# Phase 1 — Core + Auth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Docker infrastructure, TypeORM with PostgreSQL, Redis, JWT authentication (access + refresh with rotation), health checks, and shared NestJS infrastructure.

**Architecture:** Classic NestJS modular structure. AppModule registers ConfigModule, TypeOrmModule, RedisModule, ThrottlerModule. AuthModule handles registration/login/refresh/logout with JWT strategies and guards. HealthModule provides DB + Redis healthcheck. Shared infrastructure in `common/` (decorators, filters, guards).

**Tech Stack:** NestJS 11, TypeORM 0.3+, PostgreSQL 16, Redis 7, Bun, JWT (passport-jwt), class-validator, Biome

**Spec:** `docs/superpowers/specs/2026-05-12-phase1-core-auth-design.md`

---

## File Structure Map

### New files to create:

```
docker-compose.yml                    — Postgres, Redis, BullBoard services
.env.example                          — All required env vars
data-source.ts                        — TypeORM CLI DataSource for migrations

src/config/configuration.ts           — Validated config factory (DB, Redis, JWT settings)
src/config/config.module.ts           — ConfigModule registration

src/common/decorators/public.decorator.ts    — @Public() marks routes as public
src/common/decorators/roles.decorator.ts     — @Roles() specifies required roles
src/common/filters/typeorm-exception.filter.ts — Maps TypeORM errors to HTTP
src/common/guards/jwt-auth.guard.ts          — Global JWT guard (respects @Public)
src/common/guards/jwt-refresh.guard.ts       — Refresh token guard
src/common/guards/roles.guard.ts             — Role-based guard

src/auth/auth.module.ts               — Auth module registration
src/auth/auth.controller.ts           — POST register/login/refresh/logout
src/auth/auth.service.ts              — Auth logic, token generation, Redis ops
src/auth/dto/register.dto.ts          — email + password validation
src/auth/dto/login.dto.ts             — email + password
src/auth/dto/refresh.dto.ts           — refreshToken
src/auth/entities/user.entity.ts      — User entity (TypeORM)
src/auth/entities/user-role.enum.ts   — customer/admin enum
src/auth/strategies/jwt.strategy.ts   — Access token Passport strategy
src/auth/strategies/jwt-refresh.strategy.ts — Refresh token Passport strategy

src/health/health.module.ts           — Health module
src/health/health.controller.ts       — GET /health

src/migrations/1747000000000-CreateUsersTable.ts — Initial migration
```

### Files to modify:

```
package.json                          — Add dependencies, migration scripts
src/main.ts                           — Add global pipes, CORS
src/app.module.ts                     — Register all new modules, remove default scaffold
src/app.controller.ts                 — DELETE (replaced by module structure)
src/app.service.ts                    — DELETE (replaced by module structure)
src/app.controller.spec.ts            — DELETE (replaced by module tests)
test/app.e2e-spec.ts                  — Rewrite for health endpoint
```

---

## Chunk 1: Docker, Config, TypeORM, Migrations

### Task 1: Docker Compose + Environment

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - '5432:5432'
    environment:
      POSTGRES_USER: ${DB_USERNAME:-autoparts}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-autoparts}
      POSTGRES_DB: ${DB_NAME:-autoparts}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${DB_USERNAME:-autoparts}']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redisdata:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5

  bullboard:
    image: deadly0/bull-board:latest
    ports:
      - '3001:3000'
    environment:
      REDIS_HOST: ${REDIS_HOST:-redis}
      REDIS_PORT: ${REDIS_PORT:-6379}
    depends_on:
      - redis

volumes:
  pgdata:
  redisdata:
```

- [ ] **Step 2: Create .env.example**

```
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=autoparts
DB_PASSWORD=autoparts
DB_NAME=autoparts

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_ACCESS_SECRET=change-me-access-secret
JWT_REFRESH_SECRET=change-me-refresh-secret
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=604800

# App
PORT=3000
NODE_ENV=development
```

- [ ] **Step 3: Copy .env.example to .env and start Docker**

```bash
cp .env.example .env
docker compose up -d
```

Run: `docker compose ps`
Expected: postgres and redis showing `healthy`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat: add Docker Compose with Postgres, Redis, BullBoard"
```

---

### Task 2: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install production dependencies**

```bash
bun add @nestjs/typeorm @nestjs/config @nestjs/jwt @nestjs/passport @nestjs/throttler @nestjs/terminus typeorm pg passport passport-jwt class-validator class-transformer ioredis @nestjs-modules/ioredis
```

