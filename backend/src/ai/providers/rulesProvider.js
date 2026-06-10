import { BaseAIProvider } from './baseProvider.js';
import { classifyExtractedQuestion } from '../../extraction/metadataClassifier.js';
import { resolveHintsToSyllabusMappings } from '../syllabusCatalog.js';

export class RulesProvider extends BaseAIProvider {
  constructor() {
    super('rules');
  }

  isConfigured() {
    return true;
  }

  async classify(question, catalog, docMeta = {}, uploadContext = {}) {
    const result = classifyExtractedQuestion(question, catalog, docMeta, uploadContext);

    // Resolve syllabusMappings using names from metadataClassifier (result.subjectName etc.)
    // Flat model IDs (Subject._id) cannot be directly mapped to SyllabusNode IDs since
    // they belong to separate collections; we match by name instead.
    let syllabusMappings = null;
    const syllabusCatalog = catalog?.syllabus || null;
    if (syllabusCatalog && (result.subjectName || result.examTypeName)) {
      try {
        syllabusMappings = resolveHintsToSyllabusMappings(
          {
            subject: result.subjectName || null,
            topic: result.topicName || null,
            examType: result.examTypeName || null,
            class: result.class,
          },
          syllabusCatalog
        );
      } catch {
        // syllabus mappings are optional, silently continue
      }
    }

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
      syllabusMappings,
      subjectName: result.subjectName || null,
      topicName: result.topicName || null,
      examTypeName: result.examTypeName || null,
    };
  }
}
