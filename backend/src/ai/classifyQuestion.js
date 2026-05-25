import { classifyExtractedQuestion, estimateDifficulty } from '../extraction/metadataClassifier.js';
import { runClassificationPipeline } from './classificationPipeline.js';

/**
 * Modular AI-assisted classification (rules + semantic + optional LLM).
 */
export async function classifyQuestionMetadata(
  question,
  catalog = null,
  docMeta = {},
  uploadContext = {}
) {
  if (catalog?.subjects?.length) {
    return runClassificationPipeline(question, catalog, docMeta, uploadContext);
  }

  const result = classifyExtractedQuestion(question, catalog || {}, docMeta, uploadContext);
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

export { runClassificationPipeline, mergeClassification } from './classificationPipeline.js';