- [ ] **Step 2: Install dev dependencies**

```bash
bun add -d @types/passport-jwt
```

- [ ] **Step 3: Add migration scripts to package.json**

Add to `scripts`:

```json
"typeorm": "bun run --bun node_modules/typeorm/cli.js",
"migration:generate": "bun run typeorm migration:generate -d data-source.ts",
"migration:run": "bun run typeorm migration:run -d data-source.ts",
"migration:revert": "bun run typeorm migration:revert -d data-source.ts"
```

- [ ] **Step 4: Verify install**

Run: `bun install`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock
git commit -m "feat: add TypeORM, JWT, Redis, config dependencies"
```

---

### Task 3: Config Module

**Files:**
- Create: `src/config/configuration.ts`
- Create: `src/config/config.module.ts`

- [ ] **Step 1: Write configuration.ts**

```typescript
export default () => ({
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'autoparts',
    password: process.env.DB_PASSWORD || 'autoparts',
    name: process.env.DB_NAME || 'autoparts',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL || '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL || '604800', 10),
  },
  port: parseInt(process.env.PORT || '3000', 10),
})
```

- [ ] **Step 2: Write config.module.ts**

```typescript
import { Module } from '@nestjs/common'
import { ConfigModule as NestConfigModule } from '@nestjs/config'
import configuration from './configuration'

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
    }),
  ],
})
export class ConfigModule {}
```

- [ ] **Step 3: Commit**

```bash
git add src/config/
git commit -m "feat: add ConfigModule with validated env configuration"
```

---

### Task 4: TypeORM Setup + data-source.ts

**Files:**
- Create: `data-source.ts` (project root)
- Modify: `src/app.module.ts`

- [ ] **Step 1: Create data-source.ts at project root**

```typescript
import 'reflect-metadata'
import { DataSource } from 'typeorm'

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'autoparts',
  password: process.env.DB_PASSWORD || 'autoparts',
  database: process.env.DB_NAME || 'autoparts',
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
})
```

- [ ] **Step 2: Update app.module.ts to register TypeORM + Config + Redis**

```typescript
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThrottlerModule } from '@nestjs/throttler'
import { RedisModule } from '@nestjs-modules/ioredis'
import { ConfigModule } from './config/config.module'

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get('db.host'),
        port: config.get<number>('db.port'),
        username: config.get('db.username'),
        password: config.get('db.password'),
        database: config.get('db.name'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'single',
        url: `redis://${config.get('redis.host')}:${config.get('redis.port')}`,
      }),
    }),
    ThrottlerModule.forRoot(),
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Verify app boots**

Run: `bun run start:dev`
Expected: app starts, connects to Postgres + Redis. May fail on missing modules — that's fine for now, verify config loads.

- [ ] **Step 4: Commit**

```bash
git add data-source.ts src/app.module.ts
git commit -m "feat: add TypeORM, Redis, ThrottlerModule to AppModule"
```

---

### Task 5: User Entity + Migration

**Files:**
- Create: `src/auth/entities/user-role.enum.ts`
- Create: `src/auth/entities/user.entity.ts`
- Create: `src/migrations/1747000000000-CreateUsersTable.ts`

- [ ] **Step 1: Create user-role.enum.ts**

```typescript
export enum UserRole {
  CUSTOMER = 'customer',
  ADMIN = 'admin',
}
```

