import { estimateDifficulty } from '../extraction/metadataClassifier.js';
import { applySemanticCatalogHints, matchSubjectSemantically, matchTopicSemantically, matchExamTypeSemantically } from './semanticTagging.js';
import { getRulesProvider, getLlmProvider } from './providerRegistry.js';
import { logger } from '../utils/logger.js';
import { resolveHintsToSyllabusMappings } from './syllabusCatalog.js';

function resolveId(v) {
  return v?.toString?.() || v || null;
}

function findByName(items, hint, key = 'name') {
  if (!hint || !items?.length) return null;
  const h = hint.toLowerCase().trim();
  return (
    items.find((i) => i[key]?.toLowerCase() === h) ||
    items.find((i) => i[key]?.toLowerCase().includes(h) || h.includes(i[key]?.toLowerCase()))
  );
}

function resolveLlmCatalogHints(llm, catalog, question, base = {}) {
  if (!llm?.hints) return base;

  const text = question.questionText || '';
  let subjectId = base.subjectId;
  let chapterId = base.chapterId;
  let examTypeId = base.examTypeId;

  // Flat model collections (subjects, topics, examTypes) were dropped.
  // Use syllabus tree (catalog.syllabus) as the primary source.
  const syllabusCatalog = catalog?.syllabus;
  
  if (llm.hints.subject) {
    // Try syllabus tree first, fall back to flat catalog
    let subjectSource = syllabusCatalog?.subjects;
    if (!subjectSource?.length) subjectSource = catalog.subjects;
    const byName = findByName(subjectSource, llm.hints.subject);
    subjectId = byName?._id || subjectId;
    if (!subjectId && subjectSource?.length) {
      subjectId = matchSubjectSemantically(text, subjectSource).subject?._id || subjectId;
    }
  }
  if (llm.hints.examType) {
    const byName = findByName(catalog.examTypes, llm.hints.examType);
    examTypeId = byName?._id || matchExamTypeSemantically(text, catalog.examTypes).examType?._id || examTypeId;
  }
  if (llm.hints.topic) {
    // Try syllabus tree chapters (primary source)
    if (syllabusCatalog?.chapters?.length) {
      const bySyllabusName = findByName(syllabusCatalog.chapters, llm.hints.topic);
      if (bySyllabusName) {
        chapterId = bySyllabusName._id.toString();
      }
    }
    // Fall back to flat Topic model (empty since collection was dropped)
    if (!chapterId && catalog.topics?.length) {
      const byName = findByName(catalog.topics, llm.hints.topic);
      chapterId =
        byName?._id ||
        matchTopicSemantically(text, catalog.topics, subjectId, base.class).topic?._id ||
        chapterId;
    }
  }

  return { subjectId, chapterId, examTypeId };
}

/** Per-field confidence thresholds for auto-review marking. */
const FIELD_THRESHOLDS = {
  class: 0.9,
  subject: 0.9,
  chapter: 0.85,
  topic: 0.8,
  difficulty: 0.75,
};

/**
 * Compute per-field confidence from all available provider signals.
 * @returns {{ class: number, subject: number, chapter: number, topic: number, difficulty: number }}
 */
