// src/orders/dto/checkout.dto.ts

import { Type } from 'class-transformer'
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator'

export class ShippingAddressDto {
  @IsString()
  @IsNotEmpty()
  line1: string

  @IsOptional()
  @IsString()
  line2?: string

  @IsString()
  @IsNotEmpty()
  city: string

  @IsString()
  @IsNotEmpty()
  state: string

  @IsString()
  @IsNotEmpty()
  zip: string

  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  country: string
}

export class CheckoutDto {
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto
}
