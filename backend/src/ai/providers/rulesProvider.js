import { BaseAIProvider } from './baseProvider.js';
import { classifyExtractedQuestion } from '../../extraction/metadataClassifier.js';

export class RulesProvider extends BaseAIProvider {
  constructor() {
    super('rules');
  }

  isConfigured() {
    return true;
  }

  async classify(question, catalog, docMeta = {}, uploadContext = {}) {
    const result = classifyExtractedQuestion(question, catalog, docMeta, uploadContext);
    return {
      class: result.class,
      subjectId: result.subjectId?.toString?.() || result.subjectId,
      chapterId: result.chapterId?.toString?.() || result.chapterId,
      examTypeId: result.examTypeId?.toString?.() || result.examTypeId,
      difficulty: result.difficulty,
      tags: result.tags,
      confidence: (result.aiConfidence || 30) / 100,
      status: result.status,
      extractionWarnings: result.extractionWarnings,
      aiMetadata: result.aiMetadata,
    };
  }
}
