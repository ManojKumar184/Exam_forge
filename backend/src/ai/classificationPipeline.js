import { estimateDifficulty } from '../extraction/metadataClassifier.js';
import { applySemanticCatalogHints } from './semanticTagging.js';
import { getRulesProvider, getLlmProvider } from './providerRegistry.js';
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

  if (llmProvider && !uploadContext.skipLlm) {
    try {
      llm = await llmProvider.classify(question, catalog, docMeta);
      if (llm) {
        llm.provider = llmProvider.name;
      }
    } catch (err) {
      logger.warn('LLM classification failed', { error: err.message });
    }
  }

  return mergeClassification(rules, semantic, llm, question, catalog);
}

/**
 * Full AI-assisted batch classification pipeline.
 */
export async function runClassificationPipelineBatch(
  questions,
  catalog,
  docMeta = {},
  uploadContext = {}
) {
  const rulesProvider = getRulesProvider();
  
  // 1. Run rules provider on all questions
  const rulesList = await Promise.all(
    questions.map((q) => rulesProvider.classify(q, catalog, docMeta, uploadContext))
  );

  // 2. Run semantic hinting on all questions
  const semanticList = questions.map((q, idx) =>
    applySemanticCatalogHints(q, catalog, {
      class: rulesList[idx].class,
      subjectId: rulesList[idx].subjectId,
      chapterId: rulesList[idx].chapterId,
      examTypeId: rulesList[idx].examTypeId,
    })
  );

  // 3. Run LLM batch classification
  let llmList = null;
  const llmProvider = getLlmProvider();

  if (llmProvider && !uploadContext.skipLlm) {
    try {
      if (typeof llmProvider.classifyBatch === 'function') {
        const results = await llmProvider.classifyBatch(questions, catalog, docMeta);
        if (results && results.length === questions.length) {
          llmList = results;
        }
      }
      
      // Fallback if batching method fails or is unsupported
      if (!llmList) {
        logger.info('[pipeline] Falling back to sequential classification for batch');
        llmList = await Promise.all(
          questions.map((q) => llmProvider.classify(q, catalog, docMeta).catch(() => null))
        );
      }
    } catch (err) {
      logger.warn('LLM batch classification failed', { error: err.message });
    }
  }

  // 4. Merge results for each question
  return questions.map((q, idx) => {
    const rules = rulesList[idx];
    const semantic = semanticList[idx];
    const llm = llmList?.[idx] || null;
    if (llm) {
      llm.provider = llmProvider.name;
    }
    return mergeClassification(rules, semantic, llm, q, catalog);
  });
}

