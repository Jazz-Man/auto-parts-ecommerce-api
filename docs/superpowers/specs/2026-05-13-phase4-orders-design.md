# Phase 4 — Orders Design

## Overview

Checkout and order management with transactional cart-to-order conversion, atomic stock reservation, status lifecycle, idempotency, mock payment webhook with HMAC verification, and event-driven status changes.

Builds on Phase 1 (Auth, Config, TypeORM, Redis, Health), Phase 2 (Catalog), and Phase 3 (Cart).

## Technology Decisions

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Order storage | PostgreSQL (orders + order_items tables) | Durable, transactional, queryable |
| Stock reservation | `SELECT FOR UPDATE` + `UPDATE ... RETURNING` | Prevents over-reservation under concurrency |
| Stock rollback | `UPDATE products SET stock = stock + qty` on cancel | Atomic stock return within cancel transaction |
| Status transitions | Service-level state machine | Explicit allowed transitions, easy to audit |
| Idempotency | Redis cache + DB unique constraint | Fast lookup via Redis, persistent fallback via DB |
| Payment simulation | Mock Stripe webhook with HMAC-SHA256 | Teaches real Stripe integration pattern |
| Events | `@nestjs/event-emitter` | Decoupled status change reactions, no listeners until Phase 5 |
| Shipping address | JSONB column | One address per order, no reuse needed (YAGNI) |
| Module structure | OrdersModule + WebhooksModule | Separate concerns: order logic vs webhook handling |

## Database Schema

### `orders`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default uuid_generate_v4() |
| user_id | UUID | FK → users(id) ON DELETE CASCADE, NOT NULL |
| status | VARCHAR(20) | NOT NULL, default 'pending' |
| total | DECIMAL(10,2) | NOT NULL |
| shipping_address | JSONB | NOT NULL |
| idempotency_key | VARCHAR(64) | UNIQUE, nullable |
| created_at | TIMESTAMP | NOT NULL, default NOW() |
| updated_at | TIMESTAMP | NOT NULL, default NOW() |

`idempotency_key` is nullable — only `POST /checkout` provides it. Other endpoints don't have this header.

Index: `INDEX(user_id)` for order history queries.

### `order_items`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default uuid_generate_v4() |
| order_id | UUID | FK → orders(id) ON DELETE CASCADE, NOT NULL |
| product_id | UUID | FK → products(id) ON DELETE RESTRICT, NOT NULL |
| quantity | INTEGER | NOT NULL, min 1 |
| price_snapshot | DECIMAL(10,2) | NOT NULL |

Unique constraint: `(order_id, product_id)` — one row per product per order, consistent with cart constraint.

Indexes: `INDEX(order_id)`, `INDEX(product_id)`.

## Entities

All in `src/orders/entities/`:
- `order.entity.ts`
- `order-item.entity.ts`

Enum in `src/orders/enum/order-status.enum.ts`:

```typescript
export enum OrderStatus {
  Pending = 'pending',
  Paid = 'paid',
  Shipped = 'shipped',
  Delivered = 'delivered',
  Cancelled = 'cancelled',
}
```

Entity uses `@Column({ type: 'varchar', length: 20, default: OrderStatus.Pending })` for the status column — VARCHAR rather than PostgreSQL enum for simpler migrations if statuses change.

## Status State Machine

Allowed transitions:

```
pending  → paid       (webhook)
pending  → cancelled  (user or admin)
paid     → shipped    (admin only)
paid     → cancelled  (admin only, stock returned)
shipped  → delivered  (admin only)
```

Invalid transitions return 400. The service validates transitions before applying.

Cancel returns stock only for `pending` and `paid` orders. `shipped` and later cannot be cancelled.

## Checkout Flow

`POST /checkout` — authenticated users only.

Transaction steps (all within one TypeORM `EntityManager.transaction`):

