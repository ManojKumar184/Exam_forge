import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as exportPresetController from '../controllers/exportPresetController.js';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(exportPresetController.list));
router.get('/:id', asyncHandler(exportPresetController.getOne));

router.post(
  '/',
  authorize('super_admin', 'faculty'),
  asyncHandler(exportPresetController.create)
);

router.patch(
  '/:id',
  authorize('super_admin', 'faculty'),
  asyncHandler(exportPresetController.update)
);

router.delete(
  '/:id',
  authorize('super_admin', 'faculty'),
  asyncHandler(exportPresetController.remove)
);

export default router;
