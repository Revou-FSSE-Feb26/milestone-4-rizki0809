import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * The single PrismaClient for the whole process.
 *
 * PrismaClient owns a connection pool, so instantiating one per service would
 * multiply the pool and exhaust the free-tier connection limit on Supabase or
 * Neon. Wrapping it in an @Injectable and exporting it from a @Global module
 * means Nest hands every service the same instance and manages its lifecycle.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Query logging is useful while developing but would leak row data into
      // production logs, so it stays off outside development.
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL');
  }
}
