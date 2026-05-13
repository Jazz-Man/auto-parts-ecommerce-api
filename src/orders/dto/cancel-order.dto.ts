// src/orders/dto/cancel-order.dto.ts
import { IsOptional, IsString } from 'class-validator'

export class CancelOrderDto {
  @IsOptional()
  @IsString()
  reason?: string
}
