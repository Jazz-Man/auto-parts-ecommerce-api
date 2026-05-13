# Phase 5 — Queues Design

## Overview

Async job processing with BullMQ, bridging existing `EventEmitter2` order events to named queues with workers. Two queues: order confirmation email (console mock) and low-stock inventory alerts.

Builds on Phase 1 (Auth), Phase 2 (Catalog), Phase 3 (Cart), and Phase 4 (Orders with event emissions).

## Technology Decisions

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Queue library | `@nestjs/bullmq` + `bullmq` | NestJS-native, shares existing Redis, BullBoard already in Docker |
| Event bridge | `@OnEvent()` listeners → `queue.add()` | OrdersService unchanged, zero coupling to queue infrastructure |
| Email mock | Console Logger | No SMTP dependency, sufficient for development |
| Low-stock check | Query all products with `stock <= threshold` | Catches cumulative stock depletion across orders |
| Retry policy | Exponential backoff, 3 attempts (email), 2 attempts (inventory) | Standard resilience pattern |
| Health | BullMQ health indicator added to existing `/health` | Consistent with existing health check pattern |

## Architecture

```
OrdersService → EventEmitter2 → QueueModule listeners → BullMQ jobs → Workers
```

OrdersService emits events via `EventEmitter2` (already implemented in Phase 4). QueueModule registers `@OnEvent()` listeners that convert events to BullMQ jobs. Workers process jobs asynchronously.

This bridge pattern means OrdersService has zero knowledge of queues — no circular dependencies, no module coupling.

## Named Queues

### `email:order-confirmation`

| Property | Value |
|----------|-------|
| Trigger | `order.created` event |
| Job data | `{ orderId: string, userId: string, total: string }` |
| Worker | Fetches order details, renders email, logs to console |
| Retry | 3 attempts, exponential backoff (1s, 5s, 30s) |
| TTL | 24 hours (job removed if not processed) |
| Concurrency | 1 (sequential processing) |

### `inventory:low-stock-alert`

| Property | Value |
|----------|-------|
| Trigger | `order.created` event (after stock decrement) |
| Job data | `{ orderId: string }` |
| Worker | Queries products with `stock <= lowStockThreshold` |
| Retry | 2 attempts, 10s delay |
| TTL | 1 hour |
| Concurrency | 1 |

Low-stock check queries ALL products, not just those from the triggering order. This catches cumulative depletion across multiple orders.

## Event Listeners

`OrderListener` in `src/queue/listeners/order-listener.ts`:

```typescript
@Injectable()
export class OrderListener {
  constructor(
    @InjectQueue('email:order-confirmation') private readonly emailQueue: Queue,
    @InjectQueue('inventory:low-stock-alert') private readonly inventoryQueue: Queue,
  ) {}

  @OnEvent('order.created')
  async handleOrderCreated(payload: { orderId: string; userId: string; total: string }) {
    await this.emailQueue.add('order-confirmation', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: { age: 24 * 3600 },
    })
    await this.inventoryQueue.add('low-stock-check', { orderId: payload.orderId }, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 10000 },
      removeOnComplete: true,
      removeOnFail: { age: 3600 },
    })
  }
}
```

Imports: `@InjectQueue` from `@nestjs/bullmq`, `Queue` from `bullmq`, `@OnEvent` from `@nestjs/event-emitter`.

Only `order.created` is bridged to queues. The `order.paid`, `order.shipped`, `order.delivered`, and `order.cancelled` events are deliberately not bridged — Phase 5 scope is confirmation + stock alerts only.

## Email Service (Console Mock)

`EmailService` in `src/queue/services/email.service.ts`:

```typescript
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)

  async sendOrderConfirmation(to: string, orderId: string, total: string): Promise<void> {
    this.logger.log(
      `To: ${to} | Subject: Order Confirmation #${orderId} | Body: Your order for $${total} has been received and is being processed.`,
    )
  }
}
```

No real SMTP. Logs structured email content for visibility. Replace with real email provider later.

## Inventory Service

`InventoryService` in `src/queue/services/inventory.service.ts`:

```typescript
@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly config: ConfigService,
  ) {}

  async checkLowStock(): Promise<{ sku: string; title: string; stock: number }[]> {
    const threshold = this.config.get<number>('queue.lowStockThreshold')!
    const products = await this.productRepo
      .createQueryBuilder('product')
      .where('product.stock <= :threshold', { threshold })
      .orderBy('product.stock', 'ASC')
      .getMany()

    return products.map((p) => ({ sku: p.sku, stock: p.stock, title: p.title }))
  }
}
```

## Processors

Processors extend `WorkerHost` (the current `@nestjs/bullmq` pattern) with explicit concurrency.

### Email Processor

```typescript
@Processor('email:order-confirmation', { concurrency: 1 })
export class EmailProcessor extends WorkerHost {
  constructor(private readonly emailService: EmailService) {
    super()
  }

