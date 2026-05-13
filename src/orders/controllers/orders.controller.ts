// src/orders/controllers/orders.controller.ts
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import { UserRole } from '../../auth/entities/user-role.enum'
import { Roles } from '../../common/decorators/roles.decorator'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CancelOrderDto } from '../dto/cancel-order.dto'
import { CheckoutDto } from '../dto/checkout.dto'
import { PaginationQueryDto } from '../dto/pagination-query.dto'
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto'
import { OrdersService } from '../orders.service'

interface RequestUser {
  role: string
  userId: string
}

function getUser(req: Request): RequestUser {
  return req.user as unknown as RequestUser
}

@Controller()
@UseGuards(RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  async checkout(
    @Req() req: Request,
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const { userId } = getUser(req)
    return await this.ordersService.checkout(
      userId,
      dto.shippingAddress,
      idempotencyKey,
    )
  }

  @Get('orders')
  async findAll(@Req() req: Request, @Query() query: PaginationQueryDto) {
    const { userId, role } = getUser(req)
    return await this.ordersService.findAll(query, userId, role)
  }

  @Get('orders/:id')
  async findOne(@Param('id') id: string) {
    return await this.ordersService.findOne(id)
  }

  @Patch('orders/:id/status')
  @Roles(UserRole.ADMIN)
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const { userId } = getUser(req)
    return await this.ordersService.updateStatus(id, dto.status, userId)
  }

  @Post('orders/:id/cancel')
  async cancel(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    const { userId, role } = getUser(req)
    return await this.ordersService.cancel(id, userId, role, dto.reason)
  }
}
