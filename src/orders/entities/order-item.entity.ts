// src/orders/entities/order-item.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import type { Product } from '../../catalog/entities/product.entity'
import type { Order } from './order.entity'

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'order_id' })
  orderId: string

  @ManyToOne(
    // biome-ignore lint/style/noCommonJs: circular import lazy load
    () => require('./order.entity').Order,
    (order: Order) => order.items,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'order_id' })
  order: Order

  @Column({ name: 'product_id' })
  productId: string

  // biome-ignore lint/style/noCommonJs: circular import lazy load
  @ManyToOne(() => require('../../catalog/entities/product.entity').Product, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product

  @Column()
  quantity: number

  @Column({
    name: 'price_snapshot',
    precision: 10,
    scale: 2,
    type: 'decimal',
  })
  priceSnapshot: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
