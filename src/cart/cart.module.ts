import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Product } from '../catalog/entities/product.entity'
import { CartController } from './controllers/cart.controller'
import { CartService } from './cart.service'
import { CartItem } from './entities/cart-item.entity'
import { Cart } from './entities/cart.entity'

@Module({
  controllers: [CartController],
  imports: [
    TypeOrmModule.forFeature([Cart, CartItem, Product]),
    JwtModule.register({}),
  ],
  exports: [CartService],
  providers: [CartService],
})
export class CartModule {}
