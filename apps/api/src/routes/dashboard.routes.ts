import { Router } from 'express';
import { Role } from '@lms/shared';
import * as dashboard from '../controllers/dashboard.controller';
import * as notifications from '../controllers/notifications.controller';
import { authenticate, requirePasswordChanged, requireRole } from '../middleware/authenticate';
import { asyncHandler } from '../middleware/errors';

export const dashboardRoutes = Router();

// Per-route guards, same style as the other routers. Each dashboard is only for its own role.
const anyUser = [authenticate, requirePasswordChanged];

dashboardRoutes.get('/dashboard/student', ...anyUser, requireRole(Role.STUDENT), asyncHandler(dashboard.getStudentDashboard));
dashboardRoutes.get('/dashboard/instructor', ...anyUser, requireRole(Role.INSTRUCTOR), asyncHandler(dashboard.getInstructorDashboard));
dashboardRoutes.get('/dashboard/admin', ...anyUser, requireRole(Role.ADMIN), asyncHandler(dashboard.getAdminDashboard));

// Notifications belong to the signed-in user; every query filters by their id.
dashboardRoutes.get('/notifications', ...anyUser, asyncHandler(notifications.listNotifications));
dashboardRoutes.post('/notifications/read-all', ...anyUser, asyncHandler(notifications.markAllNotificationsRead));
dashboardRoutes.patch('/notifications/:id/read', ...anyUser, asyncHandler(notifications.markNotificationRead));
