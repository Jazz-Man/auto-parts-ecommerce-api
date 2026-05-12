import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('brands')
export class Brand {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: '255' })
  name: string

  @Column({ length: '255', unique: true })
  slug: string
}
