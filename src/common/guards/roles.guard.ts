import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Role-based access control. Registered globally after JwtAuthGuard, so by the
 * time it runs the user is already authenticated and its role has been re-read
 * from the database (see JwtStrategy) rather than trusted off the token.
 *
 * Routes without @Roles() are open to any authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `This action requires the ${requiredRoles.join(' or ')} role`,
      );
    }

    return true;
  }
}
