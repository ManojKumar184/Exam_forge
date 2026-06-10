import { detectSource } from './sourceDetection.js';
import { SOURCE_TYPES, semanticDocumentFromLegacyBlocks } from './semanticDocumentModel.js';
import { detectQuestionBoundaries, segmentToLegacyBlock } from './boundaryDetector.js';
import { detectAnswer } from './answerDetectionEngine.js';
import { detectExplanation } from './explanationDetectionEngine.js';
import { classifyQuestion } from './questionTypeClassifier.js';
import { validateQuestionObject } from './validationEngine.js';
import { applyConfidence } from './confidenceEngine.js';
import { normalizeQuestions } from '../normalizeQuestions.js';
import { extractDocxQuestions } from '../extractDocxQuestions.js';
import { extractPdfQuestions, extractPdfWithOcrFallback } from '../extractPdfQuestions.js';
import { extractImageQuestions } from '../extractImageQuestions.js';
import { splitTextIntoBlocks, preprocessDocumentText } from '../normalizeQuestions.js';

export class DocumentIntelligencePipeline {
  async process(input = {}, context = {}) {
    const source = await detectSource(input);
    const extraction = await this.extractToBlocks(source, input, context);
    const semanticDocument = extraction.semanticDocument ||
      semanticDocumentFromLegacyBlocks(extraction.blocks || [], source.type, {
        sourceFile: context.sourceFile || input.filename || null,
        sourceDetection: source,
      });

    const segments = detectQuestionBoundaries(semanticDocument);
    const blocks = segments.map(segmentToLegacyBlock);

    if (context.returnRawBlocks) {
      return {
        ...extraction,
        blocks,
        semanticDocument,
        sourceDetection: source,
        boundaryCount: segments.length,
        extractionMode: `${source.type}_semantic_pipeline`,
      };
    }

    let questions = await normalizeQuestions(blocks, {
      ...context,
      extractedFrom: source.type,
      returnRawBlocks: false,
    });

    questions = questions.map((question, index) => {
      const segment = segments[index] || {};
      const block = blocks[index] || {};
      const answer = detectAnswer(segment, question.options || block.options || []);
      const explanation = detectExplanation(segment);
      const classification = classifyQuestion(segment, block);

      const enriched = {
        ...question,
        questionType: classification.questionType,
        answerText: answer.answerText || question.answerText,
        answerKey: answer.answerKey || question.answerKey,
        correctOption: answer.correctOption ?? question.correctOption,
        correctAnswers: answer.correctAnswers?.length ? answer.correctAnswers : question.correctAnswers,
        explanation: explanation.explanation || question.explanation,
        explanationImages: explanation.images || question.explanationImages || [],
        extractionWarnings: [
          ...(question.extractionWarnings || []),
          ...answer.warnings,
          ...explanation.warnings,
        ],
        renderingMetadata: {
          ...(question.renderingMetadata || {}),
          sourceDetection: source,
          answerDetection: { level: answer.level, method: answer.method, confidence: answer.confidence },
          explanationDetection: { confidence: explanation.confidence },
          semanticDocumentVersion: semanticDocument.version,
        },
      };

      const validation = validateQuestionObject(enriched);
      const withConfidence = applyConfidence(enriched, {
        boundary: segment.confidence,
        answer: answer.confidence,
        explanation: explanation.confidence,
        classification: classification.confidence,
        validation: validation.valid ? 0.9 : 0.55,
      });

      return {
        ...withConfidence,
        status: validation.status === 'needs_review' ? 'needs_review' : withConfidence.status,
        extractionWarnings: [...withConfidence.extractionWarnings, ...validation.issues],
      };
    });

    return {
      ...extraction,
      questions,
      blocks,
      semanticDocument,
      sourceDetection: source,
      boundaryCount: segments.length,
      extractionMode: `${source.type}_semantic_pipeline`,
    };
  }

  async extractToBlocks(source, input, context) {
    const innerContext = { ...context, returnRawBlocks: true };
    if (source.type === SOURCE_TYPES.DOCX) {
      return extractDocxQuestions(input.filePath, innerContext);
    }
    if (source.type === SOURCE_TYPES.NATIVE_PDF) {
      return extractPdfQuestions(input.filePath, innerContext);
    }
    if (source.type === SOURCE_TYPES.SCANNED_PDF) {
      return extractPdfWithOcrFallback(input.filePath, innerContext);
    }
    if (source.type === SOURCE_TYPES.IMAGE) {
      return extractImageQuestions(input.filePath, innerContext);
    }
    if (source.type === SOURCE_TYPES.HTML || source.type === SOURCE_TYPES.CLIPBOARD) {
      const rawText = preprocessDocumentText(input.plain || input.html || '');
      return {
        blocks: splitTextIntoBlocks(rawText),
        questions: [],
        warnings: [],
        rawText,
        rawTextLength: rawText.length,
      };
    }
    return { blocks: [], questions: [], warnings: [`Unsupported source type: ${source.type}`] };
  }
}

export const documentIntelligencePipeline = new DocumentIntelligencePipeline();
