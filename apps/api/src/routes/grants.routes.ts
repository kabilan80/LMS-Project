import { Router } from 'express';
import { Role, createGrantSchema } from '@lms/shared';
import * as grants from '../controllers/grants.controller';
import { authenticate, requirePasswordChanged, requirePermission, requireRole } from '../middleware/authenticate';
import { asyncHandler } from '../middleware/errors';
import { validateBody } from '../middleware/validate';

export const grantRoutes = Router();

// Admin always passes the permission check; instructors need grant.create (on by default) and may only
// work with the students assigned to them (checked in the controller).
const canGrant = [authenticate, requirePasswordChanged, requireRole(Role.ADMIN, Role.INSTRUCTOR), requirePermission('grant.create')];

grantRoutes.get('/grants', ...canGrant, asyncHandler(grants.listGrants));
grantRoutes.get('/grants/students', ...canGrant, asyncHandler(grants.grantableStudents));
grantRoutes.post('/grants', ...canGrant, validateBody(createGrantSchema), asyncHandler(grants.createGrant));
grantRoutes.post('/grants/:id/revoke', ...canGrant, asyncHandler(grants.revokeGrant));
