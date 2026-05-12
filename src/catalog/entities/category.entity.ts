import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm'

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: '255' })
  name: string

  @Column({ length: '255', unique: true })
  slug: string

  @Column({ name: 'parent_id', nullable: true })
  parentId: string | null

  @ManyToOne(() => Category, (category) => category.children)
  @JoinColumn({ name: 'parent_id' })
  parent: Category

  @OneToMany(() => Category, (category) => category.parent)
  children: Category[]
}
