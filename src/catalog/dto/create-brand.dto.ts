import { IsString, Matches } from 'class-validator'

export class CreateBrandDto {
  @IsString()
  name: string

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug: string
}
