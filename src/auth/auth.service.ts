import {
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { Role } from '../common/enums/role.enum';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../common/interfaces/authenticated-user.interface';
import type { PasswordHasher } from '../common/providers/password-hasher';
import { PASSWORD_HASHER } from '../common/providers/tokens';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  /**
   * A real bcrypt hash of a random string, compared against when the email is
   * unknown. Without it, a miss returns immediately while a hit spends ~100ms
   * in bcrypt - a difference an attacker can measure to enumerate which email
   * addresses have accounts. Comparing against a throwaway hash makes both
   * paths cost the same.
   */
  private decoyHash!: string;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async onModuleInit(): Promise<void> {
    this.decoyHash = await this.hasher.hash(randomBytes(32).toString('hex'));
  }

  /**
   * Public sign-up. RegisterDto has no `role` field, so everyone created here
   * takes the database default of 'user'; making an admin is an admin action
   * through POST /users.
   */
  register(dto: RegisterDto) {
    return this.users.create({ ...dto, role: Role.USER });
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const matches = await this.hasher.compare(
      dto.password,
      user?.password ?? this.decoyHash,
    );

    // One message for both failure modes. "No such user" versus "wrong
    // password" would tell an attacker which half they already have right.
    if (!user || !matches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as Role,
    };

    return {
      access_token: await this.jwt.signAsync(payload),
      token_type: 'Bearer',
      expires_in: this.config.get<string>('JWT_EXPIRES_IN') ?? '1h',
      // Rebuilt field by field rather than spread from `user`, so the password
      // hash cannot ride along by accident.
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
    };
  }

  /** GET /auth/me - who the current token belongs to, with their accounts. */
  profile(actor: AuthenticatedUser) {
    return this.users.findOne(actor.id);
  }
}
