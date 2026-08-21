# FinTrack API — Smoke Test

One example request and response for **every** endpoint, plus the error cases
worth knowing about. Everything here was produced against the data in
`db/seed.sql` / `prisma/seed.ts`.

## Setup

```bash
BASE_URL="http://localhost:3000"          # or your deployed URL

login() {
  curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"Password123!\"}" | jq -r .access_token
}

TOKEN=$(login budi@example.com)            # a regular user
ADMIN_TOKEN=$(login admin@fintrack.test)   # an admin
```

All seeded users share the password **`Password123!`**.

| Email                 | Role  | Accounts                                |
| --------------------- | ----- | --------------------------------------- |
| `admin@fintrack.test` | admin | Admin Wallet (1), Admin Bank (2)        |
| `budi@example.com`    | user  | Dompet Tunai (3), BCA Payroll (4), GoPay (5) |
| `sari@example.com`    | user  | Cash Harian (6), Mandiri Tabungan (7)   |
| `dimas@example.com`   | user  | OVO (8), BNI Utama (9)                  |

Every route except `GET /`, `GET /health`, `POST /auth/register` and
`POST /auth/login` requires `Authorization: Bearer <access_token>`.

---

## Table of contents

- [Service](#service)
- [Auth](#auth)
- [Users](#users)
- [Accounts](#accounts)
- [Categories](#categories)
- [Transactions](#transactions)
- [Error catalogue](#error-catalogue)

---

## Service

### `GET /` — service index (public)

```bash
curl "$BASE_URL/"
```

**200 OK**

```json
{
  "name": "FinTrack API",
  "description": "Personal finance tracker: accounts, categories and transactions.",
  "version": "1.0.0",
  "docs": {
    "smoke_test": "docs/api-smoke-test.md",
    "postman": "docs/fintrack.postman_collection.json"
  },
  "endpoints": {
    "auth": ["POST /auth/register", "POST /auth/login", "GET /auth/me"],
    "users": ["POST /users", "GET /users", "GET /users/:id", "PATCH /users/:id", "DELETE /users/:id"],
    "accounts": ["POST /accounts", "GET /accounts", "GET /accounts/:id", "GET /accounts/:id/transactions", "PATCH /accounts/:id", "DELETE /accounts/:id", "POST /accounts/:id/recalculate-balance"],
    "categories": ["POST /categories", "GET /categories", "GET /categories/:id", "PATCH /categories/:id", "DELETE /categories/:id"],
    "transactions": ["POST /transactions", "GET /transactions", "GET /transactions/:id", "PATCH /transactions/:id", "DELETE /transactions/:id"]
  }
}
```

### `GET /health` — liveness + database round trip (public)

```bash
curl "$BASE_URL/health"
```

**200 OK**

```json
{
  "status": "ok",
  "database": "up",
  "latency_ms": 12,
  "uptime_seconds": 431,
  "timestamp": "2026-08-21T09:14:02.771Z"
}
```

If the database is unreachable the same route still answers 200 with
`"status": "degraded"`, `"database": "down"` — the process is alive, the
dependency is not.

---

## Auth

### `POST /auth/register` — public sign-up

```bash
curl -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Nadia Putri","email":"nadia@example.com","password":"Password123!"}'
```

**201 Created** — note there is no `password` field in the response, and no
`role` field in the request: everyone who registers here is a `user`.

```json
{
  "id": 5,
  "name": "Nadia Putri",
  "email": "nadia@example.com",
  "role": "user",
  "created_at": "2026-08-21T09:15:44.512Z"
}
```

### `POST /auth/login` — exchange credentials for a JWT

Rate limited to 5 attempts per minute per IP (`LOGIN_RATE_LIMIT`).

```bash
curl -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"budi@example.com","password":"Password123!"}'
```

**200 OK**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjIsImVtYWlsIjoiYnVkaUBleGFtcGxlLmNvbSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzg2NDIzMzQ0LCJleHAiOjE3ODY0MjY5NDR9.p0Ck3s-2Q7oJ7wCw5s3G0lTn3l3iVVh1cQ2nB4rGZ1M",
  "token_type": "Bearer",
  "expires_in": "1h",
  "user": {
    "id": 2,
    "name": "Budi Santoso",
    "email": "budi@example.com",
    "role": "user",
    "created_at": "2026-05-28T14:12:00.000Z"
  }
}
```

Save it:

```bash
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"budi@example.com","password":"Password123!"}' | jq -r .access_token)
```

### `GET /auth/me` — who this token belongs to

```bash
curl "$BASE_URL/auth/me" -H "Authorization: Bearer $TOKEN"
```

**200 OK**

```json
{
  "id": 2,
  "name": "Budi Santoso",
  "email": "budi@example.com",
  "role": "user",
  "created_at": "2026-05-28T14:12:00.000Z",
  "accounts": [
    { "id": 3, "name": "Dompet Tunai", "type": "cash",     "balance": 446500,   "created_at": "2026-05-28T14:20:00.000Z", "transaction_count": 5 },
    { "id": 4, "name": "BCA Payroll",  "type": "bank",     "balance": 16180000, "created_at": "2026-05-28T14:22:00.000Z", "transaction_count": 7 },
    { "id": 5, "name": "GoPay",        "type": "e-wallet", "balance": 1427500,  "created_at": "2026-06-03T07:10:00.000Z", "transaction_count": 4 }
  ],
  "total_balance": 18054000
}
```

---

## Users

### `POST /users` — create a user (**admin only**)

The only way to mint another admin.

```bash
curl -X POST "$BASE_URL/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Ops Auditor","email":"auditor@fintrack.test","password":"Password123!","role":"admin"}'
```

**201 Created**

```json
{
  "id": 6,
  "name": "Ops Auditor",
  "email": "auditor@fintrack.test",
  "role": "admin",
  "created_at": "2026-08-21T09:18:10.004Z"
}
```

### `GET /users` — list users (**admin only**)

```bash
curl "$BASE_URL/users" -H "Authorization: Bearer $ADMIN_TOKEN"
```

**200 OK** — no `password` on any row.

```json
[
  { "id": 1, "name": "Admin FinTrack", "email": "admin@fintrack.test", "role": "admin", "created_at": "2026-05-20T09:00:00.000Z" },
  { "id": 2, "name": "Budi Santoso",   "email": "budi@example.com",    "role": "user",  "created_at": "2026-05-28T14:12:00.000Z" },
  { "id": 3, "name": "Sari Wulandari", "email": "sari@example.com",    "role": "user",  "created_at": "2026-06-01T08:45:00.000Z" },
  { "id": 4, "name": "Dimas Prakoso",  "email": "dimas@example.com",   "role": "user",  "created_at": "2026-06-02T19:30:00.000Z" }
]
```

### `GET /users/:id` — one user with nested accounts (self or admin)

This is the **relational query**: user → accounts → transaction count, in a
single Prisma query.

```bash
curl "$BASE_URL/users/2" -H "Authorization: Bearer $TOKEN"
```

**200 OK** — same shape as `GET /auth/me` above.

### `PATCH /users/:id` — update (self or admin)

```bash
curl -X PATCH "$BASE_URL/users/2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Budi S. Santoso"}'
```

**200 OK**

```json
{
  "id": 2,
  "name": "Budi S. Santoso",
  "email": "budi@example.com",
  "role": "user",
  "created_at": "2026-05-28T14:12:00.000Z"
}
```

Sending `"role": "admin"` as a non-admin returns **403** —
`"Only an admin can change a user role"`.

### `DELETE /users/:id` — delete (self or admin)

Cascades to the user's accounts and, through those, to their transactions.

```bash
curl -X DELETE "$BASE_URL/users/5" -H "Authorization: Bearer $ADMIN_TOKEN"
```

**200 OK**

```json
{
  "id": 5,
  "name": "Nadia Putri",
  "email": "nadia@example.com",
  "role": "user",
  "created_at": "2026-08-21T09:15:44.512Z"
}
```

---

## Accounts

Every route below is scoped to the caller. `user_id` comes from the token, so
it is never accepted in a body.

### `POST /accounts`

```bash
curl -X POST "$BASE_URL/accounts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bibit Investasi","type":"bank"}'
```

**201 Created** — a new account always starts at `0`. Balance is derived from
transactions and cannot be set directly.

```json
{
  "id": 10,
  "user_id": 2,
  "name": "Bibit Investasi",
  "type": "bank",
  "balance": 0,
  "created_at": "2026-08-21T09:20:31.882Z"
}
```

### `GET /accounts`

```bash
curl "$BASE_URL/accounts" -H "Authorization: Bearer $TOKEN"
```

**200 OK** — a user sees only their own; an admin sees all nine.

```json
[
  { "id": 3, "user_id": 2, "name": "Dompet Tunai", "type": "cash",     "balance": 446500,   "created_at": "2026-05-28T14:20:00.000Z" },
  { "id": 4, "user_id": 2, "name": "BCA Payroll",  "type": "bank",     "balance": 16180000, "created_at": "2026-05-28T14:22:00.000Z" },
  { "id": 5, "user_id": 2, "name": "GoPay",        "type": "e-wallet", "balance": 1427500,  "created_at": "2026-06-03T07:10:00.000Z" }
]
```

### `GET /accounts/:id`

```bash
curl "$BASE_URL/accounts/4" -H "Authorization: Bearer $TOKEN"
```

**200 OK**

```json
{
  "id": 4,
  "user_id": 2,
  "name": "BCA Payroll",
  "type": "bank",
  "balance": 16180000,
  "created_at": "2026-05-28T14:22:00.000Z"
}
```

### `GET /accounts/:id/transactions` — relational read with `include`

The account plus its transactions, each carrying its **nested category**.

```bash
curl "$BASE_URL/accounts/4/transactions" -H "Authorization: Bearer $TOKEN"
```

**200 OK** (trimmed to three of the seven rows)

```json
{
  "id": 4,
  "user_id": 2,
  "name": "BCA Payroll",
  "type": "bank",
  "balance": 16180000,
  "created_at": "2026-05-28T14:22:00.000Z",
  "transaction_count": 7,
  "transactions": [
    {
      "id": 19,
      "account_id": 4,
      "category_id": null,
      "type": "transfer",
      "amount": 2000000,
      "description": "Move to GoPay",
      "transaction_date": "2026-08-12",
      "created_at": "2026-08-12T00:00:00.000Z",
      "category": null
    },
    {
      "id": 18,
      "account_id": 4,
      "category_id": 5,
      "type": "expense",
      "amount": 640000,
      "description": "Monthly stock up",
      "transaction_date": "2026-08-01",
      "created_at": "2026-08-01T00:00:00.000Z",
      "category": { "id": 5, "name": "Groceries", "type": "expense" }
    },
    {
      "id": 16,
      "account_id": 4,
      "category_id": 1,
      "type": "income",
      "amount": 9500000,
      "description": "July salary",
      "transaction_date": "2026-07-25",
      "created_at": "2026-07-25T00:00:00.000Z",
      "category": { "id": 1, "name": "Salary", "type": "income" }
    }
  ]
}
```

### `PATCH /accounts/:id`

```bash
curl -X PATCH "$BASE_URL/accounts/5" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"GoPay Utama"}'
```

**200 OK**

```json
{
  "id": 5,
  "user_id": 2,
  "name": "GoPay Utama",
  "type": "e-wallet",
  "balance": 1427500,
  "created_at": "2026-06-03T07:10:00.000Z"
}
```

### `DELETE /accounts/:id`

Cascades to that account's transactions.

```bash
curl -X DELETE "$BASE_URL/accounts/10" -H "Authorization: Bearer $TOKEN"
```

**200 OK**

```json
{
  "id": 10,
  "user_id": 2,
  "name": "Bibit Investasi",
  "type": "bank",
  "balance": 0,
  "created_at": "2026-08-21T09:20:31.882Z"
}
```

### `POST /accounts/:id/recalculate-balance` (**admin only**)

Rebuilds the cached balance from the transaction history and reports the drift
it corrected. Useful after loading rows outside the API — e.g. via
`db/seed.sql`.

```bash
curl -X POST "$BASE_URL/accounts/4/recalculate-balance" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**200 OK**

```json
{
  "account_id": 4,
  "previous_balance": 16180000,
  "recalculated_balance": 16180000,
  "drift_corrected": 0,
  "transaction_count": 7
}
```

---

## Categories

Shared reference data: any authenticated user can read, only an admin can write.

### `POST /categories` (**admin only**)

```bash
curl -X POST "$BASE_URL/categories" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Education","type":"expense"}'
```

**201 Created**

```json
{ "id": 11, "name": "Education", "type": "expense" }
```

### `GET /categories`

```bash
curl "$BASE_URL/categories" -H "Authorization: Bearer $TOKEN"
```

**200 OK** (trimmed) — `transaction_count` is 0 for the two categories nobody
has used, which is the same result the LEFT JOIN in `db/queries.sql` produces.

```json
[
  { "id": 4,  "name": "Gift",              "type": "income",  "transaction_count": 0 },
  { "id": 3,  "name": "Investment Return", "type": "income",  "transaction_count": 2 },
  { "id": 2,  "name": "Freelance",         "type": "income",  "transaction_count": 4 },
  { "id": 1,  "name": "Salary",            "type": "income",  "transaction_count": 8 },
  { "id": 7,  "name": "Dining Out",        "type": "expense", "transaction_count": 4 },
  { "id": 9,  "name": "Entertainment",     "type": "expense", "transaction_count": 3 },
  { "id": 5,  "name": "Groceries",         "type": "expense", "transaction_count": 5 },
  { "id": 10, "name": "Healthcare",        "type": "expense", "transaction_count": 0 },
  { "id": 6,  "name": "Transport",         "type": "expense", "transaction_count": 4 },
  { "id": 8,  "name": "Utilities",         "type": "expense", "transaction_count": 5 }
]
```

### `GET /categories/:id`

```bash
curl "$BASE_URL/categories/5" -H "Authorization: Bearer $TOKEN"
```

**200 OK**

```json
{ "id": 5, "name": "Groceries", "type": "expense", "transaction_count": 5 }
```

### `PATCH /categories/:id` (**admin only**)

```bash
curl -X PATCH "$BASE_URL/categories/11" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Education & Courses"}'
```

**200 OK**

```json
{ "id": 11, "name": "Education & Courses", "type": "expense" }
```

### `DELETE /categories/:id` (**admin only**)

```bash
curl -X DELETE "$BASE_URL/categories/11" -H "Authorization: Bearer $ADMIN_TOKEN"
```

**200 OK**

```json
{ "id": 11, "name": "Education & Courses", "type": "expense" }
```

Deleting a category that transactions still reference returns **409** — the
`ON DELETE RESTRICT` foreign key refuses to orphan history:

```json
{
  "statusCode": 409,
  "message": "Category with id 5 is still used by existing transactions and cannot be deleted",
  "error": "Conflict"
}
```

---

## Transactions

### `POST /transactions` — and the balance moves

Account 3 (Dompet Tunai) starts at **446 500**.

```bash
curl -X POST "$BASE_URL/transactions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "account_id": 3,
        "category_id": 7,
        "type": "expense",
        "amount": 46500,
        "description": "Nasi padang",
        "transaction_date": "2026-08-20"
      }'
```

**201 Created**

```json
{
  "id": 39,
  "account_id": 3,
  "category_id": 7,
  "type": "expense",
  "amount": 46500,
  "description": "Nasi padang",
  "transaction_date": "2026-08-20",
  "created_at": "2026-08-21T09:25:12.309Z",
  "category": { "id": 7, "name": "Dining Out", "type": "expense" },
  "account": { "id": 3, "name": "Dompet Tunai", "type": "cash", "user_id": 2 }
}
```

`GET /accounts/3` now reports `"balance": 400000` — 446 500 − 46 500. The row
and the balance are written inside one database transaction.

### `GET /transactions`

Optional filters: `account_id`, `category_id`, `type`, `from`, `to`.

```bash
curl "$BASE_URL/transactions?type=expense&from=2026-07-01&to=2026-07-31" \
  -H "Authorization: Bearer $TOKEN"
```

**200 OK** (trimmed)

```json
[
  {
    "id": 21,
    "account_id": 5,
    "category_id": 7,
    "type": "expense",
    "amount": 47500,
    "description": "GoFood lunch",
    "transaction_date": "2026-07-19",
    "created_at": "2026-07-19T00:00:00.000Z",
    "category": { "id": 7, "name": "Dining Out", "type": "expense" },
    "account": { "id": 5, "name": "GoPay", "type": "e-wallet", "user_id": 2 }
  },
  {
    "id": 17,
    "account_id": 4,
    "category_id": 8,
    "type": "expense",
    "amount": 1250000,
    "description": "Rent and electricity",
    "transaction_date": "2026-07-28",
    "created_at": "2026-07-28T00:00:00.000Z",
    "category": { "id": 8, "name": "Utilities", "type": "expense" },
    "account": { "id": 4, "name": "BCA Payroll", "type": "bank", "user_id": 2 }
  }
]
```

### `GET /transactions/:id`

```bash
curl "$BASE_URL/transactions/18" -H "Authorization: Bearer $TOKEN"
```

**200 OK**

```json
{
  "id": 18,
  "account_id": 4,
  "category_id": 5,
  "type": "expense",
  "amount": 640000,
  "description": "Monthly stock up",
  "transaction_date": "2026-08-01",
  "created_at": "2026-08-01T00:00:00.000Z",
  "category": { "id": 5, "name": "Groceries", "type": "expense" },
  "account": { "id": 4, "name": "BCA Payroll", "type": "bank", "user_id": 2 }
}
```

### `PATCH /transactions/:id` — and the balance follows

Correcting the amount from 46 500 to 52 000 takes another 5 500 off the account.

```bash
curl -X PATCH "$BASE_URL/transactions/39" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":52000,"description":"Nasi padang + es teh"}'
```

**200 OK**

```json
{
  "id": 39,
  "account_id": 3,
  "category_id": 7,
  "type": "expense",
  "amount": 52000,
  "description": "Nasi padang + es teh",
  "transaction_date": "2026-08-20",
  "created_at": "2026-08-21T09:25:12.309Z",
  "category": { "id": 7, "name": "Dining Out", "type": "expense" },
  "account": { "id": 3, "name": "Dompet Tunai", "type": "cash", "user_id": 2 }
}
```

Account 3 is now **394 500**.

Other edits are handled the same way:

- changing `type` from `expense` to `income` moves the balance by **twice** the
  amount;
- changing `account_id` credits the old account back and debits the new one;
- to turn a categorised transaction into a transfer, send
  `{"type":"transfer","category_id":null}` — an explicit `null` clears it.

### `DELETE /transactions/:id`

Reverses whatever the transaction did to the balance.

```bash
curl -X DELETE "$BASE_URL/transactions/39" -H "Authorization: Bearer $TOKEN"
```

**200 OK**

```json
{
  "id": 39,
  "account_id": 3,
  "category_id": 7,
  "type": "expense",
  "amount": 52000,
  "description": "Nasi padang + es teh",
  "transaction_date": "2026-08-20",
  "created_at": "2026-08-21T09:25:12.309Z",
  "category": { "id": 7, "name": "Dining Out", "type": "expense" },
  "account": { "id": 3, "name": "Dompet Tunai", "type": "cash", "user_id": 2 }
}
```

Account 3 is back to **446 500**.

---

## Error catalogue

### 400 — unknown property (`forbidNonWhitelisted`)

```bash
curl -X POST "$BASE_URL/accounts" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Rekening Baru","type":"bank","balance":999999}'
```

```json
{
  "message": ["property balance should not exist"],
  "error": "Bad Request",
  "statusCode": 400
}
```

### 400 — several rules at once

```bash
curl -X POST "$BASE_URL/transactions" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id":4,"category_id":5,"type":"purchase","amount":-5,"transaction_date":"2026-02-30"}'
```

```json
{
  "message": [
    "type must be one of: income, expense, transfer",
    "amount must be greater than 0",
    "transaction_date must be a real calendar date in YYYY-MM-DD format"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

### 400 — category type disagrees with transaction type

```bash
curl -X POST "$BASE_URL/transactions" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id":4,"category_id":1,"type":"expense","amount":1000,"transaction_date":"2026-08-01"}'
```

```json
{
  "message": "Category \"Salary\" is an income category and cannot be used on a expense transaction",
  "error": "Bad Request",
  "statusCode": 400
}
```

### 401 — no token

```bash
curl "$BASE_URL/accounts"
```

```json
{ "message": "Missing or invalid access token", "error": "Unauthorized", "statusCode": 401 }
```

### 401 — wrong credentials

Identical for an unknown email and for a wrong password, on purpose.

```json
{ "message": "Invalid email or password", "error": "Unauthorized", "statusCode": 401 }
```

### 403 — ownership violation

Budi (user 2) reaching for Sari's account 7:

```bash
curl "$BASE_URL/accounts/7" -H "Authorization: Bearer $TOKEN"
```

```json
{ "message": "You do not have access to this account", "error": "Forbidden", "statusCode": 403 }
```

### 403 — role violation (RBAC)

```bash
curl -X POST "$BASE_URL/categories" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Hobbies","type":"expense"}'
```

```json
{ "message": "This action requires the admin role", "error": "Forbidden", "statusCode": 403 }
```

### 404 — missing record

```bash
curl "$BASE_URL/accounts/9999" -H "Authorization: Bearer $TOKEN"
```

```json
{ "message": "Account with id 9999 not found", "error": "Not Found", "statusCode": 404 }
```

### 409 — duplicate email

```json
{ "message": "Email budi@example.com is already registered", "error": "Conflict", "statusCode": 409 }
```

### 429 — login rate limit

The 6th login attempt within a minute from the same IP:

```json
{ "statusCode": 429, "message": "ThrottlerException: Too Many Requests" }
```

Ordinary CRUD routes are unaffected — the limiter is attached to
`POST /auth/login` only.
