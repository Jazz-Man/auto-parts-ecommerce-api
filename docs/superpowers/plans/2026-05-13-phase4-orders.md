# Phase 4 — Orders Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add checkout and order management with transactional cart-to-order conversion, stock reservation, status lifecycle, idempotency, and mock payment webhooks.

**Architecture:** Two new modules — `OrdersModule` (checkout, orders CRUD, status transitions) and `WebhooksModule` (mock Stripe webhook with HMAC verification). Checkout uses TypeORM `EntityManager.transaction` for atomic cart→order→stock conversion. Idempotency interceptor caches responses in Redis. Events via `@nestjs/event-emitter` for future Phase 5 listeners.

**Tech Stack:** TypeORM transactions, ioredis (idempotency), `@nestjs/event-emitter` (new), `crypto` (HMAC-SHA256), class-validator (DTOs).

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/orders/orders.module.ts` | Module definition, imports, exports |
| `src/orders/controllers/orders.controller.ts` | Checkout + order endpoints |
| `src/orders/orders.service.ts` | Order logic, transactions, status machine |
| `src/orders/entities/order.entity.ts` | Order entity |
| `src/orders/entities/order-item.entity.ts` | OrderItem entity |
| `src/orders/enum/order-status.enum.ts` | OrderStatus enum |
| `src/orders/dto/checkout.dto.ts` | CheckoutDto + ShippingAddressDto |
| `src/orders/dto/update-order-status.dto.ts` | UpdateOrderStatusDto |
| `src/orders/dto/cancel-order.dto.ts` | CancelOrderDto |
| `src/orders/dto/pagination-query.dto.ts` | PaginationQueryDto |
| `src/orders/interceptors/idempotency.interceptor.ts` | IdempotencyKeyInterceptor |
| `src/orders/spec/orders.service.spec.ts` | OrdersService unit tests |
| `src/orders/spec/orders.controller.spec.ts` | OrdersController unit tests |
| `src/webhooks/webhooks.module.ts` | Webhook module |
| `src/webhooks/controllers/webhooks.controller.ts` | Webhook endpoint |
| `src/webhooks/webhooks.service.ts` | Signature verification + processing |
| `src/webhooks/spec/webhooks.service.spec.ts` | WebhookService unit tests |
| `src/migrations/1747400000000-CreateOrderTables.ts` | orders + order_items tables |

### Modified Files

| File | Change |
|------|--------|
| `src/app.module.ts` | Add OrdersModule, WebhooksModule, EventEmitterModule.forRoot() |
| `src/main.ts` | Add `{ rawBody: true }` to NestFactory.create() |
| `src/config/configuration.ts` | Add webhook.secret config |

---

## Chunk 1: Foundation (Enum, Entities, Migration, Config)

### Task 1: OrderStatus Enum

**Files:**
- Create: `src/orders/enum/order-status.enum.ts`

- [ ] **Step 1: Create the enum file**

```typescript
// src/orders/enum/order-status.enum.ts
export enum OrderStatus {
  Pending = 'pending',
  Paid = 'paid',
  Shipped = 'shipped',
  Delivered = 'delivered',
  Cancelled = 'cancelled',
}
```

- [ ] **Step 2: Verify lint passes**

Run: `bun run lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/orders/enum/order-status.enum.ts
git commit -m "feat(orders): add OrderStatus enum"
```

---

### Task 2: Order Entity

**Files:**
- Create: `src/orders/entities/order.entity.ts`

- [ ] **Step 1: Create the entity**

```typescript
// src/orders/entities/order.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import type { User } from '../../auth/entities/user.entity'
import { OrderStatus } from '../enum/order-status.enum'
import { OrderItem } from './order-item.entity'

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id' })
  userId: string

  // biome-ignore lint/style/noCommonJs: circular import lazy load
  @ManyToOne(() => require('../../auth/entities/user.entity').User)
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column({ type: 'varchar', length: '20', default: OrderStatus.Pending })
  status: OrderStatus

  @Column({ precision: 10, scale: 2, type: 'decimal' })
  total: string

  @Column({ name: 'shipping_address', type: 'jsonb' })
  shippingAddress: Record<string, unknown>

  @Column({ name: 'idempotency_key', length: '64', nullable: true, unique: true })
  idempotencyKey: string | null

  @OneToMany(
    () => OrderItem,
    (item) => item.order,
    {
      cascade: true,
      eager: true,
    },
  )
  items: OrderItem[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
```

- [ ] **Step 2: Verify lint passes**

Run: `bun run lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/orders/entities/order.entity.ts
git commit -m "feat(orders): add Order entity"
```

---

### Task 3: OrderItem Entity

**Files:**
- Create: `src/orders/entities/order-item.entity.ts`

- [ ] **Step 1: Create the entity**

```typescript
// src/orders/entities/order-item.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import type { Product } from '../../catalog/entities/product.entity'
import type { Order } from './order.entity'

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'order_id' })
  orderId: string

  @ManyToOne(
    // biome-ignore lint/style/noCommonJs: circular import lazy load
    () => require('./order.entity').Order,
    (order: Order) => order.items,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'order_id' })
  order: Order

  @Column({ name: 'product_id' })
  productId: string

  // biome-ignore lint/style/noCommonJs: circular import lazy load
  @ManyToOne(() => require('../../catalog/entities/product.entity').Product, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product

  @Column()
  quantity: number

  @Column({
    name: 'price_snapshot',
    precision: 10,
    scale: 2,
    type: 'decimal',
  })
  priceSnapshot: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
```

- [ ] **Step 2: Verify lint passes**

Run: `bun run lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/orders/entities/order-item.entity.ts
git commit -m "feat(orders): add OrderItem entity"
```

---

### Task 4: Migration

**Files:**
- Create: `src/migrations/1747400000000-CreateOrderTables.ts`

- [ ] **Step 1: Create the migration**

```typescript
// src/migrations/1747400000000-CreateOrderTables.ts
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm'

export class CreateOrderTables1747400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        columns: [
          {
            default: 'uuid_generate_v4()',
            isPrimary: true,
            name: 'id',
            type: 'uuid',
          },
          {
            isNullable: false,
            name: 'user_id',
            type: 'uuid',
          },
          {
            default: "'pending'",
            isNullable: false,
            length: '20',
            name: 'status',
            type: 'varchar',
          },
          {
            isNullable: false,
            name: 'total',
            precision: 10,
            scale: 2,
            type: 'decimal',
          },
          {
            isNullable: false,
            name: 'shipping_address',
            type: 'jsonb',
          },
          {
            isNullable: true,
            isUnique: true,
            length: '64',
            name: 'idempotency_key',
            type: 'varchar',
          },
          {
            default: 'now()',
            isNullable: false,
            name: 'created_at',
            type: 'timestamp',
          },
          {
            default: 'now()',
            isNullable: false,
            name: 'updated_at',
            type: 'timestamp',
          },
        ],
        name: 'orders',
      }),
      true,
    )
    await queryRunner.createForeignKey(
      'orders',
      new TableForeignKey({
        columnNames: ['user_id'],
        onDelete: 'CASCADE',
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
      }),
    )
    await queryRunner.createIndex(
      'orders',
      new TableIndex({ columnNames: ['user_id'] }),
    )

    await queryRunner.createTable(
      new Table({
        columns: [
          {
            default: 'uuid_generate_v4()',
            isPrimary: true,
            name: 'id',
            type: 'uuid',
          },
          {
            isNullable: false,
            name: 'order_id',
            type: 'uuid',
          },
          {
            isNullable: false,
            name: 'product_id',
            type: 'uuid',
          },
          {
            isNullable: false,
            name: 'quantity',
            type: 'integer',
          },
          {
            isNullable: false,
            name: 'price_snapshot',
            precision: 10,
            scale: 2,
            type: 'decimal',
          },
          {
            default: 'now()',
            isNullable: false,
            name: 'created_at',
            type: 'timestamp',
          },
          {
            default: 'now()',
            isNullable: false,
            name: 'updated_at',
            type: 'timestamp',
          },
        ],
        name: 'order_items',
      }),
      true,
    )
    await queryRunner.createForeignKey(
      'order_items',
      new TableForeignKey({
        columnNames: ['order_id'],
        onDelete: 'CASCADE',
        referencedColumnNames: ['id'],
        referencedTableName: 'orders',
      }),
    )
    await queryRunner.createForeignKey(
      'order_items',
      new TableForeignKey({
        columnNames: ['product_id'],
        onDelete: 'RESTRICT',
        referencedColumnNames: ['id'],
        referencedTableName: 'products',
      }),
    )
    await queryRunner.createIndex(
      'order_items',
      new TableIndex({ columnNames: ['order_id'] }),
    )
    await queryRunner.createIndex(
      'order_items',
      new TableIndex({ columnNames: ['product_id'] }),
    )
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "UQ_order_items_order_product" UNIQUE ("order_id", "product_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('order_items')
    await queryRunner.dropTable('orders')
  }
}
```

- [ ] **Step 2: Verify lint passes**

Run: `bun run lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/migrations/1747400000000-CreateOrderTables.ts
git commit -m "feat(orders): add CreateOrderTables migration"
```

---

### Task 5: Config and Bootstrap Changes

**Files:**
- Modify: `src/config/configuration.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Add webhook config to configuration.ts**