function computeFieldConfidence(rules, semantic, llm) {
  const fc = { class: 0, subject: 0, chapter: 0, topic: 0, difficulty: 0 };

  // ── Rules contributions ──────────────────────────────────────
  if (rules.class >= 6 && rules.class <= 12) fc.class = Math.max(fc.class, 0.7);
  else fc.class = Math.max(fc.class, 0.35);

  if (rules.subjectId) fc.subject = Math.max(fc.subject, 0.75);
  else fc.subject = Math.max(fc.subject, 0.25);

  if (rules.chapterId) {
    fc.chapter = Math.max(fc.chapter, 0.65);
    fc.topic = Math.max(fc.topic, 0.60);
  } else {
    fc.chapter = Math.max(fc.chapter, 0.2);
    fc.topic = Math.max(fc.topic, 0.15);
  }

  if (rules.difficulty) fc.difficulty = Math.max(fc.difficulty, 0.6);

  // ── Semantic contributions ───────────────────────────────────
  if (semantic?.semanticScores) {
    if (semantic.semanticScores.subject > 0) {
      fc.subject = Math.max(fc.subject, semantic.semanticScores.subject);
    }
    if (semantic.semanticScores.topic > 0) {
      fc.chapter = Math.max(fc.chapter, semantic.semanticScores.topic * 0.9);
      fc.topic = Math.max(fc.topic, semantic.semanticScores.topic * 0.85);
    }
  }

  // ── LLM contributions ────────────────────────────────────────
  if (llm) {
    const llmBase = (llm.confidence || 0.45) * 0.8; // discount LLM confidence slightly

    if (llm.class) fc.class = Math.max(fc.class, llmBase);
    if (llm.hints?.subject) fc.subject = Math.max(fc.subject, llmBase * 0.85);
    if (llm.hints?.topic) {
      fc.chapter = Math.max(fc.chapter, llmBase * 0.75);
      fc.topic = Math.max(fc.topic, llmBase * 0.7);
    }
    if (llm.difficulty) fc.difficulty = Math.max(fc.difficulty, llmBase * 0.8);
  }

  return fc;
}

/**
 * Check per-field confidence against thresholds and return warnings.
 */
function checkFieldThresholds(fieldConfidence) {
  const warnings = [];
  for (const [field, threshold] of Object.entries(FIELD_THRESHOLDS)) {
    const score = fieldConfidence[field] || 0;
    if (score < threshold) {
      warnings.push(
        `${field} confidence ${Math.round(score * 100)}% below threshold ${Math.round(threshold * 100)}%`
      );
    }
  }
  return warnings;
}

/**
 * Determine the overall status considering all signals.
 */
function determineStatus(aiConfidence, subjectId, examTypeId, question, fieldWarnings) {
  if ((question.extractionWarnings || []).some((w) => w.includes('OCR'))) {
    return 'needs_review';
  }
  if (!subjectId || !examTypeId || aiConfidence < 55) {
    return 'needs_review';
  }
  // Per-field threshold violations mark for review
  if (fieldWarnings.length > 0) {
    return 'needs_review';
  }
  return 'pending';
}

