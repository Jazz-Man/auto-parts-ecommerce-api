import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { UserRole } from '../entities/user-role.enum'

interface JwtPayload {
  email: string
  role: UserRole
  sub: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      ignoreExpiration: false,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    })
  }

  validate(payload: JwtPayload) {
    return { email: payload.email, role: payload.role, userId: payload.sub }
  }
}
