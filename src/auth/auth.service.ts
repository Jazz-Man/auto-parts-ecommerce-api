import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { password as bunPassword } from 'bun'
import { Redis } from 'ioredis'
import { Repository } from 'typeorm'
import { User } from './entities/user.entity'
import { UserRole } from './entities/user-role.enum'

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  async register(email: string, password: string): Promise<TokenPair> {
    const existing = await this.userRepo.findOne({ where: { email } })
    if (existing) throw new ConflictException('Email already registered')

    const passwordHash = await bunPassword.hash(password)
    const user = this.userRepo.create({ email, passwordHash })
    await this.userRepo.save(user)

    return this.generateTokenPair(user.id, user.email, user.role)
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.userRepo.findOne({ where: { email } })
    if (!user) throw new UnauthorizedException('Invalid credentials')

    const valid = await bunPassword.verify(password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    return this.generateTokenPair(user.id, user.email, user.role)
  }

  async refreshTokens(
    userId: string,
    tokenId: string,
    oldRefreshToken: string,
  ): Promise<TokenPair> {
    const key = `refresh:${userId}:${tokenId}`
    const stored = await this.redis.get(key)

    if (!stored) {
      await this.invalidateAllUserTokens(userId)
      throw new UnauthorizedException('Invalid refresh token')
    }

    const valid = await bunPassword.verify(oldRefreshToken, stored)
    if (!valid) {
      await this.invalidateAllUserTokens(userId)
      throw new UnauthorizedException('Invalid refresh token')
    }

    await this.redis.del(key)

    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) throw new UnauthorizedException()

    return this.generateTokenPair(user.id, user.email, user.role)
  }

  async logout(userId: string, tokenId: string): Promise<void> {
    await this.redis.del(`refresh:${userId}:${tokenId}`)
  }

  private async generateTokenPair(
    userId: string,
    email: string,
    role: UserRole,
  ): Promise<TokenPair> {
    const tokenId = crypto.randomUUID()

    const accessToken = await this.jwt.signAsync(
      { email, role, sub: userId },
      {
        expiresIn: this.config.get<number>('jwt.accessTtl'),
        secret: this.config.get<string>('jwt.accessSecret'),
      },
    )

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, tokenId },
      {
        expiresIn: this.config.get<number>('jwt.refreshTtl'),
        secret: this.config.get<string>('jwt.refreshSecret'),
      },
    )

    const refreshTtl = this.config.get<number>('jwt.refreshTtl')
    const hashedRefresh = await bunPassword.hash(refreshToken)
    await this.redis.set(
      `refresh:${userId}:${tokenId}`,
      hashedRefresh,
      'EX',
      // biome-ignore lint/suspicious/noExplicitAny: ioredis set overload requires specific types
      refreshTtl as any,
    )

    return { accessToken, refreshToken }
  }

  private async invalidateAllUserTokens(userId: string): Promise<void> {
    const keys = await this.redis.keys(`refresh:${userId}:*`)
    if (keys.length) await this.redis.del(...keys)
  }
}
