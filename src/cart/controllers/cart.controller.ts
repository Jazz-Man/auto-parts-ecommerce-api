import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Response } from 'express'
import { Public } from '../../common/decorators/public.decorator'
import { CartService } from '../cart.service'
import { AddCartItemDto } from '../dto/add-cart-item.dto'
import { UpdateCartItemDto } from '../dto/update-cart-item.dto'

@Controller()
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('cart')
  async getCart(
    @Headers('x-session-id') sessionId: string | undefined,
    @Headers('authorization') authHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { userId, sid } = this.extractIds(authHeader, sessionId, res)

    if (userId) {
      return this.cartService.getAuthCart(userId)
    }
    return this.cartService.getGuestCart(sid!)
  }

  @Public()
  @Post('cart/items')
  async addItem(
    @Body() dto: AddCartItemDto,
    @Headers('x-session-id') sessionId: string | undefined,
    @Headers('authorization') authHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { userId, sid } = this.extractIds(authHeader, sessionId, res)

    if (userId) {
      return this.cartService.addAuthItem(userId, dto)
    }
    await this.cartService.addGuestItem(sid!, dto)
    return this.cartService.getGuestCart(sid!)
  }

  @Public()
  @Patch('cart/items/:productId')
  async updateItem(
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
    @Headers('x-session-id') sessionId: string | undefined,
    @Headers('authorization') authHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { userId, sid } = this.extractIds(authHeader, sessionId, res)

    if (userId) {
      return this.cartService.updateAuthItem(userId, productId, dto.quantity)
    }
    await this.cartService.updateGuestItem(sid!, productId, dto.quantity)
    return this.cartService.getGuestCart(sid!)
  }

  @Public()
  @Delete('cart/items/:productId')
  async removeItem(
    @Param('productId') productId: string,
    @Headers('x-session-id') sessionId: string | undefined,
    @Headers('authorization') authHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { userId, sid } = this.extractIds(authHeader, sessionId, res)

    if (userId) {
      return this.cartService.removeAuthItem(userId, productId)
    }
    await this.cartService.removeGuestItem(sid!, productId)
    return this.cartService.getGuestCart(sid!)
  }

  @Public()
  @Delete('cart')
  async clearCart(
    @Headers('x-session-id') sessionId: string | undefined,
    @Headers('authorization') authHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { userId, sid } = this.extractIds(authHeader, sessionId, res)

    if (userId) {
      return this.cartService.clearAuthCart(userId)
    }
    await this.cartService.clearGuestCart(sid!)
    return { items: [], totalItems: 0, totalPrice: '0.00' }
  }

  private extractIds(
    authHeader: string | undefined,
    sessionId: string | undefined,
    res: Response,
  ): { userId: string | null; sid: string | null } {
    let userId: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7)
        const payload = this.jwt.verify<{ sub: string; email: string }>(token, {
          secret: this.config.get<string>('jwt.accessSecret')!,
        })
        userId = payload.sub
      } catch {
        // Invalid token — treat as guest
      }
    }

    let sid = sessionId ?? null
    if (!sid && !userId) {
      sid = crypto.randomUUID()
      res.setHeader('x-session-id', sid)
    }

    return { userId, sid }
  }
}