- [ ] **Step 2: Create user.entity.ts**

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { Exclude } from 'class-transformer'
import { UserRole } from './user-role.enum'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ unique: true })
  email: string

  @Column({ name: 'password_hash' })
  @Exclude()
  passwordHash: string

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.CUSTOMER,
  })
  role: UserRole

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
```

- [ ] **Step 3: Generate the migration**

```bash
bun run migration:generate src/migrations/CreateUsersTable
```

If the CLI doesn't generate properly, create manually:

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm'

export class CreateUsersTable1747000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)

    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('customer', 'admin')`,
    )

    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'email', type: 'varchar', length: '255', isUnique: true },
          { name: 'password_hash', type: 'varchar', length: '255' },
          {
            name: 'role',
            type: 'enum',
            enum: ['customer', 'admin'],
            default: `'customer'`,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users')
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`)
  }
}
```

- [ ] **Step 4: Run migration**

```bash
bun run migration:run
```

Run: `docker compose exec postgres psql -U autoparts -c '\dt users'`
Expected: `users` table exists with all columns

- [ ] **Step 5: Commit**

```bash
git add src/auth/entities/ src/migrations/
git commit -m "feat: add User entity and CreateUsersTable migration"
```

---

### Task 6: Shared Infrastructure (decorators, filter)

**Files:**
- Create: `src/common/decorators/public.decorator.ts`
- Create: `src/common/decorators/roles.decorator.ts`
- Create: `src/common/filters/typeorm-exception.filter.ts`

- [ ] **Step 1: Create public.decorator.ts**

```typescript
import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
```

- [ ] **Step 2: Create roles.decorator.ts**

```typescript
import { SetMetadata } from '@nestjs/common'
import { UserRole } from '../../auth/entities/user-role.enum'

export const ROLES_KEY = 'roles'
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles)
```

- [ ] **Step 3: Create typeorm-exception.filter.ts**

```typescript
import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { QueryFailedError } from 'typeorm'
import { Response } from 'express'

@Catch(QueryFailedError)
export class TypeOrmExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(TypeOrmExceptionFilter.name)

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    const code = (exception as any).driverError?.code as string

    if (code === '23505') {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        message: 'Duplicate entry',
        error: 'Conflict',
      })
      return
    }

    if (code === '23503') {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Related resource not found',
        error: 'Bad Request',
      })
      return
    }

    this.logger.error(`Unhandled DB error: ${exception.message}`, exception.stack)
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    })
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/common/
git commit -m "feat: add @Public, @Roles decorators and TypeORM exception filter"
```

---

### Task 7: Update main.ts + Clean Up Scaffold

**Files:**
- Modify: `src/main.ts`
- Delete: `src/app.controller.ts`
- Delete: `src/app.service.ts`
- Delete: `src/app.controller.spec.ts`

- [ ] **Step 1: Update main.ts**

```typescript
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common'
import { NestFactory, Reflector } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  )

  await app.listen(process.env.PORT ?? 3000)
}
bootstrap()
```

- [ ] **Step 2: Delete scaffold files**

```bash
rm src/app.controller.ts src/app.service.ts src/app.controller.spec.ts
```

- [ ] **Step 3: Verify app boots**

Run: `bun run start:dev`
Expected: app starts without errors (no routes yet, that's fine)

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git rm src/app.controller.ts src/app.service.ts src/app.controller.spec.ts
git commit -m "feat: add global validation + serializer, remove default scaffold"
```

---

## Chunk 2: Auth Module

### Task 8: Auth DTOs

**Files:**
- Create: `src/auth/dto/register.dto.ts`
- Create: `src/auth/dto/login.dto.ts`
- Create: `src/auth/dto/refresh.dto.ts`

- [ ] **Step 1: Create register.dto.ts**

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator'

export class RegisterDto {
  @IsEmail()
  email: string

  @IsString()
  @MinLength(8)
  password: string
}
```

- [ ] **Step 2: Create login.dto.ts**

```typescript
import { IsEmail, IsString } from 'class-validator'

export class LoginDto {
  @IsEmail()
  email: string

  @IsString()
  password: string
}
```

- [ ] **Step 3: Create refresh.dto.ts**

```typescript
import { IsString } from 'class-validator'

export class RefreshDto {
  @IsString()
  refreshToken: string
}
```

- [ ] **Step 4: Commit**

```bash
git add src/auth/dto/
git commit -m "feat: add auth DTOs (register, login, refresh)"
```

---

### Task 9: JWT Strategies

**Files:**
- Create: `src/auth/strategies/jwt.strategy.ts`
- Create: `src/auth/strategies/jwt-refresh.strategy.ts`

- [ ] **Step 1: Create jwt.strategy.ts**

```typescript
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { UserRole } from '../entities/user-role.enum'

interface JwtPayload {
  sub: string
  email: string
  role: UserRole
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret'),
    })
  }

  validate(payload: JwtPayload) {
    return { userId: payload.sub, email: payload.email, role: payload.role }
  }
}
```

- [ ] **Step 2: Create jwt-refresh.strategy.ts**

```typescript
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

interface RefreshPayload {
  sub: string
  tokenId: string
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.refreshSecret'),
    })
  }

  validate(payload: RefreshPayload) {
    return { userId: payload.sub, tokenId: payload.tokenId }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/auth/strategies/
git commit -m "feat: add JWT access and refresh Passport strategies"
```

---

### Task 10: Guards

**Files:**
- Create: `src/common/guards/jwt-auth.guard.ts`
- Create: `src/common/guards/jwt-refresh.guard.ts`
- Create: `src/common/guards/roles.guard.ts`

- [ ] **Step 1: Create jwt-auth.guard.ts (respects @Public)**

```typescript
import { Injectable, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true
    return super.canActivate(context)
  }
}
```

- [ ] **Step 2: Create jwt-refresh.guard.ts**

```typescript
import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
```

- [ ] **Step 3: Create roles.guard.ts**

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { UserRole } from '../../auth/entities/user-role.enum'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!requiredRoles) return true
    const { role } = context.switchToHttp().getRequest().user
    return requiredRoles.includes(role)
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/common/guards/
git commit -m "feat: add JwtAuth, JwtRefresh, and Roles guards"
```

---

### Task 11: Auth Service

**Files:**
- Create: `src/auth/auth.service.ts`
- Test: `src/auth/auth.service.spec.ts`

- [ ] **Step 1: Write failing test for auth.service.spec.ts**

```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Redis } from 'ioredis'
import { ConflictException, UnauthorizedException } from '@nestjs/common'
import { AuthService } from './auth.service'
import { User } from './entities/user.entity'
import { UserRole } from './entities/user-role.enum'

