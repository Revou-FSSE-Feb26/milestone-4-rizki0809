import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionType } from '../common/constants';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import type {
  BalanceCalculator,
  Movement,
} from '../common/providers/balance-calculator.service';
import { BALANCE_CALCULATOR } from '../common/providers/tokens';
import { fromIsoDate, toId, toIsoDate, toMoney } from '../common/serialization';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

/** Relations every transaction response carries. */
const transactionInclude = {
  category: { select: { id: true, name: true, type: true } },
  account: { select: { id: true, name: true, type: true, user_id: true } },
} satisfies Prisma.TransactionInclude;

type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: typeof transactionInclude;
}>;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    @Inject(BALANCE_CALCULATOR) private readonly balance: BalanceCalculator,
  ) {}

  /**
   * Writing the row and moving the balance are one database transaction. If the
   * balance update fails, the transaction row rolls back with it - the balance
   * can never end up describing a history that is not there.
   *
   * The balance is moved with `increment` rather than by reading the current
   * value and writing back a new one, so two concurrent requests against the
   * same account cannot lose one another's update.
   */
  async create(dto: CreateTransactionDto, actor: AuthenticatedUser) {
    await this.accounts.findOwned(dto.account_id, actor);
    await this.assertCategoryMatchesType(dto.type, dto.category_id ?? null);

    const delta = this.balance.deltaForCreate({
      type: dto.type,
      amount: dto.amount,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          account_id: dto.account_id,
          category_id: dto.category_id ?? null,
          type: dto.type,
          amount: new Prisma.Decimal(dto.amount),
          description: dto.description ?? null,
          transaction_date: fromIsoDate(dto.transaction_date),
        },
        include: transactionInclude,
      });

      if (!delta.isZero()) {
        await tx.account.update({
          where: { id: dto.account_id },
          data: { balance: { increment: delta } },
        });
      }

      return transaction;
    });

    return this.serialize(created);
  }

  /**
   * A user only ever sees transactions on accounts they own - the ownership
   * check for the list endpoint is the `account: { user_id }` filter, applied
   * in the query rather than after the fact, so there is no window in which
   * someone else's rows are loaded at all.
   */
  async findAll(query: QueryTransactionsDto, actor: AuthenticatedUser) {
    if (query.account_id !== undefined) {
      // Explicit 403 rather than an empty list, so probing another user's
      // account id is answered honestly instead of looking like "no data".
      await this.accounts.findOwned(query.account_id, actor);
    }

    const where: Prisma.TransactionWhereInput = {
      ...(actor.role !== Role.ADMIN && { account: { user_id: actor.id } }),
      ...(query.account_id !== undefined && { account_id: query.account_id }),
      ...(query.category_id !== undefined && {
        category_id: query.category_id,
      }),
      ...(query.type !== undefined && { type: query.type }),
      ...((query.from || query.to) && {
        transaction_date: {
          ...(query.from && { gte: fromIsoDate(query.from) }),
          ...(query.to && { lte: fromIsoDate(query.to) }),
        },
      }),
    };

    const transactions = await this.prisma.transaction.findMany({
      where,
      include: transactionInclude,
      orderBy: [{ transaction_date: 'desc' }, { id: 'desc' }],
    });

    return transactions.map((transaction) => this.serialize(transaction));
  }

  async findOne(id: number, actor: AuthenticatedUser) {
    return this.serialize(await this.findOwned(id, actor));
  }

  /**
   * An edit can change the amount, flip income to expense, or move the row to a
   * different account - so the balance is never patched from the fields that
   * happened to be sent. The before and after states are both handed to the
   * BalanceCalculator, which works out the net movement.
   */
  async update(
    id: number,
    dto: UpdateTransactionDto,
    actor: AuthenticatedUser,
  ) {
    const existing = await this.findOwned(id, actor);

    // undefined means "not sent"; null means "explicitly cleared".
    const after = {
      account_id: dto.account_id ?? existing.account_id,
      category_id:
        dto.category_id === undefined ? existing.category_id : dto.category_id,
      type: (dto.type ?? existing.type) as TransactionType,
      amount:
        dto.amount === undefined
          ? existing.amount
          : new Prisma.Decimal(dto.amount),
      description:
        dto.description === undefined ? existing.description : dto.description,
      transaction_date:
        dto.transaction_date === undefined
          ? existing.transaction_date
          : fromIsoDate(dto.transaction_date),
    };

    if (after.account_id !== existing.account_id) {
      await this.accounts.findOwned(after.account_id, actor);
    }

    await this.assertCategoryMatchesType(after.type, after.category_id);

    const before: Movement = { type: existing.type, amount: existing.amount };
    const movedAccount = after.account_id !== existing.account_id;

    const updated = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.update({
        where: { id: BigInt(id) },
        data: after,
        include: transactionInclude,
      });

      if (movedAccount) {
        // Back the old effect out of the old account, apply the new effect to
        // the new one. Two accounts change, still inside one transaction.
        await this.applyDelta(
          tx,
          existing.account_id,
          this.balance.deltaForDelete(before),
        );
        await this.applyDelta(
          tx,
          after.account_id,
          this.balance.deltaForCreate(after),
        );
      } else {
        await this.applyDelta(
          tx,
          existing.account_id,
          this.balance.deltaForUpdate(before, after),
        );
      }

      return transaction;
    });

    return this.serialize(updated);
  }

  /** Deleting a transaction reverses whatever it did to the balance. */
  async remove(id: number, actor: AuthenticatedUser) {
    const existing = await this.findOwned(id, actor);
    const delta = this.balance.deltaForDelete(existing);

    const deleted = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.delete({
        where: { id: BigInt(id) },
        include: transactionInclude,
      });

      await this.applyDelta(tx, existing.account_id, delta);
      return transaction;
    });

    return this.serialize(deleted);
  }

  /**
   * Loads a transaction and proves the caller owns the account it sits on.
   * Transactions have no user_id of their own - ownership is inherited through
   * accounts.user_id, which is exactly the join the SQL queries make.
   */
  private async findOwned(
    id: number,
    actor: AuthenticatedUser,
  ): Promise<TransactionWithRelations> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: BigInt(id) },
      include: transactionInclude,
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }

    // Reuses the account rules rather than re-implementing them, so the two
    // resources can never disagree about who owns what.
    await this.accounts.findOwned(transaction.account_id, actor);

    return transaction;
  }

  private applyDelta(
    tx: Prisma.TransactionClient,
    accountId: number,
    delta: Prisma.Decimal,
  ) {
    if (delta.isZero()) {
      return Promise.resolve(null);
    }

    return tx.account.update({
      where: { id: accountId },
      data: { balance: { increment: delta } },
    });
  }

  /**
   * The domain rule the CHECK constraints cannot fully express:
   *
   *  - a transfer is not income or expense, so it carries no category;
   *  - income and expense must be categorised;
   *  - and the category's own type has to agree - tagging an expense with an
   *    income category would silently corrupt every spending report.
   */
  private async assertCategoryMatchesType(
    type: string,
    categoryId: number | null,
  ): Promise<void> {
    if (type === 'transfer') {
      if (categoryId !== null) {
        throw new BadRequestException(
          'A transfer moves money between your own accounts and is neither income nor expense, so it must not have a category_id. Send "category_id": null to clear it.',
        );
      }
      return;
    }

    if (categoryId === null) {
      throw new BadRequestException(
        `category_id is required for a ${type} transaction`,
      );
    }

    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException(`Category with id ${categoryId} not found`);
    }

    if (category.type !== type) {
      throw new BadRequestException(
        `Category "${category.name}" is an ${category.type} category and cannot be used on a ${type} transaction`,
      );
    }
  }

  /** BigInt id and Decimal amount are not JSON-safe; DATE must not grow a time. */
  private serialize(transaction: TransactionWithRelations) {
    return {
      id: toId(transaction.id),
      account_id: transaction.account_id,
      category_id: transaction.category_id,
      type: transaction.type,
      amount: toMoney(transaction.amount),
      description: transaction.description,
      transaction_date: toIsoDate(transaction.transaction_date),
      created_at: transaction.created_at,
      category: transaction.category,
      account: transaction.account,
    };
  }
}
