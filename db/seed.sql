-- ============================================================================
-- FinTrack API - Seed data
-- ----------------------------------------------------------------------------
-- 4 users (1 admin + 3 regular), 9 accounts, 10 categories, 38 transactions
-- spread across June-August 2026.
--
-- Every password below is the bcrypt hash of the demo password "Password123!"
-- (cost factor 10). The plaintext is never stored anywhere.
--
-- Run AFTER db/schema.sql:  psql -U <user> -d fintrack -f db/seed.sql
-- ============================================================================

TRUNCATE TABLE transactions, accounts, categories, users RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------- users -----
INSERT INTO users (id, name, email, password, role, created_at) VALUES
  (1, 'Admin FinTrack', 'admin@fintrack.test', '$2b$10$NDAmQPwliH0rVc0UF1HsXumU2TzMmGknHfE.vHsd03Vomyuei0m0y', 'admin', '2026-05-20 09:00:00'),
  (2, 'Budi Santoso',   'budi@example.com',    '$2b$10$JY9g8kz1pB2ShYot85mWVeRubA7u7o/85ypGsq9BDGvibdi23OxwK', 'user',  '2026-05-28 14:12:00'),
  (3, 'Sari Wulandari', 'sari@example.com',    '$2b$10$AvUoJrmRbtGyLD7do3Fp5.U4AgnpumAWkny4neeINucBwsYZ42l5i', 'user',  '2026-06-01 08:45:00'),
  (4, 'Dimas Prakoso',  'dimas@example.com',   '$2b$10$.HiFpcTJ6kCUeRmQ4vqmju0jTR2J9P3aCnWgNEOiA3n.IlS4ed/Ym', 'user',  '2026-06-02 19:30:00');

-- ----------------------------------------------------------- categories -----
-- 'Gift' and 'Healthcare' are deliberately left without transactions so the
-- LEFT JOIN query in db/queries.sql has something to surface.
INSERT INTO categories (id, name, type) VALUES
  (1,  'Salary',            'income'),
  (2,  'Freelance',         'income'),
  (3,  'Investment Return', 'income'),
  (4,  'Gift',              'income'),
  (5,  'Groceries',         'expense'),
  (6,  'Transport',         'expense'),
  (7,  'Dining Out',        'expense'),
  (8,  'Utilities',         'expense'),
  (9,  'Entertainment',     'expense'),
  (10, 'Healthcare',        'expense');

-- ------------------------------------------------------------- accounts -----
-- `balance` is the running balance the API maintains. It equals
-- SUM(income) - SUM(expense) over that account's transactions below; the
-- reconciliation query at the bottom of this file proves it.
INSERT INTO accounts (id, user_id, name, type, balance, created_at) VALUES
  (1, 1, 'Admin Wallet',     'cash',     770000.00,    '2026-05-20 09:05:00'),
  (2, 1, 'Admin Bank',       'bank',     28951000.00,  '2026-05-20 09:06:00'),
  (3, 2, 'Dompet Tunai',     'cash',     446500.00,    '2026-05-28 14:20:00'),
  (4, 2, 'BCA Payroll',      'bank',     16180000.00,  '2026-05-28 14:22:00'),
  (5, 2, 'GoPay',            'e-wallet', 1427500.00,   '2026-06-03 07:10:00'),
  (6, 3, 'Cash Harian',      'cash',     1640000.00,   '2026-06-01 08:50:00'),
  (7, 3, 'Mandiri Tabungan', 'bank',     20780000.00,  '2026-06-01 08:52:00'),
  (8, 4, 'OVO',              'e-wallet', 3127000.00,   '2026-06-02 19:40:00'),
  (9, 4, 'BNI Utama',        'bank',     16425000.00,  '2026-06-02 19:42:00');

