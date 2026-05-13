// src/orders/interceptors/idempotency.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Redis } from 'ioredis'
import { from, Observable, of } from 'rxjs'
import { catchError, switchMap, tap } from 'rxjs/operators'

const IDEMPOTENCY_PREFIX = 'idempotency:'
const TTL_SECONDS = 86400 // 24 hours

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
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
              this.redis
                .set(
                  redisKey,
                  JSON.stringify({ body, statusCode }),
                  'EX',
                  TTL_SECONDS,
                )
                .catch(() => {
                  // intentional no-op: cache write failure is non-critical
                })
            }
          }),
        )
      }),
      catchError(() => next.handle()),
    )
  }
}
