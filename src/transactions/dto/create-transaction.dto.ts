import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';
import { TRANSACTION_TYPES } from '../../common/constants';
import type { TransactionType } from '../../common/constants';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.validator';

/** Body of POST /transactions. */
export class CreateTransactionDto {
  /**
   * Which account the money moved on. TransactionsService checks that this
   * account belongs to the caller before anything is written.
   */
  @Type(() => Number)
  @IsInt({ message: 'account_id must be an integer' })
  @IsPositive()
  account_id: number;

  /**
   * Required for income and expense, and must be omitted for a transfer.
   * That pairing is enforced by TransactionsService and, as a backstop, by the
   * transactions_category_required_check CHECK constraint in the database.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'category_id must be an integer' })
  @IsPositive()
  category_id?: number;

  @IsIn(TRANSACTION_TYPES, {
    message: `type must be one of: ${TRANSACTION_TYPES.join(', ')}`,
  })
  type: TransactionType;

  /**
   * Always positive - the direction lives in `type`, not in the sign. Capped
   * at the largest value NUMERIC(12,2) can hold, and limited to 2 decimals so
   * a request cannot ask for precision the column cannot store.
   */
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'amount must be a number with at most 2 decimal places' },
  )
  @IsPositive({ message: 'amount must be greater than 0' })
  @Max(9999999999.99, {
    message: 'amount exceeds what NUMERIC(12,2) can store',
  })
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Calendar date the money moved, e.g. "2026-07-15". */
  @IsCalendarDate()
  transaction_date: string;
}
