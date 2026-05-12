import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CreateCategoryDto } from '../dto/create-category.dto'
import { UpdateCategoryDto } from '../dto/update-category.dto'
import { Category } from '../entities/category.entity'

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async getTree(): Promise<Category[]> {
    const categories = await this.categoryRepo.find()
    return this.buildTree(categories)
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.categoryRepo.findOne({ where: { id } })
    if (!category) throw new NotFoundException('Category not found')
    return category
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    if (dto.parentId) {
      await this.findOne(dto.parentId)
    }
    const category = this.categoryRepo.create(dto)
    return this.categoryRepo.save(category)
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    if (dto.parentId === id) {
      throw new BadRequestException('Category cannot reference itself')
    }
    if (dto.parentId) {
      const descendants = this.getDescendantIds(
        id,
        await this.categoryRepo.find(),
      )
      if (descendants.includes(dto.parentId)) {
        throw new BadRequestException('Circular reference detected')
      }
    }
    const category = await this.findOne(id)
    Object.assign(category, dto)
    return this.categoryRepo.save(category)
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const category = await this.findOne(id)
    await this.categoryRepo.remove(category)
    return { deleted: true }
  }

  getDescendantIds(parentId: string, categories: Category[]): string[] {
    const ids: string[] = []
    const collect = (pid: string) => {
      for (const c of categories) {
        if (c.parentId === pid) {
          ids.push(c.id)
          collect(c.id)
        }
      }
    }
    collect(parentId)
    return ids
  }

  async getWithDescendantIds(categoryId: string): Promise<string[]> {
    const categories = await this.categoryRepo.find()
    const descendants = this.getDescendantIds(categoryId, categories)
    return [categoryId, ...descendants]
  }

  private buildTree(
    categories: Category[],
  ): (Category & { children: Category[] })[] {
    const map = new Map<string, Category & { children: Category[] }>()
    const roots: (Category & { children: Category[] })[] = []

    for (const cat of categories) {
      map.set(cat.id, { ...cat, children: [] })
    }

    for (const cat of categories) {
      const node = map.get(cat.id)!
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId)!.children.push(node)
      } else {
        roots.push(node)
      }
    }

    return roots
  }
}
