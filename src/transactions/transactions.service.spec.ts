import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountsService } from '../accounts/accounts.service';
import { Role } from '../common/enums/role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { BalanceCalculatorService } from '../common/providers/balance-calculator.service';
import { TransactionsService } from './transactions.service';

/**
 * Covers the part of the balance logic the pure calculator tests cannot: that
 * TransactionsService issues the right UPDATE against the right account, inside
 * one database transaction, for every write path.
 *
 * Prisma is mocked; the real BalanceCalculatorService is used, because the
 * point is whether the two are wired together correctly.
 */
describe('TransactionsService (balance side effects)', () => {
  const budi: AuthenticatedUser = {
    id: 2,
    email: 'budi@example.com',
    role: Role.USER,
  };

  const groceries = { id: 5, name: 'Groceries', type: 'expense' };
  const salary = { id: 1, name: 'Salary', type: 'income' };

  const existingExpense = {
    id: 14n,
    account_id: 4,
    category_id: 5,
    type: 'expense',
    amount: new Prisma.Decimal('1250000.00'),
    description: 'Rent and electricity',
    transaction_date: new Date('2026-06-28T00:00:00.000Z'),
    created_at: new Date('2026-06-28T10:00:00.000Z'),
    category: groceries,
    account: { id: 4, name: 'BCA Payroll', type: 'bank', user_id: 2 },
  };

  let prisma: any;
  let accounts: jest.Mocked<Pick<AccountsService, 'findOwned'>>;
  let service: TransactionsService;

  /** The `data` of every account.update issued during the last call. */
  const balanceUpdates = () =>
    prisma.account.update.mock.calls.map(([args]: [any]) => ({
      account_id: args.where.id,
      increment: args.data.balance.increment.toString(),
    }));

  beforeEach(() => {
    prisma = {
      category: { findUnique: jest.fn() },
      account: { update: jest.fn().mockResolvedValue({}) },
      transaction: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
      },
      // Run the callback against the same mock, the way an interactive
      // transaction runs it against a scoped client.
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    accounts = {
      findOwned: jest.fn().mockResolvedValue({ id: 4, user_id: 2 }),
    };

    service = new TransactionsService(
      prisma,
      accounts as unknown as AccountsService,
      new BalanceCalculatorService(2),
    );
  });

  describe('create', () => {
    it('subtracts an expense from the owning account, in one transaction', async () => {
      prisma.category.findUnique.mockResolvedValue(groceries);
      prisma.transaction.create.mockResolvedValue({
        ...existingExpense,
        id: 99n,
      });

      await service.create(
        {
          account_id: 4,
          category_id: 5,
          type: 'expense',
          amount: 640000,
          transaction_date: '2026-08-01',
        },
        budi,
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(balanceUpdates()).toEqual([
        { account_id: 4, increment: '-640000' },
      ]);
    });

    it('adds an income to the owning account', async () => {
      prisma.category.findUnique.mockResolvedValue(salary);
      prisma.transaction.create.mockResolvedValue({
        ...existingExpense,
        id: 99n,
      });

      await service.create(
        {
          account_id: 4,
          category_id: 1,
          type: 'income',
          amount: 9500000,
          transaction_date: '2026-07-25',
        },
        budi,
      );

      expect(balanceUpdates()).toEqual([
        { account_id: 4, increment: '9500000' },
      ]);
    });

    it('leaves the balance untouched for a transfer', async () => {
      prisma.transaction.create.mockResolvedValue({
        ...existingExpense,
        id: 99n,
      });

      await service.create(
        {
          account_id: 4,
          type: 'transfer',
          amount: 2000000,
          transaction_date: '2026-08-12',
        },
        budi,
      );

      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('checks account ownership before writing anything', async () => {
      accounts.findOwned.mockRejectedValueOnce(new NotFoundException());

      await expect(
        service.create(
          {
            account_id: 999,
            category_id: 5,
            type: 'expense',
            amount: 1,
            transaction_date: '2026-08-01',
          },
          budi,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('rejects an income category on an expense transaction', async () => {
      prisma.category.findUnique.mockResolvedValue(salary);

      await expect(
        service.create(
          {
            account_id: 4,
            category_id: 1,
            type: 'expense',
            amount: 1000,
            transaction_date: '2026-08-01',
          },
          budi,
        ),
      ).rejects.toThrow(
        /is an income category and cannot be used on a expense transaction/,
      );

      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('rejects a transfer that carries a category', async () => {
      await expect(
        service.create(
          {
            account_id: 4,
            category_id: 5,
            type: 'transfer',
            amount: 1000,
            transaction_date: '2026-08-01',
          },
          budi,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an expense with no category', async () => {
      await expect(
        service.create(
          {
            account_id: 4,
            type: 'expense',
            amount: 1000,
            transaction_date: '2026-08-01',
          },
          budi,
        ),
      ).rejects.toThrow('category_id is required for a expense transaction');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.transaction.findUnique.mockResolvedValue(existingExpense);
      prisma.transaction.update.mockResolvedValue(existingExpense);
      prisma.category.findUnique.mockResolvedValue(groceries);
    });

    it('moves the balance by the difference when the amount changes', async () => {
      // 1,250,000 expense -> 1,000,000 expense: 250,000 comes back.
      await service.update(14, { amount: 1000000 }, budi);

      expect(balanceUpdates()).toEqual([
        { account_id: 4, increment: '250000' },
      ]);
    });

    it('moves by twice the amount when an expense becomes income', async () => {
      prisma.category.findUnique.mockResolvedValue(salary);

      await service.update(14, { type: 'income', category_id: 1 }, budi);

      expect(balanceUpdates()).toEqual([
        { account_id: 4, increment: '2500000' },
      ]);
    });

    it('does not touch the balance when only the description changes', async () => {
      await service.update(
        14,
        { description: 'Rent, electricity and water' },
        budi,
      );

      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('debits the old account and credits the new one when moved', async () => {
      accounts.findOwned.mockResolvedValue({ id: 5, user_id: 2 } as never);

      await service.update(14, { account_id: 5 }, budi);

      expect(balanceUpdates()).toEqual([
        { account_id: 4, increment: '1250000' }, // old account gets the expense back
        { account_id: 5, increment: '-1250000' }, // new account takes it on
      ]);
    });

    it('verifies ownership of the destination account before moving', async () => {
      accounts.findOwned
        .mockResolvedValueOnce({ id: 4, user_id: 2 } as never) // the existing row
        .mockRejectedValueOnce(new NotFoundException()); // the destination

      await expect(
        service.update(14, { account_id: 77 }, budi),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('gives the expense back to the account', async () => {
      prisma.transaction.findUnique.mockResolvedValue(existingExpense);
      prisma.transaction.delete.mockResolvedValue(existingExpense);

      await service.remove(14, budi);

      expect(balanceUpdates()).toEqual([
        { account_id: 4, increment: '1250000' },
      ]);
    });

    it('404s for a transaction that does not exist', async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);

      await expect(service.remove(4242, budi)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('response shape', () => {
    it('returns JSON-safe types: number id, number amount, plain date', async () => {
      prisma.transaction.findUnique.mockResolvedValue(existingExpense);

      const result = await service.findOne(14, budi);

      expect(result.id).toBe(14);
      expect(result.amount).toBe(1250000);
      expect(result.transaction_date).toBe('2026-06-28');
    });
  });
});
