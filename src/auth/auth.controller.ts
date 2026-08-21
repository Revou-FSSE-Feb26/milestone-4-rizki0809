import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 201 with the new user. No token - registering is not logging in. */
  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  /**
   * Rate limited, and only here.
   *
   * ThrottlerGuard is attached to this one route rather than registered as a
   * global APP_GUARD, because a limit tight enough to stop password guessing
   * (5 attempts / minute) would throttle ordinary CRUD traffic into
   * uselessness. The limit and window come from LOGIN_RATE_LIMIT and
   * LOGIN_RATE_TTL_SECONDS - see the 'login' throttler in AppModule.
   *
   * 200, not 201: logging in returns a token, it does not create a resource.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** Requires a valid token - the quickest way to prove one works. */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.profile(user);
  }
}
