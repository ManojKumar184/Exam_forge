// backend/src/ai/documentClassificationWorkflow.js

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { sessionMap, DocumentSession } from './documentSession.js';
import { NvidiaProvider } from './providers/nvidiaProvider.js';
import { SpaceProvider } from './providers/spaceProvider.js';
import { extractJSON } from './providers/shared.js';
import { writeFile, readFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { metricsLogger } from '../utils/metrics.js';
import { loadSyllabusCatalog } from './syllabusCatalog.js';
import { extractionService, normalizeQuestions } from '../extraction/index.js';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nvidiaProvider = new NvidiaProvider();
const spaceProvider = new SpaceProvider(); // fallback if needed

/** Helper to load syllabus tree from DB */
async function loadSyllabusTree() {
  try {
    return await loadSyllabusCatalog();
  } catch (err) {
    logger.warn(`[workflow] Could not load syllabus tree from DB: ${err.message}`);
    return {};
  }
}

/** Helper to load document metadata – placeholder */
function extractMetadataFromFile(file) {
  // Simple placeholder – in real code parse uploaded doc metadata
  return { filename: file.originalname || 'unknown', uploadedAt: new Date().toISOString() };
}

export const documentClassificationWorkflow = {
  /**
   * POST /upload – handle document upload, create session.
   * Expects multipart/form-data with field 'file'.
   */
  async uploadDocument(req, res) {
    try {
      const file = req.file; // assuming multer middleware
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const syllabusTree = await loadSyllabusTree();
      const metadata = extractMetadataFromFile(file);

      // Parse uploaded document to questions list using extractionService and normalizeQuestions
      const fileType = file.originalname.endsWith('.docx') ? 'docx' : 'pdf';
      const extractResult = await extractionService.processFile(file.path, fileType);
      const blocks = extractResult.blocks || [];
      const questions = await normalizeQuestions(blocks, { returnRawBlocks: false });

      const sessionId = uuidv4();
      const session = new DocumentSession({
        docId: sessionId,
        syllabusTree,
        metadata,
        questions,
        userId: req.user._id,
        institutionId: req.institutionId,
      });
      sessionMap.set(sessionId, session);

      logger.info(`[workflow] Created session ${sessionId}`);
      return res.json({ sessionId });
    } catch (err) {
      logger.error(`[workflow] uploadDocument error: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  },

  /**
   * POST /batch/:sessionId – process a batch of questions.
   * Body: { start: number, end: number } – indices (inclusive start, exclusive end).
   */
  async processBatch(req, res) {
    try {
      const { sessionId } = req.params;
      const { start, end } = req.body;
      const session = sessionMap.get(sessionId);
      if (!session || session.userId !== req.user._id.toString() || session.institutionId !== req.institutionId?.toString()) return res.status(404).json({ error: 'Session not found' });

      const batch = session.questions.slice(start, end);
      if (!batch.length) return res.status(400).json({ error: 'Empty batch' });

      const catalog = { syllabus: session.syllabusTree };
      const docMeta = { uploadId: sessionId, batchIndex: start };

      const startTime = Date.now();
      const classifications = await nvidiaProvider.classifyBatch(batch, catalog, docMeta);
      const duration = Date.now() - startTime;

      // Store results
      session.results.push({ start, end, classifications, duration });

      // Log metrics
      metricsLogger.log({
        model: 'nvidia_fast',
        batchSize: batch.length,
        latencyMs: duration,
        // token estimation could be added here if needed
        sessionId,
        start,
        end,
      });

      return res.json({ classifications, duration });
    } catch (err) {
      logger.error(`[workflow] processBatch error: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  },

  /**
   * GET /finalize/:sessionId – aggregate all batch results and return summary.
   */
  async finalize(req, res) {
    try {
      const { sessionId } = req.params;
      const session = sessionMap.get(sessionId);
      if (!session || session.userId !== req.user._id.toString() || session.institutionId !== req.institutionId?.toString()) return res.status(404).json({ error: 'Session not found' });

      // Aggregate metrics
      const totalQuestions = session.results.reduce((sum, r) => sum + (r.end - r.start), 0);
      const totalLatency = session.results.reduce((sum, r) => sum + r.duration, 0);

      const summary = {
        sessionId,
        totalQuestions,
        totalLatencyMs: totalLatency,
        avgLatencyPerBatch: session.results.length ? totalLatency / session.results.length : 0,
        results: session.results,
      };

      // Optionally write a JSON report file
      const reportPath = path.resolve(__dirname, `../../reports/${sessionId}_classification_report.json`);
      await mkdir(path.dirname(reportPath), { recursive: true });
      await writeFile(reportPath, JSON.stringify(summary, null, 2), 'utf-8');

      logger.info(`[workflow] Finalized session ${sessionId}, report written to ${reportPath}`);
      return res.json({ summary, reportPath });
    } catch (err) {
      logger.error(`[workflow] finalize error: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  },
};
