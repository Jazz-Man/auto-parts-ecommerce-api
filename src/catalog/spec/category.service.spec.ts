import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Category } from '../entities/category.entity'
import { CategoryService } from '../services/category.service'

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
        { id: '1', name: 'Engine', parentId: null, slug: 'engine' },
        { id: '2', name: 'Filters', parentId: '1', slug: 'filters' },
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
      const dto = { name: 'Engine', slug: 'engine' }
      const category = { id: '1', ...dto, parentId: null }
      mockRepo.create.mockReturnValue(category)
      mockRepo.save.mockResolvedValue(category)

      const result = await service.create(dto)
      expect(result.name).toBe('Engine')
    })

    it('should create a child category when parent exists', async () => {
      const parent = { id: '1', name: 'Engine', parentId: null, slug: 'engine' }
      mockRepo.findOne.mockResolvedValue(parent)
      const dto = { name: 'Filters', parentId: '1', slug: 'filters' }
      const category = { id: '2', ...dto }
      mockRepo.create.mockReturnValue(category)
      mockRepo.save.mockResolvedValue(category)

      const result = await service.create(dto)
      expect(result.name).toBe('Filters')
    })

    it('should throw NotFoundException if parent not found', async () => {
      mockRepo.findOne.mockResolvedValue(null)
      await expect(
        service.create({ name: 'X', parentId: 'missing', slug: 'x' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('update', () => {
    it('should throw BadRequestException for self-reference', async () => {
      mockRepo.find.mockResolvedValue([])
      await expect(service.update('1', { parentId: '1' })).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  describe('remove', () => {
    it('should remove and return { deleted: true }', async () => {
      const category = {
        id: '1',
        name: 'Engine',
        parentId: null,
        slug: 'engine',
      }
      mockRepo.findOne.mockResolvedValue(category)
      mockRepo.remove.mockResolvedValue(category)

      const result = await service.remove('1')
      expect(result).toEqual({ deleted: true })
    })
  })
})
