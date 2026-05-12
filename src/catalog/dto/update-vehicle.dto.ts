import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator'

export class UpdateVehicleDto {
  @IsOptional()
  @IsUUID()
  brandId?: string

  @IsOptional()
  @IsString()
  model?: string

  @IsOptional()
  @IsInt()
  @Min(1900)
  yearStart?: number

  @IsOptional()
  @IsInt()
  @Min(1900)
  yearEnd?: number
}
