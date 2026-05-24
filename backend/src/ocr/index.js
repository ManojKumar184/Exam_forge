/**
 * OCR service — Phase 4 (Tesseract.js initial)
 * Architecture supports future: PaddleOCR, Mathpix, cloud APIs
 */
export class OCRService {
  static STATUS = 'NOT_IMPLEMENTED';

  async extractFromImage(_filePath) {
    throw new Error('OCR is not implemented yet. See docs/MERN_MIGRATION.md Phase 4.');
  }
}

export const ocrService = new OCRService();
