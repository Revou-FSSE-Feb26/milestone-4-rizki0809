import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  const config = app.get(ConfigService);

  const port = Number(config.get<string>('PORT') ?? 3000);

  // 0.0.0.0, not localhost: Render, Railway and Fly route to the container's
  // external interface, and a server bound to loopback is unreachable there.
  await app.listen(port, '0.0.0.0');

  logger.log(
    `FinTrack API listening on port ${port} (${config.get<string>('NODE_ENV') ?? 'development'})`,
  );
}

/**
 * Startup deliberately fails fast rather than serving a half-working API: an
 * unreachable database or a missing JWT_SECRET should break the deploy visibly,
 * not turn into 500s once traffic arrives. The catch is only here to say which
 * of those it was, instead of printing an unhandled rejection.
 */
bootstrap().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error);

  logger.error(`FinTrack API failed to start: ${reason}`);

  if (reason.includes("Can't reach database server")) {
    logger.error(
      'Check DATABASE_URL, and that the database is running and reachable.',
    );
  }

  process.exit(1);
});
