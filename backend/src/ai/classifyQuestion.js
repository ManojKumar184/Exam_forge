import { classifyExtractedQuestion, estimateDifficulty } from '../extraction/metadataClassifier.js';
import { runClassificationPipeline, runClassificationPipelineBatch } from './classificationPipeline.js';

/**
 * Modular AI-assisted classification (rules + semantic + optional LLM).
 */
export async function classifyQuestionMetadata(
  question,
  catalog = null,
  docMeta = {},
  uploadContext = {}
) {
  if (catalog?.subjects?.length || catalog?.syllabus) {
    return runClassificationPipeline(question, catalog, docMeta, uploadContext);
  }

  const result = classifyExtractedQuestion(question, catalog || {}, docMeta, uploadContext);
  return {
    aiConfidence: result.aiConfidence,
    aiMetadata: result.aiMetadata,
    class: result.class,
    subjectId: result.subjectId,
    chapterId: result.chapterId,
    topicId: result.topicId,
    examTypeId: result.examTypeId,
    difficulty: result.difficulty,
    tags: result.tags,
    status: result.status,
    fieldConfidence: result.fieldConfidence,
    extractionWarnings: result.extractionWarnings,
    syllabusMappings: result.syllabusMappings,
  };
}

/**
 * Modular AI-assisted batch classification (rules + semantic + optional LLM).
 */
export async function classifyQuestionMetadataBatch(
  questions,
  catalog = null,
  docMeta = {},
  uploadContext = {}
) {
  if (catalog?.subjects?.length || catalog?.syllabus) {
    return runClassificationPipelineBatch(questions, catalog, docMeta, uploadContext);
  }

  return questions.map((q) => {
    const result = classifyExtractedQuestion(q, catalog || {}, docMeta, uploadContext);
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
      syllabusMappings: result.syllabusMappings,
    };
  });
}

export { runClassificationPipeline, runClassificationPipelineBatch, mergeClassification } from './classificationPipeline.js';

