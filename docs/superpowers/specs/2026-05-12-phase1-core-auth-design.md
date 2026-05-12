# Phase 1 — Core Setup + Auth Module Design

## Overview

Foundation for the AutoParts e-commerce API: Docker infrastructure, TypeORM with PostgreSQL, Redis, health checks, JWT authentication, and shared NestJS infrastructure (validation, error handling, rate limiting).

This phase produces a running API with user registration/login and health endpoints. All subsequent phases (Catalog, Cart, Orders, Queues) build on top of this.

## Technology Decisions

| Concern | Choice | Rationale |
|---------|--------|-----------|
| ORM | TypeORM 0.3+ | Declarative entities, migration CLI, well-integrated with NestJS |
| Auth | JWT (access + refresh) | Stateless, standard for API-only backends |
| Password hashing | `bun:password` (bcrypt) | Built into Bun, no extra dependency |
| Schema management | TypeORM migrations | Version-controlled, reproducible |
| Validation | `class-validator` + `class-transformer` | NestJS standard, DTO-based |
| Rate limiting | `@nestjs/throttler` | Built-in, configurable |
| Redis client | `ioredis` (via `@nestjs-modules/ioredis`) | NestJS module wrapping ioredis, injectable per-connection |

## Docker Compose

Services in `docker-compose.yml`:

- **postgres**: PostgreSQL 16, port 5432, volume `pgdata`
- **redis**: Redis 7 Alpine, port 6379, volume `redisdata`
- **bullboard**: Queue management UI, port 3002 (placeholder — queues added in later phase)

`.env.example` with all required variables. App container NOT included in Phase 1 — the app runs locally via `bun run start:dev`, connecting to containerized services.

## Database Schema

### `users` table

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default `uuid_generate_v4()` |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| role | ENUM('customer', 'admin') | NOT NULL, default 'customer' |
| created_at | TIMESTAMP | NOT NULL, default NOW() |
| updated_at | TIMESTAMP | NOT NULL, default NOW() |

Initial migration: `CreateUsersTable`.

## Auth Module

### Entity

`User` entity in `src/auth/entities/user.entity.ts` — mirrors the `users` table above. Password hash excluded from API responses via `@Exclude()` + `ClassSerializerInterceptor`.

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public | Create account, return tokens |
| POST | `/auth/login` | Public | Validate credentials, return tokens |
| POST | `/auth/refresh` | Refresh token | Issue new access token pair |
| POST | `/auth/logout` | JWT | Invalidate refresh token |

### JWT Strategy

- **Access token**: 15 min TTL, contains `{ sub: userId, email, role }`
- **Refresh token**: 7 day TTL, stored as hash in Redis (`refresh:{userId}:{tokenId}`) with TTL matching token expiry. On refresh, the old token is deleted from Redis before issuing a new pair (rotation). Reuse of an old refresh token invalidates all tokens for that user (reuse detection).
- **Strategies**: `JwtStrategy` (access), `JwtRefreshStrategy` (refresh)
- **Guards**: `JwtAuthGuard` globally applied, `@Public()` decorator to skip

### DTOs

- `RegisterDto`: email (valid email), password (min 8 chars)
- `LoginDto`: email, password
- `RefreshDto`: refreshToken
- Auth responses: `{ accessToken, refreshToken }` — no user data in login/register response beyond what's in the token

## Health Module

`GET /health` — uses `@nestjs/terminus`:

- `TypeOrmHealthIndicator` — ping PostgreSQL
- Custom Redis ping check

Returns `{ status: "ok", info: { db: { status: "up" }, redis: { status: "up" } } }`.

## Shared Infrastructure

### Global Pipes (main.ts)

`ValidationPipe` with:
- `whitelist: true` — strip unknown properties
- `forbidNonWhitelisted: true` — reject unknown properties with error
- `transform: true` — auto-transform types

### Error Filter

`TypeOrmExceptionFilter` — catches TypeORM `QueryFailedError`:
- Unique violation (code 23505) → 409 Conflict
- Foreign key violation (code 23503) → 400 Bad Request
- Other DB errors → 500 Internal Server Error

### Custom Decorators

- `@Public()` — marks endpoint as publicly accessible (skips JwtAuthGuard)
- `@Roles(...roles)` — specifies required roles (used with RolesGuard)

### Throttler

`ThrottlerModule` with default limits. Applied globally, excluded for health endpoint.

## File Structure

```
src/
  main.ts
  app.module.ts
  common/
    decorators/
      public.decorator.ts
      roles.decorator.ts
    filters/
      typeorm-exception.filter.ts
    guards/
      jwt-auth.guard.ts
      jwt-refresh.guard.ts
      roles.guard.ts
  config/
    config.module.ts
    configuration.ts          (validated config factory)
  auth/
    auth.module.ts
    auth.controller.ts
    auth.service.ts
    dto/
      register.dto.ts
      login.dto.ts
      refresh.dto.ts
    entities/
      user.entity.ts
    strategies/
      jwt.strategy.ts
      jwt-refresh.strategy.ts
  health/
    health.module.ts
    health.controller.ts
```

Migrations directory: `src/migrations/` (configured via `data-source.ts` at project root).

### TypeORM Configuration

Two configurations, both reading from the same env vars:

1. **Application** (`TypeOrmModule.forRootAsync` in `AppModule`): uses `ConfigModule` to read `DATABASE_URL` or individual `DB_HOST/PORT/USERNAME/PASSWORD/NAME`. Loads entities via `autoLoadEntities: true`. Sets `synchronize: false`.

2. **CLI / Migrations** (`data-source.ts` at project root): standalone DataSource for `typeorm` CLI commands (`migration:generate`, `migration:run`). Reads the same env vars via `dotenv`. References entities and migrations by glob paths.

Migration commands in `package.json`:
```
"typeorm": "bun run data-source.ts",
"migration:generate": "bun run typeorm migration:generate -d data-source.ts",
"migration:run": "bun run typeorm migration:run -d data-source.ts"
```

### Redis Configuration

`@nestjs-modules/ioredis` (`RedisModule`) registered in `AppModule` with connection config from `ConfigModule` (`REDIS_HOST`, `REDIS_PORT`). Injected via `@InjectRedis()` in services that need it. Used for:
- Refresh token storage
- Rate limiting (via ThrottlerModule with Redis storage — deferred to Phase 6, in-memory for now)

## Dependencies to Add

```
@nestjs/typeorm
@nestjs/config
@nestjs/jwt
@nestjs/passport
@nestjs/throttler
@nestjs/terminus
@nestjs-modules/ioredis
typeorm
pg
passport
passport-jwt
class-validator
class-transformer
ioredis
```

## Out of Scope for Phase 1

- CatalogModule, VehicleModule — Phase 2
- CartModule — Phase 3
- OrderModule — Phase 4
- QueueModule (BullMQ) — Phase 5
- Caching layer — Phase 6
- Idempotency interceptor — Phase 4 (with orders)
- Response wrapper interceptor — deferred until needed
- Prometheus metrics — Phase 6
