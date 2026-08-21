-- ============================================================================
-- FinTrack API - Analytical queries
-- ----------------------------------------------------------------------------
-- Ten queries against the schema in db/schema.sql, seeded by db/seed.sql.
-- Each one is preceded by the question it answers.
--
-- Run with:  psql -U <user> -d fintrack -f db/queries.sql
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. FILTERED SELECT
--    "Which single expenses over Rp 100.000 did we record in July 2026?"
--    Plain filtering: a range predicate on a DATE plus two equality/threshold
--    predicates, newest first.
-- ----------------------------------------------------------------------------
SELECT id,
       account_id,
       category_id,
       amount,
       description,
       transaction_date
FROM transactions
WHERE type = 'expense'
  AND amount > 100000
  AND transaction_date >= DATE '2026-07-01'
  AND transaction_date <  DATE '2026-08-01'
ORDER BY transaction_date DESC, amount DESC;


-- ----------------------------------------------------------------------------
-- 2. THREE-TABLE JOIN
--    "Show every transaction as a human would read it: which account it hit and
--    what it was tagged as."
--    transactions -> accounts -> categories. The category join is LEFT because
--    'transfer' rows legitimately have category_id IS NULL.
-- ----------------------------------------------------------------------------
SELECT t.id            AS transaction_id,
       t.transaction_date,
       a.name          AS account_name,
       a.type          AS account_type,
       COALESCE(c.name, '(uncategorised transfer)') AS category_name,
       t.type          AS transaction_type,
       t.amount,
       t.description
FROM transactions t
INNER JOIN accounts   a ON a.id = t.account_id
LEFT  JOIN categories c ON c.id = t.category_id
ORDER BY t.transaction_date DESC, t.id DESC
LIMIT 25;


-- ----------------------------------------------------------------------------
-- 3. FOUR-TABLE JOIN
--    "Same as above, but attributed to the person who owns the account."
--    Adds users on top of the three-table join. This is the join the API's
--    per-user ownership check reproduces in Prisma.
-- ----------------------------------------------------------------------------
SELECT u.name  AS user_name,
       a.name  AS account_name,
       c.name  AS category_name,
       t.type  AS transaction_type,
       t.amount,
       t.transaction_date
FROM transactions t
INNER JOIN accounts   a ON a.id = t.account_id
INNER JOIN users      u ON u.id = a.user_id
INNER JOIN categories c ON c.id = t.category_id
WHERE u.email = 'budi@example.com'
ORDER BY t.transaction_date DESC;


-- ----------------------------------------------------------------------------
-- 4. GROUP BY AGGREGATION
--    "Where does the money actually go? Total spent per expense category,
--    across all users."
-- ----------------------------------------------------------------------------
SELECT c.name                AS category_name,
       COUNT(t.id)           AS transaction_count,
       SUM(t.amount)         AS total_spent,
       ROUND(AVG(t.amount), 2) AS average_spent,
       MAX(t.amount)         AS largest_single_expense
FROM transactions t
INNER JOIN categories c ON c.id = t.category_id
WHERE t.type = 'expense'
GROUP BY c.id, c.name
ORDER BY total_spent DESC;


-- ----------------------------------------------------------------------------
-- 5. GROUP BY + HAVING + FILTER
--    "Per user per month: how much came in, how much went out, and did they
--    end the month in the black?"
--    HAVING drops months where nothing happened at all.
-- ----------------------------------------------------------------------------
SELECT u.name                                              AS user_name,
       TO_CHAR(DATE_TRUNC('month', t.transaction_date), 'YYYY-MM') AS month,
       COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'),  0) AS total_income,
       COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0) AS total_expense,
       COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'),  0)
     - COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0) AS net_cash_flow
FROM users u
INNER JOIN accounts     a ON a.user_id    = u.id
INNER JOIN transactions t ON t.account_id = a.id
GROUP BY u.id, u.name, DATE_TRUNC('month', t.transaction_date)
HAVING COUNT(t.id) > 0
ORDER BY u.name, month;


-- ----------------------------------------------------------------------------
-- 6. ADVANCED - SCALAR SUBQUERY
--    "Which accounts hold more than the average account balance?"
--    The subquery is evaluated once and compared against every row.
-- ----------------------------------------------------------------------------
SELECT a.id,
       a.name,
       a.type,
       a.balance,
       (SELECT ROUND(AVG(balance), 2) FROM accounts) AS average_balance
