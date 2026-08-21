import { Prisma } from '@prisma/client';
import { BalanceCalculatorService } from './balance-calculator.service';

/**
 * These tests are the payoff for factoring the balance rule out behind the
 * BALANCE_CALCULATOR provider: no Test.createTestingModule, no PrismaService,
 * no database, no HTTP. Just `new`.
 */
describe('BalanceCalculatorService', () => {
  const calculator = new BalanceCalculatorService(2);
  const money = (value: string | number) => new Prisma.Decimal(value);

  describe('effectOf', () => {
    it('adds income', () => {
      expect(
        calculator.effectOf({ type: 'income', amount: 1500 }).toString(),
      ).toBe('1500');
    });

    it('subtracts expense', () => {
      expect(
        calculator.effectOf({ type: 'expense', amount: 1500 }).toString(),
      ).toBe('-1500');
    });

    it('treats a transfer as balance-neutral', () => {
      expect(
        calculator.effectOf({ type: 'transfer', amount: 2_000_000 }).isZero(),
      ).toBe(true);
    });

    it('rejects a type the schema does not allow', () => {
      expect(() => calculator.effectOf({ type: 'refund', amount: 1 })).toThrow(
        'Unknown transaction type "refund"',
      );
    });
  });

  describe('deltaForCreate / deltaForDelete', () => {
    it('deleting reverses exactly what creating applied', () => {
      const movement = { type: 'expense', amount: money('120500.55') };

      const net = calculator
        .deltaForCreate(movement)
        .plus(calculator.deltaForDelete(movement));

      expect(net.isZero()).toBe(true);
    });
  });

  describe('deltaForUpdate', () => {
    it('moves by the difference when only the amount changes', () => {
      const delta = calculator.deltaForUpdate(
        { type: 'expense', amount: 100 },
        { type: 'expense', amount: 250 },
      );

      // Spending 150 more takes the balance 150 lower.
      expect(delta.toString()).toBe('-150');
    });

    it('moves by twice the amount when expense flips to income', () => {
      const delta = calculator.deltaForUpdate(
        { type: 'expense', amount: 50_000 },
        { type: 'income', amount: 50_000 },
      );

      expect(delta.toString()).toBe('100000');
    });

    it('is zero when nothing that affects the balance changed', () => {
      const before = { type: 'income', amount: money('9500000.00') };
      const after = { type: 'income', amount: money('9500000.00') };

      expect(calculator.deltaForUpdate(before, after).isZero()).toBe(true);
    });
  });

  describe('sum', () => {
    it('rebuilds the seeded balance of Budi/BCA Payroll (account 4)', () => {
      // Exactly the rows db/seed.sql writes for account_id = 4.
      const movements = [
        { type: 'income', amount: '9500000.00' },
        { type: 'expense', amount: '1250000.00' },
        { type: 'income', amount: '320000.00' },
        { type: 'income', amount: '9500000.00' },
        { type: 'expense', amount: '1250000.00' },
        { type: 'expense', amount: '640000.00' },
        { type: 'transfer', amount: '2000000.00' },
      ];

      expect(calculator.sum(movements).toString()).toBe('16180000');
    });

    it('is 0.00 for an account with no transactions', () => {
      expect(calculator.sum([]).toString()).toBe('0');
    });

    it('does not accumulate floating point error over many small amounts', () => {
      // 0.1 + 0.2 !== 0.3 in binary floating point. Decimal is why money is
      // NUMERIC(12,2) in the schema rather than FLOAT.
      const movements = Array.from({ length: 3 }, () => ({
        type: 'income',
        amount: '0.10',
      }));

      expect(calculator.sum(movements).toString()).toBe('0.3');
    });
  });

  describe('scale', () => {
    it('rounds to the configured number of decimal places', () => {
      const wholeRupiah = new BalanceCalculatorService(0);

      expect(
        wholeRupiah.effectOf({ type: 'income', amount: '10.49' }).toString(),
      ).toBe('10');
    });
  });
});
