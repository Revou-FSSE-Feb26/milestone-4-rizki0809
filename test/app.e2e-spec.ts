import { INestApplication, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests over the real AppModule: real guards, real global
 * ValidationPipe, real helmet and CORS setup, real middleware registration.
 * Only PrismaService is replaced, so the suite runs without a database while
 * still exercising every layer above it.
 *
 * What these prove is the wiring the unit tests cannot: that a route is
 * actually protected, that a role is actually required, that a rejected field
 * is actually rejected, and that no response carries a password hash.
 */

// bcrypt hashes of "Password123!", the same ones db/seed.sql uses.
const ADMIN_HASH =
  '$2b$10$NDAmQPwliH0rVc0UF1HsXumU2TzMmGknHfE.vHsd03Vomyuei0m0y';
const BUDI_HASH =
  '$2b$10$JY9g8kz1pB2ShYot85mWVeRubA7u7o/85ypGsq9BDGvibdi23OxwK';

const seedUsers = [
  {
    id: 1,
    name: 'Admin FinTrack',
    email: 'admin@fintrack.test',
    password: ADMIN_HASH,
    role: 'admin',
    created_at: new Date('2026-05-20T09:00:00Z'),
  },
  {
    id: 2,
    name: 'Budi Santoso',
    email: 'budi@example.com',
    password: BUDI_HASH,
    role: 'user',
    created_at: new Date('2026-05-28T14:12:00Z'),
  },
];

const seedAccounts = [
  {
    id: 4,
    user_id: 2,
    name: 'BCA Payroll',
    type: 'bank',
    balance: '16180000.00',
    created_at: new Date('2026-05-28T14:22:00Z'),
    transaction_count: 7,
  },
  {
    id: 7,
    user_id: 3,
    name: 'Mandiri Tabungan',
    type: 'bank',
    balance: '20780000.00',
    created_at: new Date('2026-06-01T08:52:00Z'),
    transaction_count: 5,
  },
];

/** Applies a Prisma `select` object to a plain row. */
function project<T extends object>(row: T, select?: Record<string, unknown>) {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [key, wanted] of Object.entries(select)) {
    if (wanted) out[key] = (row as Record<string, unknown>)[key];
  }
  return out;
}

function createPrismaMock() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: jest.fn(({ where, select }: any) => {
        const user = seedUsers.find((candidate) =>
          where.id !== undefined
            ? candidate.id === where.id
            : candidate.email === where.email,
        );
        if (!user) return Promise.resolve(null);
        if (!select) return Promise.resolve({ ...user });

        const projected: Record<string, unknown> = project(user, select);
        if (select.accounts) {
          projected.accounts = seedAccounts
            .filter((account) => account.user_id === user.id)
            .map(({ transaction_count, user_id, ...account }) => ({
              ...account,
              _count: { transactions: transaction_count },
            }));
        }
        return Promise.resolve(projected);
      }),
      findMany: jest.fn(({ select }: any) =>
        Promise.resolve(seedUsers.map((user) => project(user, select))),
      ),
    },
    account: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          seedAccounts
            .filter(
              (account) =>
                where?.user_id === undefined ||
                account.user_id === where.user_id,
            )
            .map(({ transaction_count, ...account }) => account),
        ),
      ),
      findUnique: jest.fn(({ where }: any) => {
        const account = seedAccounts.find(
          (candidate) => candidate.id === where.id,
        );
        if (!account) return Promise.resolve(null);
        const { transaction_count, ...rest } = account;
        return Promise.resolve(rest);
      }),
    },
    category: {
      findMany: jest.fn(() =>
        Promise.resolve([
          {
            id: 5,
            name: 'Groceries',
            type: 'expense',
            _count: { transactions: 4 },
          },
        ]),
      ),
      create: jest.fn(({ data }: any) => Promise.resolve({ id: 11, ...data })),
    },
    transaction: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
  };
}

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(createPrismaMock())
    .compile();

  return configureApp(moduleRef.createNestApplication()).init();
}