Add after the `redis` section:

```typescript
  webhook: {
    secret: process.env.WEBHOOK_SECRET || 'whsec_test',
  },
```

- [ ] **Step 2: Add rawBody to main.ts**

Change:
```typescript
const app = await NestFactory.create(AppModule)
```
To:
```typescript
const app = await NestFactory.create(AppModule, { rawBody: true })
```

- [ ] **Step 3: Verify build passes**

Run: `bun run build`
Expected: compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src/config/configuration.ts src/main.ts
git commit -m "feat(orders): add webhook config and rawBody for HMAC verification"
```

---

## Chunk 2: DTOs and Idempotency Interceptor

### Task 6: DTOs

**Files:**
- Create: `src/orders/dto/checkout.dto.ts`
- Create: `src/orders/dto/update-order-status.dto.ts`
- Create: `src/orders/dto/cancel-order.dto.ts`
- Create: `src/orders/dto/pagination-query.dto.ts`

- [ ] **Step 1: Create checkout.dto.ts**

```typescript
// src/orders/dto/checkout.dto.ts
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export class ShippingAddressDto {
  @IsString()
  @IsNotEmpty()
  line1: string

  @IsOptional()
  @IsString()
  line2?: string

  @IsString()
  @IsNotEmpty()
  city: string

  @IsString()
  @IsNotEmpty()
  state: string

  @IsString()
  @IsNotEmpty()
  zip: string

  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  country: string
}

export class CheckoutDto {
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto
}
```

- [ ] **Step 2: Create update-order-status.dto.ts**

```typescript
// src/orders/dto/update-order-status.dto.ts
import { IsEnum } from 'class-validator'
import { OrderStatus } from '../enum/order-status.enum'

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus
}
```

- [ ] **Step 3: Create cancel-order.dto.ts**

```typescript
// src/orders/dto/cancel-order.dto.ts
import { IsOptional, IsString } from 'class-validator'

export class CancelOrderDto {
  @IsOptional()
  @IsString()
  reason?: string
}
```

- [ ] **Step 4: Create pagination-query.dto.ts**

```typescript
// src/orders/dto/pagination-query.dto.ts
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20
}
```

- [ ] **Step 5: Verify lint passes**

Run: `bun run lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/orders/dto/
git commit -m "feat(orders): add DTOs for checkout, status update, cancel, pagination"
```

---

### Task 7: Idempotency Interceptor

**Files:**
- Create: `src/orders/interceptors/idempotency.interceptor.ts`

- [ ] **Step 1: Write the interceptor**

```typescript
// src/orders/interceptors/idempotency.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Redis } from 'ioredis'
import { Observable, from, of } from 'rxjs'
import { catchError, switchMap, tap } from 'rxjs/operators'

