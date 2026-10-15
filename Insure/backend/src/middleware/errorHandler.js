/**
 * Centralised error handler middleware.
 * Formats all errors into a consistent JSON response.
 * Never leaks stack traces to clients in production.
 */

'use strict';

function errorHandler(err, req, res, _next) {
  const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

  // Log the error server-side (safe — no secrets)
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
    if (isDev && err.stack) console.error(err.stack);
  }

  // Handle malformed JSON body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON payload in request body' });
  }

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors ? err.errors.map(e => ({ field: e.path.join('.'), message: e.message })) : err.message,
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

function createError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { errorHandler, createError };

