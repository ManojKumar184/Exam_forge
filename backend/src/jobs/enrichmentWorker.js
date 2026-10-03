import { Question } from '../models/Question.js';
import { runStagesReconstruction } from '../extraction/reconstructionPipeline.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import crypto from 'node:crypto';

let isRunning = false;

export async function startEnrichmentWorker() {
  const { getLlmProvider } = await import('../ai/providerRegistry.js');
  if (!getLlmProvider()) {
    logger.info('[enrichment-worker] No supported LLM provider is configured for enrichment worker.');
    return () => {};
  }

  logger.info('[enrichment-worker] Enrichment worker started.');
  
  // Poll loop every 10 seconds
  const timer = setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await pollAndEnrich();
    } catch (err) {
      logger.error('[enrichment-worker] Poll iteration failed', { error: err.message });
    } finally {
      isRunning = false;
    }
  }, 10000);
  timer.unref?.();
  return () => clearInterval(timer);
}

export async function claimNextEnrichmentQuestion(workerId = crypto.randomUUID()) {
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  const claimId = `${workerId}:${crypto.randomUUID()}`;
  const question = await Question.findOneAndUpdate({
    semanticEnriched: false,
    status: { $in: ['pending', 'needs_review'] },
    $or: [
      { enrichmentAttempts: { $lt: 3 }, $or: [{ enrichmentClaimedAt: null }, { enrichmentClaimedAt: { $exists: false } }] },
      { enrichmentClaimedAt: { $lt: staleBefore } },
    ],
  }, { $set: { enrichmentClaimId: claimId, enrichmentClaimedAt: new Date() }, $inc: { enrichmentAttempts: 1 } }, { new: true });
  return question ? { question, claimId } : null;
}

async function pollAndEnrich() {
  const claimed = await claimNextEnrichmentQuestion();
  if (!claimed) return;
  const { question, claimId } = claimed;

  logger.info(`[enrichment-worker] Enriching question ${question._id} (attempt ${question.enrichmentAttempts})...`);

  try {
    const plainText = question.questionText;
    const rawHtml = question.debugInfo?.rawClipboardHtml || null;
    const blocks = question.semanticBlocks || [];

    const pipeline = await runStagesReconstruction(
      plainText,
      rawHtml,
      null,
      blocks,
      rawHtml,
      { skipLlm: false }
    );

    // Update question with enriched fields
    const fields = { questionText: pipeline.stem, questionType: pipeline.questionType };
    if (pipeline.options && pipeline.options.length >= 2) {
      fields.options = pipeline.options.map(o => ({
        text: o.text || '',
        latex: o.latex || null,
        image: o.image || null,
      }));
    }
    
    fields.correctAnswers = pipeline.correctAnswers || [];
    if (pipeline.correctAnswers?.length > 0) {
      if (pipeline.questionType === 'mcq') {
        const ansChar = pipeline.correctAnswers[0];
        const idx = ansChar.toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < 4) {
          fields.correctOption = idx;
          fields.answerKey = ansChar;
          fields.answerText = ansChar;
        }
      }
    }

    if (pipeline.explanation) {
      fields.explanation = pipeline.explanation;
    }
    if (pipeline.statementGroups) {
      fields.statementGroups = pipeline.statementGroups;
    }
    if (pipeline.formulas) {
      fields.formulas = pipeline.formulas;
    }
    
    fields.tags = [...new Set([...(question.tags || []), ...(pipeline.tags || [])])];
    
    Object.assign(fields, { parserConfidence: pipeline.confidence, reconstructionFidelity: pipeline.reconstructionFidelity, semanticConfidence: pipeline.semanticConfidence, mathPreservationConfidence: pipeline.mathPreservationConfidence, metadataConfidence: pipeline.metadataConfidence, semanticEnriched: true });
    fields.auditHistory = [...(question.auditHistory || []), {
      action: 'semantic_enrichment',
      timestamp: new Date(),
      user: null,
      notes: `${env.ai.provider} background semantic enrichment completed.`,
    }];
    const saved = await Question.findOneAndUpdate({ _id: question._id, enrichmentClaimId: claimId, updatedAt: question.updatedAt, status: { $in: ['pending', 'needs_review'] } }, { $set: { ...fields, enrichmentClaimId: null, enrichmentClaimedAt: null } }, { new: true });
    if (!saved) return; // A reviewer changed the question while enrichment ran.
    logger.info(`[enrichment-worker] Successfully enriched question ${question._id}`);
  } catch (err) {
    logger.error(`[enrichment-worker] Failed to enrich question ${question._id}`, { error: err.message });
    
    if (question.enrichmentAttempts >= 3) {
      await Question.updateOne({ _id: question._id, enrichmentClaimId: claimId, status: { $in: ['pending', 'needs_review'] } }, { $set: { semanticEnriched: true, enrichmentClaimId: null, enrichmentClaimedAt: null }, $push: { auditHistory: {
        action: 'enrichment_failed',
        timestamp: new Date(),
        user: null,
        notes: `${env.ai.provider} enrichment failed after 3 attempts. Error: ${err.message}`,
      } } });
      logger.warn(`[enrichment-worker] Max retries reached for question ${question._id}. Marking as skipped.`);
    }
    else await Question.updateOne({ _id: question._id, enrichmentClaimId: claimId }, { $set: { enrichmentClaimId: null, enrichmentClaimedAt: null } });
  }
}
