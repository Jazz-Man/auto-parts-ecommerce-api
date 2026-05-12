import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CreateProductDto } from '../dto/create-product.dto'
import { ProductQueryDto } from '../dto/product-query.dto'
import { UpdateProductDto } from '../dto/update-product.dto'
import { Product } from '../entities/product.entity'
import { ProductVehicle } from '../entities/product-vehicle.entity'
import { CategoryService } from './category.service'

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVehicle)
    private readonly pvRepo: Repository<ProductVehicle>,
    private readonly categoryService: CategoryService,
  ) {}

  async findAll(query: ProductQueryDto) {
    const {
      brand_id,
      vehicle_id,
      year,
      category_id,
      min_price,
      max_price,
      page = 1,
      limit = 20,
    } = query

    const qb = this.productRepo.createQueryBuilder('product')

    const needsVehicleJoin = vehicle_id || brand_id || year

    if (needsVehicleJoin) {
      qb.innerJoin(
        'product_vehicles',
        'pv',
        'pv.product_id = product.id',
      ).innerJoin('vehicles', 'vehicle', 'pv.vehicle_id = vehicle.id')

      if (vehicle_id) {
        qb.andWhere('pv.vehicle_id = :vehicle_id', { vehicle_id })
      }
      if (brand_id) {
        qb.andWhere('vehicle.brand_id = :brand_id', { brand_id })
      }
      if (year) {
        qb.andWhere('vehicle.year_start <= :year', { year })
        qb.andWhere('vehicle.year_end >= :year', { year })
      }
    }

    if (category_id) {
      const categoryIds =
        await this.categoryService.getWithDescendantIds(category_id)
      qb.andWhere('product.category_id IN (:...categoryIds)', {
        categoryIds,
      })
    }

    if (min_price !== undefined) {
      qb.andWhere('product.price >= :min_price', { min_price })
    }
    if (max_price !== undefined) {
      qb.andWhere('product.price <= :max_price', { max_price })
    }

    const skip = (page - 1) * limit
    qb.orderBy('product.created_at', 'DESC').skip(skip).take(limit)

    const [data, total] = await qb.getManyAndCount()

    return {
      data,
      meta: {
        limit,
        page,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      relations: [
        'category',
        'productVehicles',
        'productVehicles.vehicle',
        'productVehicles.vehicle.brand',
      ],
      where: { id },
    })
    if (!product) throw new NotFoundException('Product not found')
    return product
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const { vehicleIds, price, ...rest } = dto
    const product = this.productRepo.create({
      ...rest,
      price: String(price),
    })
    const saved = await this.productRepo.save(product)

    if (vehicleIds?.length) {
      const links = vehicleIds.map((vehicleId) =>
        this.pvRepo.create({ productId: saved.id, vehicleId }),
      )
      await this.pvRepo.save(links)
    }

    return this.findOne(saved.id)
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const { vehicleIds, price, ...rest } = dto
    const product = await this.findOne(id)

    const updateData: Record<string, unknown> = { ...rest }
    if (price !== undefined) updateData.price = String(price)

    if (Object.keys(updateData).length > 0) {
      Object.assign(product, updateData)
      await this.productRepo.save(product)
    }

    if (vehicleIds !== undefined) {
      await this.pvRepo.delete({ productId: id })
      if (vehicleIds.length) {
        const links = vehicleIds.map((vehicleId) =>
          this.pvRepo.create({ productId: id, vehicleId }),
        )
        await this.pvRepo.save(links)
      }
    }

    return this.findOne(id)
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const product = await this.findOne(id)
    await this.productRepo.remove(product)
    return { deleted: true }
  }
}
