// backend/src/routes/documentClassification.js

import { Router } from 'express';
import { documentClassificationWorkflow } from '../../src/ai/documentClassificationWorkflow.js';

const router = Router();

// Upload a document and create a session
router.post('/upload', documentClassificationWorkflow.uploadDocument);

// Process a batch of questions (expects JSON body { start, end })
router.post('/batch/:sessionId', documentClassificationWorkflow.processBatch);

// Finalize the session and get a summary report
router.get('/finalize/:sessionId', documentClassificationWorkflow.finalize);

export default router;
