import { Question } from '../models/Question.js';
import { runStagesReconstruction } from '../extraction/reconstructionPipeline.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

let isRunning = false;

export async function startEnrichmentWorker() {
  if (env.ai.provider !== 'ollama') {
    logger.info('[enrichment-worker] Ollama provider is not configured. Enrichment worker disabled.');
    return;
  }

  logger.info('[enrichment-worker] Enrichment worker started.');
  
  // Poll loop every 10 seconds
  setInterval(async () => {
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
}

async function pollAndEnrich() {
  const question = await Question.findOne({
    semanticEnriched: false,
    status: { $in: ['pending', 'needs_review'] },
    enrichmentAttempts: { $lt: 3 },
  });

  if (!question) return;

  question.enrichmentAttempts = (question.enrichmentAttempts || 0) + 1;
  await question.save();

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
    question.questionText = pipeline.stem;
    question.questionType = pipeline.questionType;
    if (pipeline.options && pipeline.options.length >= 2) {
      question.options = pipeline.options.map(o => ({
        text: o.text || '',
        latex: o.latex || null,
        image: o.image || null,
      }));
    }
    
    question.correctAnswers = pipeline.correctAnswers || [];
    if (pipeline.correctAnswers?.length > 0) {
      if (pipeline.questionType === 'mcq') {
        const ansChar = pipeline.correctAnswers[0];
        const idx = ansChar.toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < 4) {
          question.correctOption = idx;
          question.answerKey = ansChar;
          question.answerText = ansChar;
        }
      }
    }

    if (pipeline.explanation) {
      question.explanation = pipeline.explanation;
    }
    if (pipeline.statementGroups) {
      question.statementGroups = pipeline.statementGroups;
    }
    if (pipeline.formulas) {
      question.formulas = pipeline.formulas;
    }
    
    question.tags = [...new Set([...(question.tags || []), ...(pipeline.tags || [])])];
    
    question.parserConfidence = pipeline.confidence;
    question.reconstructionFidelity = pipeline.reconstructionFidelity;
    question.semanticConfidence = pipeline.semanticConfidence;
    question.mathPreservationConfidence = pipeline.mathPreservationConfidence;
    question.metadataConfidence = pipeline.metadataConfidence;
    
    question.semanticEnriched = true;
    
    question.auditHistory.push({
      action: 'semantic_enrichment',
      timestamp: new Date(),
      user: null,
      notes: 'Ollama background semantic enrichment completed.',
    });

    await question.save();
    logger.info(`[enrichment-worker] Successfully enriched question ${question._id}`);
  } catch (err) {
    logger.error(`[enrichment-worker] Failed to enrich question ${question._id}`, { error: err.message });
    
    if (question.enrichmentAttempts >= 3) {
      question.semanticEnriched = true;
      question.auditHistory.push({
        action: 'enrichment_failed',
        timestamp: new Date(),
        user: null,
        notes: `Ollama enrichment failed after 3 attempts. Error: ${err.message}`,
      });
      await question.save();
      logger.warn(`[enrichment-worker] Max retries reached for question ${question._id}. Marking as skipped.`);
    }
  }
}
