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
import { Category } from './category.entity'
import { ProductVehicle } from './product-vehicle.entity'

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: '255', unique: true })
  sku: string

  @Column({ length: '500' })
  title: string

  @Column({ precision: 10, scale: 2, type: 'decimal' })
  price: string

  @Column({ default: 0 })
  stock: number

  @Column({ name: 'category_id' })
  categoryId: string

  @ManyToOne(() => Category)
  @JoinColumn({ name: 'category_id' })
  category: Category

  @Column({ nullable: true, type: 'jsonb' })
  specs: Record<string, unknown> | null

  @OneToMany(() => ProductVehicle, (pv) => pv.product)
  productVehicles: ProductVehicle[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
