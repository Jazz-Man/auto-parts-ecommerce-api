# Phase 3 — Shopping Cart Design

## Overview

Shopping cart with dual storage: Redis for guest carts, PostgreSQL for authenticated user carts. Merge on login with MAX(qty) conflict resolution. Guest carts expire after 7 days of inactivity.

Builds on Phase 1 (Auth, Config, TypeORM, Redis, Health) and Phase 2 (Catalog — brands, vehicles, categories, products).

## Technology Decisions

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Guest cart storage | Redis hash | Fast, ephemeral, auto-expiring. Key: `cart:guest:{sessionId}` |
| Auth cart storage | PostgreSQL (carts + cart_items tables) | Durable, survives Redis restarts, queryable |
| Merge strategy | MAX(qty) on conflict | No data loss, simple, predictable |
| Session ID | `x-session-id` header | No cookie dependency, works with any HTTP client |
| Price capture | price_snapshot at add time | Price changes don't affect items already in cart |
| Module structure | Single CartModule | Only 2 entities, tightly coupled |

## Database Schema

### `carts`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default uuid_generate_v4() |
| user_id | UUID | FK → users(id) ON DELETE CASCADE, UNIQUE |
| created_at | TIMESTAMP | NOT NULL, default NOW() |
| updated_at | TIMESTAMP | NOT NULL, default NOW() |

One cart per user (user_id is UNIQUE). No guest carts in DB — guests use Redis only.

### `cart_items`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default uuid_generate_v4() |
| cart_id | UUID | FK → carts(id) ON DELETE CASCADE, NOT NULL |
| product_id | UUID | FK → products(id) ON DELETE RESTRICT, NOT NULL |
| quantity | INTEGER | NOT NULL, min 1 |
| price_snapshot | DECIMAL(10, 2) | NOT NULL |

Unique constraint: `(cart_id, product_id)` — one row per product per cart.

Index: `INDEX(cart_id)`, `INDEX(product_id)`.

## Entities

All in `src/cart/entities/`:
- `cart.entity.ts`
- `cart-item.entity.ts`

## Redis Format

Guest carts stored as Redis hashes:

- Key: `cart:guest:{sessionId}`
- Fields: `productId` → `quantity` (string values)
- TTL: 7 days (604800 seconds), refreshed on write operations only (add/update/delete, not read)

No price stored in Redis — fetched from DB when reading cart.

## Session Management

Guest users are identified by `x-session-id` header.

- On first request without `x-session-id`, server generates a UUID session ID and returns it in `x-session-id` response header
- Client must persist and resend this header on subsequent requests
- Session ID is a plain UUID v4 — no encryption, no JWT

## API Endpoints

All endpoints are `@Public()` — no auth required.

**Auth detection on public routes**: The global `JwtAuthGuard` skips entirely on `@Public()` routes, so `req.user` is never populated. To detect authenticated users on cart endpoints, the controller manually verifies the JWT: extract the token from the `Authorization` header, call `JwtService.verifyAsync()`, and if valid, set the user ID. If no token or invalid token, treat as guest. This is done in a private helper in the controller (e.g., `getUserId(req)`), not via a guard.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cart` | Get cart with items and product details |
| POST | `/cart/items` | Add item to cart |
| PATCH | `/cart/items/:productId` | Update item quantity (0 = remove) |
| DELETE | `/cart/items/:productId` | Remove item from cart |
| DELETE | `/cart` | Clear entire cart |

### Add Item (`POST /cart/items`)

Body: `{ "productId": "uuid", "quantity": 2 }`

- If product already in cart: increment quantity atomically (Redis: `HINCRBY`; DB: `quantity = quantity + dto.quantity`)
- price_snapshot captured from `product.price` at add time
- Validates product exists and has stock >= requested quantity

### Update Item (`PATCH /cart/items/:productId`)

Body: `{ "quantity": 5 }`

- If quantity = 0: remove item from cart
- Validates quantity >= 0

### Get Cart (`GET /cart`)

Response includes product details for each item:

```json
{
  "items": [
    {
      "productId": "uuid",
      "quantity": 2,
      "priceSnapshot": "12.50",
      "product": {
        "id": "uuid",
        "sku": "OIL-TOY-001",
        "title": "Oil Filter Toyota Corolla",
        "price": "13.00",
        "stock": 45
      }
    }
  ],
  "totalPrice": "25.00",
  "totalItems": 2
}
```

`totalPrice` is calculated from `price_snapshot * quantity` for each item. Empty cart response: `{ "items": [], "totalPrice": "0.00", "totalItems": 0 }`.

## Merge on Login

Triggered in `AuthController.login()` after calling `AuthService.login()`:

1. Controller extracts `x-session-id` from `@Headers('x-session-id')` header
2. If sessionId present, calls `CartService.mergeGuestCart(userId, sessionId)`
3. CartService loads guest cart from Redis, merges into user's DB cart
4. For each guest item:
   - If product already in DB cart: `quantity = MAX(guest_qty, db_qty)`
   - If product not in DB cart: add with guest quantity and fresh price_snapshot
5. Delete Redis key
6. Cart continues in DB for subsequent authenticated requests

This keeps merge logic in CartService (not AuthService), avoiding circular dependencies. AuthModule imports CartModule.

## File Structure

```
src/cart/
  cart.module.ts
  cart.controller.ts
  cart.service.ts
  entities/
    cart.entity.ts
    cart-item.entity.ts
  dto/
    add-cart-item.dto.ts
    update-cart-item.dto.ts
  spec/
    cart.service.spec.ts
```

## DTO Definitions

### AddCartItemDto

- `productId` (UUID, required)
- `quantity` (integer, required, min 1)

### UpdateCartItemDto

- `quantity` (integer, required, min 0)

## Error Handling

| Scenario | HTTP Status |
|----------|------------|
| Product not found | 404 |
| Product out of stock | 400 |
| Cart item not found | 404 |
| Invalid session ID format | 400 |
| Validation failure | 400 |

Product deletion restricted if items reference it (ON DELETE RESTRICT on cart_items.product_id).

## Migrations

1. `CreateCartTables` — creates carts and cart_items tables with indexes

No seed data needed — carts are created on demand.

## Dependencies

No new packages. Uses existing `@nestjs-modules/ioredis` (Redis) and TypeORM.

## Out of Scope

- Stock reservation/checkout — Phase 4 (Orders)
- Cart caching — Phase 6
- Cart sharing/wishlists — future
- Cart abandonment notifications — future
