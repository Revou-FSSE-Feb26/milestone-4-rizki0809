import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the globally registered JwtAuthGuard.
 *
 * The guard is global and the exceptions are marked explicitly, rather than the
 * other way around - forgetting to add @UseGuards to a new controller then
 * fails closed (401) instead of silently exposing it.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
