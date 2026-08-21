import { Prisma } from '@prisma/client';

/** The minimum a transaction needs to expose for its balance effect. */
export interface Movement {
  /** One of TRANSACTION_TYPES. Typed as string because this is what the
   *  varchar column yields; effectOf() rejects anything it does not know. */
  type: string;
  amount: Prisma.Decimal | string | number;
}

/**
 * The one place that knows how a transaction moves an account balance.
 *
 * Every method returns a *delta*, not a new balance. Services then hand the
 * delta to Prisma as `{ balance: { increment: delta } }`, which Postgres
 * applies in a single atomic UPDATE - so two concurrent writes to the same
 * account can never read-modify-write over each other.
 */
export interface BalanceCalculator {
  effectOf(movement: Movement): Prisma.Decimal;
  deltaForCreate(created: Movement): Prisma.Decimal;
  deltaForDelete(deleted: Movement): Prisma.Decimal;
  deltaForUpdate(before: Movement, after: Movement): Prisma.Decimal;
  sum(movements: Movement[]): Prisma.Decimal;
}

/**
 * Reference implementation of the FinTrack balance rule.
 *
 * Deliberately free of @Injectable, PrismaService, HTTP types and every other
 * framework concern: it is a pure function of (type, amount) wrapped in a
 * class, and it is instantiated by a useFactory in CoreModule. That is why it
 * was factored out of TransactionsService - the money rule is the part most
 * worth testing, and here it can be tested with `new BalanceCalculatorService(2)`
 * and no test module, no database and no HTTP layer.
 *
 * See src/common/providers/balance-calculator.service.spec.ts.
 */
export class BalanceCalculatorService implements BalanceCalculator {
  /**
   * Signed direction per transaction type.
   *
   * 'transfer' is 0 on purpose. The canonical schema records a transfer against
   * a single account_id and has no destination column, so a transfer row cannot
   * describe where the money went. Treating it as balance-neutral is the only
   * reading that never corrupts a balance. See "Known limitations" in README.md.
   */
  private static readonly DIRECTION: Record<string, number> = {
    income: 1,
    expense: -1,
    transfer: 0,
  };

  /**
   * @param scale decimal places to round to. Matches NUMERIC(12,2), and is
   *   passed in rather than hardcoded - which is also why this class needs a
   *   useFactory: Nest cannot resolve a bare `number` constructor argument.
   */
  constructor(private readonly scale: number = 2) {}

  /** Signed amount this movement contributes to its account's balance. */
  effectOf(movement: Movement): Prisma.Decimal {
    const direction = BalanceCalculatorService.DIRECTION[movement.type];

    if (direction === undefined) {
      // Unreachable through the API - the DTO's @IsIn rejects it first - but
      // this class is public API for anyone importing it directly.
      throw new Error(`Unknown transaction type "${movement.type}"`);
    }

    return this.round(new Prisma.Decimal(movement.amount).mul(direction));
  }

  /** Adding a transaction applies its effect. */
  deltaForCreate(created: Movement): Prisma.Decimal {
    return this.effectOf(created);
  }

  /** Removing a transaction backs its effect out again. */
  deltaForDelete(deleted: Movement): Prisma.Decimal {
    return this.round(this.effectOf(deleted).negated());
  }

  /**
   * Editing a transaction backs out the old effect and applies the new one, so
   * changing 50,000 expense -> 50,000 income moves the balance by +100,000.
   */
  deltaForUpdate(before: Movement, after: Movement): Prisma.Decimal {
    return this.round(this.effectOf(after).minus(this.effectOf(before)));
  }

  /** Rebuilds a balance from scratch. Used by the admin recalculate action. */
  sum(movements: Movement[]): Prisma.Decimal {
    return this.round(
      movements.reduce(
        (total, movement) => total.plus(this.effectOf(movement)),
        new Prisma.Decimal(0),
      ),
    );
  }

  private round(value: Prisma.Decimal): Prisma.Decimal {
    return value.toDecimalPlaces(this.scale);
  }
}
