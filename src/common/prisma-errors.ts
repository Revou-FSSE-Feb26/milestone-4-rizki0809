import { Prisma } from '@prisma/client';

/**
 * The Prisma error codes this API turns into meaningful HTTP responses.
 * https://www.prisma.io/docs/orm/reference/error-reference
 */
export const PrismaErrorCode = {
  /** Unique constraint failed, e.g. two users with the same email. -> 409 */
  UNIQUE_VIOLATION: 'P2002',
  /** Foreign key constraint failed, e.g. deleting a category still in use. -> 409 */
  FOREIGN_KEY_VIOLATION: 'P2003',
  /** An operation depended on a record that does not exist. -> 404 */
  RECORD_NOT_FOUND: 'P2025',
} as const;

export function isPrismaError(
  error: unknown,
  code?: string,
): error is Prisma.PrismaClientKnownRequestError {
  const known = error instanceof Prisma.PrismaClientKnownRequestError;
  return code ? known && error.code === code : known;
}

/** Which column(s) tripped a P2002, so the 409 can name the actual field. */
export function uniqueViolationFields(
  error: Prisma.PrismaClientKnownRequestError,
): string[] {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target as string[];
  if (typeof target === 'string') return [target];
  return [];
}
