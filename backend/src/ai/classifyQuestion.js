import {
  classifyExtractedQuestion,
  estimateDifficulty,
} from '../extraction/metadataClassifier.js';

/**
 * Rule-based classification (Phase 4 can extend with LLM).
 */
export async function classifyQuestionMetadata(question, catalog = null, docMeta = {}) {
  if (catalog?.subjects?.length) {
    const result = classifyExtractedQuestion(question, catalog, docMeta, {});
    return {
      aiConfidence: result.aiConfidence,
      aiMetadata: result.aiMetadata,
      class: result.class,
      subjectId: result.subjectId,
      chapterId: result.chapterId,
      examTypeId: result.examTypeId,
      difficulty: result.difficulty,
      tags: result.tags,
      status: result.status,
      extractionWarnings: result.extractionWarnings,
    };
  }

  return {
    aiConfidence: 30,
    aiMetadata: {
      provider: 'rules',
      status: 'PARTIAL',
      message: 'Catalog not loaded — manual metadata required',
    },
    difficulty: estimateDifficulty(question),
  };
}
