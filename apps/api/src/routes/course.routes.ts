import { Router } from 'express';
import {
  Role,
  courseInputSchema,
  lessonInputSchema,
  moduleInputSchema,
  quizInputSchema,
  courseAssignmentInputSchema,
  rejectCourseSchema,
  reorderSchema,
  updateCourseSchema,
  updateLessonSchema,
} from '@lms/shared';
import * as courseAssignments from '../controllers/courseAssignments.controller';
import * as courses from '../controllers/courses.controller';
import * as curriculum from '../controllers/curriculum.controller';
import * as plans from '../controllers/plans.controller';
import * as quizzes from '../controllers/quizzes.controller';
import { authenticate, requirePasswordChanged, requirePermission, requireRole } from '../middleware/authenticate';
import { asyncHandler } from '../middleware/errors';
import { validateBody } from '../middleware/validate';

export const courseRoutes = Router();

// Per-route guards (not router.use) so other routers can add routes for other roles later.
const anyUser = [authenticate, requirePasswordChanged];
const staff = [...anyUser, requireRole(Role.ADMIN, Role.INSTRUCTOR)];
const adminOnly = [...anyUser, requireRole(Role.ADMIN)];
const canEdit = [...staff, requirePermission('course.edit.own')];

// Reading: role decides what comes back (students: published only; instructors: own; admin: all).
courseRoutes.get('/courses', ...anyUser, asyncHandler(courses.listCourses));
courseRoutes.get('/courses/categories', ...anyUser, asyncHandler(courses.listCategories));
courseRoutes.get('/courses/options', ...staff, asyncHandler(plans.listCourseOptions));
courseRoutes.get('/courses/:id', ...anyUser, asyncHandler(courses.getCourse));

courseRoutes.post('/courses', ...staff, requirePermission('course.create'), validateBody(courseInputSchema), asyncHandler(courses.createCourse));
courseRoutes.patch('/courses/:id', ...canEdit, validateBody(updateCourseSchema), asyncHandler(courses.updateCourse));
courseRoutes.post('/courses/:id/submit', ...staff, requirePermission('course.submit'), asyncHandler(courses.submitCourse));

courseRoutes.post('/courses/:id/publish', ...adminOnly, asyncHandler(courses.publishCourse));
courseRoutes.post('/courses/:id/unpublish', ...adminOnly, asyncHandler(courses.unpublishCourse));

courseRoutes.post('/courses/:id/approve', ...adminOnly, asyncHandler(courses.approveCourse));
courseRoutes.post('/courses/:id/reject', ...adminOnly, validateBody(rejectCourseSchema), asyncHandler(courses.rejectCourse));

courseRoutes.post('/courses/:id/modules', ...canEdit, validateBody(moduleInputSchema), asyncHandler(curriculum.createModule));
courseRoutes.post('/courses/:id/modules/reorder', ...canEdit, validateBody(reorderSchema), asyncHandler(curriculum.reorderModules));
courseRoutes.patch('/modules/:id', ...canEdit, validateBody(moduleInputSchema), asyncHandler(curriculum.updateModule));
courseRoutes.delete('/modules/:id', ...canEdit, asyncHandler(curriculum.deleteModule));

courseRoutes.post('/modules/:id/lessons', ...canEdit, validateBody(lessonInputSchema), asyncHandler(curriculum.createLesson));
courseRoutes.post('/modules/:id/lessons/reorder', ...canEdit, validateBody(reorderSchema), asyncHandler(curriculum.reorderLessons));
courseRoutes.patch('/lessons/:id', ...canEdit, validateBody(updateLessonSchema), asyncHandler(curriculum.updateLesson));
courseRoutes.delete('/lessons/:id', ...canEdit, asyncHandler(curriculum.deleteLesson));

courseRoutes.put('/courses/:id/quiz', ...canEdit, validateBody(quizInputSchema), asyncHandler(quizzes.saveQuiz));

// Assignments set for a course (like modules): the instructor/admin adds them, students submit a PDF for each one.
courseRoutes.post('/courses/:id/assignments', ...canEdit, validateBody(courseAssignmentInputSchema), asyncHandler(courseAssignments.createCourseAssignment));
courseRoutes.post('/courses/:id/assignments/reorder', ...canEdit, validateBody(reorderSchema), asyncHandler(courseAssignments.reorderCourseAssignments));
courseRoutes.patch('/course-assignments/:id', ...canEdit, validateBody(courseAssignmentInputSchema), asyncHandler(courseAssignments.updateCourseAssignment));
courseRoutes.delete('/course-assignments/:id', ...canEdit, asyncHandler(courseAssignments.deleteCourseAssignment));
