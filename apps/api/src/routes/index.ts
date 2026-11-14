import { Router } from 'express';
import { adminRoutes } from './admin.routes';
import { authRoutes } from './auth.routes';
import { commerceRoutes } from './commerce.routes';
import { courseRoutes } from './course.routes';
import { grantRoutes } from './grants.routes';
import { dashboardRoutes } from './dashboard.routes';
import { assignmentRoutes } from './assignments.routes';
import { doubtRoutes } from './doubts.routes';
import { learningRoutes } from './learning.routes';
import { asyncHandler } from '../middleware/errors';
import { publicLimiter, verifyLimiter } from '../middleware/rateLimit';
import { verifyCertificate } from '../controllers/certificates.controller';
import { getPublicHome } from '../controllers/home.controller';

export const apiRoutes = Router();

apiRoutes.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
apiRoutes.use('/auth', authRoutes);
apiRoutes.use(adminRoutes);
apiRoutes.use(courseRoutes);
apiRoutes.use(commerceRoutes);
apiRoutes.use(grantRoutes);
apiRoutes.use(learningRoutes);
apiRoutes.use(doubtRoutes);
apiRoutes.use(assignmentRoutes);
apiRoutes.use(dashboardRoutes);
// Public: the landing page data (no sign-in).
apiRoutes.get('/public/home', publicLimiter, asyncHandler(getPublicHome));
// Public: anyone can verify a certificate code (no sign-in).
apiRoutes.get('/verify/:code', verifyLimiter, asyncHandler(verifyCertificate));

