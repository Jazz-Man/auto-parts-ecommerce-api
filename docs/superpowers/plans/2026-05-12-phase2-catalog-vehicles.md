# Phase 2 — Catalog + Vehicles Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the product catalog with brands, vehicles, categories, products, vehicle compatibility filtering, admin CRUD, and seed data.

**Architecture:** Single CatalogModule with 4 services/controllers (brand, vehicle, category, product). Entities use TypeORM decorators matching existing Phase 1 patterns. Admin routes under `/admin/` with `@Roles(UserRole.ADMIN)`. Public routes use `@Public()`. Product filtering via TypeORM QueryBuilder.

**Tech Stack:** NestJS 11, TypeORM 0.3, class-validator, PostgreSQL 16, Bun runtime

---

## File Structure

```
src/catalog/
  catalog.module.ts                          — Module registration
  entities/
    brand.entity.ts                          — Brand entity (id, name, slug)
    vehicle.entity.ts                        — Vehicle entity (id, brandId, model, yearStart, yearEnd)
    category.entity.ts                       — Category entity (id, name, slug, parentId, self-ref)
    product.entity.ts                        — Product entity (id, sku, title, price, stock, categoryId, specs, timestamps)
    product-vehicle.entity.ts                — Join entity (productId, vehicleId)
  dto/
    create-brand.dto.ts                      — CreateBrandDto (name, slug)
    update-brand.dto.ts                      — UpdateBrandDto (name?, slug?)
    create-vehicle.dto.ts                    — CreateVehicleDto (brandId, model, yearStart, yearEnd)
    update-vehicle.dto.ts                    — UpdateVehicleDto (all optional)
    create-category.dto.ts                   — CreateCategoryDto (name, slug, parentId?)
    update-category.dto.ts                   — UpdateCategoryDto (name?, slug?, parentId?)
    create-product.dto.ts                    — CreateProductDto (sku, title, price, stock?, categoryId, specs?, vehicleIds?)
    update-product.dto.ts                    — UpdateProductDto (all optional, vehicleIds replace semantics)
    product-query.dto.ts                     — ProductQueryDto (filter params + pagination)
  controllers/
    brand.controller.ts                      — GET /brands, POST/PATCH/DELETE /admin/brands
    vehicle.controller.ts                    — GET /vehicles, /vehicles/search, POST/PATCH/DELETE /admin/vehicles
    category.controller.ts                   — GET /categories, POST/PATCH/DELETE /admin/categories
    product.controller.ts                    — GET /products, /products/:id, POST/PATCH/DELETE /admin/products
  services/
    brand.service.ts                         — CRUD for brands
    vehicle.service.ts                       — CRUD + search for vehicles
    category.service.ts                      — CRUD + tree building for categories
    product.service.ts                       — CRUD + filtering + pagination for products
  spec/
    brand.service.spec.ts                    — Brand service unit tests
    vehicle.service.spec.ts                  — Vehicle service unit tests
    category.service.spec.ts                 — Category service unit tests
    product.service.spec.ts                  — Product service unit tests
src/migrations/
  <timestamp>-CreateCatalogTables.ts         — Schema migration
  <timestamp>-SeedCatalogData.ts             — Seed data migration
```

Modified files:
- `src/app.module.ts` — add CatalogModule import
- `README.md` — add catalog API usage examples

---

## Chunk 1: Entities, Module, Migration, Brands

### Task 1: Create Catalog Entities

**Files:**
- Create: `src/catalog/entities/brand.entity.ts`
- Create: `src/catalog/entities/vehicle.entity.ts`
- Create: `src/catalog/entities/category.entity.ts`
- Create: `src/catalog/entities/product.entity.ts`
- Create: `src/catalog/entities/product-vehicle.entity.ts`

- [ ] **Step 1: Create brand entity**

```ts
// src/catalog/entities/brand.entity.ts
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
```

- [ ] **Step 2: Create vehicle entity**

```ts
// src/catalog/entities/vehicle.entity.ts
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
```

- [ ] **Step 3: Create category entity**

```ts
// src/catalog/entities/category.entity.ts
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
```

- [ ] **Step 4: Create product-vehicle join entity**

```ts
// src/catalog/entities/product-vehicle.entity.ts
import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import { Product } from './product.entity'
import { Vehicle } from './vehicle.entity'

@Entity('product_vehicles')
export class ProductVehicle {
  @PrimaryColumn('uuid')
  productId: string

  @PrimaryColumn('uuid')
  vehicleId: string

  @ManyToOne(() => Product, (product) => product.productVehicles)
  @JoinColumn({ name: 'product_id' })
  product: Product

  @ManyToOne(() => Vehicle)
  @JoinColumn({ name: 'vehicle_id' })
  vehicle: Vehicle
}
```

- [ ] **Step 5: Create product entity**

```ts
// src/catalog/entities/product.entity.ts
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
```

- [ ] **Step 6: Verify compilation**

Run: `bun run build`
Expected: compiles without errors

- [ ] **Step 7: Commit**

```bash
git add src/catalog/entities/
git commit -m "feat: add catalog entities (brand, vehicle, category, product, product-vehicle)"
```

---

### Task 2: Create CatalogModule

**Files:**
- Create: `src/catalog/catalog.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Create catalog module**

```ts
// src/catalog/catalog.module.ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Brand } from './entities/brand.entity'
import { Category } from './entities/category.entity'
import { Product } from './entities/product.entity'
import { ProductVehicle } from './entities/product-vehicle.entity'
import { Vehicle } from './entities/vehicle.entity'
import { BrandController } from './controllers/brand.controller'
import { BrandService } from './services/brand.service'
import { CategoryController } from './controllers/category.controller'
import { CategoryService } from './services/category.service'
import { ProductController } from './controllers/product.controller'
import { ProductService } from './services/product.service'
import { VehicleController } from './controllers/vehicle.controller'
import { VehicleService } from './services/vehicle.service'

@Module({
  controllers: [
    BrandController,
    VehicleController,
    CategoryController,
    ProductController,
  ],
  imports: [
    TypeOrmModule.forFeature([
      Brand,
      Vehicle,
      Category,
      Product,
      ProductVehicle,
    ]),
  ],
  providers: [
    BrandService,
    VehicleService,
    CategoryService,
    ProductService,
  ],
})
export class CatalogModule {}
```

- [ ] **Step 2: Register CatalogModule in AppModule**

Add `CatalogModule` to the imports array in `src/app.module.ts`:

```ts
// Add import at top
import { CatalogModule } from './catalog/catalog.module'

