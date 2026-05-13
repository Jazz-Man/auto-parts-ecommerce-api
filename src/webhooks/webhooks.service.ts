// src/webhooks/webhooks.service.ts
import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { OrderStatus } from '../orders/enum/order-status.enum'
import { OrdersService } from '../orders/orders.service'

@Injectable()
export class WebhooksService {
  private readonly secret: string

  constructor(
    private readonly config: ConfigService,
    private readonly ordersService: OrdersService,
  ) {
    this.secret = this.config.get<string>('webhook.secret')!
  }

  verifySignature(signatureHeader: string, rawBody: string): boolean {
    if (!signatureHeader) {
      throw new BadRequestException('Missing Stripe-Signature header')
    }

    const parts = Object.fromEntries(
      signatureHeader.split(',').map((part) => {
        const [key, ...value] = part.split('=')
        return [key, value.join('=')]
      }),
    )

    const timestamp = Number(parts.t)
    const signature = parts.v1

    if (!timestamp || !signature) {
      throw new BadRequestException('Invalid signature format')
    }

    // Check timestamp freshness (5 minutes)
    const now = Math.floor(Date.now() / 1000)
    if (now - timestamp > 300) {
      throw new BadRequestException('Webhook timestamp too old')
    }

    // Compute expected signature
    const payload = `${timestamp}.${rawBody}`
    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex')

    // Timing-safe comparison
    const expectedBuf = Buffer.from(expected, 'utf8')
    const sigBuf = Buffer.from(signature, 'utf8')

    if (expectedBuf.length !== sigBuf.length) {
      throw new BadRequestException('Invalid signature')
    }

    if (!crypto.timingSafeEqual(expectedBuf, sigBuf)) {
      throw new BadRequestException('Invalid signature')
    }

    return true
  }

  async processWebhook(body: {
    type: string
    data: { object: { metadata: { orderId: string } } }
  }): Promise<void> {
    if (body.type !== 'payment_intent.succeeded') {
      return
    }

    const orderId = body.data?.object?.metadata?.orderId
    if (orderId) {
      await this.ordersService.updateStatus(
        orderId,
        OrderStatus.Paid,
        'webhook',
      )
    }
  }
}
