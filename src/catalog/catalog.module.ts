import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Brand } from './entities/brand.entity'
import { Category } from './entities/category.entity'
import { Product } from './entities/product.entity'
import { ProductVehicle } from './entities/product-vehicle.entity'
import { Vehicle } from './entities/vehicle.entity'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Brand,
      Vehicle,
      Category,
      Product,
      ProductVehicle,
    ]),
  ],
})
export class CatalogModule {}
