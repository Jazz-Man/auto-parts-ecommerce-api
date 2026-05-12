import { Type } from 'class-transformer'
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator'

export class ProductQueryDto {
  @IsOptional()
  @IsString()
  brand_id?: string

  @IsOptional()
  @IsString()
  vehicle_id?: string

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Type(() => Number)
  year?: number

  @IsOptional()
  @IsString()
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