// Add to imports array (after AuthModule)
    CatalogModule,
```

- [ ] **Step 3: Verify compilation**

Run: `bun run build`
Expected: compiles (controllers/services don't exist yet — that's fine, just checking the module structure)

Actually, since controllers/services are referenced but don't exist yet, skip the build check here. We'll verify after Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/catalog/catalog.module.ts src/app.module.ts
git commit -m "feat: add CatalogModule and register in AppModule"
```

---

### Task 3: Create Catalog Tables Migration

**Files:**
- Create: `src/migrations/<timestamp>-CreateCatalogTables.ts`

- [ ] **Step 1: Generate migration file**

Run: `bun run migration:generate src/migrations/CreateCatalogTables`

If this fails (entity metadata not loaded), create the migration manually:

```ts
// src/migrations/<timestamp>-CreateCatalogTables.ts
import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

export class CreateCatalogTables1747100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // brands
    await queryRunner.createTable(
      new Table({
        columns: [
          {
            default: 'uuid_generate_v4()',
            isPrimary: true,
            name: 'id',
            type: 'uuid',
          },
          { isNullable: false, length: '255', name: 'name', type: 'varchar' },
          { isNullable: false, isUnique: true, length: '255', name: 'slug', type: 'varchar' },
        ],
        name: 'brands',
      }),
      true,
    )

    // vehicles
    await queryRunner.createTable(
      new Table({
        columns: [
          {
            default: 'uuid_generate_v4()',
            isPrimary: true,
            name: 'id',
            type: 'uuid',
          },
          { isNullable: false, name: 'brand_id', type: 'uuid' },
          { isNullable: false, length: '255', name: 'model', type: 'varchar' },
          { isNullable: false, name: 'year_start', type: 'integer' },
          { isNullable: false, name: 'year_end', type: 'integer' },
        ],
        name: 'vehicles',
      }),
      true,
    )
    await queryRunner.createForeignKey('vehicles', new TableForeignKey({
      columnNames: ['brand_id'],
      onDelete: 'RESTRICT',
      referencedColumnNames: ['id'],
      referencedTableName: 'brands',
    }))
    await queryRunner.createIndex('vehicles', new TableIndex({
      columnNames: ['brand_id'],
    }))

    // categories
    await queryRunner.createTable(
      new Table({
        columns: [
          {
            default: 'uuid_generate_v4()',
            isPrimary: true,
            name: 'id',
            type: 'uuid',
          },
          { isNullable: false, length: '255', name: 'name', type: 'varchar' },
          { isNullable: false, isUnique: true, length: '255', name: 'slug', type: 'varchar' },
          { isNullable: true, name: 'parent_id', type: 'uuid' },
        ],
        name: 'categories',
      }),
      true,
    )
    await queryRunner.createForeignKey('categories', new TableForeignKey({
      columnNames: ['parent_id'],
      onDelete: 'SET NULL',
      referencedColumnNames: ['id'],
      referencedTableName: 'categories',
    }))

    // products
    await queryRunner.createTable(
      new Table({
        columns: [
          {
            default: 'uuid_generate_v4()',
            isPrimary: true,
            name: 'id',
            type: 'uuid',
          },
          { isNullable: false, isUnique: true, length: '255', name: 'sku', type: 'varchar' },
          { isNullable: false, length: '500', name: 'title', type: 'varchar' },
          { isNullable: false, name: 'price', precision: 10, scale: 2, type: 'decimal' },
          { default: 0, isNullable: false, name: 'stock', type: 'integer' },
          { isNullable: false, name: 'category_id', type: 'uuid' },
          { isNullable: true, name: 'specs', type: 'jsonb' },
          { default: 'now()', isNullable: false, name: 'created_at', type: 'timestamp' },
          { default: 'now()', isNullable: false, name: 'updated_at', type: 'timestamp' },
        ],
        name: 'products',
      }),
      true,
    )
    await queryRunner.createForeignKey('products', new TableForeignKey({
      columnNames: ['category_id'],
      onDelete: 'RESTRICT',
      referencedColumnNames: ['id'],
      referencedTableName: 'categories',
    }))
    await queryRunner.createIndex('products', new TableIndex({ columnNames: ['category_id'] }))
    await queryRunner.query(`CREATE INDEX "IDX_products_specs" ON "products" USING GIN ("specs")`)
    await queryRunner.createIndex('products', new TableIndex({ columnNames: ['price', 'stock'] }))

    // product_vehicles
    await queryRunner.createTable(
      new Table({
        columns: [
          { isPrimary: true, name: 'product_id', type: 'uuid' },
          { isPrimary: true, name: 'vehicle_id', type: 'uuid' },
        ],
        name: 'product_vehicles',
      }),
      true,
    )
    await queryRunner.createForeignKey('product_vehicles', new TableForeignKey({
      columnNames: ['product_id'],
      onDelete: 'CASCADE',
      referencedColumnNames: ['id'],
      referencedTableName: 'products',
    }))
    await queryRunner.createForeignKey('product_vehicles', new TableForeignKey({
      columnNames: ['vehicle_id'],
      onDelete: 'CASCADE',
      referencedColumnNames: ['id'],
      referencedTableName: 'vehicles',
    }))
    await queryRunner.createIndex('product_vehicles', new TableIndex({
      columnNames: ['vehicle_id', 'product_id'],
    }))
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('product_vehicles')
    await queryRunner.dropTable('products')
    await queryRunner.dropTable('categories')
    await queryRunner.dropTable('vehicles')
    await queryRunner.dropTable('brands')
  }
}
```

Note: Use the actual timestamp from the generated filename. The `specs` GIN index uses raw SQL since TypeORM's `TableIndex` doesn't support GIN natively.

- [ ] **Step 2: Run migration**

Run: `bun run migration:run`
Expected: all tables created successfully

- [ ] **Step 3: Commit**

```bash
git add src/migrations/
git commit -m "feat: add CreateCatalogTables migration"
```

---

