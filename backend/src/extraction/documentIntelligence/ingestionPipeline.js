import { detectSource } from './sourceDetection.js';
import { SOURCE_TYPES, semanticDocumentFromLegacyBlocks } from './semanticDocumentModel.js';
import { detectQuestionBoundaries, segmentToLegacyBlock } from './boundaryDetector.js';
import { detectAnswer, extractSeparateAnswerKey, mapSeparateAnswerKey } from './answerDetectionEngine.js';
import { detectExplanation } from './explanationDetectionEngine.js';
import { classifyQuestion } from './questionTypeClassifier.js';
import { resolveQuestionTaxonomy } from '../../utils/questionTaxonomy.js';
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

    const separateAnswerKey = extractSeparateAnswerKey(semanticDocument.blocks || []);
    if (separateAnswerKey.found) {
      const excluded = new Set(separateAnswerKey.sourceBlockIndexes);
      semanticDocument.blocks = semanticDocument.blocks.filter((_, index) => !excluded.has(index));
    }
    const segments = detectQuestionBoundaries(semanticDocument);
    const answerKeyMapping = mapSeparateAnswerKey(separateAnswerKey, segments);
    const globalAnswerKeyWarnings = answerKeyMapping.issues
      .filter((issue) => !issue.questionNumber || !segments.some((segment) => segment.questionNumber === issue.questionNumber))
      .map((issue) => `Answer key review: ${issue.type}${issue.questionNumber ? ` (question ${issue.questionNumber})` : ''}`);
    const blocks = segments.map(segmentToLegacyBlock);

    if (context.returnRawBlocks) {
      return {
        ...extraction,
        warnings: [...(extraction.warnings || []), ...globalAnswerKeyWarnings],
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

    questions = questions.map((question) => {
      const segmentId = question.renderingMetadata?.segmentId;
      const segment = segmentId ? (segments.find(s => s.id === segmentId) || {}) : {};
      const block = segmentId ? (blocks.find(b => b.segmentId === segmentId) || {}) : {};
      const answer = detectAnswer(segment, question.options || block.options || []);
      if (segment.answerMapping) {
        answer.answerText = segment.answerMapping.answer.join(',');
        answer.answerKey = answer.answerText;
        answer.correctAnswers = segment.answerMapping.answer.filter((label) => /^[A-H]$/.test(label));
        answer.correctOption = answer.correctAnswers.length === 1 ? answer.correctAnswers[0].charCodeAt(0) - 65
          : (segment.answerMapping.answer.length === 1 && ['TRUE', 'T'].includes(segment.answerMapping.answer[0]) ? 0
            : (segment.answerMapping.answer.length === 1 && ['FALSE', 'F'].includes(segment.answerMapping.answer[0]) ? 1 : null));
        if (segment.answerMapping.answer.length === 1 && /^-?\d+(?:\.\d+)?$/.test(segment.answerMapping.answer[0])) answer.numericalAnswer = Number(segment.answerMapping.answer[0]);
        answer.confidence = segment.answerMapping.confidence;
        answer.method = 'separate_answer_key';
        answer.warnings = [];
      }
      if (segment.answerMappingIssues?.length) answer.warnings.push(...segment.answerMappingIssues.map((issue) => `Answer key review: ${issue.type}${issue.questionNumber ? ` (question ${issue.questionNumber})` : ''}`));
      const explanation = detectExplanation(segment);
      const classification = classifyQuestion(segment, block, answer);
      const taxonomy = resolveQuestionTaxonomy({ questionType: classification.questionType, subtype: classification.subtype });

      const enriched = {
        ...question,
        options: question.options?.length ? question.options : (classification.questionType === 'TRUE_FALSE' ? [{ text: 'True' }, { text: 'False' }] : []),
        questionType: classification.questionType,
        responseType: taxonomy.responseType,
        subtype: taxonomy.subtype,
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
          answerKeyValidation: segment.answerMappingIssues || [],
          fidelity: {
            ...(question.renderingMetadata?.fidelity || {}),
            boundaryConfidence: segment.confidence ?? null,
            classificationConfidence: classification.confidence ?? null,
            answerConfidence: answer.confidence ?? null,
          },
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
      warnings: [...(extraction.warnings || []), ...globalAnswerKeyWarnings],
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
