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

  if (llm.hints.subject) {
    const byName = findByName(catalog.subjects, llm.hints.subject);
    subjectId = byName?._id || matchSubjectSemantically(text, catalog.subjects).subject?._id || subjectId;
  }
  if (llm.hints.examType) {
    const byName = findByName(catalog.examTypes, llm.hints.examType);
    examTypeId = byName?._id || matchExamTypeSemantically(text, catalog.examTypes).examType?._id || examTypeId;
  }
  if (llm.hints.topic) {
    const byName = findByName(catalog.topics, llm.hints.topic);
    chapterId =
      byName?._id ||
      matchTopicSemantically(text, catalog.topics, subjectId, base.class).topic?._id ||
      chapterId;
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
  if (syllabusCatalog) {
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

    // Extract topicId from resolved syllabus mappings if available
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

  // Check per-field confidence to decide if LLM augmentation is needed
  const fieldConfForTrigger = computeFieldConfidence(rules, null, null);
  const hasWeakField = checkFieldThresholds(fieldConfForTrigger).length > 0;

  // Call LLM only if rules classification is uncertain or any field is below threshold
  const isUncertain = !question.questionType || 
                      question.questionType === 'descriptive' || 
                      (rules.confidence * 100) < 70 || 
                      rules.status === 'needs_review' ||
                      hasWeakField;

  if (llmProvider && !uploadContext.skipLlm && isUncertain) {
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

  // 3. Run LLM batch classification only for uncertain cases
  let llmList = null;
  const llmProvider = getLlmProvider();

  if (llmProvider && !uploadContext.skipLlm) {
    try {
      const uncertainIndices = [];
      const uncertainQuestions = [];
      
      questions.forEach((q, idx) => {
        const rules = rulesList[idx];
        const fieldConfForTrigger = computeFieldConfidence(rules, null, null);
        const hasWeakField = checkFieldThresholds(fieldConfForTrigger).length > 0;
        const isUncertain = !q.questionType || 
                            q.questionType === 'descriptive' || 
                            (rules.confidence * 100) < 70 || 
                            rules.status === 'needs_review' ||
                            hasWeakField;
        if (isUncertain) {
          uncertainIndices.push(idx);
          uncertainQuestions.push(q);
        }
      });

      if (uncertainQuestions.length > 0) {
        let uncertainLlmResults = null;
        if (typeof llmProvider.classifyBatch === 'function') {
          uncertainLlmResults = await llmProvider.classifyBatch(uncertainQuestions, catalog, docMeta);
        }
        
        if (!uncertainLlmResults) {
          logger.info('[pipeline] Falling back to sequential classification for batch');
          uncertainLlmResults = await Promise.all(
            uncertainQuestions.map((q) => llmProvider.classify(q, catalog, docMeta).catch(() => null))
          );
        }

        llmList = new Array(questions.length).fill(null);
        uncertainIndices.forEach((qIdx, arrIdx) => {
          llmList[qIdx] = uncertainLlmResults[arrIdx];
        });
      } else {
        llmList = new Array(questions.length).fill(null);
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

