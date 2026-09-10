import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Noto‘g‘ri so‘rov', details?: unknown) {
    return new AppError(400, 'bad_request', message, details);
  }
  static unauthorized(message = 'Avtorizatsiya talab qilinadi') {
    return new AppError(401, 'unauthorized', message);
  }
  static forbidden(message = 'Ruxsat yo‘q', details?: unknown) {
    return new AppError(403, 'forbidden', message, details);
  }
  static notFound(message = 'Topilmadi') {
    return new AppError(404, 'not_found', message);
  }
  static conflict(message = 'Konflikt') {
    return new AppError(409, 'conflict', message);
  }
  static limit(message = 'Tarif limiti', details?: unknown) {
    return new AppError(402, 'plan_limit', message, details);
  }
  static tooMany(message = 'Juda ko‘p so‘rov') {
    return new AppError(429, 'too_many_requests', message);
  }
  static internal(message = 'Ichki xatolik', details?: unknown) {
    return new AppError(500, 'internal_error', message, details);
  }
}

/** async route handler'larni o'rab, xatolarni next()'ga uzatadi */
export const ah =
  <T extends RequestHandler>(fn: T): RequestHandler =>
  (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Endpoint topilmadi' } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Ma’lumotlar noto‘g‘ri',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Noma’lum xatolik';
  // eslint-disable-next-line no-console
  console.error('[api] unhandled error:', err);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: process.env.NODE_ENV === 'production' ? 'Ichki xatolik' : message,
    },
  });
}
