// src/webhooks/controllers/webhooks.controller.ts
import { Body, Controller, Headers, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { Public } from '../../common/decorators/public.decorator'
import { WebhooksService } from '../webhooks.service'

@Controller()
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Public()
  @Post('webhooks/payment')
  async handlePayment(
    @Headers('stripe-signature') signatureHeader: string,
    @Req() req: Request,
  ) {
    const rawBody = req.rawBody?.toString() ?? ''

    this.webhooksService.verifySignature(signatureHeader, rawBody)

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body

    await this.webhooksService.processWebhook(body)

    return { received: true }
  }
}
