import type { Product } from '../../catalog/entities/product.entity'
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import type { Cart } from './cart.entity'

@Entity('cart_items')
export class CartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'cart_id' })
  cartId: string

  @ManyToOne(() => require('./cart.entity').Cart, (cart: Cart) => cart.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'cart_id' })
  cart: Cart

  @Column({ name: 'product_id' })
  productId: string

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
