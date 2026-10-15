/**
 * Centralised error handler middleware.
 * Formats all errors into a consistent JSON response.
 * Never leaks stack traces to clients in production.
 */

import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): any {
  const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

  if (process.env.NODE_ENV !== 'test') {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
    if (isDev && err.stack) console.error(err.stack);
  }

  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON payload in request body' });
  }

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors ? err.errors.map((e: any) => ({ field: e.path.join('.'), message: e.message })) : err.message,
    });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  const body = {
    error: message,
    ...(isDev && { stack: err.stack }),
  };

  res.status(status).json(body);
}

export function createError(status: number, message: string): Error {
  const err: any = new Error(message);
  err.status = status;
  return err;
}
