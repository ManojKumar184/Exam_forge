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

router.get('/', authorize('super_admin', 'faculty'), asyncHandler(uploadController.list));
router.get('/:id', authorize('super_admin', 'faculty'), asyncHandler(uploadController.getOne));

router.post(
  '/',
  authorize('super_admin', 'faculty'),
  uploadMiddleware.single('file'),
  asyncHandler(uploadController.uploadFile)
);

router.post(
  '/manual',
  authorize('super_admin', 'faculty'),
  asyncHandler(uploadController.uploadManual)
);

router.patch(
  '/:id/staging/:index',
  authorize('super_admin', 'faculty'),
  asyncHandler(uploadController.updateStagedQuestion)
);

router.delete(
  '/:id/staging/:index',
  authorize('super_admin', 'faculty'),
  asyncHandler(uploadController.rejectStagedQuestion)
);

router.post(
  '/:id/commit',
  authorize('super_admin', 'faculty'),
  asyncHandler(uploadController.commitStagedQuestions)
);

router.post(
  '/:id/reprocess',
  authorize('super_admin', 'faculty'),
  asyncHandler(uploadController.reprocess)
);

router.post(
  '/:id/duplicate',
  authorize('super_admin', 'faculty'),
  asyncHandler(uploadController.duplicateSession)
);

router.get(
  '/:id/staging/:index/duplicates',
  authorize('super_admin', 'faculty'),
  asyncHandler(uploadController.getStagedQuestionDuplicates)
);

export default router;
