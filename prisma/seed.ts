/**
 * FinTrack API - Prisma seed
 * ---------------------------------------------------------------------------
 * Loads exactly the same data as db/seed.sql: 4 users (1 admin + 3 regular),
 * 9 accounts, 10 categories, 38 transactions across June-August 2026.
 *
 * Difference from the raw SQL file: the password hashes are computed here at
 * seed time from DEMO_PASSWORD rather than being pasted in as literals, so the
 * seed still works if the cost factor changes.
 *
 * Run with:  npm run prisma:seed      (or: npx prisma db seed)
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Every seeded account logs in with this password. Demo data only. */
const DEMO_PASSWORD = 'Password123!';
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

const users = [
  { id: 1, name: 'Admin FinTrack', email: 'admin@fintrack.test', role: 'admin', created_at: '2026-05-20T09:00:00Z' },
  { id: 2, name: 'Budi Santoso', email: 'budi@example.com', role: 'user', created_at: '2026-05-28T14:12:00Z' },
  { id: 3, name: 'Sari Wulandari', email: 'sari@example.com', role: 'user', created_at: '2026-06-01T08:45:00Z' },
  { id: 4, name: 'Dimas Prakoso', email: 'dimas@example.com', role: 'user', created_at: '2026-06-02T19:30:00Z' },
];

// 'Gift' (4) and 'Healthcare' (10) intentionally end up with zero transactions
// so the LEFT JOIN query in db/queries.sql has something to surface.
const categories = [
  { id: 1, name: 'Salary', type: 'income' },
  { id: 2, name: 'Freelance', type: 'income' },
  { id: 3, name: 'Investment Return', type: 'income' },
  { id: 4, name: 'Gift', type: 'income' },
  { id: 5, name: 'Groceries', type: 'expense' },
  { id: 6, name: 'Transport', type: 'expense' },
  { id: 7, name: 'Dining Out', type: 'expense' },
  { id: 8, name: 'Utilities', type: 'expense' },
  { id: 9, name: 'Entertainment', type: 'expense' },
  { id: 10, name: 'Healthcare', type: 'expense' },
];

// `balance` is left out on purpose - it is recomputed from the transactions
// below so the seed can never ship an account whose balance is a lie.
const accounts = [
  { id: 1, user_id: 1, name: 'Admin Wallet', type: 'cash', created_at: '2026-05-20T09:05:00Z' },
  { id: 2, user_id: 1, name: 'Admin Bank', type: 'bank', created_at: '2026-05-20T09:06:00Z' },
  { id: 3, user_id: 2, name: 'Dompet Tunai', type: 'cash', created_at: '2026-05-28T14:20:00Z' },
  { id: 4, user_id: 2, name: 'BCA Payroll', type: 'bank', created_at: '2026-05-28T14:22:00Z' },
  { id: 5, user_id: 2, name: 'GoPay', type: 'e-wallet', created_at: '2026-06-03T07:10:00Z' },
  { id: 6, user_id: 3, name: 'Cash Harian', type: 'cash', created_at: '2026-06-01T08:50:00Z' },
  { id: 7, user_id: 3, name: 'Mandiri Tabungan', type: 'bank', created_at: '2026-06-01T08:52:00Z' },
  { id: 8, user_id: 4, name: 'OVO', type: 'e-wallet', created_at: '2026-06-02T19:40:00Z' },
  { id: 9, user_id: 4, name: 'BNI Utama', type: 'bank', created_at: '2026-06-02T19:42:00Z' },
];

type SeedTransaction = {
  account_id: number;
  category_id: number | null;
  type: 'income' | 'expense' | 'transfer';
  amount: string;
  description: string;
  transaction_date: string;
};

