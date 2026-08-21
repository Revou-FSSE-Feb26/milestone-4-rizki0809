import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

/**
 * Everything applied to the Nest application after it is created.
 *
 * Lives here rather than inline in main.ts so the e2e tests can boot the app
 * through exactly the same configuration. A security header or validation rule
 * that only exists in main.ts is a rule no test ever checks.
 */

/**
 * Turns the CORS_ORIGINS environment variable into a CORS origin setting.
 *
 * The list is explicit on purpose. `origin: true` reflects whatever Origin the
 * browser sent, which combined with credentials is the misconfiguration that
 * lets any site call this API as a logged-in user. '*' stays available for
 * local work and is refused in production.
 */
export function resolveCorsOrigins(config: ConfigService): string[] | boolean {
  const raw = config.get<string>('CORS_ORIGINS')?.trim();
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  if (!raw) {
    return isProduction ? [] : true;
  }

  if (raw === '*') {
    if (isProduction) {
      throw new Error(
        'CORS_ORIGINS="*" is not allowed in production. List the allowed origins explicitly.',
      );
    }
    return true;
  }

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function configureApp(app: INestApplication): INestApplication {
  const config = app.get(ConfigService);

  /**
   * helmet sets the security response headers Express omits by default:
   * X-Content-Type-Options, Referrer-Policy, Strict-Transport-Security and
   * friends. It also removes X-Powered-By, which otherwise advertises the
   * stack to anyone scanning.
   */
  app.use(helmet());

  app.enableCors({
    origin: resolveCorsOrigins(config),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  });

  /**
   * One pipe, applied to every DTO in the application.
   *
   *  whitelist            strips properties with no validation decorator, so a
   *                       stray field can never reach Prisma.
   *  forbidNonWhitelisted turns that strip into a 400. Silently dropping
   *                       {"balance": 999999} would let a client believe it had
   *                       set an opening balance.
   *  transform            hands the handler a real DTO instance rather than a
   *                       plain object, which is what makes the @Type
   *                       conversions on query parameters work.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Lets Nest run onModuleDestroy, so Prisma closes its connection pool
  // cleanly when the host sends SIGTERM during a redeploy.
  app.enableShutdownHooks();

  return app;
}
