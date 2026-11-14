import jwt, { type SignOptions } from 'jsonwebtoken';
import type { AuthTokenPayload, Role } from '@lms/shared';
import { env } from '../config/env';

export function signToken(userId: number, role: Role): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign({ sub: String(userId), role }, env.JWT_SECRET, options);
}

export function verifyToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === 'string' || !decoded.sub || typeof decoded['role'] !== 'string') {
    throw new Error('Malformed token');
  }
  return { sub: Number(decoded.sub), role: decoded['role'] as Role };
}