### Task 4: Brand CRUD (DTOs, Service, Controller, Tests)

**Files:**
- Create: `src/catalog/dto/create-brand.dto.ts`
- Create: `src/catalog/dto/update-brand.dto.ts`
- Create: `src/catalog/services/brand.service.ts`
- Create: `src/catalog/controllers/brand.controller.ts`
- Create: `src/catalog/spec/brand.service.spec.ts`

- [ ] **Step 1: Write brand service test**

```ts
// src/catalog/spec/brand.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { NotFoundException } from '@nestjs/common'
import { BrandService } from '../services/brand.service'
import { Brand } from '../entities/brand.entity'

describe('BrandService', () => {
  let service: BrandService

  const mockRepo = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    save: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandService,
        { provide: getRepositoryToken(Brand), useValue: mockRepo },
      ],
    }).compile()

    service = module.get<BrandService>(BrandService)
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('findAll', () => {
    it('should return all brands', async () => {
      const brands = [
        { id: '1', name: 'Toyota', slug: 'toyota' },
        { id: '2', name: 'BMW', slug: 'bmw' },
      ]
      mockRepo.find.mockResolvedValue(brands)
      expect(await service.findAll()).toEqual(brands)
    })
  })

  describe('findOne', () => {
    it('should return a brand by id', async () => {
      const brand = { id: '1', name: 'Toyota', slug: 'toyota' }
      mockRepo.findOne.mockResolvedValue(brand)
      expect(await service.findOne('1')).toEqual(brand)
    })

    it('should throw NotFoundException if not found', async () => {
      mockRepo.findOne.mockResolvedValue(null)
      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('create', () => {
    it('should create and return a brand', async () => {
      const dto = { name: 'Toyota', slug: 'toyota' }
      const brand = { id: '1', ...dto }
      mockRepo.create.mockReturnValue(brand)
      mockRepo.save.mockResolvedValue(brand)

      const result = await service.create(dto)
      expect(result).toEqual(brand)
      expect(mockRepo.create).toHaveBeenCalledWith(dto)
    })
  })

  describe('update', () => {
    it('should update and return the brand', async () => {
      const existing = { id: '1', name: 'Toyota', slug: 'toyota' }
      const dto = { name: 'Toyota Motors' }
      mockRepo.findOne.mockResolvedValue(existing)
      mockRepo.save.mockResolvedValue({ ...existing, ...dto })

      const result = await service.update('1', dto)
      expect(result.name).toBe('Toyota Motors')
    })

    it('should throw NotFoundException if not found', async () => {
      mockRepo.findOne.mockResolvedValue(null)
      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('remove', () => {
    it('should remove and return { deleted: true }', async () => {
      const brand = { id: '1', name: 'Toyota', slug: 'toyota' }
      mockRepo.findOne.mockResolvedValue(brand)
      mockRepo.remove.mockResolvedValue(brand)

      const result = await service.remove('1')
      expect(result).toEqual({ deleted: true })
      expect(mockRepo.remove).toHaveBeenCalledWith(brand)
    })

    it('should throw NotFoundException if not found', async () => {
      mockRepo.findOne.mockResolvedValue(null)
      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      )
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/catalog/spec/brand.service.spec.ts`
Expected: FAIL — `BrandService` not found

- [ ] **Step 3: Create brand DTOs**

```ts
// src/catalog/dto/create-brand.dto.ts
import { IsString, Matches } from 'class-validator'

export class CreateBrandDto {
  @IsString()
  name: string

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug: string
}
```

```ts
// src/catalog/dto/update-brand.dto.ts
import { IsOptional, IsString, Matches } from 'class-validator'

export class UpdateBrandDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug?: string
}
```

- [ ] **Step 4: Create brand service**

```ts
// src/catalog/services/brand.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Brand } from '../entities/brand.entity'
import { CreateBrandDto } from '../dto/create-brand.dto'
import { UpdateBrandDto } from '../dto/update-brand.dto'

@Injectable()
export class BrandService {
  constructor(
    @InjectRepository(Brand)
    private readonly brandRepo: Repository<Brand>,
  ) {}

  findAll(): Promise<Brand[]> {
    return this.brandRepo.find()
  }

  async findOne(id: string): Promise<Brand> {
    const brand = await this.brandRepo.findOne({ where: { id } })
    if (!brand) throw new NotFoundException('Brand not found')
    return brand
  }

  create(dto: CreateBrandDto): Promise<Brand> {
    const brand = this.brandRepo.create(dto)
    return this.brandRepo.save(brand)
  }

  async update(id: string, dto: UpdateBrandDto): Promise<Brand> {
    const brand = await this.findOne(id)
    Object.assign(brand, dto)
    return this.brandRepo.save(brand)
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const brand = await this.findOne(id)
    await this.brandRepo.remove(brand)
    return { deleted: true }
  }
}
```

- [ ] **Step 5: Create brand controller**

```ts
// src/catalog/controllers/brand.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Public } from '../../common/decorators/public.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { UserRole } from '../../auth/entities/user-role.enum'
import { BrandService } from '../services/brand.service'
import { CreateBrandDto } from '../dto/create-brand.dto'
import { UpdateBrandDto } from '../dto/update-brand.dto'

@Controller()
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @Public()
  @Get('brands')
  findAll() {
    return this.brandService.findAll()
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Post('admin/brands')
  create(@Body() dto: CreateBrandDto) {
    return this.brandService.create(dto)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Patch('admin/brands/:id')
  update(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.brandService.update(id, dto)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Delete('admin/brands/:id')
  remove(@Param('id') id: string) {
    return this.brandService.remove(id)
  }
}
```

- [ ] **Step 6: Run brand service tests**

Run: `bun run test -- src/catalog/spec/brand.service.spec.ts`
Expected: all tests PASS

- [ ] **Step 7: Verify build**

Run: `bun run build`
Expected: compiles without errors

- [ ] **Step 8: Commit**

```bash
git add src/catalog/dto/ src/catalog/services/ src/catalog/controllers/ src/catalog/spec/
git commit -m "feat: add brand CRUD (DTOs, service, controller, tests)"
```

---

## Chunk 2: Vehicles & Categories

### Task 5: Vehicle CRUD (DTOs, Service, Controller, Tests)

