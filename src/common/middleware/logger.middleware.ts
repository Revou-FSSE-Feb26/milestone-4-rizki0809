import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Request-logging middleware, registered globally from AppModule.configure().
 *
 * Middleware runs before the guards, so the status code and duration are not
 * known yet at call time. Instead we start a timer and hang a listener on the
 * response's 'finish' event, which fires once the last byte is flushed - by
 * which point the status code is final and (for authenticated routes) the
 * guard has already put the user on the request.
 *
 * Nothing from the request body is logged, so passwords never reach the log.
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    const { method, originalUrl } = req;

    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const { statusCode } = res;
      const size = res.get('content-length') ?? '0';
      const user = req.user as AuthenticatedUser | undefined;
      const actor = user ? `user#${user.id}` : 'anonymous';

      const line = `${method} ${originalUrl} ${statusCode} ${elapsedMs.toFixed(1)}ms ${size}b [${actor}]`;

      if (statusCode >= 500) {
        this.logger.error(line);
      } else if (statusCode >= 400) {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
    });

    next();
  }
}
