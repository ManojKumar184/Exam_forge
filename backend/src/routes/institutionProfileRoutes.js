import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as institutionProfileController from '../controllers/institutionProfileController.js';
import { resolveTenantContext, requireInstitutionContext } from '../middleware/tenantContext.js';

const router = Router();

router.use(authenticate, resolveTenantContext, requireInstitutionContext);

router.get('/', asyncHandler(institutionProfileController.getProfile));

router.post(
  '/',
  authorize('super_admin', 'faculty'),
  asyncHandler(institutionProfileController.upsertProfile)
);

export default router;
