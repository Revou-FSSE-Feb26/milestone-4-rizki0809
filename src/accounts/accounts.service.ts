import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Account } from '@prisma/client';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { isPrismaError, PrismaErrorCode } from '../common/prisma-errors';
import type { BalanceCalculator } from '../common/providers/balance-calculator.service';
import { BALANCE_CALCULATOR } from '../common/providers/tokens';
import { toId, toIsoDate, toMoney } from '../common/serialization';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BALANCE_CALCULATOR) private readonly balance: BalanceCalculator,
  ) {}

  /**
   * The owner is taken from the JWT, never from the request body, so there is
   * no field a client could set to create an account under another user.
   */
  async create(dto: CreateAccountDto, actor: AuthenticatedUser) {
    try {
      const account = await this.prisma.account.create({
        data: { user_id: actor.id, name: dto.name, type: dto.type },
      });
      return this.serialize(account);
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        throw new ConflictException(
          `You already have an account named "${dto.name}"`,
        );
      }
      throw error;
    }
  }

  /** A user sees only their own accounts; an admin sees every account. */
  async findAll(actor: AuthenticatedUser) {
    const accounts = await this.prisma.account.findMany({
      where: actor.role === Role.ADMIN ? {} : { user_id: actor.id },
      orderBy: { id: 'asc' },
    });
    return accounts.map((account) => this.serialize(account));
  }

  async findOne(id: number, actor: AuthenticatedUser) {
    return this.serialize(await this.findOwned(id, actor));
  }

  /**
   * GET /accounts/:id/transactions - the relational read required by Part 3.
   *
   * `include` pulls each transaction's category in the same query, so the
   * response is ready to render without the client making one follow-up call
   * per row.
   */
  async findTransactions(id: number, actor: AuthenticatedUser) {
    await this.findOwned(id, actor);

    // Destructured rather than spread wholesale: `_count` is Prisma's internal
    // shape and has no business appearing in the response.
    const { transactions, _count, ...account } =
      await this.prisma.account.findUniqueOrThrow({
        where: { id },
        include: {
          transactions: {
            include: {
              category: { select: { id: true, name: true, type: true } },
            },
            orderBy: [{ transaction_date: 'desc' }, { id: 'desc' }],
          },
          _count: { select: { transactions: true } },
        },
      });

    return {
      ...this.serialize(account),
      transaction_count: _count.transactions,
      transactions: transactions.map((transaction) => ({
        id: toId(transaction.id),
        account_id: transaction.account_id,
        category_id: transaction.category_id,
        type: transaction.type,
        amount: toMoney(transaction.amount),
        description: transaction.description,
        transaction_date: toIsoDate(transaction.transaction_date),
        created_at: transaction.created_at,
        category: transaction.category,
      })),
    };
  }

  async update(id: number, dto: UpdateAccountDto, actor: AuthenticatedUser) {
    await this.findOwned(id, actor);

    try {
      const account = await this.prisma.account.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.type !== undefined && { type: dto.type }),
        },
      });
      return this.serialize(account);
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        throw new ConflictException(
          `You already have an account named "${dto.name}"`,
        );
      }
      throw error;
    }
  }

  /**
   * Deleting an account also deletes its transactions - the ON DELETE CASCADE
   * on transactions_account_id_fkey. No balance work is needed: the balance
   * disappears with the row that carried it.
   */
  async remove(id: number, actor: AuthenticatedUser) {
    await this.findOwned(id, actor);
    return this.serialize(await this.prisma.account.delete({ where: { id } }));
  }

  /**
   * POST /accounts/:id/recalculate-balance (admin only).
   *
   * Rebuilds the running balance from the transaction history and reports the
   * drift it corrected. This is the repair tool for the one thing that can go
   * wrong with a cached aggregate - a row written outside the API, say by the
   * SQL seed - and it reuses exactly the same BalanceCalculatorService the
   * write paths use, so the two can never disagree about the rule.
   */
  async recalculateBalance(id: number) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: { transactions: { select: { type: true, amount: true } } },
    });

    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }

    const recalculated = this.balance.sum(account.transactions);

    const updated = await this.prisma.account.update({
      where: { id },
      data: { balance: recalculated },
    });

    return {
      account_id: id,
      previous_balance: toMoney(account.balance),
      recalculated_balance: toMoney(updated.balance),
      drift_corrected: toMoney(recalculated.minus(account.balance)),
      transaction_count: account.transactions.length,
    };
  }

  /**
   * Loads an account and proves the caller is allowed to touch it.
   *
   * Every :id route in this service goes through here - that is the ownership
   * enforcement the assignment asks for, and keeping it in one method is what
   * stops a new endpoint from quietly forgetting it. Admins bypass the owner
   * check but not the existence check.
   */
  async findOwned(id: number, actor: AuthenticatedUser): Promise<Account> {
    const account = await this.prisma.account.findUnique({ where: { id } });

    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }

    if (actor.role !== Role.ADMIN && account.user_id !== actor.id) {
      throw new ForbiddenException('You do not have access to this account');
    }

    return account;
  }

  /** NUMERIC(12,2) arrives as a Decimal object; clients want a number. */
  private serialize(account: Account) {
    return { ...account, balance: toMoney(account.balance) };
  }
}
