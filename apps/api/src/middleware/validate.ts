import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

/** Parses and replaces req.body with the validated value. Errors go to the error handler (422). */
export const validateBody =
  (schema: ZodTypeAny): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };
