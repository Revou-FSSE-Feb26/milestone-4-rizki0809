# FinTrack API

Backend for a personal finance tracker — **NestJS · Prisma · PostgreSQL**.
You register the places your money sits, record what moves in and out, and tag
each movement so you can see where it goes.

- **Live URL:** [Railway](https://milestone-4-rizki0809-production.up.railway.app/)
- **Every endpoint with examples:** [`docs/api-smoke-test.md`](docs/api-smoke-test.md)
- **Postman:** [collection](docs/fintrack.postman_collection.json) + [environment](docs/fintrack.postman_environment.json)

## The domain

| Entity | What it is |
| --- | --- |
| **user** | Email + password, role `user` or `admin` |
| **account** | Where money sits — `cash`, `bank`, `e-wallet`. Belongs to one user, carries a **balance** |
| **category** | A label like Salary or Groceries. `income`/`expense`, **shared by all users**, admin-managed |
| **transaction** | One movement: 640 000 of Groceries out of BCA Payroll on 1 Aug. `income`, `expense` or `transfer` |

> **`accounts.balance` always equals the sum of that account's transactions.**
> Income adds, expense subtracts. You cannot set a balance directly — a new
> account starts at `0.00` and only a transaction moves it.

Two things that are easy to get wrong: **`amount` is always positive** (direction
lives in `type`, not the sign), and **`categories.type` ≠ `transactions.type`** —
a category is only `income`/`expense`, while a transaction can also be a
`transfer`, which carries no category at all (CHECK constraint).

## Data model

![FinTrack ERD](docs/erd.png)

Source: [`docs/erd.dbml`](docs/erd.dbml) (paste into dbdiagram.io) · vector: [`docs/erd.svg`](docs/erd.svg)

The model is written three times and all three agree column for column:
[`db/schema.sql`](db/schema.sql), [`prisma/schema.prisma`](prisma/schema.prisma),
and the [init migration](prisma/migrations/20260721010000_init/migration.sql).
Nothing is renamed — Prisma fields are `snake_case` like the SQL columns, so a
JSON response looks like a row you would `SELECT` by hand.

`NUMERIC(12,2)` for money, never `FLOAT` (those errors accumulate over a ledger).
`DATE` for `transaction_date`, `TIMESTAMP` for `created_at`. `BIGSERIAL` only for
transactions, the one table that grows without bound. CHECK constraints rather
than native `ENUM`s so `'e-wallet'` keeps its hyphen. Deleting a user cascades to
their accounts and transactions; a category still in use cannot be deleted
(`ON DELETE RESTRICT` → `409`).

## Quick start

Needs Node 20+ and PostgreSQL 14+ (local, or free-tier Supabase/Neon/Railway).

```bash
npm install                 # postinstall runs `prisma generate`
cp .env.example .env        # then set DATABASE_URL and JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npm run prisma:migrate      # create the schema
npm run prisma:seed         # 4 users, 9 accounts, 10 categories, 38 transactions
npm run start:dev           # http://localhost:3000
```

Seeded users all use **`Password123!`** — `admin@fintrack.test` (admin),
`budi@example.com`, `sari@example.com`, `dimas@example.com`.

```bash
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"budi@example.com","password":"Password123!"}'
```

Import the Postman collection and environment, run **01 Auth → Login (user)** and
**Login (admin)** — they store the tokens — and every other request works.

<details><summary>Raw SQL path instead of Prisma</summary>

```bash
createdb fintrack
psql -d fintrack -f db/schema.sql
psql -d fintrack -f db/seed.sql       # prints a balance reconciliation
psql -d fintrack -f db/queries.sql    # the ten analytical queries
```

To hand over to Prisma afterwards:
`npx prisma migrate resolve --applied 20260721010000_init`
</details>

### Environment

Commented template: [`.env.example`](.env.example). `.env` is git-ignored — on a
host, set these through its environment UI.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | **Required.** PostgreSQL connection string |
| `JWT_SECRET` | — | **Required.** App refuses to boot without it |
| `NODE_ENV` | `development` | `production` ignores `.env` and rejects `CORS_ORIGINS="*"` |
| `PORT` | `3000` | Supplied automatically by most hosts |
| `JWT_EXPIRES_IN` · `BCRYPT_SALT_ROUNDS` | `1h` · `10` | Token lifetime, hashing cost |
| `CORS_ORIGINS` | — | Comma-separated allow-list; `*` is local-only |
| `LOGIN_RATE_LIMIT` · `LOGIN_RATE_TTL_SECONDS` | `5` · `60` | Login throttle |
| `MONEY_DECIMAL_PLACES` | `2` | Rounding scale; must match `NUMERIC(12,2)` |

## API

Request and response for every route: [`docs/api-smoke-test.md`](docs/api-smoke-test.md).
All routes need `Authorization: Bearer <token>` except the four public ones.

| Route | Access |
| --- | --- |
| `GET /` · `GET /health` | public — index, and liveness + database ping |
| `POST /auth/register` · `POST /auth/login` | public (**login is rate limited**) |
| `GET /auth/me` | any authenticated |
| `POST /users` · `GET /users` | **admin** |
| `GET\|PATCH\|DELETE /users/:id` | self or admin — `GET` nests accounts |
| `POST\|GET\|PATCH\|DELETE /accounts[/:id]` | owner (admin sees all) |
| `GET /accounts/:id/transactions` | owner — nests each category |
| `POST /accounts/:id/recalculate-balance` | **admin** |
| `GET /categories[/:id]` | any authenticated |
| `POST\|PATCH\|DELETE /categories[/:id]` | **admin** |
| `POST\|GET\|PATCH\|DELETE /transactions[/:id]` | owner — filters: `account_id`, `category_id`, `type`, `from`, `to` |

One global `ValidationPipe` ([`src/app.setup.ts`](src/app.setup.ts)) with
`whitelist`, `forbidNonWhitelisted` and `transform`. The middle one matters most:
without it `POST /accounts {"balance":999999}` would succeed while silently
ignoring the field, leaving the client believing it set an opening balance. Rules
live in DTOs only, never in a controller — including a custom
[`@IsCalendarDate()`](src/common/validators/is-calendar-date.validator.ts),
because `@IsDateString` accepts `2026-07-15T09:00:00+07:00` (the shape that causes
off-by-one-day bugs) and lets `2026-02-30` through.

## Architecture

```
src/
├── app.setup.ts       helmet + CORS + ValidationPipe (shared with the e2e tests)
├── app.module.ts      wiring, global guards, middleware registration
├── common/            core.module (custom providers) · guards · middleware
│                      decorators · validators · serialization
├── prisma/            one PrismaClient for the process
├── auth/              register, login, JWT strategy
└── users/ accounts/ categories/ transactions/
                      one module / controller / service / DTO set each
```

Controllers do HTTP — routes, status codes, identifying the caller. Services own
the domain rules and every database call. No controller touches a balance.

### Custom providers (DI)

Two registrations in [`core.module.ts`](src/common/core.module.ts) go beyond
`providers: [SomeService]`.

**`BALANCE_CALCULATOR` — `useFactory`.**
[`BalanceCalculatorService`](src/common/providers/balance-calculator.service.ts)
is the one place that knows how a transaction moves a balance. It *needs* a
factory: its constructor takes a plain `number` (the decimal scale) that Nest's
type-based resolution cannot supply. It was pulled out of `TransactionsService`
because (a) it is the part most worth testing — no `@Injectable`, no Prisma, no
HTTP, so its [tests](src/common/providers/balance-calculator.service.spec.ts) are
`new BalanceCalculatorService(2)` with no testing module, database or mocks;
(b) transactions and accounts both need the same rule and must not drift apart;
(c) it is the thing most likely to change — the day transfers gain a destination
account, one registration changes and no service moves.

**`PASSWORD_HASHER` — `useClass` on an interface token.** `AuthService` depends on
the [`PasswordHasher`](src/common/providers/password-hasher.ts) interface, never on
`bcrypt`. A TS interface doesn't exist at runtime, which is what the string token
is for. Swapping to argon2 is a one-line change, and tests inject a fake instead
of paying real bcrypt rounds.

### Middleware

[`LoggerMiddleware`](src/common/middleware/logger.middleware.ts), registered
globally from `AppModule.configure()`:

```
[Nest] LOG  [HTTP] GET /accounts/4 200 14.2ms 218b [user#2]
[Nest] WARN [HTTP] GET /accounts/7 403  3.1ms  96b [user#2]
```

Middleware runs *before* the guards, so status and duration aren't known yet — it
starts a timer and listens for the response's `finish` event instead, by which
point the status is final and the guard has attached the user. Bodies are never
logged, so passwords never reach the log.

### Balance logic

Every calculator method returns a **delta**, handed to Prisma as
`{ balance: { increment: delta } }` — one atomic `UPDATE`, so concurrent writes to
the same account can't lose each other. Row and balance move inside one
`prisma.$transaction`.

| Operation | Effect |
| --- | --- |
| create `income` / `expense` / `transfer` | `+amount` / `−amount` / `0` |
| delete | the exact reverse of what the row applied |
| update | `effect(after) − effect(before)` |
| update moving `account_id` | old account credited back, new one debited |

Turning a 50 000 expense into a 50 000 income moves the balance by **100 000** —
there's a test for it. Two rules no CHECK constraint can express live in the
service: income/expense must be categorised and a transfer must not be, and the
category's type has to match the transaction's (tagging an expense with an income
category would corrupt every spending report).

### Auth, ownership and RBAC

- **Passwords** are bcrypt-hashed and never come back out. Reads pass
  `USER_SAFE_SELECT` to Prisma so the column isn't even loaded — stronger than
  stripping the field afterwards. The e2e suite asserts no response contains `$2b$`.
- **Login** returns a JWT (`sub`, `email`, `role`). Unknown email and wrong password
  give the same `401`, and login always runs a bcrypt comparison — against a
  throwaway hash when the email is unknown — so both paths take the same time.
  Otherwise response timing becomes an account-enumeration oracle.
- **Guards are global, exceptions explicit:** `JwtAuthGuard` then `RolesGuard` as
  `APP_GUARD`, with `@Public()` to opt out. Default-deny means a new controller is
  protected the moment it exists.
- [`JwtStrategy`](src/auth/strategies/jwt.strategy.ts) verifies the signature and
  then **re-reads the user from the database** — a JWT is a snapshot, and someone
  deleted or demoted five minutes ago would otherwise keep their powers until it
  expired.
- **Ownership is separate from authentication.** `AccountsService.findOwned()` is
  the single implementation (`404` if missing, `403` if someone else's) and every
  `:id` route goes through it. Transactions have no `user_id` — ownership is
  inherited via `transactions.account_id → accounts.user_id`, and
  `TransactionsService` calls the *accounts* implementation rather than writing a
  second one. `GET /transactions` filters on `account: { user_id }` **in the
  query**, so other users' rows never load. `user_id` always comes from the token.
- **RBAC** via `@Roles(Role.ADMIN)`: category writes, `POST`/`GET /users` (the
  route that can mint an admin), and balance recalculation. A non-admin PATCHing
  their own `role` gets a `403` rather than a silent no-op.

### Security hardening

- **Login rate limit only.** `ThrottlerGuard` sits on `POST /auth/login`, not as an
  `APP_GUARD` — a limit tight enough to stop password guessing would make normal
  CRUD unusable.
- **Explicit CORS allow-list.** `origin: true` is never used; `"*"` throws at boot
  in production.
- **`helmet()`** for the security headers Express omits, and it drops `X-Powered-By`.
- **No hash ever leaves.** The login response is rebuilt field by field rather than
  spread from the row.
- **No self-promotion.** `RegisterDto = OmitType(CreateUserDto, ['role'])`, so with
  `forbidNonWhitelisted` sending `role` is a `400`.
- **Fail fast.** `getOrThrow('JWT_SECRET')` breaks startup, not the first login.

## Database work

[`db/queries.sql`](db/queries.sql) — ten queries, each labelled with the question
it answers: filtered SELECT · 3-table join · 4-table join · GROUP BY aggregation ·
GROUP BY + HAVING + FILTER · scalar subquery · CTE + window running balance ·
`RANK()` top-3 per user · LEFT JOIN surfacing unused categories · anti-join +
balance reconciliation.

```bash
npm run prisma:migrate   # dev: create/apply a migration      npm run db:reset
npm run prisma:deploy    # prod: apply pending, never reset    npm run prisma:seed
```

The init migration is **hand-extended** — PSL cannot express CHECK constraints, so
it was generated with `prisma migrate diff` and had the six CHECKs from
`db/schema.sql` appended (Prisma's drift detection ignores CHECKs, so the history
stays in sync). The seed recomputes each balance from the transactions it inserts,
then reconciles and **fails loudly** on any mismatch — a seed shipping a balance
that is a lie would make every later balance test meaningless. Re-seed after
`prisma migrate dev` if it resets the database.

## Testing

```bash
npm test          # 30 unit tests
npm run test:e2e  # 27 end-to-end tests
npm run lint
```

**Unit** — the money rule (deleting exactly reverses creating; expense→income moves
twice the amount; 0.10 three times is 0.30, not 0.30000000000000004) and that the
service issues the right `UPDATE` against the right account on every write path.

**E2E** — boots the real `AppModule` with only `PrismaService` replaced, so it runs
without a database while still exercising real guards, pipe, helmet and middleware.
It checks what unit tests can't: routes really are protected, roles really are
required, the login limiter fires on the 4th attempt while `GET /` stays open, the
logger emits `GET /health 200 4.1ms`, and no response carries a password hash.

## Deployment

> **Status: not yet deployed.** The blueprint and image below are ready; publishing
> needs a hosting account, so the live URL at the top still has to be filled in.

**Render** — [`render.yaml`](render.yaml) provisions Postgres and the web service
together and wires `DATABASE_URL` between them, so no connection string is ever
committed. Push to GitHub → **New → Blueprint** → set `CORS_ORIGINS` (`JWT_SECRET`
is generated for you) → deploy. Build runs
`npm ci && npm run build && npx prisma migrate deploy`; seed once from the shell;
verify with `curl https://<app>.onrender.com/health`.

**Railway / Fly.io / Cloud Run** — use the [`Dockerfile`](Dockerfile) (multi-stage,
runs as the unprivileged `node` user) with the same variables.

The server binds `0.0.0.0` (loopback is unreachable in a container), and `/health`
pings the database so a bad `DATABASE_URL` surfaces immediately instead of as 500s
later. **Re-verify the live URL right before submitting** — free tiers sleep.

## Known limitations

- **A `transfer` moves no balance.** The canonical schema records a transaction
  against a single `account_id` with no destination column, so a transfer row
  cannot say where the money went; balance-neutral is the only reading that never
  corrupts a balance. Real transfers would need a nullable `transfer_account_id`
  and both legs in one database transaction — a schema extension, out of scope.
- **Balance is a cached aggregate.** Correct for everything written through the
  API, but rows inserted by `psql` or `db/seed.sql` won't update it.
  `POST /accounts/:id/recalculate-balance` repairs it; query 10 finds the drift.
- **No pagination** on `GET /transactions`.
- **Rate limiting is in-process,** so the limit multiplies if scaled horizontally.
- **No refresh tokens** — an expired token means logging in again.
- **Categories are global,** so a user cannot add one that matters only to them.
- **A user can delete their own account,** cascading to everything they own. No
  soft delete, no undo.
