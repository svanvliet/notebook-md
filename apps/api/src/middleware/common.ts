import type { Request, Response, NextFunction } from 'express';
import { generateCorrelationId, logger } from '../lib/logger.js';

// Augment Express Request with correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

/** Attach a correlation ID to every request */
export function correlationMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.correlationId = (req.headers['x-correlation-id'] as string) ?? generateCorrelationId();
  next();
}

/** Log every request with correlation ID */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode}`, {
      correlationId: req.correlationId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
}

/** Global error handler — return correlation ID, never stack traces */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  logger.error(err.message, {
    correlationId: req.correlationId,
    stack: err.stack,
  });

  const status = (err as Error & { status?: number }).status ?? 500;
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message,
    correlationId: req.correlationId,
  });
}
