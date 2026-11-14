import express, { Router } from 'express';
import { MAX_ASSIGNMENT_BYTES, Role, acceptAssignmentSchema, rejectAssignmentSchema } from '@lms/shared';
import * as courseAssignments from '../controllers/courseAssignments.controller';
import * as assignments from '../controllers/assignments.controller';
import { authenticate, requirePasswordChanged, requirePermission, requireRole } from '../middleware/authenticate';
import { asyncHandler } from '../middleware/errors';
import { validateBody } from '../middleware/validate';

export const assignmentRoutes = Router();

const anyUser = [authenticate, requirePasswordChanged];
const student = [...anyUser, requireRole(Role.STUDENT), requirePermission('course.learn')];
const instructor = [...anyUser, requireRole(Role.INSTRUCTOR), requirePermission('student.view.assigned')];
// Students and instructors only; the admin has no assignments page and no access.
const participant = [...anyUser, requireRole(Role.STUDENT, Role.INSTRUCTOR)];

// The PDF is the raw request body (no extra upload library). Anything over 5 MB is refused with 413.
const pdfBody = express.raw({ type: 'application/pdf', limit: MAX_ASSIGNMENT_BYTES });

// The assignments the instructor set for the student's courses (must be before /assignments/:id routes).
assignmentRoutes.get('/assignments/tasks', ...student, asyncHandler(courseAssignments.listMyAssignmentTasks));
assignmentRoutes.post('/assignments', ...student, pdfBody, asyncHandler(assignments.submitAssignment));
assignmentRoutes.get('/assignments', ...participant, asyncHandler(assignments.listAssignments));
assignmentRoutes.get('/assignments/:id/file', ...participant, asyncHandler(assignments.downloadAssignment));
assignmentRoutes.post('/assignments/:id/verify', ...instructor, asyncHandler(assignments.verifyAssignment));
assignmentRoutes.post('/assignments/:id/accept', ...instructor, validateBody(acceptAssignmentSchema), asyncHandler(assignments.acceptAssignment));
assignmentRoutes.post('/assignments/:id/reject', ...instructor, validateBody(rejectAssignmentSchema), asyncHandler(assignments.rejectAssignment));
