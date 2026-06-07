import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as examTemplateController from '../controllers/examTemplateController.js';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(examTemplateController.list));
router.get('/:id', asyncHandler(examTemplateController.getOne));

router.post(
  '/',
  authorize('super_admin', 'faculty'),
  asyncHandler(examTemplateController.create)
);

router.post(
  '/:id/duplicate',
  authorize('super_admin', 'faculty'),
  asyncHandler(examTemplateController.duplicate)
);

router.patch(
  '/:id',
  authorize('super_admin', 'faculty'),
  asyncHandler(examTemplateController.update)
);

router.delete(
  '/:id',
  authorize('super_admin', 'faculty'),
  asyncHandler(examTemplateController.remove)
);

export default router;
