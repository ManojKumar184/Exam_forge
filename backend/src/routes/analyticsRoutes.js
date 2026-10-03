import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as analyticsController from '../controllers/analyticsController.js';
import { resolveTenantContext, requireInstitutionContext } from '../middleware/tenantContext.js';

const router = Router();
router.use(authenticate, resolveTenantContext, requireInstitutionContext);

router.get('/admin', authorize('super_admin'), asyncHandler(analyticsController.adminAnalytics));
router.get('/faculty', authorize('faculty', 'super_admin'), asyncHandler(analyticsController.facultyAnalytics));
router.get('/student', authorize('student'), asyncHandler(analyticsController.studentAnalytics));
router.get('/system-monitor', authorize('super_admin'), asyncHandler(analyticsController.getSystemMonitor));
router.get('/replay-summary', authorize('super_admin'), asyncHandler(analyticsController.getReplaySummary));
router.get(
  '/test/:testId',
  authorize('super_admin', 'faculty'),
  asyncHandler(analyticsController.testPerformance)
);

export default router;

