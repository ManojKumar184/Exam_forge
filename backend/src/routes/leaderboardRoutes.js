import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import * as leaderboardController from '../controllers/leaderboardController.js';
import { resolveTenantContext, requireInstitutionContext } from '../middleware/tenantContext.js';

const router = Router();
router.use(authenticate, resolveTenantContext, requireInstitutionContext);

router.get('/tests/:testId', asyncHandler(leaderboardController.getTestLeaderboard));

export default router;

