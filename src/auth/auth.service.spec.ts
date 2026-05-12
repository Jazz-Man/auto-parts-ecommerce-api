import { ConflictException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { password as bunPassword } from 'bun'
import { AuthService } from './auth.service'
import { User } from './entities/user.entity'

describe('AuthService', () => {
  let service: AuthService
  let jwtService: JwtService

  const mockRepo = {
    create: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  }

  const mockRedis = {
    del: jest.fn(),
    get: jest.fn(),
    keys: jest.fn(),
    set: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              // biome-ignore lint/suspicious/noExplicitAny: test fixture
              const map: Record<string, any> = {
                'jwt.accessSecret': 'test-access-secret',
                'jwt.accessTtl': 900,
                'jwt.refreshSecret': 'test-refresh-secret',
                'jwt.refreshTtl': 604800,
              }
              return map[key]
            }),
          },
        },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: mockRepo },
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: mockRedis,
        },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
    jwtService = module.get<JwtService>(JwtService)
    jest.clearAllMocks()
  })

  describe('register', () => {
    it('should throw ConflictException if email exists', async () => {
      mockRepo.findOne.mockResolvedValue({ email: 'a@b.com', id: '1' })
      await expect(service.register('a@b.com', 'password1')).rejects.toThrow(
        ConflictException,
      )
    })

    it('should create user and return tokens', async () => {
      mockRepo.findOne.mockResolvedValue(null)
      mockRepo.create.mockReturnValue({ email: 'a@b.com', id: 'uuid' })
      mockRepo.save.mockResolvedValue({
        email: 'a@b.com',
        id: 'uuid',
        role: 'customer',
      })
      ;(jwtService.signAsync as jest.Mock)
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token')

      const result = await service.register('a@b.com', 'password1')
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    })
  })

  describe('login', () => {
    it('should throw UnauthorizedException for wrong password', async () => {
      const realHash = await bunPassword.hash('correct-password')
      mockRepo.findOne.mockResolvedValue({
        email: 'a@b.com',
        id: '1',
        passwordHash: realHash,
      })

      await expect(service.login('a@b.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      )
    })

    it('should return tokens for valid credentials', async () => {
      const realHash = await bunPassword.hash('password1')
      mockRepo.findOne.mockResolvedValue({
        email: 'a@b.com',
        id: '1',
        passwordHash: realHash,
        role: 'customer',
      })
      ;(jwtService.signAsync as jest.Mock)
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token')

      const result = await service.login('a@b.com', 'password1')
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    })

    it('should throw UnauthorizedException if user not found', async () => {
      mockRepo.findOne.mockResolvedValue(null)
      await expect(service.login('a@b.com', 'password1')).rejects.toThrow(
        UnauthorizedException,
      )
    })
  })

  describe('refreshTokens', () => {
    it('should throw UnauthorizedException if token not in Redis', async () => {
      mockRedis.get.mockResolvedValue(null)
      mockRedis.keys.mockResolvedValue([])
      await expect(
        service.refreshTokens('user-id', 'token-id', 'old-refresh'),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('should rotate tokens and delete old one', async () => {
      const realHash = await bunPassword.hash('old-refresh')
      mockRedis.get.mockResolvedValue(realHash)
      mockRepo.findOne.mockResolvedValue({
        email: 'a@b.com',
        id: 'user-id',
        role: 'customer',
      })
      ;(jwtService.signAsync as jest.Mock)
        .mockResolvedValueOnce('new-access')
        .mockResolvedValueOnce('new-refresh')

      const result = await service.refreshTokens(
        'user-id',
        'token-id',
        'old-refresh',
      )
      expect(mockRedis.del).toHaveBeenCalledWith('refresh:user-id:token-id')
      expect(result).toEqual({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      })
    })
  })

  describe('logout', () => {
    it('should delete refresh token from Redis', async () => {
      mockRedis.del.mockResolvedValue(1)
      await service.logout('user-id', 'token-id')
      expect(mockRedis.del).toHaveBeenCalledWith('refresh:user-id:token-id')
    })
  })
})