1. Read cart items: `SELECT FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = ?)`
2. Lock product rows: `SELECT id, stock FROM products WHERE id = ANY(?) FOR UPDATE`
3. Validate stock for each item — throw 400 if any `stock < quantity`
4. Decrement stock: `UPDATE products SET stock = stock - qty WHERE id = ? AND stock >= qty`
5. Create order row with total calculated from `priceSnapshot * quantity`
6. Create order_items rows from cart items (copy productId, quantity, priceSnapshot)
7. Delete cart items: `DELETE FROM cart_items WHERE cart_id = ?`
8. COMMIT

If stock insufficient at step 3 — ROLLBACK, return 400 with which products are out of stock.

If cart is empty at step 1 — return 400, no transaction needed.

The entire transaction should complete in < 50ms for typical orders (5-10 items). Lock duration on product rows is minimal.

## Shipping Address

Stored as JSONB with flat structure. Validated via DTO:

```typescript
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
  @IsLength(2, 2)
  country: string  // ISO 3166-1 alpha-2
}
```

## Checkout DTO

```typescript
export class CheckoutDto {
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto

  @IsOptional()
  @IsString()
  idempotencyKey?: string
}
```

Idempotency key can come from either the `Idempotency-Key` header or the DTO body. Header takes precedence.

## Idempotency

### IdempotencyKeyInterceptor

Global interceptor — active only when `Idempotency-Key` header is present.

Flow:

1. Request arrives with `Idempotency-Key` header
2. Interceptor checks Redis key `idempotency:{key}`
3. If found → return cached `{ statusCode, body }` immediately, handler not executed
4. If not found → execute handler
5. After handler completes successfully → cache response in Redis with 24h TTL (86400s)
6. Also store `idempotency_key` in the order row — UNIQUE constraint as persistent fallback

If Redis is down: the request flows through normally. The UNIQUE constraint on `idempotency_key` in the orders table catches true duplicates — returns 409. This is degraded but safe.

## Mock Payment Webhook

### Signature Verification

Simulates Stripe's webhook signature pattern:

- Config: `WEBHOOK_SECRET` env var (defaults to `whsec_test`)
- Request headers: `Stripe-Signature: t=<timestamp>,v1=<hmac>`
- Payload body: `{ type, data: { object: { metadata: { orderId } } } }`

Verification:

1. Parse `Stripe-Signature` header for `t` (timestamp) and `v1` (signature)
2. Compute `HMAC-SHA256(secret, timestamp + '.' + rawBody)`
3. Compare with `crypto.timingSafeEqual` against provided signature
4. Reject if timestamp is > 5 minutes old (replay protection)

### Webhook Processing

Only `payment_intent.succeeded` type triggers status change:

1. Verify signature
2. Extract `orderId` from `data.object.metadata`
3. Find order, validate status is `pending`
4. Update status to `paid`
5. Emit `order.paid` event

Other event types are logged but ignored (forward-compatible with real Stripe).

### Webhook Module

Separate `WebhooksModule` with its own controller (`@Public()`) and service. Imports `OrdersModule` for access to `OrdersService`.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/checkout` | user | Create order from cart |
| GET | `/orders` | user | Order history (paginated) |
| GET | `/orders/:id` | user | Order details |
| PATCH | `/orders/:id/status` | admin | Change order status |
| POST | `/orders/:id/cancel` | user/admin | Cancel order |
| POST | `/webhooks/payment` | public | Mock Stripe webhook |

### Authorization Rules

- `GET /orders` — returns only current user's orders. Admin sees all.
- `GET /orders/:id` — owner or admin. Others get 403.
- `PATCH /orders/:id/status` — admin only. Allowed transitions: `paid→shipped`, `shipped→delivered`.
- `POST /orders/:id/cancel` — owner can cancel `pending` orders. Admin can cancel `pending` and `paid` orders.
- `POST /webhooks/payment` — `@Public()`, verified via HMAC signature.

### Update Status DTO

```typescript
export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus
}
```

### Order Response Shape

```json
{
  "id": "uuid",
  "status": "pending",
  "total": "150.00",
  "shippingAddress": {
    "line1": "123 Main St",
    "city": "Kyiv",
    "state": "Kyivska",
    "zip": "01001",
    "country": "UA"
  },
  "items": [
    {
      "productId": "uuid",
      "quantity": 2,
      "priceSnapshot": "12.50",
      "product": {
        "id": "uuid",
        "sku": "OIL-TOY-001",
        "title": "Oil Filter Toyota Corolla"
      }
    }
  ],
  "createdAt": "2026-05-13T10:00:00Z",
  "updatedAt": "2026-05-13T10:00:00Z"
}
```

### Order List Response (paginated)

```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

