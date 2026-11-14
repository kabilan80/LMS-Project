import { Router } from 'express';
import {
  Role,
  assignManySchema,
  assignInstructorSchema,
  certificateTemplateSchema,
  createUserSchema,
  homeCourseSchema,
  updatePermissionsSchema,
  updateUserSchema,
} from '@lms/shared';
import * as instructors from '../controllers/instructors.controller';
import * as certificates from '../controllers/certificates.controller';
import * as home from '../controllers/home.controller';
import * as permissions from '../controllers/permissions.controller';
import * as users from '../controllers/users.controller';
import { authenticate, requirePasswordChanged, requireRole } from '../middleware/authenticate';
import { asyncHandler } from '../middleware/errors';
import { validateBody } from '../middleware/validate';

/** Everything here is admin-only: login, password already changed, role ADMIN. The guard is per route
 * (not router.use) so it never blocks routes that other routers add later for other roles. */
export const adminRoutes = Router();
const guard = [authenticate, requirePasswordChanged, requireRole(Role.ADMIN)];

adminRoutes.get('/users', ...guard, asyncHandler(users.listUsers));
adminRoutes.post('/users', ...guard, validateBody(createUserSchema), asyncHandler(users.createUser));
adminRoutes.patch('/users/:id', ...guard, validateBody(updateUserSchema), asyncHandler(users.updateUser));
adminRoutes.post('/users/:id/reset-password', ...guard, asyncHandler(users.resetUserPassword));

adminRoutes.patch('/students/:id/instructor', ...guard, validateBody(assignInstructorSchema), asyncHandler(instructors.assignStudentToInstructor));
adminRoutes.post('/students/assign-bulk', ...guard, validateBody(assignManySchema), asyncHandler(instructors.assignStudentsToInstructor));
adminRoutes.get('/instructors/load', ...guard, asyncHandler(instructors.listInstructors));

adminRoutes.get('/permissions', ...guard, asyncHandler(permissions.getPermissions));
adminRoutes.patch('/permissions', ...guard, validateBody(updatePermissionsSchema), asyncHandler(permissions.updatePermissions));

adminRoutes.get('/admin/certificates', ...guard, asyncHandler(certificates.listAdminCertificates));
adminRoutes.get('/admin/certificate-template', ...guard, asyncHandler(certificates.getCertificateTemplate));
adminRoutes.put('/admin/certificate-template', ...guard, validateBody(certificateTemplateSchema), asyncHandler(certificates.updateCertificateTemplate));

adminRoutes.get('/home-courses', ...guard, asyncHandler(home.listHomeCourses));
adminRoutes.patch('/home-courses/:id', ...guard, validateBody(homeCourseSchema), asyncHandler(home.setHomeCourseShown));