describe('AuthService', () => {
  let service: AuthService
  let jwtService: JwtService
  let redis: Redis

  const mockRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  }

  const mockRedis = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, any> = {
                'jwt.accessSecret': 'test-access-secret',
                'jwt.refreshSecret': 'test-refresh-secret',
                'jwt.accessTtl': 900,
                'jwt.refreshTtl': 604800,
              }
              return map[key]
            }),
          },
        },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
    jwtService = module.get<JwtService>(JwtService)
    redis = module.get('default_IORedisModuleConnectionToken')
    jest.clearAllMocks()
  })

  describe('register', () => {
    it('should throw ConflictException if email exists', async () => {
      mockRepo.findOne.mockResolvedValue({ id: '1', email: 'a@b.com' })
      await expect(service.register('a@b.com', 'password1')).rejects.toThrow(
        ConflictException,
      )
    })

    it('should create user and return tokens', async () => {
      mockRepo.findOne.mockResolvedValue(null)
      mockRepo.create.mockReturnValue({ id: 'uuid', email: 'a@b.com' })
      mockRepo.save.mockResolvedValue({ id: 'uuid', email: 'a@b.com' })
      ;(jwtService.signAsync as jest.Mock)
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token')

      const result = await service.register('a@b.com', 'password1')
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    })
  })

  describe('login', () => {
    it('should throw UnauthorizedException for wrong password', async () => {
      const realHash = await Bun.password.hash('correct-password')
      mockRepo.findOne.mockResolvedValue({
        id: '1',
        email: 'a@b.com',
        passwordHash: realHash,
      })

      await expect(service.login('a@b.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      )
    })

    it('should return tokens for valid credentials', async () => {
      const realHash = await Bun.password.hash('password1')
      mockRepo.findOne.mockResolvedValue({
        id: '1',
        email: 'a@b.com',
        passwordHash: realHash,
        role: 'customer',
      })
      ;(jwtService.signAsync as jest.Mock)
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token')

      const result = await service.login('a@b.com', 'password1')
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    })

    it('should throw UnauthorizedException if user not found', async () => {
      mockRepo.findOne.mockResolvedValue(null)
      await expect(service.login('a@b.com', 'password1')).rejects.toThrow(
        UnauthorizedException,
      )
    })
  })

  describe('refreshTokens', () => {
    it('should throw UnauthorizedException if token not in Redis', async () => {
      mockRedis.get.mockResolvedValue(null)
      await expect(
        service.refreshTokens('user-id', 'token-id', 'old-refresh'),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('should rotate tokens and delete old one', async () => {
      mockRedis.get.mockResolvedValue('hashed-token')
      ;(jwtService.signAsync as jest.Mock)
        .mockResolvedValueOnce('new-access')
        .mockResolvedValueOnce('new-refresh')

      const result = await service.refreshTokens('user-id', 'token-id', 'old-refresh')
      expect(mockRedis.del).toHaveBeenCalledWith('refresh:user-id:token-id')
      expect(result).toEqual({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      })
    })
  })

  describe('logout', () => {
    it('should delete refresh token from Redis', async () => {
      mockRedis.del.mockResolvedValue(1)
      await service.logout('user-id', 'token-id')
      expect(mockRedis.del).toHaveBeenCalledWith('refresh:user-id:token-id')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/auth/auth.service.spec.ts`
Expected: FAIL — `AuthService` does not exist yet

- [ ] **Step 3: Write auth.service.ts**

```typescript
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { password as bunPassword } from 'bun'
import { Redis } from 'ioredis'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { User } from './entities/user.entity'
import { UserRole } from './entities/user-role.enum'

interface TokenPair {
  accessToken: string
  refreshToken: string
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  async register(email: string, password: string): Promise<TokenPair> {
    const existing = await this.userRepo.findOne({ where: { email } })
    if (existing) throw new ConflictException('Email already registered')

    const passwordHash = await bunPassword.hash(password)
    const user = this.userRepo.create({ email, passwordHash })
    await this.userRepo.save(user)

    return this.generateTokenPair(user.id, user.email, user.role)
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.userRepo.findOne({ where: { email } })
    if (!user) throw new UnauthorizedException('Invalid credentials')

    const valid = await bunPassword.verify(password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    return this.generateTokenPair(user.id, user.email, user.role)
  }

  async refreshTokens(
    userId: string,
    tokenId: string,
    oldRefreshToken: string,
  ): Promise<TokenPair> {
    const key = `refresh:${userId}:${tokenId}`
    const stored = await this.redis.get(key)

    if (!stored) {
      await this.invalidateAllUserTokens(userId)
      throw new UnauthorizedException('Invalid refresh token')
    }

    const valid = await bunPassword.verify(oldRefreshToken, stored)
    if (!valid) {
      await this.invalidateAllUserTokens(userId)
      throw new UnauthorizedException('Invalid refresh token')
    }

    await this.redis.del(key)

    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) throw new UnauthorizedException()

    return this.generateTokenPair(user.id, user.email, user.role)
  }

  async logout(userId: string, tokenId: string): Promise<void> {
    await this.redis.del(`refresh:${userId}:${tokenId}`)
  }

  private async generateTokenPair(
    userId: string,
    email: string,
    role: UserRole,
  ): Promise<TokenPair> {
    const tokenId = crypto.randomUUID()

    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, role },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: this.config.get<number>('jwt.accessTtl'),
      },
    )

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, tokenId },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<number>('jwt.refreshTtl'),
      },
    )

    const refreshTtl = this.config.get<number>('jwt.refreshTtl')
    const hashedRefresh = await bunPassword.hash(refreshToken)
    await this.redis.set(
      `refresh:${userId}:${tokenId}`,
      hashedRefresh,
      'EX',
      refreshTtl,
    )

    return { accessToken, refreshToken }
  }

  private async invalidateAllUserTokens(userId: string): Promise<void> {
    const keys = await this.redis.keys(`refresh:${userId}:*`)
    if (keys.length) await this.redis.del(...keys)
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test -- src/auth/auth.service.spec.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.service.ts src/auth/auth.service.spec.ts
git commit -m "feat: add AuthService with register, login, refresh, logout"
```

---

### Task 12: Auth Controller

**Files:**
- Create: `src/auth/auth.controller.ts`
- Test: `src/auth/auth.controller.spec.ts`

- [ ] **Step 1: Write failing test for auth.controller.spec.ts**

```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { RefreshDto } from './dto/refresh.dto'

describe('AuthController', () => {
  let controller: AuthController
  let service: AuthService

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refreshTokens: jest.fn(),
    logout: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile()

    controller = module.get<AuthController>(AuthController)
    service = module.get<AuthService>(AuthService)
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('register', () => {
    it('should call service.register and return tokens', async () => {
      const tokens = { accessToken: 'a', refreshToken: 'r' }
      mockAuthService.register.mockResolvedValue(tokens)

      const result = await controller.register({
        email: 'a@b.com',
        password: 'password1',
      } as RegisterDto)
      expect(result).toEqual(tokens)
      expect(service.register).toHaveBeenCalledWith('a@b.com', 'password1')
    })
  })

  describe('login', () => {
    it('should call service.login and return tokens', async () => {
      const tokens = { accessToken: 'a', refreshToken: 'r' }
      mockAuthService.login.mockResolvedValue(tokens)

      const result = await controller.login({
        email: 'a@b.com',
        password: 'password1',
      } as LoginDto)
      expect(result).toEqual(tokens)
    })
  })

  describe('refresh', () => {
    it('should call service.refreshTokens', async () => {
      const tokens = { accessToken: 'new-a', refreshToken: 'new-r' }
      mockAuthService.refreshTokens.mockResolvedValue(tokens)

      const result = await controller.refresh(
        { userId: 'u1', tokenId: 't1' } as any,
        { refreshToken: 'old-r' } as RefreshDto,
      )
      expect(result).toEqual(tokens)
      expect(service.refreshTokens).toHaveBeenCalledWith('u1', 't1', 'old-r')
    })
  })

  describe('logout', () => {
    it('should call service.logout', async () => {
      mockAuthService.logout.mockResolvedValue(undefined)
      await controller.logout({ userId: 'u1', tokenId: 't1' } as any)
      expect(service.logout).toHaveBeenCalledWith('u1', 't1')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/auth/auth.controller.spec.ts`
Expected: FAIL — `AuthController` does not exist yet

- [ ] **Step 3: Write auth.controller.ts**

```typescript
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { RefreshDto } from './dto/refresh.dto'
import { Public } from '../common/decorators/public.decorator'
import { JwtRefreshGuard } from '../common/guards/jwt-refresh.guard'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { Request } from 'express'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password)
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password)
  }

  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  refresh(@Req() req: Request, @Body() dto: RefreshDto) {
    const { userId, tokenId } = req.user as { userId: string; tokenId: string }
    return this.auth.refreshTokens(userId, tokenId, dto.refreshToken)
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() req: Request) {
    const user = req.user as { userId: string; tokenId?: string }
    return this.auth.logout(user.userId, user.tokenId ?? '')
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test -- src/auth/auth.controller.spec.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.controller.ts src/auth/auth.controller.spec.ts
git commit -m "feat: add AuthController with register, login, refresh, logout"
```

---

### Task 13: Auth Module Registration

**Files:**
- Create: `src/auth/auth.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Create auth.module.ts**

```typescript
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { User } from './entities/user.entity'
import { JwtStrategy } from './strategies/jwt.strategy'
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy'

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy],
})
export class AuthModule {}
```

- [ ] **Step 2: Update app.module.ts — add AuthModule, HealthModule, global guards, global filter**

```typescript
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThrottlerModule } from '@nestjs/throttler'
import { RedisModule } from '@nestjs-modules/ioredis'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from './config/config.module'
import { AuthModule } from './auth/auth.module'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { TypeOrmExceptionFilter } from './common/filters/typeorm-exception.filter'
import { HealthModule } from './health/health.module'

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get('db.host'),
        port: config.get<number>('db.port'),
        username: config.get('db.username'),
        password: config.get('db.password'),
        database: config.get('db.name'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'single',
        url: `redis://${config.get('redis.host')}:${config.get('redis.port')}`,
      }),
    }),
    ThrottlerModule.forRoot(),
    AuthModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    TypeOrmExceptionFilter,
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Commit**

```bash
git add src/auth/auth.module.ts src/app.module.ts
git commit -m "feat: register AuthModule, global JWT guard, TypeORM filter"
```

---

## Chunk 3: Health Module + E2E + Final Integration

### Task 14: Health Module

**Files:**
- Create: `src/health/health.module.ts`
- Create: `src/health/health.controller.ts`

- [ ] **Step 1: Create health.module.ts**

```typescript
import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'
import { HealthController } from './health.controller'

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 2: Create health.controller.ts**

```typescript
import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Redis } from 'ioredis'
import { Public } from '../common/decorators/public.decorator'

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    @InjectRedis()
    private redis: Redis,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('db'),
      async () => {
        await this.redis.ping()
        return { redis: { status: 'up' } }
      },
    ])
  }
}
```

- [ ] **Step 3: Verify health endpoint**

Run: `bun run start:dev`

Then: `curl http://localhost:3000/health`
Expected: `{"status":"ok","info":{"db":{"status":"up"},"redis":{"status":"up"}}}`

