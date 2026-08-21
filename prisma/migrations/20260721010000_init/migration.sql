-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role" VARCHAR(10) NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "type" VARCHAR(10) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" BIGSERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "category_id" INTEGER,
    "type" VARCHAR(10) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "transaction_date" DATE NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_accounts_user_id" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_name_key" ON "accounts"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_type_key" ON "categories"("name", "type");

-- CreateIndex
CREATE INDEX "idx_transactions_account_id" ON "transactions"("account_id");

-- CreateIndex
CREATE INDEX "idx_transactions_category_id" ON "transactions"("category_id");

-- CreateIndex
CREATE INDEX "idx_transactions_date" ON "transactions"("transaction_date" DESC);

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- CHECK constraints
-- Prisma Schema Language cannot express CHECK constraints, so they are added
-- here by hand to keep the migrated database identical to db/schema.sql.
-- Prisma's drift detection ignores CHECK constraints, so this does not put the
-- migration history out of sync with prisma/schema.prisma.
-- ---------------------------------------------------------------------------

-- AddCheckConstraint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check"
    CHECK ("role" IN ('user', 'admin'));

-- AddCheckConstraint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_type_check"
    CHECK ("type" IN ('cash', 'bank', 'e-wallet'));

-- AddCheckConstraint
ALTER TABLE "categories" ADD CONSTRAINT "categories_type_check"
    CHECK ("type" IN ('income', 'expense'));

-- AddCheckConstraint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_type_check"
    CHECK ("type" IN ('income', 'expense', 'transfer'));

-- AddCheckConstraint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_check"
    CHECK ("amount" > 0);

-- AddCheckConstraint
-- Income and expense must be categorised; a transfer must not be.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_required_check"
    CHECK (("type" = 'transfer' AND "category_id" IS NULL)
        OR ("type" <> 'transfer' AND "category_id" IS NOT NULL));
