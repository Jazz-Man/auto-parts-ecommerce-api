import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { Brand } from './brand.entity'

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'brand_id' })
  brandId: string

  @ManyToOne(() => Brand)
  @JoinColumn({ name: 'brand_id' })
  brand: Brand

  @Column({ length: '255' })
  model: string

  @Column({ name: 'year_start' })
  yearStart: number

  @Column({ name: 'year_end' })
  yearEnd: number
}
