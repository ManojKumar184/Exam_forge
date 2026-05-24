import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  createPaperSchema,
  updatePaperSchema,
  generatePaperSchema,
} from '../validators/paperValidators.js';
import * as paperController from '../controllers/paperController.js';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(paperController.list));
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
router.post(
  '/generate',
  authorize('super_admin', 'faculty'),
  validate(generatePaperSchema),
  asyncHandler(paperController.generate)
);

export default router;