- [ ] **Step 4: Commit**

```bash
git add src/health/
git commit -m "feat: add HealthModule with DB and Redis checks"
```

---

### Task 15: E2E Tests

**Files:**
- Modify: `test/app.e2e-spec.ts`
- Create: `test/auth.e2e-spec.ts`

- [ ] **Step 1: Rewrite test/app.e2e-spec.ts for health endpoint**

```typescript
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { ClassSerializerInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import request from 'supertest'
import { App } from 'supertest/types'
import { AppModule } from '../src/app.module'

describe('Health (e2e)', () => {
  let app: INestApplication<App>

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok')
        expect(res.body.info.db.status).toBe('up')
        expect(res.body.info.redis.status).toBe('up')
      })
  })
})
```

- [ ] **Step 2: Create test/auth.e2e-spec.ts**

```typescript
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { ClassSerializerInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'
import { AppModule } from '../src/app.module'

describe('Auth (e2e)', () => {
  let app: INestApplication<App>
  let accessToken: string
  let refreshToken: string

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  const testEmail = `e2e-${Date.now()}@test.com`
  const testPassword = 'testpassword1'

  describe('POST /auth/register', () => {
    it('should register a new user', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: testEmail, password: testPassword })
        .expect(201)
        .expect((res) => {
          expect(res.body.accessToken).toBeDefined()
          expect(res.body.refreshToken).toBeDefined()
          accessToken = res.body.accessToken
          refreshToken = res.body.refreshToken
        })
    })

    it('should reject duplicate email', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: testEmail, password: testPassword })
        .expect(409)
    })

    it('should validate email format', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: testPassword })
        .expect(400)
    })

    it('should enforce min password length', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'new@test.com', password: 'short' })
        .expect(400)
    })
  })

  describe('POST /auth/login', () => {
    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(201)
        .expect((res) => {
          expect(res.body.accessToken).toBeDefined()
          expect(res.body.refreshToken).toBeDefined()
          accessToken = res.body.accessToken
          refreshToken = res.body.refreshToken
        })
    })

    it('should reject wrong password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: 'wrongpassword' })
        .expect(401)
    })
  })

  describe('POST /auth/refresh', () => {
    it('should issue new token pair', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .send({ refreshToken })
        .expect(201)
        .expect((res) => {
          expect(res.body.accessToken).toBeDefined()
          expect(res.body.refreshToken).toBeDefined()
          accessToken = res.body.accessToken
          refreshToken = res.body.refreshToken
        })
    })
  })

  describe('POST /auth/logout', () => {
    it('should logout successfully', () => {
      return request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201)
    })
  })
})
```

