import { Test, TestingModule } from '@nestjs/testing'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { RefreshDto } from './dto/refresh.dto'
import { RegisterDto } from './dto/register.dto'

describe('AuthController', () => {
  let controller: AuthController
  let service: AuthService

  const mockAuthService = {
    login: jest.fn(),
    logout: jest.fn(),
    refreshTokens: jest.fn(),
    register: jest.fn(),
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
        // biome-ignore lint/suspicious/noExplicitAny: mock request object
        { user: { tokenId: 't1', userId: 'u1' } } as any,
        { refreshToken: 'old-r' } as RefreshDto,
      )
      expect(result).toEqual(tokens)
      expect(service.refreshTokens).toHaveBeenCalledWith('u1', 't1', 'old-r')
    })
  })

  describe('logout', () => {
    it('should call service.logout', async () => {
      mockAuthService.logout.mockResolvedValue(undefined)
      // biome-ignore lint/suspicious/noExplicitAny: mock request object
      await controller.logout({ user: { tokenId: 't1', userId: 'u1' } } as any)
      expect(service.logout).toHaveBeenCalledWith('u1', 't1')
    })
  })
})
