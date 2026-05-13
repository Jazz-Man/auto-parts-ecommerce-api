// src/orders/orders.module.ts
import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Cart } from '../cart/entities/cart.entity'
import { CartItem } from '../cart/entities/cart-item.entity'
import { Product } from '../catalog/entities/product.entity'
import { OrdersController } from './controllers/orders.controller'
import { Order } from './entities/order.entity'
import { OrderItem } from './entities/order-item.entity'
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor'
import { OrdersService } from './orders.service'

@Module({
  controllers: [OrdersController],
  exports: [OrdersService],
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Product, Cart, CartItem]),
  ],
  providers: [
    OrdersService,
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class OrdersModule {}