**Files:**
- Create: `src/catalog/dto/create-vehicle.dto.ts`
- Create: `src/catalog/dto/update-vehicle.dto.ts`
- Create: `src/catalog/services/vehicle.service.ts`
- Create: `src/catalog/controllers/vehicle.controller.ts`
- Create: `src/catalog/spec/vehicle.service.spec.ts`

- [ ] **Step 1: Write vehicle service test**

```ts
// src/catalog/spec/vehicle.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { NotFoundException } from '@nestjs/common'
import { VehicleService } from '../services/vehicle.service'
import { Vehicle } from '../entities/vehicle.entity'

describe('VehicleService', () => {
  let service: VehicleService

  const mockRepo = {
    create: jest.fn(),
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    save: jest.fn(),
  }

  const mockQb = {
    getMany: jest.fn(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleService,
        { provide: getRepositoryToken(Vehicle), useValue: mockRepo },
      ],
    }).compile()

    service = module.get<VehicleService>(VehicleService)
    jest.clearAllMocks()
    mockRepo.createQueryBuilder.mockReturnValue(mockQb)
    mockQb.leftJoinAndSelect.mockReturnThis()
    mockQb.where.mockReturnThis()
    mockQb.getMany.mockResolvedValue([])
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('findAll', () => {
    it('should return all vehicles with brand relation', async () => {
      const vehicles = [{ id: '1', model: 'Corolla', brand: { name: 'Toyota' } }]
      mockRepo.find.mockResolvedValue(vehicles)
      expect(await service.findAll()).toEqual(vehicles)
      expect(mockRepo.find).toHaveBeenCalledWith({
        relations: ['brand'],
        where: {},
      })
    })

    it('should filter by brandId when provided', async () => {
      mockRepo.find.mockResolvedValue([])
      await service.findAll('brand-1')
      expect(mockRepo.find).toHaveBeenCalledWith({
        relations: ['brand'],
        where: { brandId: 'brand-1' },
      })
    })
  })

  describe('search', () => {
    it('should search vehicles by model using ILIKE', async () => {
      const results = [{ id: '1', model: 'Corolla' }]
      mockQb.getMany.mockResolvedValue(results)

      const found = await service.search('corr')
      expect(found).toEqual(results)
      expect(mockRepo.createQueryBuilder).toHaveBeenCalledWith('vehicle')
      expect(mockQb.where).toHaveBeenCalledWith(
        'vehicle.model ILIKE :q',
        { q: '%corr%' },
      )
    })
  })

  describe('findOne', () => {
    it('should return a vehicle by id', async () => {
      const vehicle = { id: '1', model: 'Corolla' }
      mockRepo.findOne.mockResolvedValue(vehicle)
      expect(await service.findOne('1')).toEqual(vehicle)
    })

    it('should throw NotFoundException if not found', async () => {
      mockRepo.findOne.mockResolvedValue(null)
      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('create', () => {
    it('should create and return a vehicle', async () => {
      const dto = { brandId: 'b1', model: 'Corolla', yearStart: 2015, yearEnd: 2023 }
      const vehicle = { id: '1', ...dto }
      mockRepo.create.mockReturnValue(vehicle)
      mockRepo.save.mockResolvedValue(vehicle)

      const result = await service.create(dto)
      expect(result).toEqual(vehicle)
    })
  })

  describe('update', () => {
    it('should update and return the vehicle', async () => {
      const existing = { id: '1', model: 'Corolla', brandId: 'b1', yearStart: 2015, yearEnd: 2023 }
      mockRepo.findOne.mockResolvedValue(existing)
      mockRepo.save.mockResolvedValue({ ...existing, model: 'Camry' })

      const result = await service.update('1', { model: 'Camry' })
      expect(result.model).toBe('Camry')
    })
  })

  describe('remove', () => {
    it('should remove and return { deleted: true }', async () => {
      const vehicle = { id: '1', model: 'Corolla' }
      mockRepo.findOne.mockResolvedValue(vehicle)
      mockRepo.remove.mockResolvedValue(vehicle)

      const result = await service.remove('1')
      expect(result).toEqual({ deleted: true })
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/catalog/spec/vehicle.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: Create vehicle DTOs**

```ts
// src/catalog/dto/create-vehicle.dto.ts
import {
  IsInt,
  IsString,
  IsUUID,
  Min,
  ValidateBy,
  ValidationArguments,
} from 'class-validator'

export class CreateVehicleDto {
  @IsUUID()
  brandId: string

  @IsString()
  model: string

  @IsInt()
  @Min(1900)
  yearStart: number

  @IsInt()
  @Min(1900)
  @ValidateBy({
    message: (args: ValidationArguments) =>
      'yearEnd must be greater than or equal to yearStart',
    name: 'isYearEndValid',
    validator: {
      defaultMessage: () => 'yearEnd must be >= yearStart',
      validate(value: number, args: ValidationArguments) {
        const dto = args.object as CreateVehicleDto
        return value >= dto.yearStart
      },
    },
  })
  yearEnd: number
}
```

```ts
// src/catalog/dto/update-vehicle.dto.ts
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator'

export class UpdateVehicleDto {
  @IsOptional()
  @IsUUID()
  brandId?: string

  @IsOptional()
  @IsString()
  model?: string

  @IsOptional()
  @IsInt()
  @Min(1900)
  yearStart?: number

  @IsOptional()
  @IsInt()
  @Min(1900)
  yearEnd?: number
}
```

- [ ] **Step 4: Create vehicle service**

```ts
// src/catalog/services/vehicle.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Vehicle } from '../entities/vehicle.entity'
import { CreateVehicleDto } from '../dto/create-vehicle.dto'
import { UpdateVehicleDto } from '../dto/update-vehicle.dto'

