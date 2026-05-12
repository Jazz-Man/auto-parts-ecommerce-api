import { IsInt, IsNumber, IsOptional, IsUUID, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class ProductQueryDto {
  @IsOptional()
  @IsUUID()
  brand_id?: string

  @IsOptional()
  @IsUUID()
  vehicle_id?: string

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Type(() => Number)
  year?: number

  @IsOptional()
  @IsUUID()
  category_id?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  min_price?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  max_price?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20
}
