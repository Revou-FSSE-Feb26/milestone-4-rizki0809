/**
 * The three type enums from db/schema.sql, in one place.
 *
 * These arrays are the single source of truth for the API layer: DTOs validate
 * against them with @IsIn, so a value that would violate a CHECK constraint in
 * Postgres is rejected with a 400 long before it reaches the database.
 *
 * NOTE: accounts.type, categories.type and transactions.type are three
 * different enums. In particular categories.type has no 'transfer'.
 */

export const ACCOUNT_TYPES = ['cash', 'bank', 'e-wallet'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CATEGORY_TYPES = ['income', 'expense'] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const TRANSACTION_TYPES = ['income', 'expense', 'transfer'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * Columns of `users` that are safe to send over the wire. Passing this to
 * Prisma's `select` means the password hash is never even read out of the
 * database, which is a stronger guarantee than deleting it afterwards.
 */
export const USER_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  created_at: true,
} as const;
