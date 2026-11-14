import { Router } from 'express';
import { Role, sendDoubtSchema } from '@lms/shared';
import * as doubts from '../controllers/doubts.controller';
import { authenticate, requirePasswordChanged, requireRole } from '../middleware/authenticate';
import { asyncHandler } from '../middleware/errors';
import { validateBody } from '../middleware/validate';

export const doubtRoutes = Router();

// Students and instructors only. The admin does not take part in doubts.
const participant = [authenticate, requirePasswordChanged, requireRole(Role.STUDENT, Role.INSTRUCTOR)];

doubtRoutes.get('/doubts/contacts', ...participant, asyncHandler(doubts.listDoubtContacts));
doubtRoutes.get('/doubts/messages', ...participant, asyncHandler(doubts.getDoubtThread));
doubtRoutes.post('/doubts/messages', ...participant, validateBody(sendDoubtSchema), asyncHandler(doubts.sendDoubtMessage));