const IDEMPOTENCY_PREFIX = 'idempotency:'
const TTL_SECONDS = 86400 // 24 hours

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()
    const key = request.headers['idempotency-key'] as string | undefined

    if (!key) {
      return next.handle()
    }

    const redisKey = `${IDEMPOTENCY_PREFIX}${key}`

    return from(this.redis.get(redisKey)).pipe(
      switchMap((cached) => {
        if (cached) {
          const response = JSON.parse(cached)
          const res = context.switchToHttp().getResponse()
          res.statusCode = response.statusCode
          return of(response.body)
        }
        return next.handle().pipe(
          tap((body) => {
            const statusCode = context.switchToHttp().getResponse().statusCode
            if (statusCode >= 200 && statusCode < 300) {
              this.redis.set(
                redisKey,
                JSON.stringify({ body, statusCode }),
                'EX',
                TTL_SECONDS,
              ).catch(() => {})
            }
          }),
        )
      }),
      catchError(() => next.handle()),
    )
  }
}
```

- [ ] **Step 2: Verify lint passes**

Run: `bun run lint`
Expected: no errors. Fix any lint issues.

- [ ] **Step 3: Commit**

```bash
git add src/orders/interceptors/idempotency.interceptor.ts
git commit -m "feat(orders): add IdempotencyKeyInterceptor with Redis caching"
```

---

## Chunk 3: OrdersService + OrdersController

### Task 8: OrdersService — Tests

**Files:**
- Create: `src/orders/spec/orders.service.spec.ts`

- [ ] **Step 1: Write the service tests**

```typescript
// src/orders/spec/orders.service.spec.ts
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Cart } from '../../cart/entities/cart.entity'
import { CartItem } from '../../cart/entities/cart-item.entity'
import { Product } from '../../catalog/entities/product.entity'
import { OrderStatus } from '../enum/order-status.enum'
import { OrdersService } from '../orders.service'
import { Order } from '../entities/order.entity'
import { OrderItem } from '../entities/order-item.entity'

