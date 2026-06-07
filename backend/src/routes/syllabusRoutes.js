import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import * as syllabusController from '../controllers/syllabusController.js';

const router = Router();

// All syllabus routes require authentication
router.use(authenticate);

// Publicly read syllabus tree and nodes
router.get('/', asyncHandler(syllabusController.list));
router.get('/tree', asyncHandler(syllabusController.getTree));
router.get('/:id', asyncHandler(syllabusController.getOne));

// Admin management endpoints
router.post(
  '/',
  authorize('super_admin'),
  asyncHandler(syllabusController.create)
);

router.patch(
  '/:id',
  authorize('super_admin'),
  asyncHandler(syllabusController.update)
);

router.delete(
  '/:id',
  authorize('super_admin'),
  asyncHandler(syllabusController.remove)
);

export default router;
