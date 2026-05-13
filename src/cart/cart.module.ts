import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Product } from '../catalog/entities/product.entity'
import { CartService } from './cart.service'
import { CartController } from './controllers/cart.controller'
import { Cart } from './entities/cart.entity'
import { CartItem } from './entities/cart-item.entity'

@Module({
  controllers: [CartController],
  exports: [CartService],
  imports: [
    TypeOrmModule.forFeature([Cart, CartItem, Product]),
    JwtModule.register({}),
  ],
  providers: [CartService],
})
export class CartModule {}
