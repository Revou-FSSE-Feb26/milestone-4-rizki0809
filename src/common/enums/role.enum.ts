/** Mirrors the users_role_check CHECK constraint in db/schema.sql. */
export enum Role {
  USER = 'user',
  ADMIN = 'admin',
}

export const ROLES = Object.values(Role);
