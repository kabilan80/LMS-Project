import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import type { ApiError } from '@lms/shared';
import { log } from '../lib/log';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, 'BAD_REQUEST', msg);
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'You do not have permission to do this') =>
  new HttpError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Not found') => new HttpError(404, 'NOT_FOUND', msg);
export const conflict = (msg: string) => new HttpError(409, 'CONFLICT', msg);

/** Lets async controllers throw; Express 4 does not catch rejected promises by itself. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    // Dev log: which controller function is running, who called it and with what data.
    // (Anonymous inline handlers, like the sign-in check in authenticate, are skipped to keep the log readable.)
    if (fn.name) {
      log('API', `${req.method} ${req.originalUrl} -> ${fn.name}`, {
        user: req.auth ? { id: req.auth.id, role: req.auth.role } : 'anonymous',
        params: req.params,
        body: req.body,
      });
    }
    fn(req, res, next).catch(next);
  };

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(notFound('Route not found'));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  log('API-ERROR', `${req.method} ${req.originalUrl} -> ${err instanceof HttpError ? `${err.status} ${err.code}: ${err.message}` : err instanceof ZodError ? '422 validation' : 'failed'}`);
  if (err instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || 'form';
      (details[key] ??= []).push(issue.message);
    }
    const body: ApiError = { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details } };
    res.status(422).json(body);
    return;
  }
  // body-parser refuses a body bigger than the route allows (the 5 MB PDF limit).
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large') {
    const body: ApiError = { error: { code: 'TOO_LARGE', message: 'The PDF must be 5 MB or smaller' } };
    res.status(413).json(body);
    return;
  }
  if (err instanceof HttpError) {
    const body: ApiError = { error: { code: err.code, message: err.message } };
    res.status(err.status).json(body);
    return;
  }
  console.error(err);
  const body: ApiError = { error: { code: 'INTERNAL', message: 'Something went wrong' } };
  res.status(500).json(body);
};
