// src/orders/spec/orders.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import type { Request } from 'express'
import { OrdersController } from '../controllers/orders.controller'
import { OrdersService } from '../orders.service'

interface MockUser {
  role?: string
  userId: string
}

function mockReq(user: MockUser): Request {
  return { user } as Request
}

describe('OrdersController', () => {
  let controller: OrdersController

  const mockOrdersService = {
    cancel: jest.fn(),
    checkout: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateStatus: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: mockOrdersService }],
    }).compile()

    controller = module.get<OrdersController>(OrdersController)
    jest.resetAllMocks()
  })

  describe('checkout', () => {
    it('should call service.checkout with userId and body', async () => {
      const dto = {
        shippingAddress: {
          city: 'Kyiv',
          country: 'UA',
          line1: '123',
          state: 'KY',
          zip: '01001',
        },
      }
      mockOrdersService.checkout.mockResolvedValueOnce({ id: 'o-1' })

      await controller.checkout(mockReq({ userId: 'user-1' }), dto, 'key-123')

      expect(mockOrdersService.checkout).toHaveBeenCalledWith(
        'user-1',
        dto.shippingAddress,
        'key-123',
      )
    })
  })

  describe('findAll', () => {
    it('should pass userId from request', async () => {
      mockOrdersService.findAll.mockResolvedValueOnce({ data: [], meta: {} })

      await controller.findAll(
        mockReq({ role: 'customer', userId: 'user-1' }),
        { limit: 20, page: 1 },
      )

      expect(mockOrdersService.findAll).toHaveBeenCalledWith(
        { limit: 20, page: 1 },
        'user-1',
        'customer',
      )
    })
  })

  describe('findOne', () => {
    it('should call service.findOne', async () => {
      mockOrdersService.findOne.mockResolvedValueOnce({ id: 'o-1' })

      await controller.findOne('o-1')

      expect(mockOrdersService.findOne).toHaveBeenCalledWith('o-1')
    })
  })

  describe('updateStatus', () => {
    it('should call service.updateStatus', async () => {
      mockOrdersService.updateStatus.mockResolvedValueOnce({
        id: 'o-1',
        status: 'shipped',
      })

      await controller.updateStatus(mockReq({ userId: 'admin-1' }), 'o-1', {
        status: 'shipped',
      })

      expect(mockOrdersService.updateStatus).toHaveBeenCalledWith(
        'o-1',
        'shipped',
        'admin-1',
      )
    })
  })

  describe('cancel', () => {
    it('should call service.cancel with reason', async () => {
      mockOrdersService.cancel.mockResolvedValueOnce({
        id: 'o-1',
        status: 'cancelled',
      })

      await controller.cancel(
        mockReq({ role: 'customer', userId: 'user-1' }),
        'o-1',
        { reason: 'changed mind' },
      )

      expect(mockOrdersService.cancel).toHaveBeenCalledWith(
        'o-1',
        'user-1',
        'customer',
        'changed mind',
      )
    })
  })
})
