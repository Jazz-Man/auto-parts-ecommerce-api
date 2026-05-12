import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Vehicle } from '../entities/vehicle.entity'
import { VehicleService } from '../services/vehicle.service'

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
      const vehicles = [
        { brand: { name: 'Toyota' }, id: '1', model: 'Corolla' },
      ]
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
      expect(mockQb.where).toHaveBeenCalledWith('vehicle.model ILIKE :q', {
        q: '%corr%',
      })
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
      const dto = {
        brandId: 'b1',
        model: 'Corolla',
        yearEnd: 2023,
        yearStart: 2015,
      }
      const vehicle = { id: '1', ...dto }
      mockRepo.create.mockReturnValue(vehicle)
      mockRepo.save.mockResolvedValue(vehicle)

      const result = await service.create(dto)
      expect(result).toEqual(vehicle)
    })
  })

  describe('update', () => {
    it('should update and return the vehicle', async () => {
      const existing = {
        brandId: 'b1',
        id: '1',
        model: 'Corolla',
        yearEnd: 2023,
        yearStart: 2015,
      }
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
