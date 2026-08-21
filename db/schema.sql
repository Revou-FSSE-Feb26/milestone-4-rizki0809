-- ============================================================================
-- FinTrack API - Database Schema (PostgreSQL)
-- ----------------------------------------------------------------------------
-- Domain: a personal finance tracker. A user owns one or more accounts
-- (cash / bank / e-wallet). Every transaction is recorded against exactly one
-- account and is tagged with a category so the user can see where money goes.
--
-- Run with:  psql -U <user> -d fintrack -f db/schema.sql
-- ============================================================================

-- Dropped in reverse dependency order so the file can be re-run from scratch.
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS accounts     CASCADE;
DROP TABLE IF EXISTS categories   CASCADE;
DROP TABLE IF EXISTS users        CASCADE;

-- ----------------------------------------------------------------------------
-- users : the person using FinTrack. Owns accounts; owns transactions
--         transitively through those accounts.
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id         SERIAL       PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    email      VARCHAR(255) NOT NULL,
    -- Always a bcrypt hash. The API never stores or returns a plaintext password.
    password   VARCHAR(255) NOT NULL,
    role       VARCHAR(10)  NOT NULL DEFAULT 'user',
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT users_email_key   UNIQUE (email),
    CONSTRAINT users_role_check  CHECK (role IN ('user', 'admin'))
);

-- ----------------------------------------------------------------------------
-- accounts : a place money physically sits. `balance` is the running balance,
--            kept in sync by the service layer on every transaction write.
--            NUMERIC(12,2) - never FLOAT - so money never picks up rounding
--            error (max value 9,999,999,999.99).
-- ----------------------------------------------------------------------------
CREATE TABLE accounts (
    id         SERIAL        PRIMARY KEY,
    user_id    INTEGER       NOT NULL,
    name       VARCHAR(100)  NOT NULL,
    type       VARCHAR(10)   NOT NULL,
    balance    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT accounts_type_check   CHECK (type IN ('cash', 'bank', 'e-wallet')),
    -- One user cannot have two accounts with the same name.
    CONSTRAINT accounts_user_id_name_key UNIQUE (user_id, name)
);

-- ----------------------------------------------------------------------------
-- categories : shared lookup table (not per-user). Its `type` says whether the
--              category describes money coming in or going out. NOTE this is a
--              different enum from transactions.type, which also allows
--              'transfer'.
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
    id   SERIAL      PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    type VARCHAR(10) NOT NULL,

    CONSTRAINT categories_type_check    CHECK (type IN ('income', 'expense')),
    -- "Bonus" can legitimately exist as income only once, but the same word may
    -- exist under a different type, hence the composite unique key.
    CONSTRAINT categories_name_type_key UNIQUE (name, type)
);

-- ----------------------------------------------------------------------------
-- transactions : one money movement. BIGSERIAL because this is the table that
--                grows without bound. `amount` is always stored positive - the
--                direction lives in `type`, not in the sign.
-- ----------------------------------------------------------------------------
CREATE TABLE transactions (
    id               BIGSERIAL     PRIMARY KEY,
    account_id       INTEGER       NOT NULL,
    -- Nullable only for 'transfer' rows, which move money between the user's
    -- own accounts and therefore are not spending or earning. Enforced below.
    category_id      INTEGER       NULL,
    type             VARCHAR(10)   NOT NULL,
    amount           NUMERIC(12,2) NOT NULL,
    description      TEXT          NULL,
    transaction_date DATE          NOT NULL,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT transactions_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES accounts (id) ON DELETE CASCADE ON UPDATE CASCADE,
    -- RESTRICT: a category that is still in use must not silently disappear and
    -- orphan the history that references it.
    CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id)
        REFERENCES categories (id) ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT transactions_type_check   CHECK (type IN ('income', 'expense', 'transfer')),
    CONSTRAINT transactions_amount_check CHECK (amount > 0),
    -- Income and expense must be categorised; a transfer must not be.
    CONSTRAINT transactions_category_required_check
        CHECK ((type = 'transfer' AND category_id IS NULL)
            OR (type <> 'transfer' AND category_id IS NOT NULL))
);

-- ----------------------------------------------------------------------------
-- Indexes on every foreign key and on the column the API filters by most
-- (transaction_date), so list endpoints do not degrade into sequential scans.
-- ----------------------------------------------------------------------------
CREATE INDEX idx_accounts_user_id          ON accounts     (user_id);
CREATE INDEX idx_transactions_account_id   ON transactions (account_id);
CREATE INDEX idx_transactions_category_id  ON transactions (category_id);
CREATE INDEX idx_transactions_date         ON transactions (transaction_date DESC);
