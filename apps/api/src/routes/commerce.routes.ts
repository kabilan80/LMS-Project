import { Router } from 'express';
import {
  Role,
  bundleInputSchema,
  checkoutSchema,
  confirmCheckoutSchema,
  planTypeParam,
  updateBundleSchema,
  updatePlanSchema,
} from '@lms/shared';
import * as checkout from '../controllers/checkout.controller';
import * as plans from '../controllers/plans.controller';
import { authenticate, requirePasswordChanged, requirePermission, requireRole } from '../middleware/authenticate';
import { asyncHandler } from '../middleware/errors';
import { checkoutLimiter } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import type { RequestHandler } from 'express';

export const commerceRoutes = Router();

// Per-route guards, same style as the other routers.
const anyUser = [authenticate, requirePasswordChanged];
const adminOnly = [...anyUser, requireRole(Role.ADMIN)];
const studentOnly = [...anyUser, requireRole(Role.STUDENT)];

const validatePlanType: RequestHandler = (req, _res, next) => {
  const parsed = planTypeParam.safeParse(req.params);
  if (!parsed.success) return next(parsed.error);
  next();
};

// Prices: students see active plans, admin sees all. Plan management is admin-only in v1; the
// plan.manage key is still checked so the matrix stays meaningful.
commerceRoutes.get('/plans', ...anyUser, asyncHandler(plans.listPlans));
commerceRoutes.patch('/plans/:type', ...adminOnly, requirePermission('plan.manage'), validatePlanType, validateBody(updatePlanSchema), asyncHandler(plans.updatePlan));

commerceRoutes.get('/bundles', ...anyUser, asyncHandler(plans.listBundles));
commerceRoutes.post('/bundles', ...adminOnly, requirePermission('plan.manage'), validateBody(bundleInputSchema), asyncHandler(plans.createBundle));
commerceRoutes.patch('/bundles/:id', ...adminOnly, requirePermission('plan.manage'), validateBody(updateBundleSchema), asyncHandler(plans.updateBundle));

commerceRoutes.get('/purchases', ...adminOnly, requirePermission('plan.manage'), asyncHandler(plans.listPurchases));
commerceRoutes.get('/purchases/summary', ...adminOnly, requirePermission('plan.manage'), asyncHandler(plans.getSalesSummary));

// Only students pay. Instructors and admins never reach checkout.
commerceRoutes.post('/checkout', ...studentOnly, checkoutLimiter, validateBody(checkoutSchema), asyncHandler(checkout.createCheckout));
commerceRoutes.post('/checkout/confirm', ...studentOnly, checkoutLimiter, validateBody(confirmCheckoutSchema), asyncHandler(checkout.confirmCheckout));
commerceRoutes.get('/me/access', ...studentOnly, asyncHandler(checkout.getMyAccess));