  async process(job: Job<{ orderId: string; userId: string; total: string }>): Promise<void> {
    if (job.name === 'order-confirmation') {
      const { orderId, userId, total } = job.data
      await this.emailService.sendOrderConfirmation(`user-${userId}`, orderId, total)
    }
  }
}
```

### Inventory Processor

```typescript
@Processor('inventory:low-stock-alert', { concurrency: 1 })
export class InventoryProcessor extends WorkerHost {
  private readonly logger = new Logger(InventoryProcessor.name)

  constructor(private readonly inventoryService: InventoryService) {
    super()
  }

  async process(job: Job<{ orderId: string }>): Promise<void> {
    if (job.name === 'low-stock-check') {
      const lowStock = await this.inventoryService.checkLowStock()
      if (lowStock.length > 0) {
        this.logger.warn(
          `Low stock alert (${lowStock.length} products): ${lowStock.map((p) => `${p.sku}=${p.stock}`).join(', ')}`,
        )
      }
    }
  }
}
```

Imports: `@Processor` from `@nestjs/bullmq`, `WorkerHost`, `Job` from `bullmq`.

## QueueModule

```typescript
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: 'email:order-confirmation' },
      { name: 'inventory:low-stock-alert' },
    ),
    TypeOrmModule.forFeature([Product]),
  ],
  providers: [
    OrderListener,
    EmailProcessor,
    InventoryProcessor,
    EmailService,
    InventoryService,
  ],
})
export class QueueModule {}
```

Uses `BullModule.forRootAsync` to reuse existing Redis config. No new Redis instance needed.

## Config

Add to `src/config/configuration.ts`:

```typescript
queue: {
  lowStockThreshold: parseInt(process.env.LOW_STOCK_THRESHOLD || '5', 10),
},
```

## Health Check

Create a `QueueHealthIndicator` in `src/health/queue-health.ts`:

```typescript
@Injectable()
export class QueueHealthIndicator extends HealthIndicator {
  constructor(
    @InjectQueue('email:order-confirmation') private readonly emailQueue: Queue,
    @InjectQueue('inventory:low-stock-alert') private readonly inventoryQueue: Queue,
  ) {
    super()
  }

  async check(key: string) {
    const queue = key === 'email:order-confirmation' ? this.emailQueue : this.inventoryQueue
    try {
      const isPaused = await queue.isPaused()
      return this.getStatus(key, !isPaused)
    } catch {
      return this.getStatus(key, false)
    }
  }
}
```

Register in `HealthModule` providers. Update health controller to add queue checks:

```typescript
@Get()
@Public()
async check() {
  return this.health.check([
    () => this.db.pingCheck('database'),
    () => this.redis.pingCheck('redis'),
    () => this.queueHealth.check('email:order-confirmation'),
    () => this.queueHealth.check('inventory:low-stock-alert'),
  ])
}
```

`HealthModule` must import `BullModule.registerQueue(...)` (or reference `QueueModule`) to make queues available for injection.

## Module Registration

Add `QueueModule` to `AppModule` imports array.

`HealthModule` needs access to BullMQ queues for the health indicator. Import `BullModule.registerQueue({ name: 'email:order-confirmation' }, { name: 'inventory:low-stock-alert' })` in `HealthModule` (or restructure to avoid duplication).

## Graceful Shutdown

Add to `src/main.ts`:

```typescript
const app = await NestFactory.create(AppModule, { rawBody: true })
app.enableShutdownHooks()
```

NestJS handles calling `onModuleDestroy` lifecycle hooks. BullMQ queues drain automatically when the module destroys.

## File Structure

```
src/queue/
  queue.module.ts
  listeners/
    order-listener.ts
  processors/
    email.processor.ts
    inventory.processor.ts
  services/
    email.service.ts
    inventory.service.ts
  spec/
    email.service.spec.ts
    inventory.service.spec.ts
    order-listener.spec.ts
```

## Test Strategy

- **OrderListener**: Mock `Queue` (stub `add()` method), call `handleOrderCreated()`, verify `add()` called with correct job name, data, and options
- **EmailService**: Call `sendOrderConfirmation()`, verify `logger.log` called with formatted string (spy on Logger)
- **InventoryService**: Mock `Product` repository, return products below threshold, verify query and result shape
- **Processors**: Test by calling `process()` with a mock `Job` object, verify service methods called

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Job processing fails | Retry per queue policy, then mark failed |
| Redis unavailable | BullMQ reconnects automatically, jobs queue locally |
| All retries exhausted | Job marked failed, visible in BullBoard |
| Low-stock check finds none | Silent success (no alert logged) |

## Migrations

None. No new database tables.

## Dependencies

New packages:
- `@nestjs/bullmq` — NestJS wrapper for BullMQ (align major version with `@nestjs/common ^11`)
- `bullmq` — Core queue library

Uses existing Redis (ioredis already installed).

## Out of Scope

- Daily sales report queue — future
- Real email provider (SendGrid, SES, etc.) — future
- SMS notifications — future
- Push notifications — future
- Queue monitoring beyond health check — BullBoard already available in Docker on port 3002
