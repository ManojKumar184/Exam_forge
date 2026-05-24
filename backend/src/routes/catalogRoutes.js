import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import * as catalogController from '../controllers/catalogController.js';

const router = Router();

router.use(authenticate);

router.get('/subjects', asyncHandler(catalogController.listSubjects));
router.get('/topics', asyncHandler(catalogController.listTopics));
router.get('/chapters', asyncHandler(catalogController.listTopics));
router.get('/exam-types', asyncHandler(catalogController.listExamTypes));

export default router;
