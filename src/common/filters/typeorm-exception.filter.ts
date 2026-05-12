import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Response } from 'express'
import { QueryFailedError } from 'typeorm'

@Catch(QueryFailedError)
export class TypeOrmExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(TypeOrmExceptionFilter.name)

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    // biome-ignore lint/suspicious/noExplicitAny: TypeORM driverError is not typed
    const code = (exception as any).driverError?.code as string

    if (code === '23505') {
      response.status(HttpStatus.CONFLICT).json({
        error: 'Conflict',
        message: 'Duplicate entry',
        statusCode: HttpStatus.CONFLICT,
      })
      return
    }

    if (code === '23503') {
      response.status(HttpStatus.BAD_REQUEST).json({
        error: 'Bad Request',
        message: 'Related resource not found',
        statusCode: HttpStatus.BAD_REQUEST,
      })
      return
    }

    this.logger.error(
      `Unhandled DB error: ${exception.message}`,
      exception.stack,
    )
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    })
  }
}
