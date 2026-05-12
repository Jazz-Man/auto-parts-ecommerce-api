# Phase 2 — Catalog + Vehicles Design

## Overview

Product catalog with brands, vehicles, categories, and products. Vehicle compatibility filtering (M:N via `product_vehicles`). Admin CRUD endpoints for data management, public read endpoints for browsing. Seed migration with test data.

Builds on Phase 1 (Auth, Config, TypeORM, Redis, Health).

## Technology Decisions

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Module structure | Single CatalogModule | 4 tightly related entities, shared filtering logic |
| Category tree | Self-referencing parent_id | Unlimited depth, simple schema |
| Admin CRUD | Separate `/admin/*` routes | Clear auth boundary with @Roles(ADMIN) |
| Filtering | Query params with TypeORM QueryBuilder | Dynamic WHERE/JOIN based on params |
| Seed data | Migration | Reproducible, version-controlled |

## Database Schema

### `brands`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default uuid_generate_v4() |
| name | VARCHAR(255) | NOT NULL |
| slug | VARCHAR(255) | UNIQUE, NOT NULL |

### `vehicles`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default uuid_generate_v4() |
| brand_id | UUID | FK → brands(id), NOT NULL |
| model | VARCHAR(255) | NOT NULL |
| year_start | INTEGER | NOT NULL |
| year_end | INTEGER | NOT NULL |

Index: `INDEX(brand_id)`

### `categories`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default uuid_generate_v4() |
| name | VARCHAR(255) | NOT NULL |
| slug | VARCHAR(255) | UNIQUE, NOT NULL |
| parent_id | UUID | FK → categories(id), nullable |

Self-referencing for tree structure. Root categories have `parent_id = NULL`.

### `products`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default uuid_generate_v4() |
| sku | VARCHAR(255) | UNIQUE, NOT NULL |
| title | VARCHAR(500) | NOT NULL |
| price | DECIMAL(10, 2) | NOT NULL |
| stock | INTEGER | NOT NULL, default 0 |
| category_id | UUID | FK → categories(id), NOT NULL |
| specs | JSONB | nullable |
| created_at | TIMESTAMP | NOT NULL, default NOW() |
| updated_at | TIMESTAMP | NOT NULL, default NOW() |

Indexes: `INDEX(category_id)`, `GIN(specs)`, `B-TREE(price, stock)`

### `product_vehicles`

| Column | Type | Constraints |
|--------|------|-------------|
| product_id | UUID | FK → products(id), NOT NULL |
| vehicle_id | UUID | FK → vehicles(id), NOT NULL |

Composite PK: `(product_id, vehicle_id)`. Index: `INDEX(vehicle_id, product_id)`.

## Entities

All in `src/catalog/entities/`:
- `brand.entity.ts`
- `vehicle.entity.ts`
- `category.entity.ts`
- `product.entity.ts`
- `product-vehicle.entity.ts` (join table entity)

## Public Endpoints

All public (`@Public()` decorator).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/brands` | List all brands |
| GET | `/vehicles/search?q=` | Autocomplete by model name (ILIKE) |
| GET | `/vehicles?brand_id=` | List vehicles, optional filter by brand |
| GET | `/categories` | Full category tree (nested) |
| GET | `/products` | Paginated catalog with filters |
| GET | `/products/:id` | Single product details |

### Product Filtering (`GET /products`)

Query parameters:
- `brand_id` — filter by brand (via product_vehicles → vehicles → brands)
- `vehicle_id` — filter by specific vehicle (via product_vehicles)
- `year` — filter vehicles by year range (year_start <= year <= year_end)
- `category_id` — filter by category (includes children)
- `min_price` / `max_price` — price range
- `page` — page number (default 1)
- `limit` — items per page (default 20, max 100)

Filtering logic:
- If `vehicle_id` provided: direct JOIN product_vehicles
- If `brand_id` without `vehicle_id`: JOIN product_vehicles → vehicles WHERE brand_id matches
- If `year` provided: additionally filter vehicles by year_start/year_end
- If `category_id` provided: include all descendant categories (recursive CTE or in-app resolution)

Response format:
```json
{
  "data": [...],
  "meta": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 }
}
```

### Category Tree (`GET /categories`)

Loads all categories, builds tree in service. Single DB query, O(n) in-memory assembly.

## Admin Endpoints

Protected by `@Roles(UserRole.ADMIN)` + `@UseGuards(RolesGuard)`.

Base paths under `/admin/`:

| Resource | POST (create) | PATCH (update) | DELETE |
|----------|--------------|----------------|--------|
| Brands | `/admin/brands` | `/admin/brands/:id` | `/admin/brands/:id` |
| Vehicles | `/admin/vehicles` | `/admin/vehicles/:id` | `/admin/vehicles/:id` |
| Categories | `/admin/categories` | `/admin/categories/:id` | `/admin/categories/:id` |
| Products | `/admin/products` | `/admin/products/:id` | `/admin/products/:id` |

Product create/update DTOs include `vehicleIds: string[]` for managing the M:N compatibility relation.

## File Structure

```
src/catalog/
  catalog.module.ts
  controllers/
    brand.controller.ts
    vehicle.controller.ts
    category.controller.ts
    product.controller.ts
  services/
    brand.service.ts
    vehicle.service.ts
    category.service.ts
    product.service.ts
  entities/
    brand.entity.ts
    vehicle.entity.ts
    category.entity.ts
    product.entity.ts
    product-vehicle.entity.ts
  dto/
    create-brand.dto.ts
    update-brand.dto.ts
    create-vehicle.dto.ts
    update-vehicle.dto.ts
    create-category.dto.ts
    update-category.dto.ts
    create-product.dto.ts
    update-product.dto.ts
    product-query.dto.ts
  spec/
    brand.service.spec.ts
    vehicle.service.spec.ts
    category.service.spec.ts
    product.service.spec.ts
```

## Migrations

1. `CreateCatalogTables` — creates brands, vehicles, categories, products, product_vehicles with all indexes
2. `SeedCatalogData` — inserts test data:
   - 3 brands (Toyota, BMW, Volkswagen)
   - 6 vehicles (2 per brand, varied year ranges)
   - 4 categories in tree structure (Engine > Filters, Brakes > Pads, Suspension)
   - 10 products with specs, prices, stock
   - product_vehicles links for compatibility

## Dependencies

No new packages beyond Phase 1. Uses TypeORM QueryBuilder for dynamic filtering.

## Out of Scope

- Cart logic — Phase 3
- Order/reservation — Phase 4
- Caching (Redis) — Phase 6
- Full-text search (PostgreSQL tsvector) — future
- Image uploads — future
