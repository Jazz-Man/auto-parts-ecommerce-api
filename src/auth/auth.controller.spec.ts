import { Test, TestingModule } from '@nestjs/testing'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { RefreshDto } from './dto/refresh.dto'

describe('AuthController', () => {
  let controller: AuthController
  let service: AuthService

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refreshTokens: jest.fn(),
    logout: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile()

    controller = module.get<AuthController>(AuthController)
    service = module.get<AuthService>(AuthService)
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('register', () => {
    it('should call service.register and return tokens', async () => {
      const tokens = { accessToken: 'a', refreshToken: 'r' }
      mockAuthService.register.mockResolvedValue(tokens)

      const result = await controller.register({
        email: 'a@b.com',
        password: 'password1',
      } as RegisterDto)
      expect(result).toEqual(tokens)
      expect(service.register).toHaveBeenCalledWith('a@b.com', 'password1')
    })
  })

  describe('login', () => {
    it('should call service.login and return tokens', async () => {
      const tokens = { accessToken: 'a', refreshToken: 'r' }
      mockAuthService.login.mockResolvedValue(tokens)

      const result = await controller.login({
        email: 'a@b.com',
        password: 'password1',
      } as LoginDto)
      expect(result).toEqual(tokens)
    })
  })

  describe('refresh', () => {
    it('should call service.refreshTokens', async () => {
      const tokens = { accessToken: 'new-a', refreshToken: 'new-r' }
      mockAuthService.refreshTokens.mockResolvedValue(tokens)

      const result = await controller.refresh(
        { user: { userId: 'u1', tokenId: 't1' } } as any,
        { refreshToken: 'old-r' } as RefreshDto,
      )
      expect(result).toEqual(tokens)
      expect(service.refreshTokens).toHaveBeenCalledWith('u1', 't1', 'old-r')
    })
  })

  describe('logout', () => {
    it('should call service.logout', async () => {
      mockAuthService.logout.mockResolvedValue(undefined)
      await controller.logout({ user: { userId: 'u1', tokenId: 't1' } } as any)
      expect(service.logout).toHaveBeenCalledWith('u1', 't1')
    })
  })
})