describe('OrdersService', () => {
  let service: OrdersService

  const mockOrderRepo = {
    create: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  }
  const mockOrderItemRepo = {}
  const mockProductRepo = {}
  const mockCartRepo = {}
  const mockCartItemRepo = {}

  const mockEntityManager = {
    find: jest.fn(),
    findOne: jest.fn(),
    query: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    getRepository: jest.fn(),
  }

  const mockDataSource = {
    transaction: jest.fn((cb) => cb(mockEntityManager)),
  }

  const mockEventEmitter = {
    emit: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: mockOrderRepo },
        { provide: getRepositoryToken(OrderItem), useValue: mockOrderItemRepo },
        { provide: getRepositoryToken(Product), useValue: mockProductRepo },
        { provide: getRepositoryToken(Cart), useValue: mockCartRepo },
        { provide: getRepositoryToken(CartItem), useValue: mockCartItemRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile()

    service = module.get<OrdersService>(OrdersService)
    jest.clearAllMocks()
  })

  describe('checkout', () => {
    const userId = 'user-1'
    const shippingAddress = {
      line1: '123 Main',
      city: 'Kyiv',
      state: 'Kyivska',
      zip: '01001',
      country: 'UA',
    }

    it('should throw if cart is empty', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce({ id: 'cart-1', items: [] })

      await expect(
        service.checkout(userId, shippingAddress, undefined),
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw if stock insufficient', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce({
        id: 'cart-1',
        items: [
          { productId: 'p-1', quantity: 5, priceSnapshot: '10.00', product: { id: 'p-1' } },
        ],
      })
      mockEntityManager.findOne.mockResolvedValueOnce({ id: 'p-1', stock: 2 })

      await expect(
        service.checkout(userId, shippingAddress, undefined),
      ).rejects.toThrow(BadRequestException)
    })

    it('should create order with correct total', async () => {
      const cartItems = [
        { productId: 'p-1', quantity: 2, priceSnapshot: '10.00', product: { id: 'p-1' } },
        { productId: 'p-2', quantity: 3, priceSnapshot: '5.00', product: { id: 'p-2' } },
      ]
      mockEntityManager.findOne.mockResolvedValueOnce({
        id: 'cart-1',
        items: cartItems,
      })
      mockEntityManager.findOne
        .mockResolvedValueOnce({ id: 'p-1', stock: 10 })
        .mockResolvedValueOnce({ id: 'p-2', stock: 10 })
      mockEntityManager.query
        .mockResolvedValueOnce([{ id: 'p-1' }]) // stock decrement p-1
        .mockResolvedValueOnce([{ id: 'p-2' }]) // stock decrement p-2
      const savedOrder = {
        id: 'order-1',
        userId,
        status: OrderStatus.Pending,
        total: '35.00',
        shippingAddress,
        idempotencyKey: null,
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockEntityManager.save.mockResolvedValueOnce(savedOrder)
      mockEntityManager.create.mockReturnValueOnce(savedOrder)

      const result = await service.checkout(userId, shippingAddress, undefined)

      expect(result.total).toBe('35.00')
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'order.created',
        expect.objectContaining({ orderId: 'order-1', userId }),
      )
    })

    it('should store idempotency key when provided', async () => {
      const cartItems = [
        { productId: 'p-1', quantity: 1, priceSnapshot: '10.00', product: { id: 'p-1' } },
      ]
      mockEntityManager.findOne.mockResolvedValueOnce({
        id: 'cart-1',
        items: cartItems,
      })
      mockEntityManager.findOne.mockResolvedValueOnce({ id: 'p-1', stock: 10 })
      mockEntityManager.query.mockResolvedValueOnce([{ id: 'p-1' }])
      const savedOrder = {
        id: 'order-1',
        userId,
        status: OrderStatus.Pending,
        total: '10.00',
        shippingAddress,
        idempotencyKey: 'key-123',
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockEntityManager.create.mockReturnValueOnce(savedOrder)
      mockEntityManager.save.mockResolvedValueOnce(savedOrder)

      const result = await service.checkout(userId, shippingAddress, 'key-123')

      expect(result.idempotencyKey).toBe('key-123')
    })
  })

  describe('findAll', () => {
    it('should return paginated orders for user', async () => {
      const orders = [
        { id: 'o-1', userId: 'user-1', total: '10.00', items: [], createdAt: new Date(), updatedAt: new Date() },
      ]
      mockOrderRepo.findAndCount.mockResolvedValueOnce([orders, 1])

      const result = await service.findAll({ page: 1, limit: 20 }, 'user-1', 'customer')

      expect(result.data).toHaveLength(1)
      expect(result.meta.total).toBe(1)
    })

    it('should return all orders for admin', async () => {
      mockOrderRepo.findAndCount.mockResolvedValueOnce([[], 0])

      await service.findAll({ page: 1, limit: 20 }, 'admin-1', 'admin')

      expect(mockOrderRepo.findAndCount).toHaveBeenCalled()
    })
  })

  describe('findOne', () => {
    it('should throw if order not found', async () => {
      mockOrderRepo.findOne.mockResolvedValueOnce(null)

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException)
    })

    it('should return order', async () => {
      const order = { id: 'o-1', userId: 'user-1', items: [], total: '10.00', status: OrderStatus.Pending }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)

      const result = await service.findOne('o-1')

      expect(result.id).toBe('o-1')
    })
  })

  describe('updateStatus', () => {
    it('should throw on invalid transition pending→delivered', async () => {
      const order = { id: 'o-1', status: OrderStatus.Pending, userId: 'user-1', items: [] }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)

      await expect(
        service.updateStatus('o-1', OrderStatus.Delivered, 'admin-1'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should allow pending→paid', async () => {
      const order = { id: 'o-1', status: OrderStatus.Pending, userId: 'user-1', items: [] }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)
      mockOrderRepo.save.mockResolvedValueOnce({ ...order, status: OrderStatus.Paid })

      const result = await service.updateStatus('o-1', OrderStatus.Paid, 'admin-1')

      expect(result.status).toBe(OrderStatus.Paid)
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'order.paid',
        expect.objectContaining({ orderId: 'o-1' }),
      )
    })

    it('should allow paid→shipped', async () => {
      const order = { id: 'o-1', status: OrderStatus.Paid, userId: 'user-1', items: [] }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)
      mockOrderRepo.save.mockResolvedValueOnce({ ...order, status: OrderStatus.Shipped })

      const result = await service.updateStatus('o-1', OrderStatus.Shipped, 'admin-1')

      expect(result.status).toBe(OrderStatus.Shipped)
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('order.shipped', expect.any(Object))
    })

    it('should allow shipped→delivered', async () => {
      const order = { id: 'o-1', status: OrderStatus.Shipped, userId: 'user-1', items: [] }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)
      mockOrderRepo.save.mockResolvedValueOnce({ ...order, status: OrderStatus.Delivered })

      const result = await service.updateStatus('o-1', OrderStatus.Delivered, 'admin-1')

      expect(result.status).toBe(OrderStatus.Delivered)
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('order.delivered', expect.any(Object))
    })
  })

  describe('cancel', () => {
    it('should cancel pending order and return stock', async () => {
      const order = {
        id: 'o-1',
        status: OrderStatus.Pending,
        userId: 'user-1',
        items: [
          { productId: 'p-1', quantity: 2 },
          { productId: 'p-2', quantity: 3 },
        ],
      }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)
      mockOrderRepo.save.mockResolvedValueOnce({ ...order, status: OrderStatus.Cancelled })
      mockDataSource.transaction.mockImplementation(async (cb) => {
        const em = {
          ...mockEntityManager,
          findOne: jest.fn().mockResolvedValue(order),
          save: jest.fn().mockResolvedValue({ ...order, status: OrderStatus.Cancelled }),
          query: jest.fn().mockResolvedValue([]),
        }
        return cb(em)
      })

      const result = await service.cancel('o-1', 'user-1', 'customer')

      expect(result.status).toBe(OrderStatus.Cancelled)
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('order.cancelled', expect.any(Object))
    })

    it('should reject cancel of shipped order', async () => {
      const order = { id: 'o-1', status: OrderStatus.Shipped, userId: 'user-1', items: [] }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)

      await expect(
        service.cancel('o-1', 'user-1', 'customer'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should reject cancel by non-owner non-admin', async () => {
      const order = { id: 'o-1', status: OrderStatus.Pending, userId: 'user-1', items: [] }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)

      await expect(
        service.cancel('o-1', 'user-2', 'customer'),
      ).rejects.toThrow(ForbiddenException)
    })

    it('should allow admin to cancel paid order', async () => {
      const order = {
        id: 'o-1',
        status: OrderStatus.Paid,
        userId: 'user-1',
        items: [{ productId: 'p-1', quantity: 1 }],
      }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)
      mockDataSource.transaction.mockImplementation(async (cb) => {
        const em = {
          ...mockEntityManager,
          findOne: jest.fn().mockResolvedValue(order),
          save: jest.fn().mockResolvedValue({ ...order, status: OrderStatus.Cancelled }),
          query: jest.fn().mockResolvedValue([]),
        }
        return cb(em)
      })

      const result = await service.cancel('o-1', 'admin-1', 'admin')

      expect(result.status).toBe(OrderStatus.Cancelled)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- src/orders/spec/orders.service.spec.ts`
Expected: FAIL — `OrdersService` does not exist

- [ ] **Step 3: Commit**

```bash
git add src/orders/spec/orders.service.spec.ts
git commit -m "test(orders): add OrdersService unit tests"
```

---

### Task 9: OrdersService — Implementation

**Files:**
- Create: `src/orders/orders.service.ts`

- [ ] **Step 1: Implement OrdersService**

```typescript
// src/orders/orders.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { DataSource, Repository } from 'typeorm'
import { Cart } from '../cart/entities/cart.entity'
import { CartItem } from '../cart/entities/cart-item.entity'
import { Product } from '../catalog/entities/product.entity'
import { UserRole } from '../auth/entities/user-role.enum'
import { OrderStatus } from './enum/order-status.enum'
import { Order } from './entities/order.entity'
import { OrderItem } from './entities/order-item.entity'

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.Pending]: [OrderStatus.Paid, OrderStatus.Cancelled],
  [OrderStatus.Paid]: [OrderStatus.Shipped, OrderStatus.Cancelled],
  [OrderStatus.Shipped]: [OrderStatus.Delivered],
  [OrderStatus.Delivered]: [],
  [OrderStatus.Cancelled]: [],
}