## Stock Rollback on Cancel

Within a transaction:

1. Load order with items
2. Validate status is `pending` or `paid`
3. Update order status to `cancelled`
4. For each order item: `UPDATE products SET stock = stock + qty WHERE id = ?`
5. Emit `order.cancelled` event

If order is `pending`: user or admin can cancel. Stock was reserved, so it must be returned.
If order is `paid`: admin only. Stock was reserved, so it must be returned.
If order is `shipped` or later: cannot cancel.

## Events

Install `@nestjs/event-emitter` as a new dependency.

Events fired by `OrdersService`:

| Event | Payload | When |
|-------|---------|------|
| `order.created` | `{ orderId, userId, total }` | After successful checkout |
| `order.paid` | `{ orderId, userId }` | After webhook marks order as paid |
| `order.shipped` | `{ orderId, userId }` | After admin sets status to shipped |
| `order.delivered` | `{ orderId, userId }` | After admin sets status to delivered |
| `order.cancelled` | `{ orderId, userId, reason? }` | After cancel with stock returned |

No listeners in Phase 4. Phase 5 adds email workers and notification handlers.

## Error Handling

| Scenario | HTTP Status |
|----------|------------|
| Cart is empty at checkout | 400 |
| Product stock insufficient | 400 (includes which products) |
| Invalid status transition | 400 |
| Order not found | 404 |
| Not order owner / not admin | 403 |
| Webhook signature invalid | 400 |
| Webhook timestamp too old (>5min) | 400 |
| Duplicate idempotency key (Redis hit) | 200 (cached response) |
| Duplicate idempotency key (Redis miss, DB hit) | 409 |
| Validation failure | 400 |

Product deletion restricted if order items reference it (ON DELETE RESTRICT on order_items.product_id).

## File Structure

```
src/orders/
  orders.module.ts
  orders.controller.ts
  orders.service.ts
  entities/
    order.entity.ts
    order-item.entity.ts
  dto/
    checkout.dto.ts
    shipping-address.dto.ts
    update-order-status.dto.ts
  enum/
    order-status.enum.ts
  interceptors/
    idempotency.interceptor.ts
src/webhooks/
  webhooks.module.ts
  webhooks.controller.ts
  webhooks.service.ts
```

## DTO Definitions

### CheckoutDto

- `shippingAddress` (ShippingAddressDto, required, validated)
- `idempotencyKey` (string, optional)

### ShippingAddressDto

- `line1` (string, required)
- `line2` (string, optional)
- `city` (string, required)
- `state` (string, required)
- `zip` (string, required)
- `country` (string, required, exactly 2 chars — ISO 3166-1 alpha-2)

### UpdateOrderStatusDto

- `status` (OrderStatus enum, required)

## Migrations

1. `CreateOrderTables` — creates orders and order_items tables with indexes and constraints

No seed data needed — orders are created via checkout.

## Dependencies

New packages:
- `@nestjs/event-emitter` — for order status change events

Uses existing TypeORM (transactions), ioredis (idempotency), and class-validator (DTOs).

## Out of Scope

- Real payment integration — future
- Email notifications — Phase 5
- Order search/filtering beyond pagination — future
- Refunds — future
- Order notes/comments — future
- Partial cancellations — future
- Invoice generation — future