describe('FinTrack API (e2e)', () => {
  let app: INestApplication;
  let http: string;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-not-used-in-production';
    // High enough that the ordinary login tests below never trip it; the rate
    // limit gets its own app instance at the bottom of this file.
    process.env.LOGIN_RATE_LIMIT = '100';

    app = await createApp();
    http = app.getHttpServer();

    const jwt = app.get(JwtService);
    userToken = jwt.sign({ sub: 2, email: 'budi@example.com', role: 'user' });
    adminToken = jwt.sign({
      sub: 1,
      email: 'admin@fintrack.test',
      role: 'admin',
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('public routes', () => {
    it('GET / returns the service index without a token', async () => {
      const response = await request(http).get('/').expect(200);
      expect(response.body.name).toBe('FinTrack API');
    });

    it('GET /health reports the database', async () => {
      const response = await request(http).get('/health').expect(200);
      expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
    });
  });

  describe('security headers (helmet)', () => {
    it('sets the hardening headers and hides the stack', async () => {
      const response = await request(http).get('/').expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('request-logging middleware', () => {
    it('logs method, path, status and duration for every request', async () => {
      const logged: string[] = [];
      const spy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(
          (message: unknown) => void logged.push(String(message)),
        );

      await request(http).get('/health').expect(200);
      // res.on('finish') can land a tick after supertest resolves.
      await new Promise((resolve) => setImmediate(resolve));
      spy.mockRestore();

      expect(
        logged.some((line) => /^GET \/health 200 [\d.]+ms/.test(line)),
      ).toBe(true);
    });
  });

  describe('authentication', () => {
    it('rejects an unauthenticated request to a protected route', async () => {
      await request(http).get('/accounts').expect(401);
    });

    it('rejects a malformed token', async () => {
      await request(http)
        .get('/accounts')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('400s on a malformed login body', async () => {
      const response = await request(http)
        .post('/auth/login')
        .send({ email: 'not-an-email', password: '' })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          'email must be a valid email address',
          'password must not be empty',
        ]),
      );
    });

    it('gives the same 401 for an unknown email as for a wrong password', async () => {
      const unknown = await request(http)
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'Password123!' })
        .expect(401);

      const wrongPassword = await request(http)
        .post('/auth/login')
        .send({ email: 'budi@example.com', password: 'WrongPassword1' })
        .expect(401);

      expect(unknown.body.message).toBe('Invalid email or password');
      expect(wrongPassword.body.message).toBe('Invalid email or password');
    });

    it('issues a token on valid credentials and never returns the hash', async () => {
      const response = await request(http)
        .post('/auth/login')
        .send({ email: 'budi@example.com', password: 'Password123!' })
        .expect(200);

      expect(response.body.access_token).toEqual(expect.any(String));
      expect(response.body.token_type).toBe('Bearer');
      expect(response.body.user).not.toHaveProperty('password');
      expect(JSON.stringify(response.body)).not.toContain('$2b$');
    });

    it('refuses a self-registration that tries to set a role', async () => {
      const response = await request(http)
        .post('/auth/register')
        .send({
          name: 'Sneaky',
          email: 'sneaky@example.com',
          password: 'Password123!',
          role: 'admin',
        })
        .expect(400);

      expect(response.body.message).toContain('property role should not exist');
    });

    it('GET /auth/me returns the caller without a password hash', async () => {
      const response = await request(http)
        .get('/auth/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.email).toBe('budi@example.com');
      expect(response.body).not.toHaveProperty('password');
      expect(response.body.accounts[0]).toMatchObject({
        id: 4,
        transaction_count: 7,
      });
    });
  });

  describe('ownership enforcement', () => {
    it('lists only the caller own accounts', async () => {
      const response = await request(http)
        .get('/accounts')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        id: 4,
        user_id: 2,
        balance: 16180000,
      });
    });

    it('403s when a logged-in user guesses another user account id', async () => {
      const response = await request(http)
        .get('/accounts/7')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.message).toBe(
        'You do not have access to this account',
      );
    });

    it('404s for an account that does not exist', async () => {
      await request(http)
        .get('/accounts/9999')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });

    it('403s when a user reads another user record', async () => {
      await request(http)
        .get('/users/1')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('role-based access control', () => {
    it('lets any authenticated user read categories', async () => {
      await request(http)
        .get('/categories')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('403s when a non-admin creates a category', async () => {
      const response = await request(http)
        .post('/categories')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Hobbies', type: 'expense' })
        .expect(403);

      expect(response.body.message).toBe('This action requires the admin role');
    });

    it('allows an admin to create a category', async () => {
      const response = await request(http)
        .post('/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Hobbies', type: 'expense' })
        .expect(201);

      expect(response.body).toMatchObject({ name: 'Hobbies', type: 'expense' });
    });

    it('403s when a non-admin lists all users', async () => {
      await request(http)
        .get('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('never includes a password hash in the admin user list', async () => {
      const response = await request(http)
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('$2b$');
      expect(response.body[0]).not.toHaveProperty('password');
    });
  });

  describe('validation', () => {
    it('rejects an unexpected property (forbidNonWhitelisted)', async () => {
      const response = await request(http)
        .post('/accounts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Rekening Baru', type: 'bank', balance: 999999 })
        .expect(400);

      expect(response.body.message).toContain(
        'property balance should not exist',
      );
    });

    it('rejects an account type outside the CHECK constraint', async () => {
      const response = await request(http)
        .post('/accounts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Crypto', type: 'crypto' })
        .expect(400);

      expect(response.body.message).toContain(
        'type must be one of: cash, bank, e-wallet',
      );
    });

    it('reports every broken rule on a transaction at once', async () => {
      const response = await request(http)
        .post('/transactions')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          account_id: 4,
          category_id: 5,
          type: 'purchase',
          amount: -5,
          transaction_date: '2026-02-30',
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          'type must be one of: income, expense, transfer',
          'amount must be greater than 0',
          'transaction_date must be a real calendar date in YYYY-MM-DD format',
        ]),
      );
    });

    it('rejects an amount with more precision than NUMERIC(12,2)', async () => {
      const response = await request(http)
        .post('/transactions')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          account_id: 4,
          category_id: 5,
          type: 'expense',
          amount: 10.555,
          transaction_date: '2026-08-01',
        })
        .expect(400);

      expect(response.body.message).toContain(
        'amount must be a number with at most 2 decimal places',
      );
    });

    it('validates query parameters too', async () => {
      const response = await request(http)
        .get('/transactions?type=bogus')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);

      expect(response.body.message).toContain(
        'type must be one of: income, expense, transfer',
      );
    });

    it('404s on a non-numeric :id rather than reaching the service', async () => {
      await request(http)
        .get('/accounts/abc')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });
  });
});

describe('login rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-not-used-in-production';
    // Own app instance, because the throttler storage is per-application.
    process.env.LOGIN_RATE_LIMIT = '3';
    process.env.LOGIN_RATE_TTL_SECONDS = '60';
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
    process.env.LOGIN_RATE_LIMIT = '100';
  });

  it('429s after too many login attempts, and leaves other routes alone', async () => {
    const http = app.getHttpServer();
    const attempt = () =>
      request(http)
        .post('/auth/login')
        .send({ email: 'budi@example.com', password: 'nope' });

    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);

    // The limit is scoped to the login route, so ordinary traffic is unaffected.
    await request(http).get('/').expect(200);
    await request(http).get('/health').expect(200);
  });
});
