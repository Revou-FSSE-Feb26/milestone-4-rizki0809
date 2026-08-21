import { Prisma } from '@prisma/client';

/**
 * Two Prisma types do not survive JSON.stringify on their own:
 *
 *  - Decimal (money) would serialise as an object, or lose precision if it
 *    were stored as a float in the first place. We keep NUMERIC(12,2) in the
 *    database and hand the client a plain number rounded to 2 decimals.
 *  - BigInt (transactions.id, BIGSERIAL) throws outright. Transaction ids stay
 *    far below Number.MAX_SAFE_INTEGER, so a Number is safe here.
 *
 * Doing this in one place keeps every service's response shape identical to a
 * row you would SELECT by hand.
 */

/** NUMERIC(12,2) -> JSON number, e.g. Decimal("446500.00") -> 446500 */
export function toMoney(value: Prisma.Decimal | number | string): number {
  return new Prisma.Decimal(value).toDecimalPlaces(2).toNumber();
}

/** BIGSERIAL -> JSON number */
export function toId(value: bigint | number): number {
  return Number(value);
}

/**
 * DATE -> 'YYYY-MM-DD'. transaction_date is a calendar date, not an instant;
 * returning a full ISO timestamp would invite timezone bugs on the client.
 */
export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * 'YYYY-MM-DD' -> Date at UTC midnight, which is what Postgres stores in a
 * DATE column. Parsing at UTC rather than local time is what keeps a date
 * posted from Jakarta from landing on the previous day on a UTC server.
 */
export function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