@Injectable()
export class VehicleService {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
  ) {}

  findAll(brandId?: string): Promise<Vehicle[]> {
    const where: Record<string, unknown> = {}
    if (brandId) where.brandId = brandId
    return this.vehicleRepo.find({ relations: ['brand'], where })
  }

  search(q: string): Promise<Vehicle[]> {
    return this.vehicleRepo
      .createQueryBuilder('vehicle')
      .leftJoinAndSelect('vehicle.brand', 'brand')
      .where('vehicle.model ILIKE :q', { q: `%${q}%` })
      .getMany()
  }

  async findOne(id: string): Promise<Vehicle> {
    const vehicle = await this.vehicleRepo.findOne({
      relations: ['brand'],
      where: { id },
    })
    if (!vehicle) throw new NotFoundException('Vehicle not found')
    return vehicle
  }

  create(dto: CreateVehicleDto): Promise<Vehicle> {
    const vehicle = this.vehicleRepo.create(dto)
    return this.vehicleRepo.save(vehicle)
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const vehicle = await this.findOne(id)
    Object.assign(vehicle, dto)
    return this.vehicleRepo.save(vehicle)
  }

  async remove(id: string): Promise<{ deleted: true }> {
    const vehicle = await this.findOne(id)
    await this.vehicleRepo.remove(vehicle)
    return { deleted: true }
  }
}
```

- [ ] **Step 5: Create vehicle controller**

```ts
// src/catalog/controllers/vehicle.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Public } from '../../common/decorators/public.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { UserRole } from '../../auth/entities/user-role.enum'
import { VehicleService } from '../services/vehicle.service'
import { CreateVehicleDto } from '../dto/create-vehicle.dto'
import { UpdateVehicleDto } from '../dto/update-vehicle.dto'

@Controller()
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Public()
  @Get('vehicles')
  findAll(@Query('brand_id') brandId?: string) {
    return this.vehicleService.findAll(brandId)
  }

  @Public()
  @Get('vehicles/search')
  search(@Query('q') q: string) {
    return this.vehicleService.search(q)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Post('admin/vehicles')
  create(@Body() dto: CreateVehicleDto) {
    return this.vehicleService.create(dto)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Patch('admin/vehicles/:id')
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehicleService.update(id, dto)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Delete('admin/vehicles/:id')
  remove(@Param('id') id: string) {
    return this.vehicleService.remove(id)
  }
}
```

- [ ] **Step 6: Run vehicle service tests**

Run: `bun run test -- src/catalog/spec/vehicle.service.spec.ts`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/catalog/
git commit -m "feat: add vehicle CRUD with search (DTOs, service, controller, tests)"
```

---

### Task 6: Category CRUD (DTOs, Service, Controller, Tests)

**Files:**
- Create: `src/catalog/dto/create-category.dto.ts`
- Create: `src/catalog/dto/update-category.dto.ts`
- Create: `src/catalog/services/category.service.ts`
- Create: `src/catalog/controllers/category.controller.ts`
- Create: `src/catalog/spec/category.service.spec.ts`

- [ ] **Step 1: Write category service test**

```ts
// src/catalog/spec/category.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CategoryService } from '../services/category.service'
import { Category } from '../entities/category.entity'

describe('CategoryService', () => {
  let service: CategoryService

  const mockRepo = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    save: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: getRepositoryToken(Category), useValue: mockRepo },
      ],
    }).compile()

    service = module.get<CategoryService>(CategoryService)
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('getTree', () => {
    it('should build a tree from flat categories', async () => {
      const categories = [
        { id: '1', name: 'Engine', slug: 'engine', parentId: null },
        { id: '2', name: 'Filters', slug: 'filters', parentId: '1' },
      ]
      mockRepo.find.mockResolvedValue(categories)

      const tree = await service.getTree()
      expect(tree).toHaveLength(1)
      expect(tree[0].name).toBe('Engine')
      expect(tree[0].children).toHaveLength(1)
      expect(tree[0].children[0].name).toBe('Filters')
    })

    it('should handle empty categories', async () => {
      mockRepo.find.mockResolvedValue([])
      const tree = await service.getTree()
      expect(tree).toHaveLength(0)
    })
  })

  describe('create', () => {
    it('should create a root category', async () => {
      const dto = { name: 'Engine', slug: 'engine', parentId: undefined }
      const category = { id: '1', ...dto, parentId: null }
      mockRepo.create.mockReturnValue(category)
      mockRepo.save.mockResolvedValue(category)

      const result = await service.create(dto)
      expect(result.name).toBe('Engine')
    })

    it('should create a child category when parent exists', async () => {
      const parent = { id: '1', name: 'Engine', slug: 'engine', parentId: null }
      mockRepo.findOne.mockResolvedValue(parent)
      const dto = { name: 'Filters', slug: 'filters', parentId: '1' }
      const category = { id: '2', ...dto }
      mockRepo.create.mockReturnValue(category)
      mockRepo.save.mockResolvedValue(category)

      const result = await service.create(dto)
      expect(result.name).toBe('Filters')
    })

    it('should throw NotFoundException if parent not found', async () => {
      mockRepo.findOne.mockResolvedValue(null)
      await expect(
        service.create({ name: 'X', slug: 'x', parentId: 'missing' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('update', () => {
    it('should throw BadRequestException for self-reference', async () => {
      mockRepo.find.mockResolvedValue([])
      await expect(
        service.update('1', { parentId: '1' }),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('remove', () => {
    it('should remove and return { deleted: true }', async () => {
      const category = { id: '1', name: 'Engine', slug: 'engine', parentId: null }
      mockRepo.findOne.mockResolvedValue(category)
      mockRepo.remove.mockResolvedValue(category)

      const result = await service.remove('1')
      expect(result).toEqual({ deleted: true })
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/catalog/spec/category.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: Create category DTOs**

```ts
// src/catalog/dto/create-category.dto.ts
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator'

export class CreateCategoryDto {
  @IsString()
  name: string

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug: string

  @IsOptional()
  @IsUUID()
  parentId?: string
}
```

```ts
// src/catalog/dto/update-category.dto.ts
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator'

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug?: string

  @IsOptional()
  @IsUUID()
  parentId?: string
}
```

- [ ] **Step 4: Create category service**

```ts
// src/catalog/services/category.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Category } from '../entities/category.entity'
import { CreateCategoryDto } from '../dto/create-category.dto'
import { UpdateCategoryDto } from '../dto/update-category.dto'

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
```

- [ ] **Step 5: Create category controller**

```ts
// src/catalog/controllers/category.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Public } from '../../common/decorators/public.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { UserRole } from '../../auth/entities/user-role.enum'
import { CategoryService } from '../services/category.service'
import { CreateCategoryDto } from '../dto/create-category.dto'
import { UpdateCategoryDto } from '../dto/update-category.dto'

