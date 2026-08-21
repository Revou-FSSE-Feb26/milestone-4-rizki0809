import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService],
  // TransactionsModule imports this to reuse findOwned. Ownership of a
  // transaction is ownership of the account it sits on, so there is exactly
  // one implementation of that rule.
  exports: [AccountsService],
})
export class AccountsModule {}
