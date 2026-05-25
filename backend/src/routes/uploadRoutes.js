import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { uploadMiddleware } from '../config/multer.js';
import * as uploadController from '../controllers/uploadController.js';
import { uploadLimiter } from '../middleware/rateLimits.js';

const router = Router();

router.use(uploadLimiter);

router.use(authenticate);

router.get('/', authorize('super_admin'), asyncHandler(uploadController.list));
router.get('/:id', authorize('super_admin'), asyncHandler(uploadController.getOne));

router.post(
  '/',
  authorize('super_admin'),
  uploadMiddleware.single('file'),
  asyncHandler(uploadController.uploadFile)
);

export default router;