// amount is ALWAYS positive; direction lives in `type`.
// 'transfer' rows carry no category (CHECK transactions_category_required_check).
const transactions: SeedTransaction[] = [
  // Admin Wallet (cash)
  { account_id: 1, category_id: 1, type: 'income', amount: '1000000.00', description: 'Cash allowance', transaction_date: '2026-06-01' },
  { account_id: 1, category_id: 5, type: 'expense', amount: '185000.00', description: 'Weekly groceries', transaction_date: '2026-06-03' },
  { account_id: 1, category_id: 6, type: 'expense', amount: '45000.00', description: 'Bus card top up', transaction_date: '2026-07-02' },
  // Admin Bank
  { account_id: 2, category_id: 1, type: 'income', amount: '15000000.00', description: 'June payroll', transaction_date: '2026-06-25' },
  { account_id: 2, category_id: 8, type: 'expense', amount: '850000.00', description: 'Electricity and water', transaction_date: '2026-07-10' },
  { account_id: 2, category_id: 1, type: 'income', amount: '15000000.00', description: 'July payroll', transaction_date: '2026-07-25' },
  { account_id: 2, category_id: 9, type: 'expense', amount: '199000.00', description: 'Streaming annual plan', transaction_date: '2026-08-05' },
  // Budi / Dompet Tunai (cash)
  { account_id: 3, category_id: 2, type: 'income', amount: '750000.00', description: 'Cash payment from client', transaction_date: '2026-06-02' },
  { account_id: 3, category_id: 7, type: 'expense', amount: '65000.00', description: 'Lunch with team', transaction_date: '2026-06-11' },
  { account_id: 3, category_id: 5, type: 'expense', amount: '120500.00', description: 'Pasar mingguan', transaction_date: '2026-06-21' },
  { account_id: 3, category_id: 6, type: 'expense', amount: '30000.00', description: 'Ojek to office', transaction_date: '2026-07-04' },
  { account_id: 3, category_id: 7, type: 'expense', amount: '88000.00', description: 'Dinner with family', transaction_date: '2026-08-09' },
  // Budi / BCA Payroll (bank)
  { account_id: 4, category_id: 1, type: 'income', amount: '9500000.00', description: 'June salary', transaction_date: '2026-06-25' },
  { account_id: 4, category_id: 8, type: 'expense', amount: '1250000.00', description: 'Rent and electricity', transaction_date: '2026-06-28' },
  { account_id: 4, category_id: 3, type: 'income', amount: '320000.00', description: 'Mutual fund dividend', transaction_date: '2026-07-15' },
  { account_id: 4, category_id: 1, type: 'income', amount: '9500000.00', description: 'July salary', transaction_date: '2026-07-25' },
  { account_id: 4, category_id: 8, type: 'expense', amount: '1250000.00', description: 'Rent and electricity', transaction_date: '2026-07-28' },
  { account_id: 4, category_id: 5, type: 'expense', amount: '640000.00', description: 'Monthly stock up', transaction_date: '2026-08-01' },
  { account_id: 4, category_id: null, type: 'transfer', amount: '2000000.00', description: 'Move to GoPay', transaction_date: '2026-08-12' },
  // Budi / GoPay (e-wallet)
  { account_id: 5, category_id: 6, type: 'expense', amount: '25000.00', description: 'GoRide to client meeting', transaction_date: '2026-07-06' },
  { account_id: 5, category_id: 7, type: 'expense', amount: '47500.00', description: 'GoFood lunch', transaction_date: '2026-07-19' },
  { account_id: 5, category_id: null, type: 'transfer', amount: '2000000.00', description: 'Received from BCA Payroll', transaction_date: '2026-08-12' },
  { account_id: 5, category_id: 2, type: 'income', amount: '1500000.00', description: 'Design gig', transaction_date: '2026-08-14' },
  // Sari / Cash Harian (cash)
  { account_id: 6, category_id: 2, type: 'income', amount: '2000000.00', description: 'Tutoring income', transaction_date: '2026-06-05' },
  { account_id: 6, category_id: 5, type: 'expense', amount: '210000.00', description: 'Groceries', transaction_date: '2026-06-15' },
  { account_id: 6, category_id: 9, type: 'expense', amount: '150000.00', description: 'Cinema with family', transaction_date: '2026-07-08' },
  // Sari / Mandiri Tabungan (bank)
  { account_id: 7, category_id: 1, type: 'income', amount: '11000000.00', description: 'June payroll', transaction_date: '2026-06-27' },
  { account_id: 7, category_id: 8, type: 'expense', amount: '975000.00', description: 'Kos and internet', transaction_date: '2026-07-03' },
  { account_id: 7, category_id: 1, type: 'income', amount: '11250000.00', description: 'July payroll incl. adjustment', transaction_date: '2026-07-27' },
  { account_id: 7, category_id: 8, type: 'expense', amount: '975000.00', description: 'Kos and internet', transaction_date: '2026-08-03' },
  { account_id: 7, category_id: 3, type: 'income', amount: '480000.00', description: 'Bond coupon', transaction_date: '2026-08-16' },
  // Dimas / OVO (e-wallet)
  { account_id: 8, category_id: 6, type: 'expense', amount: '18000.00', description: 'Grab to station', transaction_date: '2026-06-09' },
  { account_id: 8, category_id: 7, type: 'expense', amount: '55000.00', description: 'Coffee shop', transaction_date: '2026-07-12' },
  { account_id: 8, category_id: 2, type: 'income', amount: '3200000.00', description: 'Freelance invoice #12', transaction_date: '2026-08-07' },
  // Dimas / BNI Utama (bank)
  { account_id: 9, category_id: 1, type: 'income', amount: '8750000.00', description: 'June salary', transaction_date: '2026-06-26' },
  { account_id: 9, category_id: 9, type: 'expense', amount: '350000.00', description: 'Concert ticket', transaction_date: '2026-07-01' },
  { account_id: 9, category_id: 1, type: 'income', amount: '8750000.00', description: 'July salary', transaction_date: '2026-07-26' },
  { account_id: 9, category_id: 5, type: 'expense', amount: '725000.00', description: 'Supermarket', transaction_date: '2026-08-18' },
];

