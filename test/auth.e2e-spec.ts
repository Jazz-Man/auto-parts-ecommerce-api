import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'

describe('Auth (e2e)', () => {
  let app: INestApplication
  let accessToken: string
  let refreshToken: string

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    )
    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector)),
    )
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  const testEmail = `e2e-${Date.now()}@test.com`
  const testPassword = 'testpassword1'

  describe('POST /auth/register', () => {
    it('should register a new user', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: testEmail, password: testPassword })
        .expect(201)
        .expect((res) => {
          expect(res.body.accessToken).toBeDefined()
          expect(res.body.refreshToken).toBeDefined()
          accessToken = res.body.accessToken
          refreshToken = res.body.refreshToken
        })
    })

    it('should reject duplicate email', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: testEmail, password: testPassword })
        .expect(409)
    })

    it('should validate email format', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: testPassword })
        .expect(400)
    })

    it('should enforce min password length', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'new@test.com', password: 'short' })
        .expect(400)
    })
  })

  describe('POST /auth/login', () => {
    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword })
        .expect(201)
        .expect((res) => {
          expect(res.body.accessToken).toBeDefined()
          expect(res.body.refreshToken).toBeDefined()
          accessToken = res.body.accessToken
          refreshToken = res.body.refreshToken
        })
    })

    it('should reject wrong password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: 'wrongpassword' })
        .expect(401)
    })
  })

  describe('POST /auth/refresh', () => {
    it('should issue new token pair', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .send({ refreshToken })
        .expect(201)
        .expect((res) => {
          expect(res.body.accessToken).toBeDefined()
          expect(res.body.refreshToken).toBeDefined()
          accessToken = res.body.accessToken
          refreshToken = res.body.refreshToken
        })
    })
  })

  describe('POST /auth/logout', () => {
    it('should logout successfully', () => {
      return request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201)
    })
  })
})
