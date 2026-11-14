import type { RequestHandler } from 'express';
import type { Role } from '@lms/shared';
import { verifyToken } from '../lib/jwt';
import { prisma } from '../config/prisma';
import { asyncHandler, forbidden, unauthorized } from './errors';

export interface AuthContext {
  id: number;
  role: Role;
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Verifies the JWT, then re-reads the user so disabled accounts and role changes
 * take effect immediately. Role and id always come from here, never from the request body.
 */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();

  let payload;
  try {
    payload = verifyToken(header.slice(7));
  } catch {
    throw unauthorized('Session expired. Please sign in again.');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, active: true, mustChangePassword: true },
  });
  if (!user || !user.active) throw unauthorized('Account is not available');

  req.auth = { id: user.id, role: user.role, mustChangePassword: user.mustChangePassword };
  next();
});

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden());
    next();
  };

/** Blocks everything except change-password until a new instructor sets their own password. */
export const requirePasswordChanged: RequestHandler = (req, _res, next) => {
  if (req.auth?.mustChangePassword) {
    return next(forbidden('You must change your temporary password first'));
  }
  next();
};

/** Feature gate controlled by the Roles & permissions matrix. ADMIN always passes. */
export const requirePermission = (key: string): RequestHandler =>
  asyncHandler(async (req, _res, next) => {
    if (!req.auth) throw unauthorized();
    if (req.auth.role === 'ADMIN') return next();
    const row = await prisma.rolePermission.findUnique({
      where: { role_permissionKey: { role: req.auth.role, permissionKey: key } },
    });
    if (!row?.allowed) throw forbidden();
    next();
  });