- [ ] **Step 3: Run unit tests**

Run: `bun run test`
Expected: all tests PASS

- [ ] **Step 4: Run E2E tests**

Run: `bun run test:e2e`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add test/
git commit -m "feat: add E2E tests for health and auth endpoints"
```

---

### Task 16: Lint + Final Verification

**Files:**
- Potentially modify: any files with lint issues

- [ ] **Step 1: Run Biome lint**

Run: `bun run lint`
Expected: no errors. Fix any that appear.

- [ ] **Step 2: Run all unit tests**

Run: `bun run test`
Expected: all PASS

- [ ] **Step 3: Run all E2E tests**

Run: `bun run test:e2e`
Expected: all PASS

- [ ] **Step 4: Manual smoke test**

```bash
# Start app
bun run start:dev

# Health check
curl http://localhost:3000/health

# Register
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"password1"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"password1"}'

# Access protected route (should fail without token)
curl http://localhost:3000/health # this is public, should work
```

- [ ] **Step 5: Final commit if any fixes**

```bash
git add -A
git commit -m "chore: fix lint issues from Phase 1"
```

---

## Summary

| Task | Description | Depends on |
|------|-------------|------------|
| 1 | Docker Compose + .env | — |
| 2 | Install dependencies | — |
| 3 | Config module | 2 |
| 4 | TypeORM + data-source + AppModule | 2, 3 |
| 5 | User entity + migration | 4 |
| 6 | Shared infrastructure (decorators, filter) | — |
| 7 | Update main.ts + clean scaffold | 4 |
| 8 | Auth DTOs | — |
| 9 | JWT strategies | 3 |
| 10 | Guards | 6, 9 |
| 11 | Auth service (TDD) | 5, 9 |
| 12 | Auth controller (TDD) | 8, 10, 11 |
| 13 | Auth module registration | 12 |
| 14 | Health module | 4 |
| 15 | E2E tests | 13, 14 |
| 16 | Lint + final verification | 15 |

Tasks 1, 2, 6, 8 can run in parallel (no dependencies).
