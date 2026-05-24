import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import * as leaderboardController from '../controllers/leaderboardController.js';

const router = Router();
router.use(authenticate);

router.get('/tests/:testId', asyncHandler(leaderboardController.getTestLeaderboard));

export default router;

