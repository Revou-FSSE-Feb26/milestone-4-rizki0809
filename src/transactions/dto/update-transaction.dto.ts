import { PartialType } from '@nestjs/mapped-types';
import { CreateTransactionDto } from './create-transaction.dto';

/**
 * PATCH /transactions/:id.
 *
 * Any of these can change the account's balance - amount, type, or moving the
 * row to a different account_id - so TransactionsService always recomputes the
 * delta from the before/after pair rather than trusting which fields were sent.
 */
export class UpdateTransactionDto extends PartialType(CreateTransactionDto) {}
