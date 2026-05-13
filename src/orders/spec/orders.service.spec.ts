// src/orders/spec/orders.service.spec.ts
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { Cart } from '../../cart/entities/cart.entity'
import { CartItem } from '../../cart/entities/cart-item.entity'
import { Product } from '../../catalog/entities/product.entity'
import { Order } from '../entities/order.entity'
import { OrderItem } from '../entities/order-item.entity'
import { OrderStatus } from '../enum/order-status.enum'
import { OrdersService } from '../orders.service'

describe('OrdersService', () => {
  let service: OrdersService

  const mockQb = {
    andWhere: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
  }

  const mockOrderRepo = {
    create: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  }
  const mockOrderItemRepo = {}
  const mockProductRepo = {}
  const mockCartRepo = {}
  const mockCartItemRepo = {}

  const mockEntityManager = {
    create: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    getRepository: jest.fn(),
    query: jest.fn(),
    remove: jest.fn(),
    save: jest.fn(),
  }

  const mockDataSource = {
    transaction: jest.fn((cb) => cb(mockEntityManager)),
  }

  const mockEventEmitter = {
    emit: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: mockOrderRepo },
        { provide: getRepositoryToken(OrderItem), useValue: mockOrderItemRepo },
        { provide: getRepositoryToken(Product), useValue: mockProductRepo },
        { provide: getRepositoryToken(Cart), useValue: mockCartRepo },
        { provide: getRepositoryToken(CartItem), useValue: mockCartItemRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile()

    service = module.get<OrdersService>(OrdersService)
    jest.resetAllMocks()
    // Re-setup mocks that are used across tests
    mockOrderRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb)
    Object.assign(mockQb, {
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
    })
    mockDataSource.transaction = jest.fn((cb) => cb(mockEntityManager))
  })

  describe('checkout', () => {
    const userId = 'user-1'
    const shippingAddress = {
      city: 'Kyiv',
      country: 'UA',
      line1: '123 Main',
      state: 'Kyivska',
      zip: '01001',
    }

    it('should throw if cart is empty', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce({
        id: 'cart-1',
        items: [],
      })

      await expect(
        service.checkout(userId, shippingAddress, undefined),
      ).rejects.toThrow(BadRequestException)
    })

    it('should throw if stock insufficient', async () => {
      mockEntityManager.findOne.mockResolvedValueOnce({
        id: 'cart-1',
        items: [
          {
            priceSnapshot: '10.00',
            product: { id: 'p-1' },
            productId: 'p-1',
            quantity: 5,
          },
        ],
      })
      // em.query returns products for SELECT FOR UPDATE
      mockEntityManager.query.mockResolvedValueOnce([{ id: 'p-1', stock: 2 }])

      await expect(
        service.checkout(userId, shippingAddress, undefined),
      ).rejects.toThrow(BadRequestException)
    })

    it('should create order with correct total', async () => {
      const cartItems = [
        {
          priceSnapshot: '10.00',
          product: { id: 'p-1' },
          productId: 'p-1',
          quantity: 2,
        },
        {
          priceSnapshot: '5.00',
          product: { id: 'p-2' },
          productId: 'p-2',
          quantity: 3,
        },
      ]
      mockEntityManager.findOne.mockResolvedValueOnce({
        id: 'cart-1',
        items: cartItems,
      })
      // em.query for SELECT FOR UPDATE
      mockEntityManager.query.mockResolvedValueOnce([
        { id: 'p-1', stock: 10 },
        { id: 'p-2', stock: 10 },
      ])
      // em.query for stock decrement (p-1, p-2)
      mockEntityManager.query
        .mockResolvedValueOnce([{ id: 'p-1' }])
        .mockResolvedValueOnce([{ id: 'p-2' }])
      const savedOrder = {
        createdAt: new Date(),
        id: 'order-1',
        idempotencyKey: null,
        items: [],
        shippingAddress,
        status: OrderStatus.Pending,
        total: '35.00',
        updatedAt: new Date(),
        userId,
      }
      const savedOrderItems = [
        {
          orderId: 'order-1',
          priceSnapshot: '10.00',
          productId: 'p-1',
          quantity: 2,
        },
        {
          orderId: 'order-1',
          priceSnapshot: '5.00',
          productId: 'p-2',
          quantity: 3,
        },
      ]
      mockEntityManager.create
        .mockReturnValueOnce(savedOrder)
        .mockReturnValueOnce(savedOrderItems[0])
        .mockReturnValueOnce(savedOrderItems[1])
      mockEntityManager.save
        .mockResolvedValueOnce(savedOrder)
        .mockResolvedValueOnce(savedOrderItems)

      const result = await service.checkout(userId, shippingAddress, undefined)

      expect(result.total).toBe('35.00')
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'order.created',
        expect.objectContaining({ orderId: 'order-1', userId }),
      )
    })

    it('should store idempotency key when provided', async () => {
      const cartItems = [
        {
          priceSnapshot: '10.00',
          product: { id: 'p-1' },
          productId: 'p-1',
          quantity: 1,
        },
      ]
      mockEntityManager.findOne.mockResolvedValueOnce({
        id: 'cart-1',
        items: cartItems,
      })
      // em.query for SELECT FOR UPDATE
      mockEntityManager.query.mockResolvedValueOnce([{ id: 'p-1', stock: 10 }])
      // em.query for stock decrement
      mockEntityManager.query.mockResolvedValueOnce([{ id: 'p-1' }])
      const savedOrder = {
        createdAt: new Date(),
        id: 'order-1',
        idempotencyKey: 'key-123',
        items: [],
        shippingAddress,
        status: OrderStatus.Pending,
        total: '10.00',
        updatedAt: new Date(),
        userId,
      }
      const savedOrderItem = {
        orderId: 'order-1',
        priceSnapshot: '10.00',
        productId: 'p-1',
        quantity: 1,
      }
      mockEntityManager.create
        .mockReturnValueOnce(savedOrder)
        .mockReturnValueOnce(savedOrderItem)
      mockEntityManager.save
        .mockResolvedValueOnce(savedOrder)
        .mockResolvedValueOnce([savedOrderItem])

      const result = await service.checkout(userId, shippingAddress, 'key-123')

      expect(result.idempotencyKey).toBe('key-123')
    })
  })

  describe('findAll', () => {
    it('should return paginated orders for user', async () => {
      const orders = [
        {
          createdAt: new Date(),
          id: 'o-1',
          items: [],
          total: '10.00',
          updatedAt: new Date(),
          userId: 'user-1',
        },
      ]
      mockQb.getManyAndCount.mockResolvedValueOnce([orders, 1])

      const result = await service.findAll(
        { limit: 20, page: 1 },
        'user-1',
        'customer',
      )

      expect(result.data).toHaveLength(1)
      expect(result.meta.total).toBe(1)
    })

    it('should return all orders for admin', async () => {
      mockQb.getManyAndCount.mockResolvedValueOnce([[], 0])

      await service.findAll({ limit: 20, page: 1 }, 'admin-1', 'admin')

      expect(mockQb.getManyAndCount).toHaveBeenCalled()
    })
  })

  describe('findOne', () => {
    it('should throw if order not found', async () => {
      mockOrderRepo.findOne.mockResolvedValueOnce(null)

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      )
    })

    it('should return order', async () => {
      const order = {
        id: 'o-1',
        items: [],
        status: OrderStatus.Pending,
        total: '10.00',
        userId: 'user-1',
      }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)

      const result = await service.findOne('o-1')

      expect(result.id).toBe('o-1')
    })
  })

  describe('updateStatus', () => {
    it('should throw on invalid transition pending→delivered', async () => {
      const order = {
        id: 'o-1',
        items: [],
        status: OrderStatus.Pending,
        userId: 'user-1',
      }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)

      await expect(
        service.updateStatus('o-1', OrderStatus.Delivered, 'admin-1'),
      ).rejects.toThrow(BadRequestException)
    })

    it('should allow pending→paid', async () => {
      const order = {
        id: 'o-1',
        items: [],
        status: OrderStatus.Pending,
        userId: 'user-1',
      }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)
      mockOrderRepo.save.mockResolvedValueOnce({
        ...order,
        status: OrderStatus.Paid,
      })

      const result = await service.updateStatus(
        'o-1',
        OrderStatus.Paid,
        'admin-1',
      )

      expect(result.status).toBe(OrderStatus.Paid)
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'order.paid',
        expect.objectContaining({ orderId: 'o-1' }),
      )
    })

    it('should allow paid→shipped', async () => {
      const order = {
        id: 'o-1',
        items: [],
        status: OrderStatus.Paid,
        userId: 'user-1',
      }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)
      mockOrderRepo.save.mockResolvedValueOnce({
        ...order,
        status: OrderStatus.Shipped,
      })

      const result = await service.updateStatus(
        'o-1',
        OrderStatus.Shipped,
        'admin-1',
      )

      expect(result.status).toBe(OrderStatus.Shipped)
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'order.shipped',
        expect.any(Object),
      )
    })

    it('should allow shipped→delivered', async () => {
      const order = {
        id: 'o-1',
        items: [],
        status: OrderStatus.Shipped,
        userId: 'user-1',
      }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)
      mockOrderRepo.save.mockResolvedValueOnce({
        ...order,
        status: OrderStatus.Delivered,
      })

      const result = await service.updateStatus(
        'o-1',
        OrderStatus.Delivered,
        'admin-1',
      )

      expect(result.status).toBe(OrderStatus.Delivered)
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'order.delivered',
        expect.any(Object),
      )
    })
  })

  describe('cancel', () => {
    it('should cancel pending order and return stock', async () => {
      const order = {
        id: 'o-1',
        items: [
          { productId: 'p-1', quantity: 2 },
          { productId: 'p-2', quantity: 3 },
        ],
        status: OrderStatus.Pending,
        userId: 'user-1',
      }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)
      mockDataSource.transaction.mockImplementation((cb) => {
        const em = {
          ...mockEntityManager,
          query: jest.fn().mockResolvedValue([]),
          save: jest
            .fn()
            .mockResolvedValue({ ...order, status: OrderStatus.Cancelled }),
        }
        return cb(em)
      })

      const result = await service.cancel('o-1', 'user-1', 'customer')

      expect(result.status).toBe(OrderStatus.Cancelled)
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'order.cancelled',
        expect.any(Object),
      )
    })

    it('should reject cancel of shipped order', async () => {
      const order = {
        id: 'o-1',
        items: [],
        status: OrderStatus.Shipped,
        userId: 'user-1',
      }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)

      await expect(service.cancel('o-1', 'user-1', 'customer')).rejects.toThrow(
        BadRequestException,
      )
    })

    it('should reject cancel by non-owner non-admin', async () => {
      const order = {
        id: 'o-1',
        items: [],
        status: OrderStatus.Pending,
        userId: 'user-1',
      }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)

      await expect(service.cancel('o-1', 'user-2', 'customer')).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('should allow admin to cancel paid order', async () => {
      const order = {
        id: 'o-1',
        items: [{ productId: 'p-1', quantity: 1 }],
        status: OrderStatus.Paid,
        userId: 'user-1',
      }
      mockOrderRepo.findOne.mockResolvedValueOnce(order)
      mockDataSource.transaction.mockImplementation((cb) => {
        const em = {
          ...mockEntityManager,
          query: jest.fn().mockResolvedValue([]),
          save: jest
            .fn()
            .mockResolvedValue({ ...order, status: OrderStatus.Cancelled }),
        }
        return cb(em)
      })

      const result = await service.cancel('o-1', 'admin-1', 'admin')

      expect(result.status).toBe(OrderStatus.Cancelled)
    })
  })
})
