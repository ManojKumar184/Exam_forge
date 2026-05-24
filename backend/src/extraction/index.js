import path from 'path';
import { extractDocxQuestions } from './extractDocxQuestions.js';
import { extractPdfQuestions } from './extractPdfQuestions.js';
import { detectDuplicatesForQuestions } from './detectDuplicates.js';
import { Question } from '../models/Question.js';
import { AppError } from '../utils/AppError.js';

export { extractDocxQuestions } from './extractDocxQuestions.js';
export { extractPdfQuestions } from './extractPdfQuestions.js';
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
      throw new AppError(
        'Image uploads require OCR (Phase 4). Use PDF or DOCX for now.',
        400,
        'OCR_NOT_IMPLEMENTED'
      );
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
