import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Registered as a global APP_GUARD in AppModule, so every route requires a
 * valid Bearer token unless it is explicitly marked @Public().
 *
 * That default-deny arrangement is what makes the assignment's "forgot to add
 * @UseGuards" failure mode impossible: a new controller is protected the
 * moment it exists.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return isPublic ? true : super.canActivate(context);
  }

  /** Turns passport's generic failure into a message a client can act on. */
  handleRequest<TUser>(
    err: Error | null,
    user: TUser,
    info: { message?: string } | undefined,
  ): TUser {
    if (err || !user) {
      throw (
        err ??
        new UnauthorizedException(
          info?.message === 'jwt expired'
            ? 'Access token has expired, please log in again'
            : 'Missing or invalid access token',
        )
      );
    }
    return user;
  }
}
