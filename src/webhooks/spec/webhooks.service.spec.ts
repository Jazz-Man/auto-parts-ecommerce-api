// src/webhooks/spec/webhooks.service.spec.ts
import { BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import crypto from 'crypto'
import { OrderStatus } from '../../orders/enum/order-status.enum'
import { OrdersService } from '../../orders/orders.service'
import { WebhooksService } from '../webhooks.service'

describe('WebhooksService', () => {
  let service: WebhooksService

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        'webhook.secret': 'whsec_test',
      }
      return map[key]
    }),
  }

  const mockOrdersService = {
    updateStatus: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: OrdersService, useValue: mockOrdersService },
      ],
    }).compile()

    service = module.get<WebhooksService>(WebhooksService)
    jest.clearAllMocks()
  })

  describe('verifySignature', () => {
    it('should throw if signature header missing', () => {
      expect(() => service.verifySignature('', '{}')).toThrow(
        BadRequestException,
      )
    })

    it('should throw if timestamp too old', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600 // 10 min ago
      const header = `t=${oldTimestamp},v1=fakesig`

      expect(() => service.verifySignature(header, '{}')).toThrow(
        BadRequestException,
      )
    })

    it('should throw if signature invalid', () => {
      const ts = Math.floor(Date.now() / 1000)
      const header = `t=${ts},v1=invalidsignature`

      expect(() => service.verifySignature(header, '{}')).toThrow(
        BadRequestException,
      )
    })

    it('should return true for valid signature', () => {
      const ts = Math.floor(Date.now() / 1000)
      const payload = '{"type":"payment_intent.succeeded"}'
      const expected = crypto
        .createHmac('sha256', 'whsec_test')
        .update(`${ts}.${payload}`)
        .digest('hex')
      const header = `t=${ts},v1=${expected}`

      expect(service.verifySignature(header, payload)).toBe(true)
    })
  })

  describe('processWebhook', () => {
    it('should update order to paid for succeeded event', async () => {
      mockOrdersService.updateStatus.mockResolvedValueOnce({
        id: 'o-1',
        status: OrderStatus.Paid,
      })

      await service.processWebhook({
        data: { object: { metadata: { orderId: 'o-1' } } },
        type: 'payment_intent.succeeded',
      })

      expect(mockOrdersService.updateStatus).toHaveBeenCalledWith(
        'o-1',
        OrderStatus.Paid,
        'webhook',
      )
    })

    it('should ignore non-succeeded events', async () => {
      await service.processWebhook({
        data: { object: { metadata: { orderId: 'o-1' } } },
        type: 'payment_intent.created',
      })

      expect(mockOrdersService.updateStatus).not.toHaveBeenCalled()
    })
  })
})
