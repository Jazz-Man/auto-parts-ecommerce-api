# Auto Parts E-Commerce API

## Project setup

```bash
bun install
docker compose up -d
```

## Run

```bash
bun run start:dev            # dev server with watch (port 3001)
bun run build                # compile to dist/
bun run start:prod           # run compiled output
```

## Tests

```bash
bun run test                 # unit tests
bun run test:e2e             # e2e tests
bun run test:cov             # coverage
bun run lint                 # biome check --unsafe --fix
```

## Migrations

```bash
bun run migration:generate src/migrations/Name
bun run migration:run
bun run migration:revert
```

## API Usage with curl

### Health check

```bash
curl http://localhost:3001/health
```

### Register

```bash
curl -X POST http://localhost:3001/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"secret123"}'
```

Response:

```json
{ "accessToken": "...", "refreshToken": "..." }
```

### Login

```bash
curl -X POST http://localhost:3001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"secret123"}'
```

Response:

```json
{ "accessToken": "...", "refreshToken": "..." }
```

### Refresh tokens

```bash
curl -X POST http://localhost:3001/auth/refresh \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <refreshToken>' \
  -d '{"refreshToken":"<refreshToken>"}'
```

### Logout

```bash
curl -X POST http://localhost:3001/auth/logout \
  -H 'Authorization: Bearer <accessToken>'
```

## Environment

Copy `.env.example` to `.env` and adjust values. Key variables:

```
PORT=3001
DB_HOST=localhost
DB_PORT=5433
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_ACCESS_SECRET=<your-secret>
JWT_REFRESH_SECRET=<your-secret>
```
