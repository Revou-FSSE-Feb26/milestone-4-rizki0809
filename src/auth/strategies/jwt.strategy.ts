import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '../../common/enums/role.enum';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/interfaces/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Verifies the Bearer token and decides who the request is from.
 *
 * The signature is checked first (passport-jwt), then the user is re-read from
 * the database. Trusting the token's own claims would be faster, but a JWT is a
 * snapshot: a user deleted or demoted from admin five minutes ago would keep
 * their old powers until the token expired. Reading the row is one indexed
 * primary-key lookup and closes that window entirely.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // getOrThrow, so a deployment missing JWT_SECRET fails at boot rather
      // than signing tokens with an undefined secret.
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /** Whatever this returns becomes request.user. Never includes the hash. */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      throw new UnauthorizedException(
        'The account for this token no longer exists',
      );
    }

    return { id: user.id, email: user.email, role: user.role as Role };
  }
}
