// src/webhooks/webhooks.module.ts
import { Module } from '@nestjs/common'
import { OrdersModule } from '../orders/orders.module'
import { WebhooksController } from './controllers/webhooks.controller'
import { WebhooksService } from './webhooks.service'

@Module({
  controllers: [WebhooksController],
  imports: [OrdersModule],
  providers: [WebhooksService],
})
export class WebhooksModule {}
