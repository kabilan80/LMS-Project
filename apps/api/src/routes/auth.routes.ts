import { Router } from 'express';
import { changePasswordSchema, loginSchema, registerSchema } from '@lms/shared';
import * as auth from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { asyncHandler } from '../middleware/errors';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';

export const authRoutes = Router();

authRoutes.post('/register', registerLimiter, validateBody(registerSchema), asyncHandler(auth.register));
authRoutes.post('/login', loginLimiter, validateBody(loginSchema), asyncHandler(auth.login));
// /me and /change-password work even while mustChangePassword is true.
authRoutes.get('/me', authenticate, asyncHandler(auth.getCurrentUser));
authRoutes.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  asyncHandler(auth.changePassword),
);
