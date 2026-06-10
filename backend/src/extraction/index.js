import path from 'path';
import { extractDocxQuestions } from './extractDocxQuestions.js';
import { extractPdfQuestions } from './extractPdfQuestions.js';
import { extractImageQuestions } from './extractImageQuestions.js';
import { detectDuplicatesForQuestions } from './detectDuplicates.js';
import { Question } from '../models/Question.js';
import { documentIntelligencePipeline } from './documentIntelligence/ingestionPipeline.js';

export { extractDocxQuestions } from './extractDocxQuestions.js';
export { extractPdfQuestions, extractPdfWithOcrFallback } from './extractPdfQuestions.js';
export { extractImageQuestions } from './extractImageQuestions.js';
export { normalizeQuestions, splitTextIntoBlocks } from './normalizeQuestions.js';
export { detectDuplicatesForQuestions } from './detectDuplicates.js';
export { documentIntelligencePipeline } from './documentIntelligence/ingestionPipeline.js';
export { detectSource } from './documentIntelligence/sourceDetection.js';
export { createSemanticDocument, semanticDocumentFromLegacyBlocks } from './documentIntelligence/semanticDocumentModel.js';
export { validateDocxTemplate, isTemplateDocument } from './templateValidator.js';
export { detectAnswer, detectAnswerInLine } from './answerDetector.js';
export { detectExplanation, isExplanationLine } from './explanationDetector.js';

export class ExtractionService {
  async processFile(filePath, fileType, context = {}) {
    const ext = fileType?.toLowerCase();
    return documentIntelligencePipeline.process(
      {
        filePath,
        fileType: ext,
        filename: context.filename || context.sourceFile || path.basename(filePath),
      },
      context
    );
  }

  async processClipboard({ html = '', plain = '' } = {}, context = {}) {
    return documentIntelligencePipeline.process(
      {
        html,
        plain,
        clipboard: true,
        fileType: html?.trim() ? 'html' : 'manual',
        filename: context.sourceFile || 'clipboard',
      },
      context
    );
  }

  async processAndDeduplicate(filePath, fileType, context = {}) {
    const result = await this.processFile(filePath, fileType, context);
    const withDupes = await detectDuplicatesForQuestions(Question, result.questions || []);
    return { ...result, questions: withDupes };
  }
}

export const extractionService = new ExtractionService();
