import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Brand } from './entities/brand.entity'
import { Category } from './entities/category.entity'
import { Product } from './entities/product.entity'
import { ProductVehicle } from './entities/product-vehicle.entity'
import { Vehicle } from './entities/vehicle.entity'
import { BrandController } from './controllers/brand.controller'
import { BrandService } from './services/brand.service'
import { CategoryController } from './controllers/category.controller'
import { CategoryService } from './services/category.service'

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
  controllers: [BrandController, CategoryController],
  providers: [BrandService, CategoryService],
})
export class CatalogModule {}
