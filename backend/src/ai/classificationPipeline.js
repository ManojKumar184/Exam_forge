import { estimateDifficulty } from '../extraction/metadataClassifier.js';
import { applySemanticCatalogHints } from './semanticTagging.js';
import { getRulesProvider, getLlmProvider, getOllamaProvider } from './providerRegistry.js';
import { resolveGeminiHints } from './geminiCatalogResolver.js';
import { logger } from '../utils/logger.js';

function resolveId(v) {
  return v?.toString?.() || v || null;
}

// ... (keep the mergeClassification helper unchanged)
export function mergeClassification(rules, semantic, llm, question, catalog = {}) {
  const warnings = [...(rules.extractionWarnings || [])];
  let classLevel = rules.class ?? semantic?.class ?? llm?.class;
  let subjectId = resolveId(rules.subjectId) || resolveId(semantic?.subjectId) || null;
  let chapterId = resolveId(rules.chapterId) || resolveId(semantic?.chapterId) || null;
  let examTypeId = resolveId(rules.examTypeId) || resolveId(semantic?.examTypeId) || null;
  let difficulty = rules.difficulty || llm?.difficulty || estimateDifficulty(question);
  let questionType = question.questionType || llm?.questionType;

  if (llm?.provider === 'gemini' && llm.hints) {
    const resolved = resolveGeminiHints(llm, catalog, question, {
      subjectId,
      chapterId,
      examTypeId,
      class: classLevel,
    });
    subjectId = resolved.subjectId || subjectId;
    chapterId = resolved.chapterId || chapterId;
    examTypeId = resolved.examTypeId || examTypeId;
  }

  if (llm?.validationOk === false && llm.validationNote) {
    warnings.push(`Gemini validation: ${llm.validationNote}`);
  }
  if (llm?.hints?.subject && !subjectId) {
    warnings.push(`LLM subject hint: ${llm.hints.subject}`);
  }
  if (llm?.hints?.topic && !chapterId) {
    warnings.push(`LLM topic hint: ${llm.hints.topic}`);
  }

  const confidences = [(rules.confidence ?? rules.aiConfidence / 100) || 0.3];
  if (semantic?.semanticConfidence) confidences.push(semantic.semanticConfidence);
  if (llm?.confidence) confidences.push(llm.confidence);

  const aiConfidence = Math.round(
    (confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100
  );

  const tags = [...new Set([...(rules.tags || []), ...(llm?.tags || []), ...(question.tags || [])])];
  if (llm?.questionType === 'mcq' && !tags.includes('mcq_single')) tags.push('mcq_single');
  let status = rules.status || 'pending';

  if (!subjectId || !examTypeId || aiConfidence < 55) {
    status = 'needs_review';
  }
  if ((question.extractionWarnings || []).some((w) => w.includes('OCR'))) {
    status = 'needs_review';
  }

  const providers = ['rules', 'semantic'];
  if (llm) providers.push(llm.provider || 'llm');

  return {
    class: classLevel,
    subjectId,
    chapterId,
    examTypeId,
    difficulty,
    questionType,
    tags,
    status,
    aiConfidence,
    aiMetadata: {
      providers,
      rules: rules.aiMetadata || { status: 'CLASSIFIED' },
      semantic: semantic?.semanticScores || null,
      llm: llm ? { confidence: llm.confidence, hints: llm.hints, reasoning: llm.reasoning } : null,
    },
    extractionWarnings: warnings,
  };
}

/**
 * Full AI-assisted classification pipeline.
 */
export async function runClassificationPipeline(
  question,
  catalog,
  docMeta = {},
  uploadContext = {}
) {
  const rulesProvider = getRulesProvider();
  const rules = await rulesProvider.classify(question, catalog, docMeta, uploadContext);

  const semantic = applySemanticCatalogHints(question, catalog, {
    class: rules.class,
    subjectId: rules.subjectId,
    chapterId: rules.chapterId,
    examTypeId: rules.examTypeId,
  });

  let llm = null;
  const llmProvider = getLlmProvider();
  let primaryFailed = false;

  if (llmProvider && !uploadContext.skipLlm) {
    try {
      llm = await llmProvider.classify(question, catalog, docMeta);
      if (llm) {
        llm.provider = llmProvider.name;
      } else {
        primaryFailed = true;
      }
    } catch (err) {
      logger.warn('Primary LLM classification failed, attempting fallback', { error: err.message });
      primaryFailed = true;
    }
  } else {
    primaryFailed = true;
  }

  if (primaryFailed && llmProvider?.name !== 'ollama' && !uploadContext.skipLlm) {
    const ollama = getOllamaProvider();
    if (ollama && ollama.isConfigured()) {
      try {
        logger.info('Executing Ollama local fallback classification...');
        llm = await ollama.classify(question, catalog, docMeta);
        if (llm) {
          llm.provider = 'ollama';
        }
      } catch (err) {
        logger.warn('Ollama fallback classification failed', { error: err.message });
      }
    }
  }

  return mergeClassification(rules, semantic, llm, question, catalog);
}
