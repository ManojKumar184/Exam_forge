import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import * as questionBankController from '../controllers/questionBankController.js';
import { resolveTenantContext, requireInstitutionContext } from '../middleware/tenantContext.js';

const router = Router();

// All question bank routes require authentication
router.use(authenticate, resolveTenantContext, requireInstitutionContext);

router.get('/', asyncHandler(questionBankController.list));
router.patch('/system-test/visibility', asyncHandler(questionBankController.setSystemTestVisibility));
router.get('/:id', asyncHandler(questionBankController.getOne));
router.post('/', asyncHandler(questionBankController.create));
router.patch('/reorder', asyncHandler(questionBankController.reorder));
router.patch('/:id', asyncHandler(questionBankController.update));
router.delete('/:id', asyncHandler(questionBankController.remove));

// Question assignment/removal
router.post('/:id/questions', asyncHandler(questionBankController.assignQuestions));
router.delete('/:id/questions', asyncHandler(questionBankController.removeQuestions));

export default router;
