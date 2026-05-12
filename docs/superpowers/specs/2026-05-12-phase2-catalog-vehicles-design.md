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
| CQRS-lite | Single service per entity (not split read/write) | 4 entities share filtering logic; splitting adds complexity without benefit at this scale |
| Seed data | Separate seed script (`bun run seed`) | Avoids test data in production |
| Slug strategy | Admin provides slug on create, immutable after | Simple, no auto-generation logic needed |

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
| brand_id | UUID | FK → brands(id) ON DELETE RESTRICT, NOT NULL |
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
| parent_id | UUID | FK → categories(id) ON DELETE SET NULL, nullable |

Self-referencing for tree structure. Root categories have `parent_id = NULL`.

### `products`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default uuid_generate_v4() |
| sku | VARCHAR(255) | UNIQUE, NOT NULL |
| title | VARCHAR(500) | NOT NULL |
| price | DECIMAL(10, 2) | NOT NULL |
| stock | INTEGER | NOT NULL, default 0 |
| category_id | UUID | FK → categories(id) ON DELETE RESTRICT, NOT NULL |
| specs | JSONB | nullable |
| created_at | TIMESTAMP | NOT NULL, default NOW() |
| updated_at | TIMESTAMP | NOT NULL, default NOW() |

Indexes: `INDEX(category_id)`, `GIN(specs)`, `B-TREE(price, stock)`

### `product_vehicles`

| Column | Type | Constraints |
|--------|------|-------------|
| product_id | UUID | FK → products(id) ON DELETE CASCADE, NOT NULL |
| vehicle_id | UUID | FK → vehicles(id) ON DELETE CASCADE, NOT NULL |

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
| GET | `/vehicles/search?q=` | Autocomplete by model name (ILIKE `%q%`), returns array of `{ id, model, yearStart, yearEnd, brand }` |
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

All filters are AND-combined — results must satisfy every provided parameter.

Default sort: `products.created_at DESC` (newest first).

Filtering logic (applied as AND conditions):
- If `vehicle_id` provided: direct JOIN product_vehicles
- If `brand_id` without `vehicle_id`: JOIN product_vehicles → vehicles WHERE brand_id matches
- If `year` provided: additionally filter vehicles by year_start/year_end
- If `category_id` provided: include all descendant categories (in-app resolution — load all categories, collect descendant IDs, filter with IN clause)

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

### Admin Auth

All admin endpoints use `@Roles(UserRole.ADMIN)` + `@UseGuards(RolesGuard)`. Since the global `JwtAuthGuard` applies to all routes, admin endpoints require a valid JWT with admin role — no additional `@Public()` needed.

### Product-Vehicle Compatibility

On **create**: `vehicleIds` in the DTO sets initial M:N links. Validates all vehicle IDs exist before linking.

On **update**: `vehicleIds` **replaces** the entire compatibility set. If omitted from the update DTO, existing links are preserved unchanged. To clear all links, pass `vehicleIds: []`.

## DTO Definitions

### Brand DTOs

**CreateBrandDto**: `name` (string, required), `slug` (string, required, matches `^[a-z0-9-]+$`)

**UpdateBrandDto**: same fields as Create, all optional

### Vehicle DTOs

**CreateVehicleDto**: `brandId` (UUID, required), `model` (string, required), `yearStart` (integer, required, min 1900), `yearEnd` (integer, required, min 1900, must be >= yearStart)

**UpdateVehicleDto**: same fields as Create, all optional. If both yearStart and yearEnd provided, validate yearEnd >= yearStart. If only one provided, validate against existing DB value.

### Category DTOs

**CreateCategoryDto**: `name` (string, required), `slug` (string, required, matches `^[a-z0-9-]+$`), `parentId` (UUID, optional, must reference existing category)

**UpdateCategoryDto**: same fields as Create, all optional

### Product DTOs

**CreateProductDto**: `sku` (string, required), `title` (string, required), `price` (number, required, min 0 — accepts number in DTO, stored as DECIMAL, returned as string in JSON), `stock` (integer, optional, min 0, defaults to 0 via DB), `categoryId` (UUID, required), `specs` (JSON object, optional), `vehicleIds` (UUID array, optional, default [])

**UpdateProductDto**: same fields as Create, all optional. `vehicleIds` follows replace semantics described above.

### Product Query DTO

**ProductQueryDto**: `brandId` (UUID, optional), `vehicleId` (UUID, optional), `year` (integer, optional, min 1900), `categoryId` (UUID, optional), `minPrice` (decimal, optional), `maxPrice` (decimal, optional), `page` (integer, optional, default 1, min 1), `limit` (integer, optional, default 20, min 1, max 100)

## Response Shapes

All admin create/update endpoints return the full entity object. Delete returns `{ deleted: true }`.

### Brand Response
```json
{ "id": "uuid", "name": "Toyota", "slug": "toyota" }
```

### Vehicle Response
```json
{ "id": "uuid", "brandId": "uuid", "model": "Corolla", "yearStart": 2015, "yearEnd": 2023 }
```

### Category Response (flat)
```json
{ "id": "uuid", "name": "Engine", "slug": "engine", "parentId": null }
```

### Category Tree Response (nested)
```json
[
  {
    "id": "uuid", "name": "Engine", "slug": "engine", "parentId": null,
    "children": [
      { "id": "uuid", "name": "Filters", "slug": "filters", "parentId": "uuid", "children": [] }
    ]
  }
]
```

### Product Response (detail, includes relations)
```json
{
  "id": "uuid", "sku": "OIL-TOY-001", "title": "Oil Filter Toyota Corolla",
  "price": "12.50", "stock": 45, "categoryId": "uuid",
  "specs": { "material": "cellulose", "threadSize": "M20x1.5" },
  "category": { "id": "uuid", "name": "Filters", "slug": "filters" },
  "vehicles": [
    { "id": "uuid", "model": "Corolla", "yearStart": 2015, "yearEnd": 2023,
      "brand": { "id": "uuid", "name": "Toyota", "slug": "toyota" } }
  ],
  "createdAt": "2026-05-12T00:00:00.000Z", "updatedAt": "2026-05-12T00:00:00.000Z"
}
```

### Product List Response (paginated, scalar fields only — relations omitted for performance)
```json
{
  "data": [
    { "id": "uuid", "sku": "OIL-TOY-001", "title": "...", "price": "12.50", "stock": 45 }
  ],
  "meta": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 }
}
```

## Error Handling

| Scenario | HTTP Status | Condition |
|----------|------------|-----------|
| Resource not found | 404 | GET/PATCH/DELETE by ID that doesn't exist |
| Duplicate slug/sku | 409 | Create/update with slug or SKU already taken (caught by TypeOrmExceptionFilter on unique constraint violation) |
| Invalid FK reference | 400 | brandId, categoryId, parentId, or vehicleId references non-existent entity (caught by TypeOrmExceptionFilter on FK violation) |
| Validation failure | 400 | Missing required fields, invalid format (class-validator via ValidationPipe) |
| Category self-reference | 400 | Setting parentId to own ID |
| Delete with dependents | 409 | Deleting a brand with vehicles, or a category with products (ON DELETE RESTRICT) |

Category cycle prevention: on create/update, if `parentId` is provided, validate the target is not a descendant of the current category (prevents circular references).

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