export interface OrderItemResponse {
  productId: string
  quantity: number
  priceSnapshot: string
  product: { id: string; sku: string; title: string }
}

export interface OrderResponse {
  id: string
  status: OrderStatus
  total: string
  shippingAddress: Record<string, unknown>
  idempotencyKey: string | null
  items: OrderItemResponse[]
  createdAt: Date
  updatedAt: Date
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async checkout(
    userId: string,
    shippingAddress: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<OrderResponse> {
    return this.dataSource.transaction(async (em) => {
      // Step 1: Read cart with items
      const cart = await em.findOne(Cart, {
        where: { userId },
        relations: ['items', 'items.product'],
      })

      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Cart is empty')
      }

      const cartItems = cart.items

      // Step 2: Lock product rows (SELECT FOR UPDATE)
      const productIds = cartItems.map((item) => item.productId)
      const products = await em.query(
        'SELECT id, stock FROM products WHERE id = ANY($1) FOR UPDATE',
        [productIds],
      )
      const productMap = new Map(products.map((p: any) => [p.id, p.stock]))

      // Step 3: Validate stock
      const insufficient = cartItems.filter(
        (item) => (productMap.get(item.productId) ?? 0) < item.quantity,
      )
      if (insufficient.length > 0) {
        throw new BadRequestException(
          `Insufficient stock for products: ${insufficient.map((i) => i.productId).join(', ')}`,
        )
      }

      // Step 4: Decrement stock atomically
      for (const item of cartItems) {
        await em.query(
          'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1',
          [item.quantity, item.productId],
        )
      }

      // Step 5: Calculate total
      let totalCents = 0
      for (const item of cartItems) {
        totalCents += Math.round(Number.parseFloat(item.priceSnapshot) * 100) * item.quantity
      }
      const total = (totalCents / 100).toFixed(2)

      // Step 6: Create order + order_items
      const order = em.create(Order, {
        idempotencyKey: idempotencyKey ?? null,
        shippingAddress,
        status: OrderStatus.Pending,
        total,
        userId,
      } as Partial<Order>)
      const savedOrder = await em.save(Order, order)

      const orderItems = cartItems.map((item) =>
        em.create(OrderItem, {
          orderId: savedOrder.id,
          priceSnapshot: item.priceSnapshot,
          productId: item.productId,
          quantity: item.quantity,
        } as Partial<OrderItem>),
      )
      await em.save(OrderItem, orderItems)

      // Step 7: Delete cart items
      await em.delete(CartItem, { cartId: cart.id })

      this.eventEmitter.emit('order.created', {
        orderId: savedOrder.id,
        total,
        userId,
      })

      return this.buildResponse({ ...savedOrder, items: orderItems } as Order)
    })
  }

