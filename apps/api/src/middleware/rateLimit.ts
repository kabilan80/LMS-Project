import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

// Only the automated browser tests switch this on (DISABLE_RATE_LIMITS=true); never set it in production.
const skip = () => env.DISABLE_RATE_LIMITS;

const message = {
  error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
};

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

/** Starting or confirming a payment: generous for real use, tight enough to stop scripted abuse. */
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

/** Public certificate checks: stops code guessing, still fine for people verifying a few certificates. */
export const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

/** The public landing page: generous, it is read-only and cached for a minute. */
export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  skip,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});
