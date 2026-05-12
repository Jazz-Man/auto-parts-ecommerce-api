import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThrottlerModule } from '@nestjs/throttler'
import { RedisModule } from '@nestjs-modules/ioredis'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
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
        host: config.get<string>('db.host'),
        port: config.get<number>('db.port'),
        username: config.get<string>('db.username'),
        password: config.get<string>('db.password'),
        database: config.get<string>('db.name'),
        autoLoadEntities: true,
        synchronize: false,
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
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: TypeOrmExceptionFilter },
  ],
})
export class AppModule {}
