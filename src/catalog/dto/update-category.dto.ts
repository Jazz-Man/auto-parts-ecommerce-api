import { IsOptional, IsString, IsUUID, Matches } from 'class-validator'

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug?: string

  @IsOptional()
  @IsUUID()
  parentId?: string
}
