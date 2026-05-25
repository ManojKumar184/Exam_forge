import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { validateQuery } from '../middleware/validateQuery.js';
import {
  createQuestionSchema,
  updateQuestionSchema,
  listQuestionsSchema,
  bulkIdsSchema,
  bulkUpdateMetadataSchema,
  reconstructQuestionSchema,
} from '../validators/questionValidators.js';
import * as questionController from '../controllers/questionController.js';

const router = Router();

router.use(authenticate);

router.get('/', validateQuery(listQuestionsSchema), asyncHandler(questionController.list));
router.get('/meta/count', validateQuery(listQuestionsSchema), asyncHandler(questionController.count));

router.post(
  '/reconstruct',
  authorize('super_admin', 'faculty'),
  validate(reconstructQuestionSchema),
  asyncHandler(questionController.reconstruct)
);

router.get('/:id', asyncHandler(questionController.getOne));

router.post(
  '/',
  authorize('super_admin', 'faculty'),
  validate(createQuestionSchema),
  asyncHandler(questionController.create)
);

router.patch(
  '/:id',
  authorize('super_admin'),
  validate(updateQuestionSchema),
  asyncHandler(questionController.update)
);

router.delete('/:id', authorize('super_admin'), asyncHandler(questionController.remove));

router.post('/:id/approve', authorize('super_admin'), asyncHandler(questionController.approve));
router.post('/:id/reject', authorize('super_admin'), asyncHandler(questionController.reject));

router.post(
  '/bulk/approve',
  authorize('super_admin'),
  validate(bulkIdsSchema),
  asyncHandler(questionController.bulkApprove)
);
router.post(
  '/bulk/reject',
  authorize('super_admin'),
  validate(bulkIdsSchema),
  asyncHandler(questionController.bulkReject)
);
router.post(
  '/bulk/delete',
  authorize('super_admin'),
  validate(bulkIdsSchema),
  asyncHandler(questionController.bulkDelete)
);
router.post(
  '/bulk/update-metadata',
  authorize('super_admin'),
  validate(bulkUpdateMetadataSchema),
  asyncHandler(questionController.bulkUpdateMetadata)
);

export default router;