@Controller()
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Public()
  @Get('categories')
  getTree() {
    return this.categoryService.getTree()
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Post('admin/categories')
  create(@Body() dto: CreateCategoryDto) {
    return this.categoryService.create(dto)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Patch('admin/categories/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoryService.update(id, dto)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Delete('admin/categories/:id')
  remove(@Param('id') id: string) {
    return this.categoryService.remove(id)
  }
}
```

- [ ] **Step 6: Run category service tests**

Run: `bun run test -- src/catalog/spec/category.service.spec.ts`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/catalog/
git commit -m "feat: add category CRUD with tree building (DTOs, service, controller, tests)"
```

---

## Chunk 3: Products, Filtering, Seed

### Task 7: Product DTOs

**Files:**
- Create: `src/catalog/dto/create-product.dto.ts`
- Create: `src/catalog/dto/update-product.dto.ts`
- Create: `src/catalog/dto/product-query.dto.ts`

- [ ] **Step 1: Create product DTOs**

```ts
// src/catalog/dto/create-product.dto.ts
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator'

export class CreateProductDto {
  @IsString()
  sku: string

  @IsString()
  title: string

  @IsNumber()
  @Min(0)
  price: number

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number

  @IsUUID()
  categoryId: string

  @IsOptional()
  specs?: Record<string, unknown>

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  vehicleIds?: string[]
}
```

```ts
// src/catalog/dto/update-product.dto.ts
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator'

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  sku?: string

  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number

  @IsOptional()
  @IsUUID()
  categoryId?: string

  @IsOptional()
  specs?: Record<string, unknown>

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  vehicleIds?: string[]
}
```

```ts
// src/catalog/dto/product-query.dto.ts
import { IsInt, IsNumber, IsOptional, IsUUID, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class ProductQueryDto {
  @IsOptional()
  @IsUUID()
  brand_id?: string

  @IsOptional()
  @IsUUID()
  vehicle_id?: string

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Type(() => Number)
  year?: number

  @IsOptional()
  @IsUUID()
  category_id?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  min_price?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  max_price?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20
}
```

- [ ] **Step 2: Commit**

```bash
git add src/catalog/dto/
git commit -m "feat: add product DTOs (create, update, query)"
```

---

### Task 8: Product Service TDD (Tests + Implementation)

**Files:**
- Create: `src/catalog/services/product.service.ts`
- Create: `src/catalog/spec/product.service.spec.ts`

- [ ] **Step 1: Write product service test**

```ts
// src/catalog/spec/product.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { NotFoundException } from '@nestjs/common'
import { ProductService } from '../services/product.service'
import { Product } from '../entities/product.entity'
import { ProductVehicle } from '../entities/product-vehicle.entity'
import { CategoryService } from '../services/category.service'
import { ProductQueryDto } from '../dto/product-query.dto'

describe('ProductService', () => {
  let service: ProductService

  const mockProductRepo = {
    create: jest.fn(),
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    save: jest.fn(),
  }

  const mockPvRepo = {
    create: jest.fn(),
    delete: jest.fn(),
    save: jest.fn(),
  }

  const mockCategoryService = {
    getWithDescendantIds: jest.fn(),
  }

  const mockQb = {
    andWhere: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    innerJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        {
          provide: getRepositoryToken(Product),
          useValue: mockProductRepo,
        },
        {
          provide: getRepositoryToken(ProductVehicle),
          useValue: mockPvRepo,
        },
        { provide: CategoryService, useValue: mockCategoryService },
      ],
    }).compile()

    service = module.get<ProductService>(ProductService)
    jest.clearAllMocks()
    mockProductRepo.createQueryBuilder.mockReturnValue(mockQb)
    mockQb.innerJoin.mockReturnThis()
    mockQb.andWhere.mockReturnThis()
    mockQb.orderBy.mockReturnThis()
    mockQb.skip.mockReturnThis()
    mockQb.take.mockReturnThis()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const products = [{ id: '1', sku: 'A-001', title: 'Oil Filter' }]
      mockQb.getManyAndCount.mockResolvedValue([products, 1])

      const result = await service.findAll({})
      expect(result.data).toEqual(products)
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      })
    })

    it('should apply category filter with descendants', async () => {
      mockCategoryService.getWithDescendantIds.mockResolvedValue([
        'cat-1',
        'cat-2',
      ])
      mockQb.getManyAndCount.mockResolvedValue([[], 0])

      await service.findAll({ category_id: 'cat-1' })
      expect(mockCategoryService.getWithDescendantIds).toHaveBeenCalledWith(
        'cat-1',
      )
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'product.category_id IN (:...categoryIds)',
        { categoryIds: ['cat-1', 'cat-2'] },
      )
    })

    it('should apply price range filters', async () => {
      mockQb.getManyAndCount.mockResolvedValue([[], 0])

      await service.findAll({ min_price: 10, max_price: 50 })
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'product.price >= :min_price',
        { min_price: 10 },
      )
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'product.price <= :max_price',
        { max_price: 50 },
      )
    })
  })

  describe('findOne', () => {
    it('should return a product with relations', async () => {
      const product = {
        id: '1',
        sku: 'A-001',
        title: 'Oil Filter',
        category: { name: 'Filters' },
        productVehicles: [],
      }
      mockProductRepo.findOne.mockResolvedValue(product)

      const result = await service.findOne('1')
      expect(result).toEqual(product)
    })

    it('should throw NotFoundException if not found', async () => {
      mockProductRepo.findOne.mockResolvedValue(null)
      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('create', () => {
    it('should create product without vehicle links', async () => {
      const dto = {
        sku: 'A-001',
        title: 'Oil Filter',
        price: 12.5,
        categoryId: 'cat-1',
      }
      const saved = { id: '1', ...dto }
      mockProductRepo.create.mockReturnValue(saved)
      mockProductRepo.save.mockResolvedValue(saved)
      mockProductRepo.findOne.mockResolvedValue({
        ...saved,
        category: {},
        productVehicles: [],
      })

      const result = await service.create(dto)
      expect(result.id).toBe('1')
      expect(mockPvRepo.save).not.toHaveBeenCalled()
    })

    it('should create product with vehicle links', async () => {
      const dto = {
        sku: 'A-001',
        title: 'Oil Filter',
        price: 12.5,
        categoryId: 'cat-1',
        vehicleIds: ['v1', 'v2'],
      }
      const saved = { id: '1', sku: 'A-001', title: 'Oil Filter', price: 12.5, categoryId: 'cat-1' }
      mockProductRepo.create.mockReturnValue(saved)
      mockProductRepo.save.mockResolvedValue(saved)
      mockPvRepo.create.mockImplementation((data) => data)
      mockPvRepo.save.mockResolvedValue([])
      mockProductRepo.findOne.mockResolvedValue({
        ...saved,
        category: {},
        productVehicles: [],
      })

      await service.create(dto)
      expect(mockPvRepo.save).toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('should update product and replace vehicle links', async () => {
      const existing = {
        id: '1',
        sku: 'A-001',
        title: 'Oil Filter',
        price: 12.5,
        categoryId: 'cat-1',
        category: {},
        productVehicles: [],
      }
      mockProductRepo.findOne.mockResolvedValue(existing)
      mockProductRepo.save.mockResolvedValue({ ...existing, title: 'New Title' })
      mockPvRepo.delete.mockResolvedValue({ affected: 2 })
      mockPvRepo.create.mockImplementation((data) => data)

      const result = await service.update('1', {
        title: 'New Title',
        vehicleIds: ['v1'],
      })
      expect(mockPvRepo.delete).toHaveBeenCalledWith({ productId: '1' })
    })

    it('should preserve vehicle links if vehicleIds not provided', async () => {
      const existing = {
        id: '1',
        sku: 'A-001',
        title: 'Old',
        category: {},
        productVehicles: [],
      }
      mockProductRepo.findOne.mockResolvedValue(existing)
      mockProductRepo.save.mockResolvedValue({ ...existing, title: 'New' })

      await service.update('1', { title: 'New' })
      expect(mockPvRepo.delete).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('should remove and return { deleted: true }', async () => {
      const product = { id: '1', sku: 'A-001', category: {}, productVehicles: [] }
      mockProductRepo.findOne.mockResolvedValue(product)
      mockProductRepo.remove.mockResolvedValue(product)

      const result = await service.remove('1')
      expect(result).toEqual({ deleted: true })
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/catalog/spec/product.service.spec.ts`
Expected: FAIL — `ProductService` not found

- [ ] **Step 3: Create product service**

```ts
// src/catalog/services/product.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Product } from '../entities/product.entity'
import { ProductVehicle } from '../entities/product-vehicle.entity'
import { CategoryService } from './category.service'
import { CreateProductDto } from '../dto/create-product.dto'
import { UpdateProductDto } from '../dto/update-product.dto'
import { ProductQueryDto } from '../dto/product-query.dto'

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
      ).innerJoin(
        'vehicles',
        'vehicle',
        'pv.vehicle_id = vehicle.id',
      )

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
    qb.orderBy('product.created_at', 'DESC')
      .skip(skip)
      .take(limit)

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
      relations: ['category', 'productVehicles', 'productVehicles.vehicle', 'productVehicles.vehicle.brand'],
      where: { id },
    })
    if (!product) throw new NotFoundException('Product not found')
    return product
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const { vehicleIds, ...productData } = dto
    const product = this.productRepo.create(productData)
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
    const { vehicleIds, ...productData } = dto
    const product = await this.findOne(id)

    if (Object.keys(productData).length > 0) {
      Object.assign(product, productData)
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- src/catalog/spec/product.service.spec.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/catalog/services/product.service.ts src/catalog/spec/product.service.spec.ts
git commit -m "feat: add product service with CRUD, filtering, pagination and tests"
```

---

### Task 9: Product Controller

**Files:**
- Create: `src/catalog/controllers/product.controller.ts`

- [ ] **Step 1: Create product controller**

```ts
// src/catalog/controllers/product.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Public } from '../../common/decorators/public.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { UserRole } from '../../auth/entities/user-role.enum'
import { ProductService } from '../services/product.service'
import { CreateProductDto } from '../dto/create-product.dto'
import { UpdateProductDto } from '../dto/update-product.dto'
import { ProductQueryDto } from '../dto/product-query.dto'

@Controller()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Public()
  @Get('products')
  findAll(@Query() query: ProductQueryDto) {
    return this.productService.findAll(query)
  }

  @Public()
  @Get('products/:id')
  findOne(@Param('id') id: string) {
    return this.productService.findOne(id)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Post('admin/products')
  create(@Body() dto: CreateProductDto) {
    return this.productService.create(dto)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Patch('admin/products/:id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productService.update(id, dto)
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Delete('admin/products/:id')
  remove(@Param('id') id: string) {
    return this.productService.remove(id)
  }
}
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/catalog/controllers/product.controller.ts
git commit -m "feat: add product controller (public + admin routes)"
```

---

### Task 10: Seed Migration

**Files:**
- Create: `src/migrations/<timestamp>-SeedCatalogData.ts`

- [ ] **Step 1: Create seed migration**

Generate the migration file:
```bash
bun run migration:generate src/migrations/SeedCatalogData
```

If auto-generation fails, create manually with the following content. Use the actual timestamp from the filename.

```ts
// src/migrations/<timestamp>-SeedCatalogData.ts
import { MigrationInterface, QueryRunner } from 'typeorm'

export class SeedCatalogData1747200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Brands
    await queryRunner.query(`
      INSERT INTO brands (id, name, slug) VALUES
        ('a0000001-0000-0000-0000-000000000001', 'Toyota', 'toyota'),
        ('a0000001-0000-0000-0000-000000000002', 'BMW', 'bmw'),
        ('a0000001-0000-0000-0000-000000000003', 'Volkswagen', 'volkswagen')
    `)

    // Vehicles
    await queryRunner.query(`
      INSERT INTO vehicles (id, brand_id, model, year_start, year_end) VALUES
        ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'Corolla', 2015, 2023),
        ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001', 'Camry', 2018, 2024),
        ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000002', '3 Series', 2019, 2024),
        ('b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000002', 'X5', 2019, 2025),
        ('b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000003', 'Golf', 2020, 2024),
        ('b0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000003', 'Tiguan', 2021, 2025)
    `)

    // Categories (tree: Engine > Filters, Brakes > Pads, Suspension)
    await queryRunner.query(`
      INSERT INTO categories (id, name, slug, parent_id) VALUES
        ('c0000001-0000-0000-0000-000000000001', 'Engine', 'engine', NULL),
        ('c0000001-0000-0000-0000-000000000002', 'Filters', 'filters', 'c0000001-0000-0000-0000-000000000001'),
        ('c0000001-0000-0000-0000-000000000003', 'Brakes', 'brakes', NULL),
        ('c0000001-0000-0000-0000-000000000004', 'Pads', 'pads', 'c0000001-0000-0000-0000-000000000003'),
        ('c0000001-0000-0000-0000-000000000005', 'Suspension', 'suspension', NULL)
    `)

    // Products
    await queryRunner.query(`
      INSERT INTO products (id, sku, title, price, stock, category_id, specs) VALUES
        ('d0000001-0000-0000-0000-000000000001', 'OIL-TOY-001', 'Oil Filter Toyota Corolla', 12.50, 45, 'c0000001-0000-0000-0000-000000000002', '{"material": "cellulose", "threadSize": "M20x1.5"}'),
        ('d0000001-0000-0000-0000-000000000002', 'AIR-TOY-001', 'Air Filter Toyota Camry', 18.00, 30, 'c0000001-0000-0000-0000-000000000002', '{"type": "panel"}'),
        ('d0000001-0000-0000-0000-000000000003', 'BRK-BMW-001', 'Front Brake Pads BMW 3 Series', 45.00, 20, 'c0000001-0000-0000-0000-000000000004', '{"material": "ceramic", "position": "front"}'),
        ('d0000001-0000-0000-0000-000000000004', 'BRK-BMW-002', 'Rear Brake Pads BMW X5', 42.00, 15, 'c0000001-0000-0000-0000-000000000004', '{"material": "semi-metallic", "position": "rear"}'),
        ('d0000001-0000-0000-0000-000000000005', 'OIL-VW-001', 'Oil Filter VW Golf', 10.00, 50, 'c0000001-0000-0000-0000-000000000002', '{"material": "synthetic"}'),
        ('d0000001-0000-0000-0000-000000000006', 'SUS-TOY-001', 'Front Shock Absorber Toyota Corolla', 85.00, 10, 'c0000001-0000-0000-0000-000000000005', '{"type": "gas", "position": "front"}'),
        ('d0000001-0000-0000-0000-000000000007', 'BRK-TOY-001', 'Brake Pads Toyota Camry', 35.00, 25, 'c0000001-0000-0000-0000-000000000004', '{"material": "ceramic"}'),
        ('d0000001-0000-0000-0000-000000000008', 'AIR-BMW-001', 'Air Filter BMW 3 Series', 22.00, 18, 'c0000001-0000-0000-0000-000000000002', '{"type": "cylinder"}'),
        ('d0000001-0000-0000-0000-000000000009', 'SUS-VW-001', 'Rear Shock Absorber VW Tiguan', 78.00, 8, 'c0000001-0000-0000-0000-000000000005', '{"type": "hydraulic", "position": "rear"}'),
        ('d0000001-0000-0000-0000-000000000010', 'OIL-BMW-001', 'Oil Filter BMW X5', 15.00, 35, 'c0000001-0000-0000-0000-000000000002', '{"material": "cellulose", "threadSize": "M25x2.0"}')
    `)

    // Product-Vehicle links
    await queryRunner.query(`
      INSERT INTO product_vehicles (product_id, vehicle_id) VALUES
        ('d0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001'),
        ('d0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000002'),
        ('d0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000003'),
        ('d0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000004'),
        ('d0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000005'),
        ('d0000001-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000001'),
        ('d0000001-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000002'),
        ('d0000001-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000003'),
        ('d0000001-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000006'),
        ('d0000001-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000004'),
        ('d0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000002'),
        ('d0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000004'),
        ('d0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000006'),
        ('d0000001-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000002')
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM product_vehicles`)
    await queryRunner.query(`DELETE FROM products`)
    await queryRunner.query(`DELETE FROM categories`)
    await queryRunner.query(`DELETE FROM vehicles`)
    await queryRunner.query(`DELETE FROM brands`)
  }
}
```

- [ ] **Step 2: Run seed migration**

Run: `bun run migration:run`
Expected: seed data inserted

- [ ] **Step 3: Verify seed data**

Run: `docker compose exec postgres psql -U postgres -d autoparts -c "SELECT count(*) FROM brands"`
Expected: 3 brands

- [ ] **Step 4: Commit**

```bash
git add src/migrations/
git commit -m "feat: add seed migration with test data (3 brands, 6 vehicles, 5 categories, 10 products)"
```

---

### Task 11: Update README and Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add catalog API examples to README**

Add after the existing auth examples in `README.md`:

```markdown
### List brands

```bash
curl http://localhost:3001/brands
```

### Search vehicles

```bash
curl "http://localhost:3001/vehicles/search?q=cor"
```

### List products with filters

```bash
curl "http://localhost:3001/products?brand_id=<brand-id>&page=1&limit=10"
```

### Get single product

```bash
curl http://localhost:3001/products/<product-id>
```

### Get category tree

```bash
curl http://localhost:3001/categories
```

### Admin: Create brand (requires admin JWT)

```bash
curl -X POST http://localhost:3001/admin/brands \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <admin-access-token>' \
  -d '{"name":"Honda","slug":"honda"}'
```
```

- [ ] **Step 2: Run full test suite**

Run: `bun run test`
Expected: all tests PASS

- [ ] **Step 3: Run linter**

Run: `bun run lint`
Expected: no errors (add biome-ignore comments where needed for `as any` or test mocks)

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: compiles without errors

- [ ] **Step 5: Start dev server and smoke test**

Run: `bun run start:dev`

Test endpoints:
```bash
curl http://localhost:3001/brands
curl "http://localhost:3001/vehicles/search?q=Cor"
curl http://localhost:3001/categories
curl http://localhost:3001/products?limit=5
curl http://localhost:3001/products/d0000001-0000-0000-0000-000000000001
```

Expected: each returns valid JSON with seed data

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: add catalog API usage examples to README"
```
