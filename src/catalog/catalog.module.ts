import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BrandController } from './controllers/brand.controller'
import { CategoryController } from './controllers/category.controller'
import { ProductController } from './controllers/product.controller'
import { VehicleController } from './controllers/vehicle.controller'
import { Brand } from './entities/brand.entity'
import { Category } from './entities/category.entity'
import { Product } from './entities/product.entity'
import { ProductVehicle } from './entities/product-vehicle.entity'
import { Vehicle } from './entities/vehicle.entity'
import { BrandService } from './services/brand.service'
import { CategoryService } from './services/category.service'
import { ProductService } from './services/product.service'
import { VehicleService } from './services/vehicle.service'

@Module({
  controllers: [
    BrandController,
    VehicleController,
    CategoryController,
    ProductController,
  ],
  imports: [
    TypeOrmModule.forFeature([
      Brand,
      Vehicle,
      Category,
      Product,
      ProductVehicle,
    ]),
  ],
  providers: [BrandService, VehicleService, CategoryService, ProductService],
})
export class CatalogModule {}
