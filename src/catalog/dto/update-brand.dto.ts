import { IsOptional, IsString, Matches } from 'class-validator'

export class UpdateBrandDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug?: string
}
