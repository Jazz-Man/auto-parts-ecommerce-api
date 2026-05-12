import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Brand } from '../entities/brand.entity'
import { BrandService } from '../services/brand.service'

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
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException)
    })
  })
})