FROM accounts a
WHERE a.balance > (SELECT AVG(balance) FROM accounts)
ORDER BY a.balance DESC;


-- ----------------------------------------------------------------------------
-- 7. ADVANCED - CTE + WINDOW FUNCTION
--    "Replay one account's history and show the balance after every single
--    transaction."
--    The CTE turns each row into a signed delta; SUM(...) OVER (ORDER BY ...)
--    accumulates it into a running balance without collapsing the rows.
-- ----------------------------------------------------------------------------
WITH signed_movements AS (
    SELECT t.id,
           t.account_id,
           t.transaction_date,
           t.type,
           t.amount,
           CASE t.type
               WHEN 'income'  THEN  t.amount
               WHEN 'expense' THEN -t.amount
               ELSE 0                     -- transfers are balance-neutral
           END AS delta
    FROM transactions t
)
SELECT m.id,
       m.transaction_date,
       m.type,
       m.amount,
       m.delta,
       SUM(m.delta) OVER (PARTITION BY m.account_id
                          ORDER BY m.transaction_date, m.id
                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
           AS running_balance
FROM signed_movements m
WHERE m.account_id = 4
ORDER BY m.transaction_date, m.id;


-- ----------------------------------------------------------------------------
-- 8. ADVANCED - WINDOW FUNCTION RANK
--    "What are each user's top 3 spending categories?"
--    RANK() partitions per user so every user gets their own leaderboard; the
--    outer query then keeps only the podium.
-- ----------------------------------------------------------------------------
WITH spend_per_category AS (
    SELECT u.id            AS user_id,
           u.name          AS user_name,
           c.name          AS category_name,
           SUM(t.amount)   AS total_spent
    FROM users u
    INNER JOIN accounts     a ON a.user_id    = u.id
    INNER JOIN transactions t ON t.account_id = a.id
    INNER JOIN categories   c ON c.id         = t.category_id
    WHERE t.type = 'expense'
    GROUP BY u.id, u.name, c.name
), ranked AS (
    SELECT s.*,
           RANK() OVER (PARTITION BY s.user_id ORDER BY s.total_spent DESC) AS spend_rank
    FROM spend_per_category s
)
SELECT user_name, category_name, total_spent, spend_rank
FROM ranked
WHERE spend_rank <= 3
ORDER BY user_name, spend_rank;


-- ----------------------------------------------------------------------------
-- 9. LEFT JOIN SURFACING ZERO-RESULT ROWS
--    "Which categories has nobody ever used?"
--    An INNER JOIN would hide exactly the rows we care about. The LEFT JOIN
--    keeps every category and COUNT(t.id) reports 0 for the unused ones
--    (COUNT of the nullable right-hand column, never COUNT(*)).
--    Expected from the seed data: Gift and Healthcare.
-- ----------------------------------------------------------------------------
SELECT c.id,
       c.name,
       c.type,
       COUNT(t.id)                 AS transaction_count,
       COALESCE(SUM(t.amount), 0)  AS total_amount
FROM categories c
LEFT JOIN transactions t ON t.category_id = c.id
GROUP BY c.id, c.name, c.type
ORDER BY transaction_count ASC, c.name;


-- ----------------------------------------------------------------------------
-- 10. ANTI-JOIN + RECONCILIATION
--     (a) "Has anyone registered without ever opening an account?"
--     (b) "Does the cached accounts.balance still agree with the transaction
--          history?" - the integrity check behind the balance business logic.
-- ----------------------------------------------------------------------------
-- (a)
SELECT u.id, u.name, u.email
FROM users u
LEFT JOIN accounts a ON a.user_id = u.id
WHERE a.id IS NULL
ORDER BY u.id;

-- (b)
SELECT a.id,
       a.name,
       a.balance AS stored_balance,
       COALESCE(SUM(CASE t.type WHEN 'income'  THEN  t.amount
                                WHEN 'expense' THEN -t.amount
                                ELSE 0 END), 0) AS computed_balance,
       a.balance - COALESCE(SUM(CASE t.type WHEN 'income'  THEN  t.amount
                                            WHEN 'expense' THEN -t.amount
                                            ELSE 0 END), 0) AS drift
FROM accounts a
LEFT JOIN transactions t ON t.account_id = a.id
GROUP BY a.id, a.name, a.balance
HAVING a.balance <> COALESCE(SUM(CASE t.type WHEN 'income'  THEN  t.amount
                                             WHEN 'expense' THEN -t.amount
                                             ELSE 0 END), 0)
ORDER BY a.id;
