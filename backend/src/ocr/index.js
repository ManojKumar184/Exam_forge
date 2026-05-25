import path from 'path';
import fs from 'fs/promises';
import { recognizeImage } from './tesseractOcr.js';
import { renderPdfPages } from './pdfToImages.js';
import { logger } from '../utils/logger.js';
import { retryAsync } from '../utils/retry.js';

export { recognizeImage } from './tesseractOcr.js';
export { postProcessScientificOcr } from './scientificPostProcess.js';
export { renderPdfPages } from './pdfToImages.js';

export class OCRService {
  /**
   * OCR an image file (png, jpg, webp, etc.).
   */
  async recognizeFile(filePath) {
    return retryAsync(() => recognizeImage(filePath), { label: 'tesseract-image' });
  }

  /**
   * OCR all pages of a PDF (scanned / image-only).
   */
  async recognizePdfPages(filePath, options = {}) {
    const pages = await renderPdfPages(filePath, options);
    const parts = [];
    const pageResults = [];
    let totalConfidence = 0;

    for (const { pageNum, buffer } of pages) {
      const result = await retryAsync(() => recognizeImage(buffer), {
        label: `tesseract-pdf-page-${pageNum}`,
      });
      parts.push(`\n--- Page ${pageNum} ---\n${result.text}`);
      pageResults.push({ pageNum, ...result });
      totalConfidence += result.confidence;
    }

    const avgConfidence = pages.length ? totalConfidence / pages.length : 0;
    return {
      text: parts.join('\n').trim(),
      rawText: pageResults.map((p) => p.rawText).join('\n'),
      confidence: avgConfidence,
      warnings: pageResults.flatMap((p) => p.warnings || []),
      uncertainSpans: pageResults.flatMap((p) => p.uncertainSpans || []),
      pageResults,
      pageCount: pages.length,
    };
  }

  /**
   * Extract images from mixed document folder and OCR each.
   */
  async recognizeImageDirectory(dirPath) {
    const entries = await fs.readdir(dirPath);
    const images = entries.filter((f) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(f));
    const texts = [];
    for (const img of images.sort()) {
      const full = path.join(dirPath, img);
      const r = await this.recognizeFile(full);
      texts.push(r.text);
    }
    return { text: texts.join('\n\n'), imageCount: images.length };
  }
}

export const ocrService = new OCRService();
