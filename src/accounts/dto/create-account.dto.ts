import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ACCOUNT_TYPES } from '../../common/constants';
import type { AccountType } from '../../common/constants';

/**
 * Body of POST /accounts.
 *
 * Two fields from the accounts table are deliberately absent:
 *
 *  - `user_id` comes from the JWT, never from the body. Accepting it would let
 *    any logged-in user create accounts under someone else's id.
 *  - `balance` is derived state. It starts at 0.00 and only ever moves through
 *    a transaction, which is what keeps the invariant
 *    "balance == sum of that account's movements" true at all times.
 *
 * With forbidNonWhitelisted enabled, sending either one returns 400 rather
 * than being quietly ignored.
 */
export class CreateAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(100, {
    message: 'name must be at most 100 characters (VARCHAR(100))',
  })
  name: string;

  @IsIn(ACCOUNT_TYPES, {
    message: `type must be one of: ${ACCOUNT_TYPES.join(', ')}`,
  })
  type: AccountType;
}
