// src/orders/entities/order.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import type { User } from '../../auth/entities/user.entity'
import { OrderStatus } from '../enum/order-status.enum'
import { OrderItem } from './order-item.entity'

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'user_id' })
  userId: string

  // biome-ignore lint/style/noCommonJs: circular import lazy load
  @ManyToOne(() => require('../../auth/entities/user.entity').User)
  @JoinColumn({ name: 'user_id' })
  user: User

  @Column({ default: OrderStatus.Pending, length: '20', type: 'varchar' })
  status: OrderStatus

  @Column({ precision: 10, scale: 2, type: 'decimal' })
  total: string

  @Column({ name: 'shipping_address', type: 'jsonb' })
  shippingAddress: Record<string, unknown>

  @Column({
    length: '64',
    name: 'idempotency_key',
    nullable: true,
    unique: true,
  })
  idempotencyKey: string | null

  @OneToMany(
    () => OrderItem,
    (item) => item.order,
    {
      cascade: true,
      eager: true,
    },
  )
  items: OrderItem[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