/**
 * The same rule the API's BalanceCalculatorService applies: income adds,
 * expense subtracts, transfer is balance-neutral on its own account.
 */
function balanceFor(accountId: number): Prisma.Decimal {
  return transactions
    .filter((t) => t.account_id === accountId)
    .reduce((total, t) => {
      if (t.type === 'income') return total.plus(t.amount);
      if (t.type === 'expense') return total.minus(t.amount);
      return total;
    }, new Prisma.Decimal(0));
}

async function main() {
  console.log('Seeding FinTrack...');

  // Wipe in reverse dependency order and reset every SERIAL sequence, so the
  // seed is idempotent and the ids below are always the ids you get.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE transactions, accounts, categories, users RESTART IDENTITY CASCADE',
  );

  const password = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
  await prisma.user.createMany({
    data: users.map((u) => ({ ...u, password, created_at: new Date(u.created_at) })),
  });
  console.log(`  users        ${users.length}`);

  await prisma.category.createMany({ data: categories });
  console.log(`  categories   ${categories.length}`);

  await prisma.account.createMany({
    data: accounts.map((a) => ({
      ...a,
      created_at: new Date(a.created_at),
      balance: balanceFor(a.id),
    })),
  });
  console.log(`  accounts     ${accounts.length}`);

  await prisma.transaction.createMany({
    data: transactions.map((t) => ({
      ...t,
      amount: new Prisma.Decimal(t.amount),
      transaction_date: new Date(`${t.transaction_date}T00:00:00Z`),
    })),
  });
  console.log(`  transactions ${transactions.length}`);

  // createMany with explicit ids leaves each sequence at 1, so the first insert
  // from the running API would collide. Fast-forward them.
  for (const table of ['users', 'categories', 'accounts', 'transactions']) {
    await prisma.$executeRawUnsafe(
      `SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 1))`,
    );
  }

  // Reconciliation: stored balance must equal the sum of the movements.
  const drift = await prisma.$queryRaw<Array<{ id: number; name: string; drift: Prisma.Decimal }>>`
    SELECT a.id, a.name,
           a.balance - COALESCE(SUM(CASE t.type WHEN 'income'  THEN  t.amount
                                                WHEN 'expense' THEN -t.amount
                                                ELSE 0 END), 0) AS drift
    FROM accounts a
    LEFT JOIN transactions t ON t.account_id = a.id
    GROUP BY a.id, a.name, a.balance
    HAVING a.balance <> COALESCE(SUM(CASE t.type WHEN 'income'  THEN  t.amount
                                                 WHEN 'expense' THEN -t.amount
                                                 ELSE 0 END), 0)`;

  if (drift.length > 0) {
    console.error('Balance reconciliation FAILED for:', drift);
    throw new Error('Seeded balances do not match the transaction history');
  }

  console.log('Balances reconcile. Demo login: budi@example.com / Password123!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
