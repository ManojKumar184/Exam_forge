import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  createPaperSchema,
  updatePaperSchema,
  generatePaperSchema,
  selectQuestionsSchema,
  poolFilterSchema,
} from '../validators/paperValidators.js';
import * as paperController from '../controllers/paperController.js';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(paperController.list));
router.post(
  '/pool-stats',
  authorize('super_admin', 'faculty'),
  validate(poolFilterSchema),
  asyncHandler(paperController.poolStats)
);
router.post(
  '/select-questions',
  authorize('super_admin', 'faculty'),
  validate(selectQuestionsSchema),
  asyncHandler(paperController.selectQuestions)
);
router.post(
  '/generate',
  authorize('super_admin', 'faculty'),
  validate(generatePaperSchema),
  asyncHandler(paperController.generate)
);
router.get('/:id', asyncHandler(paperController.getOne));
router.post(
  '/',
  authorize('super_admin', 'faculty'),
  validate(createPaperSchema),
  asyncHandler(paperController.create)
);
router.patch(
  '/:id',
  authorize('super_admin', 'faculty'),
  validate(updatePaperSchema),
  asyncHandler(paperController.update)
);
router.delete('/:id', authorize('super_admin', 'faculty'), asyncHandler(paperController.remove));

export default router;

