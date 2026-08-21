import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccountsModule } from './accounts/accounts.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { CoreModule } from './common/core.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Real environment variables win over .env, which is what lets Render or
      // Railway inject DATABASE_URL and JWT_SECRET without a file on disk.
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),

    /**
     * A single named throttler, 'login', configured from the environment.
     *
     * ThrottlerGuard is NOT registered as an APP_GUARD here. It is attached to
     * POST /auth/login only (see AuthController), so a limit tight enough to
     * stop password guessing does not also throttle a user who is just adding
     * transactions quickly.
     */
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'login',
            ttl:
              Number(config.get<string>('LOGIN_RATE_TTL_SECONDS') ?? 60) * 1000,
            limit: Number(config.get<string>('LOGIN_RATE_LIMIT') ?? 5),
          },
        ],
      }),
    }),

    PrismaModule,
    CoreModule,

    AuthModule,
    UsersModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    /**
     * Default-deny authentication and authorisation, applied to every route in
     * the application. Order matters: APP_GUARD providers run in registration
     * order, so JwtAuthGuard populates request.user before RolesGuard reads its
     * role. Routes opt out with @Public(); admin-only routes add @Roles().
     */
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  /**
   * Registers the request logger for every method on every path - the global
   * middleware registration Part 4 asks for. Done with configure() rather than
   * app.use() in main.ts so the middleware stays a proper Nest provider with
   * dependency injection available to it.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
