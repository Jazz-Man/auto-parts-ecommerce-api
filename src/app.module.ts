import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RedisModule } from '@nestjs-modules/ioredis'
import { AuthModule } from './auth/auth.module'
import { CartModule } from './cart/cart.module'
import { CatalogModule } from './catalog/catalog.module'
import { TypeOrmExceptionFilter } from './common/filters/typeorm-exception.filter'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { ConfigModule } from './config/config.module'
import { HealthModule } from './health/health.module'

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        autoLoadEntities: true,
        database: config.get<string>('db.name'),
        host: config.get<string>('db.host'),
        password: config.get<string>('db.password'),
        port: config.get<number>('db.port'),
        synchronize: false,
        type: 'postgres' as const,
        username: config.get<string>('db.username'),
      }),
    }),
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'single',
        url: `redis://${config.get<string>('redis.host')}:${config.get<number>('redis.port')}`,
      }),
    }),
    ThrottlerModule.forRoot(),
    AuthModule,
    CartModule,
    HealthModule,
    CatalogModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: TypeOrmExceptionFilter },
  ],
})
export class AppModule {}