  async findAll(
    query: { page: number; limit: number },
    requesterId: string,
    requesterRole: string,
  ) {
    const { page = 1, limit = 20 } = query
    const targetUserId = requesterRole === UserRole.ADMIN ? undefined : requesterId

    const qb = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('item.product', 'product')

    if (targetUserId) {
      qb.andWhere('order.userId = :userId', { userId: targetUserId })
    }

    qb.orderBy('order.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)

    const [data, total] = await qb.getManyAndCount()

    return {
      data: data.map((o) => this.buildResponse(o)),
      meta: {
        limit,
        page,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  async findOne(orderId: string): Promise<OrderResponse> {
    const order = await this.orderRepo.findOne({
      relations: ['items', 'items.product'],
      where: { id: orderId },
    })
    if (!order) throw new NotFoundException('Order not found')
    return this.buildResponse(order)
  }

  async updateStatus(
    orderId: string,
    newStatus: OrderStatus,
    adminId: string,
  ): Promise<OrderResponse> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['items'],
    })
    if (!order) throw new NotFoundException('Order not found')

    const allowed = ALLOWED_TRANSITIONS[order.status]
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${order.status} to ${newStatus}`,
      )
    }

    order.status = newStatus
    const saved = await this.orderRepo.save(order)

    const eventMap: Record<string, string> = {
      [OrderStatus.Paid]: 'order.paid',
      [OrderStatus.Shipped]: 'order.shipped',
      [OrderStatus.Delivered]: 'order.delivered',
    }
    const event = eventMap[newStatus]
    if (event) {
      this.eventEmitter.emit(event, { orderId: saved.id, userId: saved.userId })
    }

    return this.buildResponse(saved)
  }

  async cancel(
    orderId: string,
    requesterId: string,
    requesterRole: string,
    reason?: string,
  ): Promise<OrderResponse> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['items'],
    })
    if (!order) throw new NotFoundException('Order not found')

    // Authorization: owner can cancel pending, admin can cancel pending + paid
    if (requesterRole !== UserRole.ADMIN) {
      if (order.userId !== requesterId) {
        throw new ForbiddenException('Not your order')
      }
      if (order.status !== OrderStatus.Pending) {
        throw new BadRequestException('Only pending orders can be cancelled')
      }
    } else {
      if (order.status !== OrderStatus.Pending && order.status !== OrderStatus.Paid) {
        throw new BadRequestException('Only pending or paid orders can be cancelled')
      }
    }

    return this.dataSource.transaction(async (em) => {
      // Return stock
      for (const item of order.items) {
        await em.query(
          'UPDATE products SET stock = stock + $1 WHERE id = $2',
          [item.quantity, item.productId],
        )
      }

      order.status = OrderStatus.Cancelled
      const saved = await em.save(Order, order)

      this.eventEmitter.emit('order.cancelled', {
        orderId: saved.id,
        reason,
        userId: saved.userId,
      })

      return this.buildResponse(saved)
    })
  }

  private buildResponse(order: Order): OrderResponse {
    return {
      createdAt: order.createdAt,
      id: order.id,
      idempotencyKey: order.idempotencyKey,
      items:
        order.items?.map((item) => ({
          priceSnapshot: item.priceSnapshot,
          product: {
            id: item.product?.id ?? item.productId,
            sku: item.product?.sku ?? '',
            title: item.product?.title ?? '',
          },
          productId: item.productId,
          quantity: item.quantity,
        })) ?? [],
      shippingAddress: order.shippingAddress,
      status: order.status,
      total: order.total,
      updatedAt: order.updatedAt,
    }
  }
}
```

- [ ] **Step 2: Run service tests**

Run: `bun run test -- src/orders/spec/orders.service.spec.ts`
Expected: PASS (some tests may need mock adjustments — fix as needed)

- [ ] **Step 3: Commit**

```bash
git add src/orders/orders.service.ts
git commit -m "feat(orders): add OrdersService with checkout, status machine, cancel"
```

---

### Task 10: OrdersController — Tests

**Files:**
- Create: `src/orders/spec/orders.controller.spec.ts`

- [ ] **Step 1: Write controller tests**

```typescript
// src/orders/spec/orders.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { OrdersController } from '../controllers/orders.controller'
import { OrdersService } from '../orders.service'

describe('OrdersController', () => {
  let controller: OrdersController

  const mockOrdersService = {
    checkout: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateStatus: jest.fn(),
    cancel: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: mockOrdersService }],
    }).compile()

    controller = module.get<OrdersController>(OrdersController)
    jest.clearAllMocks()
  })

  describe('checkout', () => {
    it('should call service.checkout with userId and body', async () => {
      const dto = {
        shippingAddress: { line1: '123', city: 'Kyiv', state: 'KY', zip: '01001', country: 'UA' },
      }
      mockOrdersService.checkout.mockResolvedValueOnce({ id: 'o-1' })

      const req = { user: { userId: 'user-1' } } as any
      const result = await controller.checkout(req, dto, 'key-123')

      expect(mockOrdersService.checkout).toHaveBeenCalledWith(
        'user-1',
        dto.shippingAddress,
        'key-123',
      )
    })
  })

  describe('findAll', () => {
    it('should pass userId from request', async () => {
      mockOrdersService.findAll.mockResolvedValueOnce({ data: [], meta: {} })
      const req = { user: { userId: 'user-1', role: 'customer' } } as any

      await controller.findAll(req, { page: 1, limit: 20 })

      expect(mockOrdersService.findAll).toHaveBeenCalledWith(
        { page: 1, limit: 20 },
        'user-1',
        'customer',
      )
    })
  })

  describe('findOne', () => {
    it('should call service.findOne', async () => {
      mockOrdersService.findOne.mockResolvedValueOnce({ id: 'o-1' })

      const result = await controller.findOne('o-1')

      expect(mockOrdersService.findOne).toHaveBeenCalledWith('o-1')
    })
  })

  describe('updateStatus', () => {
    it('should call service.updateStatus', async () => {
      mockOrdersService.updateStatus.mockResolvedValueOnce({ id: 'o-1', status: 'shipped' })
      const req = { user: { userId: 'admin-1' } } as any

      await controller.updateStatus(req, 'o-1', { status: 'shipped' })

      expect(mockOrdersService.updateStatus).toHaveBeenCalledWith('o-1', 'shipped', 'admin-1')
    })
  })

  describe('cancel', () => {
    it('should call service.cancel with reason', async () => {
      mockOrdersService.cancel.mockResolvedValueOnce({ id: 'o-1', status: 'cancelled' })
      const req = { user: { userId: 'user-1', role: 'customer' } } as any

      await controller.cancel(req, 'o-1', { reason: 'changed mind' })

      expect(mockOrdersService.cancel).toHaveBeenCalledWith(
        'o-1',
        'user-1',
        'customer',
        'changed mind',
      )
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- src/orders/spec/orders.controller.spec.ts`
Expected: FAIL — controller does not exist

- [ ] **Step 3: Commit**

```bash
git add src/orders/spec/orders.controller.spec.ts
git commit -m "test(orders): add OrdersController unit tests"
```

---

### Task 11: OrdersController — Implementation

**Files:**
- Create: `src/orders/controllers/orders.controller.ts`

- [ ] **Step 1: Implement the controller**

```typescript
// src/orders/controllers/orders.controller.ts
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import { OrderStatus } from '../enum/order-status.enum'
import { OrdersService } from '../orders.service'
import { CheckoutDto } from '../dto/checkout.dto'
import { CancelOrderDto } from '../dto/cancel-order.dto'
import { PaginationQueryDto } from '../dto/pagination-query.dto'
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { UserRole } from '../../auth/entities/user-role.enum'

@Controller()
@UseGuards(RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  async checkout(
    @Req() req: Request,
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const userId = (req.user as any).userId
    return this.ordersService.checkout(userId, dto.shippingAddress, idempotencyKey)
  }

  @Get('orders')
  async findAll(
    @Req() req: Request,
    @Query() query: PaginationQueryDto,
  ) {
    const { userId, role } = req.user as any
    return this.ordersService.findAll(query, userId, role)
  }

  @Get('orders/:id')
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id)
  }

  @Patch('orders/:id/status')
  @Roles(UserRole.ADMIN)
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const adminId = (req.user as any).userId
    return this.ordersService.updateStatus(id, dto.status, adminId)
  }

  @Post('orders/:id/cancel')
  async cancel(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    const { userId, role } = req.user as any
    return this.ordersService.cancel(id, userId, role, dto.reason)
  }
}
```

- [ ] **Step 2: Run controller tests**

Run: `bun run test -- src/orders/spec/orders.controller.spec.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/orders/controllers/orders.controller.ts
git commit -m "feat(orders): add OrdersController with checkout, list, status, cancel"
```

---

### Task 12: OrdersModule

**Files:**
- Create: `src/orders/orders.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Create OrdersModule**

```typescript
// src/orders/orders.module.ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Cart } from '../cart/entities/cart.entity'
import { CartItem } from '../cart/entities/cart-item.entity'
import { Product } from '../catalog/entities/product.entity'
import { OrdersController } from './controllers/orders.controller'
import { OrdersService } from './orders.service'
import { Order } from './entities/order.entity'
import { OrderItem } from './entities/order-item.entity'
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor'
import { APP_INTERCEPTOR } from '@nestjs/core'

@Module({
  controllers: [OrdersController],
  exports: [OrdersService],
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Product, Cart, CartItem]),
  ],
  providers: [
    OrdersService,
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class OrdersModule {}
```

- [ ] **Step 2: Register modules in AppModule**

Add imports to `src/app.module.ts`:

```typescript
import { EventEmitterModule } from '@nestjs/event-emitter'
import { OrdersModule } from './orders/orders.module'
import { WebhooksModule } from './webhooks/webhooks.module'
```

Add to `imports` array:

```typescript
    EventEmitterModule.forRoot(),
    OrdersModule,
    WebhooksModule,
```

Note: WebhooksModule doesn't exist yet — create a placeholder first if build fails.

- [ ] **Step 3: Verify build passes**

Run: `bun run build`
Expected: compiles (may need WebhooksModule placeholder — create an empty module if needed)

- [ ] **Step 4: Commit**

```bash
git add src/orders/orders.module.ts src/app.module.ts
git commit -m "feat(orders): add OrdersModule with idempotency interceptor"
```

---

## Chunk 4: WebhooksModule

### Task 13: WebhookService — Tests

**Files:**
- Create: `src/webhooks/spec/webhooks.service.spec.ts`

- [ ] **Step 1: Write webhook service tests**

```typescript
// src/webhooks/spec/webhooks.service.spec.ts
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { OrderStatus } from '../../orders/enum/order-status.enum'
import { OrdersService } from '../../orders/orders.service'
import { WebhooksService } from '../webhooks.service'

describe('WebhooksService', () => {
  let service: WebhooksService

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const map: Record<string, any> = {
        'webhook.secret': 'whsec_test',
      }
      return map[key]
    }),
  }

  const mockOrdersService = {
    updateStatus: jest.fn(),
    findOne: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: OrdersService, useValue: mockOrdersService },
      ],
    }).compile()

    service = module.get<WebhooksService>(WebhooksService)
    jest.clearAllMocks()
  })

  describe('verifySignature', () => {
    it('should throw if signature header missing', () => {
      expect(() => service.verifySignature('', '{}')).toThrow(BadRequestException)
    })

    it('should throw if timestamp too old', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600 // 10 min ago
      const header = `t=${oldTimestamp},v1=fakesig`

      expect(() => service.verifySignature(header, '{}')).toThrow(BadRequestException)
    })

    it('should throw if signature invalid', () => {
      const ts = Math.floor(Date.now() / 1000)
      const header = `t=${ts},v1=invalidsignature`

      expect(() => service.verifySignature(header, '{}')).toThrow(BadRequestException)
    })

    it('should return true for valid signature', () => {
      const crypto = require('crypto')
      const ts = Math.floor(Date.now() / 1000)
      const payload = '{"type":"payment_intent.succeeded"}'
      const expected = crypto
        .createHmac('sha256', 'whsec_test')
        .update(`${ts}.${payload}`)
        .digest('hex')
      const header = `t=${ts},v1=${expected}`

      expect(service.verifySignature(header, payload)).toBe(true)
    })
  })

  describe('processWebhook', () => {
    it('should update order to paid for succeeded event', async () => {
      mockOrdersService.updateStatus.mockResolvedValueOnce({ id: 'o-1', status: OrderStatus.Paid })

      await service.processWebhook({
        data: { object: { metadata: { orderId: 'o-1' } } },
        type: 'payment_intent.succeeded',
      })

      expect(mockOrdersService.updateStatus).toHaveBeenCalledWith('o-1', OrderStatus.Paid, 'webhook')
    })

    it('should ignore non-succeeded events', async () => {
      await service.processWebhook({
        data: { object: { metadata: { orderId: 'o-1' } } },
        type: 'payment_intent.created',
      })

      expect(mockOrdersService.updateStatus).not.toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- src/webhooks/spec/webhooks.service.spec.ts`
Expected: FAIL — WebhooksService does not exist

- [ ] **Step 3: Commit**

```bash
git add src/webhooks/spec/webhooks.service.spec.ts
git commit -m "test(webhooks): add WebhooksService unit tests"
```

---

### Task 14: WebhookService — Implementation

**Files:**
- Create: `src/webhooks/webhooks.service.ts`

- [ ] **Step 1: Implement WebhooksService**

```typescript
// src/webhooks/webhooks.service.ts
import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { OrderStatus } from '../orders/enum/order-status.enum'
import { OrdersService } from '../orders/orders.service'

@Injectable()
export class WebhooksService {
  private readonly secret: string

  constructor(
    private readonly config: ConfigService,
    private readonly ordersService: OrdersService,
  ) {
    this.secret = this.config.get<string>('webhook.secret')!
  }

  verifySignature(signatureHeader: string, rawBody: string): boolean {
    if (!signatureHeader) {
      throw new BadRequestException('Missing Stripe-Signature header')
    }

    const parts = Object.fromEntries(
      signatureHeader.split(',').map((part) => {
        const [key, ...value] = part.split('=')
        return [key, value.join('=')]
      }),
    )

    const timestamp = Number(parts.t)
    const signature = parts.v1

    if (!timestamp || !signature) {
      throw new BadRequestException('Invalid signature format')
    }

    // Check timestamp freshness (5 minutes)
    const now = Math.floor(Date.now() / 1000)
    if (now - timestamp > 300) {
      throw new BadRequestException('Webhook timestamp too old')
    }

    // Compute expected signature
    const payload = `${timestamp}.${rawBody}`
    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex')

    // Timing-safe comparison
    const expectedBuf = Buffer.from(expected, 'utf8')
    const sigBuf = Buffer.from(signature, 'utf8')

    if (expectedBuf.length !== sigBuf.length) {
      throw new BadRequestException('Invalid signature')
    }

    if (!crypto.timingSafeEqual(expectedBuf, sigBuf)) {
      throw new BadRequestException('Invalid signature')
    }

    return true
  }

  async processWebhook(body: {
    type: string
    data: { object: { metadata: { orderId: string } } }
  }): Promise<void> {
    if (body.type !== 'payment_intent.succeeded') {
      return
    }

    const orderId = body.data?.object?.metadata?.orderId
    if (orderId) {
      await this.ordersService.updateStatus(orderId, OrderStatus.Paid, 'webhook')
    }
  }
}
```

- [ ] **Step 2: Run tests**

Run: `bun run test -- src/webhooks/spec/webhooks.service.spec.ts`
Expected: PASS (processWebhook test for updateStatus needs OrdersService injected — see controller task)

- [ ] **Step 3: Commit**

```bash
git add src/webhooks/webhooks.service.ts
git commit -m "feat(webhooks): add WebhooksService with HMAC signature verification"
```

---

### Task 15: WebhookController

**Files:**
- Create: `src/webhooks/controllers/webhooks.controller.ts`

- [ ] **Step 1: Implement the controller**

```typescript
// src/webhooks/controllers/webhooks.controller.ts
import { Body, Controller, Headers, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { Public } from '../../common/decorators/public.decorator'
import { WebhooksService } from '../webhooks.service'

@Controller()
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Public()
  @Post('webhooks/payment')
  async handlePayment(
    @Headers('stripe-signature') signatureHeader: string,
    @Req() req: Request,
  ) {
    const rawBody = req.rawBody?.toString() ?? ''

    this.webhooksService.verifySignature(signatureHeader, rawBody)

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body

    await this.webhooksService.processWebhook(body)

    return { received: true }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/webhooks/controllers/webhooks.controller.ts
git commit -m "feat(webhooks): add WebhooksController with HMAC-verified payment endpoint"
```

---

### Task 16: WebhooksModule

**Files:**
- Create: `src/webhooks/webhooks.module.ts`

- [ ] **Step 1: Create WebhooksModule**

```typescript
// src/webhooks/webhooks.module.ts
import { Module } from '@nestjs/common'
import { OrdersModule } from '../orders/orders.module'
import { OrdersService } from '../orders/orders.service'
import { WebhooksController } from './controllers/webhooks.controller'
import { WebhooksService } from './webhooks.service'

@Module({
  controllers: [WebhooksController],
  imports: [OrdersModule],
  providers: [WebhooksService],
})
export class WebhooksModule {}
```

- [ ] **Step 2: Commit**

```bash
git add src/webhooks/webhooks.module.ts
git commit -m "feat(webhooks): add WebhooksModule"
```

---

## Chunk 5: Integration and Verification

### Task 17: Install @nestjs/event-emitter

- [ ] **Step 1: Install the package**

Run: `bun add @nestjs/event-emitter`

- [ ] **Step 2: Verify package.json updated**

Run: `cat package.json | grep event-emitter`
Expected: shows `@nestjs/event-emitter` in dependencies

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "feat(orders): add @nestjs/event-emitter dependency"
```

---

### Task 18: Verify EventEmitter Wiring

**Files:**
- Verify: `src/orders/orders.service.ts` — EventEmitter2 uses class injection (already correct in Task 9)

The OrdersService uses `private readonly eventEmitter: EventEmitter2` without `@Inject()` — this works because `EventEmitterModule.forRoot()` registered in AppModule makes `EventEmitter2` injectable by class.

- [ ] **Step 1: Verify build passes**

Run: `bun run build`
Expected: compiles without errors

- [ ] **Step 2: Run orders service tests**

Run: `bun run test -- src/orders/spec/orders.service.spec.ts`
Expected: PASS — `EventEmitter2` provider token matches class injection

---

### Task 19: Full Test Suite + Lint + Build

- [ ] **Step 1: Run all tests**

Run: `bun run test`
Expected: all tests pass (existing + new orders/webhooks tests)

- [ ] **Step 2: Run lint**

Run: `bun run lint`
Expected: no errors. Fix any lint issues.

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: compiles without errors

- [ ] **Step 4: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: lint fixes for Phase 4 orders"
```

---

### Task 20: Run Migration (when DB available)

- [ ] **Step 1: Ensure Docker/PostgreSQL is running**

Run: `docker compose up -d` (or equivalent)

- [ ] **Step 2: Run migration**

Run: `bun run migration:run`
Expected: migration applies successfully, orders + order_items tables created

- [ ] **Step 3: Verify tables exist**

Run: `psql -U autoparts -d autoparts -p 5433 -c "\dt orders; \dt order_items;"`
Expected: both tables listed
