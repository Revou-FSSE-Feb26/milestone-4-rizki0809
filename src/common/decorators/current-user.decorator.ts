import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Injects the user JwtStrategy put on the request.
 *
 *   findAll(@CurrentUser() user: AuthenticatedUser)
 *   create(@CurrentUser('id') userId: number)
 *
 * Ownership is always derived from this, never from a body or query field, so
 * a client cannot claim to be someone else by sending `user_id`.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser;
    return field ? user?.[field] : user;
  },
);
