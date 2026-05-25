import path from 'path';
import { extractDocxQuestions } from './extractDocxQuestions.js';
import { extractPdfQuestions } from './extractPdfQuestions.js';
import { extractImageQuestions } from './extractImageQuestions.js';
import { detectDuplicatesForQuestions } from './detectDuplicates.js';
import { Question } from '../models/Question.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

export { extractDocxQuestions } from './extractDocxQuestions.js';
export { extractPdfQuestions, extractPdfWithOcrFallback } from './extractPdfQuestions.js';
export { extractImageQuestions } from './extractImageQuestions.js';
export { normalizeQuestions, splitTextIntoBlocks } from './normalizeQuestions.js';
export { detectDuplicatesForQuestions } from './detectDuplicates.js';

export class ExtractionService {
  async processFile(filePath, fileType, context = {}) {
    const ext = fileType?.toLowerCase();

    if (ext === 'docx') {
      return extractDocxQuestions(filePath, context);
    }
    if (ext === 'pdf') {
      return extractPdfQuestions(filePath, context);
    }
    if (ext === 'image') {
      if (!env.ocr.enabled) {
        throw new AppError('OCR is disabled on this server', 503, 'OCR_DISABLED');
      }
      return extractImageQuestions(filePath, context);
    }
    throw new AppError(`Unsupported file type: ${ext}`, 400, 'UNSUPPORTED_FILE');
  }

  async processAndDeduplicate(filePath, fileType, context = {}) {
    const result = await this.processFile(filePath, fileType, context);
    const withDupes = await detectDuplicatesForQuestions(Question, result.questions || []);
    return { ...result, questions: withDupes };
  }
}

export const extractionService = new ExtractionService();
