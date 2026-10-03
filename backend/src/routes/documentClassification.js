// backend/src/routes/documentClassification.js

import { Router } from 'express';
import { uploadMiddleware } from '../config/multer.js';
import { documentClassificationWorkflow } from '../ai/documentClassificationWorkflow.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { resolveTenantContext, requireInstitutionContext } from '../middleware/tenantContext.js';

const router = Router();

router.use(authenticate);
router.use(resolveTenantContext, requireInstitutionContext);

// Upload a document and create a session
router.post('/upload', authorize('super_admin', 'faculty'), uploadMiddleware.single('file'), documentClassificationWorkflow.uploadDocument);

// Process a batch of questions (expects JSON body { start, end })
router.post('/batch/:sessionId', authorize('super_admin', 'faculty'), documentClassificationWorkflow.processBatch);

// Finalize the session and get a summary report
router.get('/finalize/:sessionId', authorize('super_admin', 'faculty'), documentClassificationWorkflow.finalize);

export default router;
