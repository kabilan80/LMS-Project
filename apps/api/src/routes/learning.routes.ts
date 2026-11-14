import { Router } from 'express';
import { Role, progressSchema, submitQuizSchema } from '@lms/shared';
import * as certificates from '../controllers/certificates.controller';
import * as learning from '../controllers/learning.controller';
import * as attempts from '../controllers/quizAttempts.controller';
import { authenticate, requirePasswordChanged, requirePermission, requireRole } from '../middleware/authenticate';
import { asyncHandler } from '../middleware/errors';
import { validateBody } from '../middleware/validate';

export const learningRoutes = Router();

// Per-route guards, same style as the other routers.
const anyUser = [authenticate, requirePasswordChanged];
const student = [...anyUser, requireRole(Role.STUDENT)];
// Students need the course.learn permission (admin can switch it off in Roles & permissions).
const learner = [...student, requirePermission('course.learn')];

learningRoutes.get('/me/courses', ...learner, asyncHandler(learning.listMyCourses));
learningRoutes.get('/me/students', ...anyUser, requireRole(Role.INSTRUCTOR), requirePermission('student.view.assigned'), asyncHandler(learning.listMyStudents));

learningRoutes.get('/courses/:id/learn', ...learner, asyncHandler(learning.getLearnState));
learningRoutes.get('/lessons/:id', ...learner, asyncHandler(learning.getLesson));
learningRoutes.put('/lessons/:id/progress', ...learner, validateBody(progressSchema), asyncHandler(learning.saveProgress));

learningRoutes.post('/courses/:id/quiz/start', ...learner, asyncHandler(attempts.startQuiz));
learningRoutes.post('/quiz-attempts/:id/submit', ...learner, validateBody(submitQuizSchema), asyncHandler(attempts.submitQuizAttempt));
learningRoutes.get('/quiz-attempts/:id', ...learner, asyncHandler(attempts.getQuizAttempt));

learningRoutes.get('/certificates', ...student, requirePermission('certificate.view'), asyncHandler(certificates.listCertificates));
// Before /certificates/:id/pdf so "progress" is never read as an id.
learningRoutes.get('/certificates/progress', ...student, requirePermission('certificate.view'), asyncHandler(certificates.listCertificateProgress));
// Owner or admin; the controller returns 404 for anyone else.
learningRoutes.get('/certificates/:id/pdf', ...anyUser, asyncHandler(certificates.downloadCertificatePdf));