-- --------------------------------------------------------- transactions -----
-- amount is ALWAYS positive; direction lives in `type`.
-- 'transfer' rows carry no category (see the CHECK constraint in schema.sql).
INSERT INTO transactions (account_id, category_id, type, amount, description, transaction_date) VALUES
  -- Admin Wallet (cash)
  (1, 1,    'income',   1000000.00,  'Cash allowance',                '2026-06-01'),
  (1, 5,    'expense',  185000.00,   'Weekly groceries',              '2026-06-03'),
  (1, 6,    'expense',  45000.00,    'Bus card top up',               '2026-07-02'),
  -- Admin Bank
  (2, 1,    'income',   15000000.00, 'June payroll',                  '2026-06-25'),
  (2, 8,    'expense',  850000.00,   'Electricity and water',         '2026-07-10'),
  (2, 1,    'income',   15000000.00, 'July payroll',                  '2026-07-25'),
  (2, 9,    'expense',  199000.00,   'Streaming annual plan',         '2026-08-05'),
  -- Budi / Dompet Tunai (cash)
  (3, 2,    'income',   750000.00,   'Cash payment from client',      '2026-06-02'),
  (3, 7,    'expense',  65000.00,    'Lunch with team',               '2026-06-11'),
  (3, 5,    'expense',  120500.00,   'Pasar mingguan',                '2026-06-21'),
  (3, 6,    'expense',  30000.00,    'Ojek to office',                '2026-07-04'),
  (3, 7,    'expense',  88000.00,    'Dinner with family',            '2026-08-09'),
  -- Budi / BCA Payroll (bank)
  (4, 1,    'income',   9500000.00,  'June salary',                   '2026-06-25'),
  (4, 8,    'expense',  1250000.00,  'Rent and electricity',          '2026-06-28'),
  (4, 3,    'income',   320000.00,   'Mutual fund dividend',          '2026-07-15'),
  (4, 1,    'income',   9500000.00,  'July salary',                   '2026-07-25'),
  (4, 8,    'expense',  1250000.00,  'Rent and electricity',          '2026-07-28'),
  (4, 5,    'expense',  640000.00,   'Monthly stock up',              '2026-08-01'),
  (4, NULL, 'transfer', 2000000.00,  'Move to GoPay',                 '2026-08-12'),
  -- Budi / GoPay (e-wallet)
  (5, 6,    'expense',  25000.00,    'GoRide to client meeting',      '2026-07-06'),
  (5, 7,    'expense',  47500.00,    'GoFood lunch',                  '2026-07-19'),
  (5, NULL, 'transfer', 2000000.00,  'Received from BCA Payroll',     '2026-08-12'),
  (5, 2,    'income',   1500000.00,  'Design gig',                    '2026-08-14'),
  -- Sari / Cash Harian (cash)
  (6, 2,    'income',   2000000.00,  'Tutoring income',               '2026-06-05'),
  (6, 5,    'expense',  210000.00,   'Groceries',                     '2026-06-15'),
  (6, 9,    'expense',  150000.00,   'Cinema with family',            '2026-07-08'),
  -- Sari / Mandiri Tabungan (bank)
  (7, 1,    'income',   11000000.00, 'June payroll',                  '2026-06-27'),
  (7, 8,    'expense',  975000.00,   'Kos and internet',              '2026-07-03'),
  (7, 1,    'income',   11250000.00, 'July payroll incl. adjustment', '2026-07-27'),
  (7, 8,    'expense',  975000.00,   'Kos and internet',              '2026-08-03'),
  (7, 3,    'income',   480000.00,   'Bond coupon',                   '2026-08-16'),
  -- Dimas / OVO (e-wallet)
  (8, 6,    'expense',  18000.00,    'Grab to station',               '2026-06-09'),
  (8, 7,    'expense',  55000.00,    'Coffee shop',                   '2026-07-12'),
  (8, 2,    'income',   3200000.00,  'Freelance invoice #12',         '2026-08-07'),
  -- Dimas / BNI Utama (bank)
  (9, 1,    'income',   8750000.00,  'June salary',                   '2026-06-26'),
  (9, 9,    'expense',  350000.00,   'Concert ticket',                '2026-07-01'),
  (9, 1,    'income',   8750000.00,  'July salary',                   '2026-07-26'),
  (9, 5,    'expense',  725000.00,   'Supermarket',                   '2026-08-18');

-- ----------------------------------------------------------------------------
-- The rows above were inserted with explicit primary keys, which leaves each
-- SERIAL sequence pointing at 1. Fast-forward them or the next INSERT coming
-- from the API will collide with an existing id.
-- ----------------------------------------------------------------------------
SELECT setval('users_id_seq',        (SELECT MAX(id) FROM users));
SELECT setval('categories_id_seq',   (SELECT MAX(id) FROM categories));
SELECT setval('accounts_id_seq',     (SELECT MAX(id) FROM accounts));
SELECT setval('transactions_id_seq', (SELECT MAX(id) FROM transactions));

-- ----------------------------------------------------------------------------
-- Reconciliation: proves the stored running balance matches the transactions.
-- Every row should report difference = 0.00.
-- ----------------------------------------------------------------------------
SELECT a.id,
       a.name,
       a.balance AS stored_balance,
       COALESCE(SUM(CASE t.type WHEN 'income'  THEN  t.amount
                                WHEN 'expense' THEN -t.amount
                                ELSE 0 END), 0) AS computed_balance,
       a.balance - COALESCE(SUM(CASE t.type WHEN 'income'  THEN  t.amount
                                            WHEN 'expense' THEN -t.amount
                                            ELSE 0 END), 0) AS difference
FROM accounts a
LEFT JOIN transactions t ON t.account_id = a.id
GROUP BY a.id, a.name, a.balance
ORDER BY a.id;
