import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { validateQuery } from '../middleware/validateQuery.js';
import { createTestSchema, updateTestSchema, autosaveSchema } from '../validators/testValidators.js';
import { z } from 'zod';
import * as testController from '../controllers/testController.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  validateQuery(
    z.object({
      status: z.string().optional(),
      search: z.string().optional(),
      paper_id: z.string().optional(),
    })
  ),
  asyncHandler(testController.list)
);
router.get('/attempts/me', authorize('student'), asyncHandler(testController.attempts));
router.get('/:id', asyncHandler(testController.getOne));
router.post('/', authorize('super_admin', 'faculty'), validate(createTestSchema), asyncHandler(testController.create));
router.patch(
  '/:id',
  authorize('super_admin', 'faculty'),
  validate(updateTestSchema),
  asyncHandler(testController.update)
);

router.post('/:id/start', authorize('student'), asyncHandler(testController.start));
router.post('/:id/autosave', authorize('student'), validate(autosaveSchema), asyncHandler(testController.autosave));
router.post('/:id/submit', authorize('student'), asyncHandler(testController.submit));
router.post('/:id/auto-submit', authorize('student'), asyncHandler(testController.autoSubmit));
router.get('/:id/attempts', authorize('super_admin', 'faculty', 'student'), asyncHandler(testController.attempts));
router.get('/:id/leaderboard', asyncHandler(testController.leaderboard));

export default router;

