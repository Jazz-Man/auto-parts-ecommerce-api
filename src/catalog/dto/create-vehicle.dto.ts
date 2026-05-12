import {
  IsInt,
  IsString,
  IsUUID,
  Min,
  ValidateBy,
  ValidationArguments,
} from 'class-validator'

export class CreateVehicleDto {
  @IsUUID()
  brandId: string

  @IsString()
  model: string

  @IsInt()
  @Min(1900)
  yearStart: number

  @IsInt()
  @Min(1900)
  @ValidateBy({
    message: (args: ValidationArguments) =>
      'yearEnd must be greater than or equal to yearStart',
    name: 'isYearEndValid',
    validator: {
      defaultMessage: () => 'yearEnd must be >= yearStart',
      validate(value: number, args: ValidationArguments) {
        const dto = args.object as CreateVehicleDto
        return value >= dto.yearStart
      },
    },
  })
  yearEnd: number
}
