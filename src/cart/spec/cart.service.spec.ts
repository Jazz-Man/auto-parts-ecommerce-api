import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Product } from '../../catalog/entities/product.entity'
import { CartService } from '../cart.service'
import { Cart } from '../entities/cart.entity'
import { CartItem } from '../entities/cart-item.entity'

describe('CartService', () => {
  let service: CartService

  const mockCartRepo = {
    create: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  }
  const mockCartItemRepo = {
    create: jest.fn(),
    remove: jest.fn(),
    save: jest.fn(),
  }
  const mockProductRepo = {
    findOne: jest.fn(),
  }
  const mockRedis = {
    del: jest.fn(),
    expire: jest.fn(),
    hdel: jest.fn(),
    hgetall: jest.fn(),
    hincrby: jest.fn(),
    hset: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: getRepositoryToken(Cart), useValue: mockCartRepo },
        { provide: getRepositoryToken(CartItem), useValue: mockCartItemRepo },
        { provide: getRepositoryToken(Product), useValue: mockProductRepo },
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: mockRedis,
        },
      ],
    }).compile()

    service = module.get<CartService>(CartService)
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  // ---- Guest Cart ----

  describe('getGuestCart', () => {
    it('should return empty cart for new session', async () => {
      mockRedis.hgetall.mockResolvedValue({})
      const result = await service.getGuestCart('session-1')
      expect(result).toEqual({
        items: [],
        totalItems: 0,
        totalPrice: '0.00',
      })
    })

    it('should return cart with items', async () => {
      mockRedis.hgetall.mockResolvedValue({ 'product-1': '2' })
      mockProductRepo.findOne.mockResolvedValue({
        id: 'product-1',
        price: '10.00',
        sku: 'SKU-1',
        stock: 5,
        title: 'Oil Filter',
      })

      const result = await service.getGuestCart('session-1')
      expect(result.items).toHaveLength(1)
      expect(result.totalItems).toBe(2)
      expect(result.totalPrice).toBe('20.00')
    })
  })

  describe('addGuestItem', () => {
    it('should add item to guest cart via HINCRBY', async () => {
      mockProductRepo.findOne.mockResolvedValue({
        id: 'product-1',
        price: '10.00',
        stock: 5,
      })
      mockRedis.hincrby.mockResolvedValue(2)
      mockRedis.expire.mockResolvedValue(1)

      await service.addGuestItem('session-1', {
        productId: 'product-1',
        quantity: 2,
      })
      expect(mockRedis.hincrby).toHaveBeenCalledWith(
        'cart:guest:session-1',
        'product-1',
        2,
      )
      expect(mockRedis.expire).toHaveBeenCalledWith(
        'cart:guest:session-1',
        604800,
      )
    })

    it('should throw NotFoundException for missing product', async () => {
      mockProductRepo.findOne.mockResolvedValue(null)
      await expect(
        service.addGuestItem('session-1', {
          productId: 'missing',
          quantity: 1,
        }),
      ).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException for out of stock', async () => {
      mockProductRepo.findOne.mockResolvedValue({
        id: 'product-1',
        price: '10.00',
        stock: 0,
      })
      await expect(
        service.addGuestItem('session-1', {
          productId: 'product-1',
          quantity: 1,
        }),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('updateGuestItem', () => {
    it('should set quantity via HSET', async () => {
      mockRedis.hset.mockResolvedValue(1)
      mockRedis.expire.mockResolvedValue(1)

      await service.updateGuestItem('session-1', 'product-1', 5)
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'cart:guest:session-1',
        'product-1',
        5,
      )
    })

    it('should remove item when quantity is 0', async () => {
      mockRedis.hdel.mockResolvedValue(1)

      await service.updateGuestItem('session-1', 'product-1', 0)
      expect(mockRedis.hdel).toHaveBeenCalledWith(
        'cart:guest:session-1',
        'product-1',
      )
    })
  })

  describe('removeGuestItem', () => {
    it('should delete item from Redis hash', async () => {
      mockRedis.hdel.mockResolvedValue(1)
      await service.removeGuestItem('session-1', 'product-1')
      expect(mockRedis.hdel).toHaveBeenCalledWith(
        'cart:guest:session-1',
        'product-1',
      )
    })
  })

  describe('clearGuestCart', () => {
    it('should delete entire guest cart key', async () => {
      mockRedis.del.mockResolvedValue(1)
      await service.clearGuestCart('session-1')
      expect(mockRedis.del).toHaveBeenCalledWith('cart:guest:session-1')
    })
  })

  // ---- Auth Cart ----

  describe('getAuthCart', () => {
    it('should return empty cart if user has none', async () => {
      mockCartRepo.findOne.mockResolvedValue(null)
      mockCartRepo.create.mockReturnValue({
        id: 'cart-1',
        items: [],
        userId: 'user-1',
      })
      mockCartRepo.save.mockResolvedValue({
        id: 'cart-1',
        items: [],
        userId: 'user-1',
      })

      const result = await service.getAuthCart('user-1')
      expect(result).toEqual({
        items: [],
        totalItems: 0,
        totalPrice: '0.00',
      })
    })

    it('should return cart with items', async () => {
      mockCartRepo.findOne.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            id: 'item-1',
            priceSnapshot: '10.00',
            product: {
              id: 'product-1',
              price: '12.00',
              sku: 'SKU-1',
              stock: 5,
              title: 'Oil Filter',
            },
            productId: 'product-1',
            quantity: 2,
          },
        ],
        userId: 'user-1',
      })

      const result = await service.getAuthCart('user-1')
      expect(result.items).toHaveLength(1)
      expect(result.totalItems).toBe(2)
      expect(result.totalPrice).toBe('20.00')
    })
  })

  describe('addAuthItem', () => {
    it('should create cart if needed and add item', async () => {
      mockCartRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'cart-1',
        items: [
          {
            id: 'item-1',
            priceSnapshot: '10.00',
            product: {
              id: 'product-1',
              price: '10.00',
              sku: 'SKU-1',
              stock: 5,
              title: 'Oil Filter',
            },
            productId: 'product-1',
            quantity: 2,
          },
        ],
        userId: 'user-1',
      })
      mockCartRepo.create.mockReturnValue({
        id: 'cart-1',
        items: [],
        userId: 'user-1',
      })
      mockCartRepo.save.mockResolvedValue({
        id: 'cart-1',
        items: [],
        userId: 'user-1',
      })
      mockProductRepo.findOne.mockResolvedValue({
        id: 'product-1',
        price: '10.00',
        stock: 5,
      })
      mockCartItemRepo.create.mockReturnValue({
        cartId: 'cart-1',
        priceSnapshot: '10.00',
        productId: 'product-1',
        quantity: 2,
      })

      const _result = await service.addAuthItem('user-1', {
        productId: 'product-1',
        quantity: 2,
      })
      expect(mockCartRepo.save).toHaveBeenCalled()
    })

    it('should increment quantity if item already in cart', async () => {
      const product = {
        id: 'product-1',
        price: '10.00',
        sku: 'SKU-1',
        stock: 5,
        title: 'Oil Filter',
      }
      const existingItem = {
        cartId: 'cart-1',
        id: 'item-1',
        priceSnapshot: '10.00',
        product,
        productId: 'product-1',
        quantity: 1,
      }
      mockCartRepo.findOne
        .mockResolvedValueOnce({
          id: 'cart-1',
          items: [existingItem],
          userId: 'user-1',
        })
        .mockResolvedValueOnce({
          id: 'cart-1',
          items: [{ ...existingItem, product, quantity: 3 }],
          userId: 'user-1',
        })
      mockProductRepo.findOne.mockResolvedValue({
        id: 'product-1',
        price: '10.00',
        stock: 5,
      })
      mockCartItemRepo.save.mockImplementation(async (item) => item)

      await service.addAuthItem('user-1', {
        productId: 'product-1',
        quantity: 2,
      })
      expect(mockCartItemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 3 }),
      )
    })
  })

  describe('updateAuthItem', () => {
    it('should update item quantity', async () => {
      const product = {
        id: 'product-1',
        price: '10.00',
        sku: 'SKU-1',
        stock: 5,
        title: 'Oil Filter',
      }
      const item = {
        cartId: 'cart-1',
        id: 'item-1',
        priceSnapshot: '10.00',
        product,
        productId: 'product-1',
        quantity: 2,
      }
      mockCartRepo.findOne
        .mockResolvedValueOnce({
          id: 'cart-1',
          items: [item],
          userId: 'user-1',
        })
        .mockResolvedValueOnce({
          id: 'cart-1',
          items: [{ ...item, product, quantity: 5 }],
          userId: 'user-1',
        })
      mockCartItemRepo.save.mockImplementation(async (i) => i)

      await service.updateAuthItem('user-1', 'product-1', 5)
      expect(mockCartItemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 5 }),
      )
    })

    it('should remove item when quantity is 0', async () => {
      const item = {
        cartId: 'cart-1',
        id: 'item-1',
        priceSnapshot: '10.00',
        productId: 'product-1',
        quantity: 2,
      }
      mockCartRepo.findOne
        .mockResolvedValueOnce({
          id: 'cart-1',
          items: [item],
          userId: 'user-1',
        })
        .mockResolvedValueOnce({
          id: 'cart-1',
          items: [],
          userId: 'user-1',
        })
      mockCartItemRepo.remove.mockResolvedValue(item)

      await service.updateAuthItem('user-1', 'product-1', 0)
      expect(mockCartItemRepo.remove).toHaveBeenCalledWith(item)
    })

    it('should throw NotFoundException if item not in cart', async () => {
      mockCartRepo.findOne.mockResolvedValue({
        id: 'cart-1',
        items: [],
        userId: 'user-1',
      })
      await expect(
        service.updateAuthItem('user-1', 'missing-product', 5),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('removeAuthItem', () => {
    it('should remove item from cart', async () => {
      const item = {
        cartId: 'cart-1',
        id: 'item-1',
        priceSnapshot: '10.00',
        productId: 'product-1',
        quantity: 2,
      }
      mockCartRepo.findOne
        .mockResolvedValueOnce({
          id: 'cart-1',
          items: [item],
          userId: 'user-1',
        })
        .mockResolvedValueOnce({
          id: 'cart-1',
          items: [],
          userId: 'user-1',
        })
      mockCartItemRepo.remove.mockResolvedValue(item)

      await service.removeAuthItem('user-1', 'product-1')
      expect(mockCartItemRepo.remove).toHaveBeenCalledWith(item)
    })

    it('should throw NotFoundException if item not in cart', async () => {
      mockCartRepo.findOne.mockResolvedValue({
        id: 'cart-1',
        items: [],
        userId: 'user-1',
      })
      await expect(service.removeAuthItem('user-1', 'missing')).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('clearAuthCart', () => {
    it('should remove all items from cart', async () => {
      const item1 = {
        id: 'item-1',
        priceSnapshot: '10.00',
        productId: 'p-1',
        quantity: 1,
      }
      const item2 = {
        id: 'item-2',
        priceSnapshot: '20.00',
        productId: 'p-2',
        quantity: 1,
      }
      mockCartRepo.findOne.mockResolvedValue({
        id: 'cart-1',
        items: [item1, item2],
        userId: 'user-1',
      })
      mockCartItemRepo.remove.mockResolvedValue(item1)

      await service.clearAuthCart('user-1')
      expect(mockCartItemRepo.remove).toHaveBeenCalledWith([item1, item2])
    })

    it('should do nothing if cart has no items', async () => {
      mockCartRepo.findOne.mockResolvedValue({
        id: 'cart-1',
        items: [],
        userId: 'user-1',
      })
      await service.clearAuthCart('user-1')
      expect(mockCartItemRepo.remove).not.toHaveBeenCalled()
    })
  })

  // ---- Merge ----

  describe('mergeGuestCart', () => {
    it('should merge guest items into auth cart with MAX qty', async () => {
      mockRedis.hgetall.mockResolvedValue({
        'product-1': '3',
        'product-2': '1',
      })
      mockCartRepo.findOne.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            cartId: 'cart-1',
            id: 'item-1',
            priceSnapshot: '10.00',
            productId: 'product-1',
            quantity: 2,
          },
        ],
        userId: 'user-1',
      })
      mockProductRepo.findOne
        .mockResolvedValueOnce({
          id: 'product-1',
          price: '10.00',
          stock: 10,
        })
        .mockResolvedValueOnce({
          id: 'product-2',
          price: '25.00',
          stock: 5,
        })
      mockCartItemRepo.save.mockImplementation(async (i) => i)
      mockCartItemRepo.create.mockReturnValue({
        cartId: 'cart-1',
        priceSnapshot: '25.00',
        productId: 'product-2',
        quantity: 1,
      })
      mockRedis.del.mockResolvedValue(1)

      await service.mergeGuestCart('user-1', 'session-1')

      expect(mockCartItemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'product-1',
          quantity: 3,
        }),
      )
      expect(mockCartItemRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'product-2',
          quantity: 1,
        }),
      )
      expect(mockRedis.del).toHaveBeenCalledWith('cart:guest:session-1')
    })

    it('should create cart if user has none', async () => {
      mockRedis.hgetall.mockResolvedValue({ 'product-1': '2' })
      mockCartRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
      mockCartRepo.create.mockReturnValue({
        id: 'cart-new',
        items: [],
        userId: 'user-1',
      })
      mockCartRepo.save.mockResolvedValue({
        id: 'cart-new',
        items: [],
        userId: 'user-1',
      })
      mockProductRepo.findOne.mockResolvedValue({
        id: 'product-1',
        price: '10.00',
        stock: 5,
      })
      mockCartItemRepo.create.mockReturnValue({
        cartId: 'cart-new',
        priceSnapshot: '10.00',
        productId: 'product-1',
        quantity: 2,
      })
      mockRedis.del.mockResolvedValue(1)

      await service.mergeGuestCart('user-1', 'session-1')
      expect(mockCartRepo.create).toHaveBeenCalledWith({
        items: [],
        userId: 'user-1',
      })
      expect(mockRedis.del).toHaveBeenCalledWith('cart:guest:session-1')
    })

    it('should do nothing if guest cart is empty', async () => {
      mockRedis.hgetall.mockResolvedValue({})
      await service.mergeGuestCart('user-1', 'session-1')
      expect(mockCartRepo.findOne).not.toHaveBeenCalled()
    })
  })
})
