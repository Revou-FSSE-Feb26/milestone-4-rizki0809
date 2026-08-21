import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  /** Service index. Public, so a deployment can be smoke-tested with a GET. */
  getApiInfo() {
    return {
      name: 'FinTrack API',
      description:
        'Personal finance tracker: accounts, categories and transactions.',
      version: '1.0.0',
      docs: {
        smoke_test: 'docs/api-smoke-test.md',
        postman: 'docs/fintrack.postman_collection.json',
      },
      endpoints: {
        auth: ['POST /auth/register', 'POST /auth/login', 'GET /auth/me'],
        users: [
          'POST /users',
          'GET /users',
          'GET /users/:id',
          'PATCH /users/:id',
          'DELETE /users/:id',
        ],
        accounts: [
          'POST /accounts',
          'GET /accounts',
          'GET /accounts/:id',
          'GET /accounts/:id/transactions',
          'PATCH /accounts/:id',
          'DELETE /accounts/:id',
          'POST /accounts/:id/recalculate-balance',
        ],
        categories: [
          'POST /categories',
          'GET /categories',
          'GET /categories/:id',
          'PATCH /categories/:id',
          'DELETE /categories/:id',
        ],
        transactions: [
          'POST /transactions',
          'GET /transactions',
          'GET /transactions/:id',
          'PATCH /transactions/:id',
          'DELETE /transactions/:id',
        ],
      },
    };
  }

  /**
   * Liveness plus a real database round trip. A health check that only proves
   * the process is up would report "ok" while every request 500s on a dropped
   * connection - which is exactly the free-tier failure mode worth catching.
   */
  async getHealth() {
    const startedAt = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        database: 'up',
        latency_ms: Date.now() - startedAt,
        uptime_seconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        status: 'degraded',
        database: 'down',
        latency_ms: Date.now() - startedAt,
        uptime_seconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      };
    }
  }
}
