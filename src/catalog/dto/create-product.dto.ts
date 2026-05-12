import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator'

export class CreateProductDto {
  @IsString()
  sku: string

  @IsString()
  title: string

  @IsNumber()
  @Min(0)
  price: number

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number

  @IsUUID()
  categoryId: string

  @IsOptional()
  specs?: Record<string, unknown>

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  vehicleIds?: string[]
}
