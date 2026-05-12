import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ProductQueryDto } from '../dto/product-query.dto'
import { Product } from '../entities/product.entity'
import { ProductVehicle } from '../entities/product-vehicle.entity'
import { CategoryService } from '../services/category.service'
import { ProductService } from '../services/product.service'

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
        limit: 20,
        page: 1,
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

      await service.findAll({ max_price: 50, min_price: 10 })
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
        category: { name: 'Filters' },
        id: '1',
        productVehicles: [],
        sku: 'A-001',
        title: 'Oil Filter',
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
        categoryId: 'cat-1',
        price: 12.5,
        sku: 'A-001',
        title: 'Oil Filter',
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
        categoryId: 'cat-1',
        price: 12.5,
        sku: 'A-001',
        title: 'Oil Filter',
        vehicleIds: ['v1', 'v2'],
      }
      const saved = {
        categoryId: 'cat-1',
        id: '1',
        price: 12.5,
        sku: 'A-001',
        title: 'Oil Filter',
      }
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
        category: {},
        categoryId: 'cat-1',
        id: '1',
        price: 12.5,
        productVehicles: [],
        sku: 'A-001',
        title: 'Oil Filter',
      }
      mockProductRepo.findOne.mockResolvedValue(existing)
      mockProductRepo.save.mockResolvedValue({
        ...existing,
        title: 'New Title',
      })
      mockPvRepo.delete.mockResolvedValue({ affected: 2 })
      mockPvRepo.create.mockImplementation((data) => data)

      const _result = await service.update('1', {
        title: 'New Title',
        vehicleIds: ['v1'],
      })
      expect(mockPvRepo.delete).toHaveBeenCalledWith({ productId: '1' })
    })

    it('should preserve vehicle links if vehicleIds not provided', async () => {
      const existing = {
        category: {},
        id: '1',
        productVehicles: [],
        sku: 'A-001',
        title: 'Old',
      }
      mockProductRepo.findOne.mockResolvedValue(existing)
      mockProductRepo.save.mockResolvedValue({ ...existing, title: 'New' })

      await service.update('1', { title: 'New' })
      expect(mockPvRepo.delete).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('should remove and return { deleted: true }', async () => {
      const product = {
        category: {},
        id: '1',
        productVehicles: [],
        sku: 'A-001',
      }
      mockProductRepo.findOne.mockResolvedValue(product)
      mockProductRepo.remove.mockResolvedValue(product)

      const result = await service.remove('1')
      expect(result).toEqual({ deleted: true })
    })
  })
})
