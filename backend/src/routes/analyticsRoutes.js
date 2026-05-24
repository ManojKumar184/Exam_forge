import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as analyticsController from '../controllers/analyticsController.js';

const router = Router();
router.use(authenticate);

router.get('/admin', authorize('super_admin'), asyncHandler(analyticsController.adminAnalytics));
router.get('/faculty', authorize('faculty', 'super_admin'), asyncHandler(analyticsController.facultyAnalytics));
router.get('/student', authorize('student'), asyncHandler(analyticsController.studentAnalytics));

export default router;

