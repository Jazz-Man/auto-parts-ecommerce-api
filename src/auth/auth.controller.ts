import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { CartService } from '../cart/cart.service'
import { Public } from '../common/decorators/public.decorator'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { JwtRefreshGuard } from '../common/guards/jwt-refresh.guard'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { RefreshDto } from './dto/refresh.dto'
import { RegisterDto } from './dto/register.dto'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    private readonly cartService: CartService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password)
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Headers('x-session-id') sessionId?: string,
  ) {
    const tokens = await this.auth.login(dto.email, dto.password)
    if (sessionId) {
      try {
        const { sub } = this.jwt.decode<{ sub: string }>(
          tokens.accessToken,
        ) as { sub: string }
        await this.cartService.mergeGuestCart(sub, sessionId)
      } catch {
        // merge failure should not block login
      }
    }
    return tokens
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  refresh(@Req() req: Request, @Body() dto: RefreshDto) {
    const { userId, tokenId } = req.user as { userId: string; tokenId: string }
    return this.auth.refreshTokens(userId, tokenId, dto.refreshToken)
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() req: Request) {
    const user = req.user as { userId: string; tokenId?: string }
    return this.auth.logout(user.userId, user.tokenId ?? '')
  }
}
