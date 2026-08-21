import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsPositive } from 'class-validator';
import { TRANSACTION_TYPES } from '../../common/constants';
import type { TransactionType } from '../../common/constants';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.validator';

/**
 * Query string of GET /transactions, e.g.
 *   /transactions?type=expense&from=2026-07-01&to=2026-07-31
 *
 * Query parameters arrive as strings, so the numeric ones need @Type to be
 * converted before @IsInt sees them - the global ValidationPipe runs with
 * transform enabled but not implicit conversion, which would otherwise coerce
 * far more aggressively than intended.
 */
export class QueryTransactionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'account_id must be an integer' })
  @IsPositive()
  account_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'category_id must be an integer' })
  @IsPositive()
  category_id?: number;

  @IsOptional()
  @IsIn(TRANSACTION_TYPES, {
    message: `type must be one of: ${TRANSACTION_TYPES.join(', ')}`,
  })
  type?: TransactionType;

  /** Inclusive lower bound on transaction_date. */
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  /** Inclusive upper bound on transaction_date. */
  @IsOptional()
  @IsCalendarDate()
  to?: string;
}