export function mergeClassification(rules, semantic, llm, question, catalog = {}) {
  const warnings = [...(rules.extractionWarnings || [])];
  let classLevel = rules.class ?? semantic?.class ?? llm?.class;
  let subjectId = resolveId(rules.subjectId) || resolveId(semantic?.subjectId) || null;
  let chapterId = resolveId(rules.chapterId) || resolveId(semantic?.chapterId) || null;
  let examTypeId = resolveId(rules.examTypeId) || resolveId(semantic?.examTypeId) || null;
  let difficulty = rules.difficulty || llm?.difficulty || estimateDifficulty(question);
  let questionType = question.questionType || llm?.questionType;

  // Collect LLM hints for syllabusMappings resolution
  let llmHints = null;
  if (llm?.hints) {
    const resolved = resolveLlmCatalogHints(llm, catalog, question, {
      subjectId,
      chapterId,
      examTypeId,
      class: classLevel,
    });
    subjectId = resolved.subjectId || subjectId;
    chapterId = resolved.chapterId || chapterId;
    examTypeId = resolved.examTypeId || examTypeId;

    // Preserve LLM hints for syllabus mapping resolution
    llmHints = llm.hints;
  }

  if (llm?.validationOk === false && llm.validationNote) {
    warnings.push(`AI validation: ${llm.validationNote}`);
  }

  // ── Compute per-field confidence ───────────────────────────────
  const fieldConfidence = computeFieldConfidence(rules, semantic, llm);
  const fieldWarnings = checkFieldThresholds(fieldConfidence);
  warnings.push(...fieldWarnings);

  // ── Overall aiConfidence (backward compatible) ─────────────────
  const confidences = [(rules.confidence ?? rules.aiConfidence / 100) || 0.3];
  if (semantic?.semanticConfidence) confidences.push(semantic.semanticConfidence);
  if (llm?.confidence) confidences.push(llm.confidence);

  const aiConfidence = Math.round(
    (confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100
  );

  const tags = [...new Set([...(rules.tags || []), ...(llm?.tags || []), ...(question.tags || [])])];
  if (llm?.questionType === 'mcq' && !tags.includes('mcq_single')) tags.push('mcq_single');

  const status = determineStatus(aiConfidence, subjectId, examTypeId, question, fieldWarnings);

  const providers = ['rules', 'semantic'];
  if (llm) providers.push(llm.provider || 'llm');

  // ── Syllabus-only constraint enforcement ────────────────────────
  let topicId = null;
  let syllabusMappings = null;
  const syllabusCatalog = catalog?.syllabus || null;

  // Use already-resolved syllabusMappings from the rules provider (avoids re-resolution failures)
  if (rules.syllabusMappings) {
    syllabusMappings = rules.syllabusMappings;
  }

  if (syllabusCatalog && !syllabusMappings) {
    // Try LLM hints first (most specific)
    if (llmHints && (llmHints.subject || llmHints.topic || llmHints.examType)) {
      syllabusMappings = resolveHintsToSyllabusMappings(llmHints, syllabusCatalog);
      if (!syllabusMappings) {
        warnings.push('LLM hints did not match any existing syllabus nodes — syllabus mapping skipped');
      }
    }
    // Fall back to flat IDs via name-based lookup if LLM hints didn't resolve
    if (!syllabusMappings && subjectId) {
      const subjectName = rules.subjectName || null;
      if (subjectName) {
        syllabusMappings = resolveHintsToSyllabusMappings(
          { subject: subjectName, topic: rules.topicName || null, examType: rules.examTypeName || null, class: classLevel },
          syllabusCatalog
        );
        if (!syllabusMappings) {
          warnings.push(`Rules subject "${subjectName}" did not match any syllabus node — syllabus mapping skipped`);
        }
      }
    }

    // Extract chapterId and topicId from resolved syllabus mappings if available
    if (syllabusMappings?.[0]?.chapterId) {
      chapterId = resolveId(syllabusMappings[0].chapterId);
    }
    if (syllabusMappings?.[0]?.topicId) {
      topicId = resolveId(syllabusMappings[0].topicId);
    }
  } else {
    // No syllabus catalog available — use chapterId as topicId fallback
    if (chapterId) {
      topicId = chapterId;
    }
  }

  if (!syllabusCatalog && llmHints && (llmHints.subject || llmHints.topic)) {
    // LLM produced hints but no syllabus catalog to validate against
    warnings.push('No syllabus catalog available — LLM hints could not be validated against existing nodes');
  }

  // ── LLM hint warnings (only when hints failed to resolve) ──────
  if (llm?.hints?.subject && !subjectId) {
    warnings.push(`LLM subject hint: ${llm.hints.subject}`);
  }
  if (llm?.hints?.topic && !chapterId && !topicId) {
    warnings.push(`LLM topic hint: ${llm.hints.topic}`);
  }

  return {
    class: classLevel,
    subjectId,
    chapterId,
    topicId,
    examTypeId,
    difficulty,
    questionType,
    tags,
    status,
    aiConfidence,
    fieldConfidence: {
      class: Math.round(fieldConfidence.class * 100),
      subject: Math.round(fieldConfidence.subject * 100),
      chapter: Math.round(fieldConfidence.chapter * 100),
      topic: Math.round(fieldConfidence.topic * 100),
      difficulty: Math.round(fieldConfidence.difficulty * 100),
    },
    aiMetadata: {
      providers,
      rules: rules.aiMetadata || { status: 'CLASSIFIED' },
      semantic: semantic?.semanticScores || null,
      llm: llm ? { confidence: llm.confidence, hints: llm.hints, reasoning: llm.reasoning } : null,
    },
    extractionWarnings: warnings,
    syllabusMappings,
  };
}

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

  // AI-PRIMARY: Always query LLM for classification; rules + semantic act as fallback
  if (llmProvider && !uploadContext.skipLlm) {
    try {
      llm = await llmProvider.classify(question, catalog, docMeta);
      if (llm) {
        llm.provider = llmProvider.name;
      }
    } catch (err) {
      logger.warn('LLM classification failed, falling back to rules+semantic', { error: err.message });
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

  // 3. AI-PRIMARY: Run LLM batch classification on ALL questions
  let llmList = null;
  const llmProvider = getLlmProvider();
  const pipelineStart = Date.now();

  if (llmProvider && !uploadContext.skipLlm) {
    const llmStart = Date.now();
    try {
      if (typeof llmProvider.classifyBatch === 'function') {
        // Pass upload context so the provider can log diagnostics with uploadId
        docMeta.uploadId = uploadContext.uploadId || docMeta.uploadId;
        docMeta.batchIndex = uploadContext.batchIndex || 0;
        llmList = await llmProvider.classifyBatch(questions, catalog, docMeta);
      }

      if (!llmList) {
        logger.info('[pipeline] Batch classify returned null, falling back to sub-batched parallel classify');
        const fallbackStart = Date.now();
        llmList = await _fallbackParallelClassify(llmProvider, questions, catalog, docMeta);
        logger.info(`[PIPELINE_DIAG] Phase=fallback Questions=${questions.length} Duration=${Date.now() - fallbackStart}ms`);
      }
    } catch (err) {
      logger.warn('LLM batch classification failed, falling back to sub-batched parallel classify', { error: err.message });
      try {
        const fallbackStart = Date.now();
        llmList = await _fallbackParallelClassify(llmProvider, questions, catalog, docMeta);
        logger.info(`[PIPELINE_DIAG] Phase=fallback_catch Questions=${questions.length} Duration=${Date.now() - fallbackStart}ms`);
      } catch (fallbackErr) {
        logger.warn('Fallback parallel classify also failed, using rules+semantic only', { error: fallbackErr.message });
      }
    }
    const llmDuration = Date.now() - llmStart;
    const llmCount = llmList?.filter(r => r !== null)?.length || 0;
    logger.info(`[PIPELINE_DIAG] Phase=LLM Questions=${questions.length} Successful=${llmCount} Duration=${llmDuration}ms`);
  }

  // 4. Merge results for each question
  const mergeStart = Date.now();
  const results = questions.map((q, idx) => {
    const rules = rulesList[idx];
    const semantic = semanticList[idx];
    const llm = llmList?.[idx] || null;
    if (llm) {
      llm.provider = llmProvider?.name || 'llm';
    }
    return mergeClassification(rules, semantic, llm, q, catalog);
  });

  const totalDuration = Date.now() - pipelineStart;
  logger.info(`[PIPELINE_DIAG] Phase=total Questions=${questions.length} Rules_ok=${rulesList.filter(r => r !== null).length} LLM_ok=${llmList?.filter(r => r !== null).length || 0} Merge_duration=${Date.now() - mergeStart}ms Total_duration=${totalDuration}ms`);

  return results;
}

/**
 * Fallback: split questions into smaller sub-batches and classify each with retry.
 * Avoids hammering the API with N per-question calls simultaneously.
 * Uses the provider's classifyBatch on sub-batches if available, otherwise classify per-question.
 */
async function _fallbackParallelClassify(llmProvider, questions, catalog, docMeta) {
  if (!llmProvider || !questions?.length) return null;

  const SUB_BATCH_SIZE = 3;
  const results = [];

  for (let i = 0; i < questions.length; i += SUB_BATCH_SIZE) {
    const subBatch = questions.slice(i, i + SUB_BATCH_SIZE);
    let subResults = null;

    // Try sub-batch classify first
    if (typeof llmProvider.classifyBatch === 'function') {
      try {
        subResults = await llmProvider.classifyBatch(subBatch, catalog, docMeta);
      } catch (err) {
        logger.warn(`[pipeline] Sub-batch(${i}) classifyBatch failed, trying per-question`, { error: err.message });
      }
    }

    // Fall back to per-question with concurrency limiting
    if (!subResults) {
      const concurrencyLimit = llmProvider.maxConcurrentCalls || 3;
      subResults = [];
      for (let j = 0; j < subBatch.length; j += concurrencyLimit) {
        const batch = subBatch.slice(j, j + concurrencyLimit);
        const batchResults = await Promise.all(
          batch.map((q) => llmProvider.classify(q, catalog, docMeta).catch((err) => {
            logger.warn(`[pipeline] Per-question classify failed: ${err.message}`);
            return null;
          }))
        );
        subResults.push(...batchResults);
      }
    }

    results.push(...subResults);
  }

  return results;
}

