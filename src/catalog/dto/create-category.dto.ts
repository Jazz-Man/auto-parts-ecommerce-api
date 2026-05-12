import { IsOptional, IsString, IsUUID, Matches } from 'class-validator'

export class CreateCategoryDto {
  @IsString()
  name: string

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug: string

  @IsOptional()
  @IsUUID()
  parentId?: string
}
