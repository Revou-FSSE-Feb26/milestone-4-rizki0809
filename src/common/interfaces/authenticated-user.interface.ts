import { Role } from '../enums/role.enum';

/**
 * What JwtStrategy.validate() puts on `request.user`.
 *
 * Deliberately does NOT carry the password hash, and is re-read from the
 * database on every request rather than trusted straight off the token, so a
 * deleted user or a demoted admin loses access immediately instead of when
 * their token happens to expire.
 */
export interface AuthenticatedUser {
  id: number;
  email: string;
  role: Role;
}

/** The claims we sign into the JWT. `sub` is the standard subject claim. */
export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
}
