import fs from 'fs/promises';
import path from 'path';
import { pdf } from 'pdf-to-img';
import { logger } from '../utils/logger.js';

/**
 * Render PDF pages to PNG buffers (for scanned / image-only PDFs).
 */
export async function renderPdfPages(filePath, options = {}) {
  const maxPages = options.maxPages ?? 30;
  const scale = options.scale ?? 2;
  const pages = [];

  try {
    const doc = await pdf(filePath, { scale });
    let pageNum = 0;
    for await (const image of doc) {
      pageNum += 1;
      if (pageNum > maxPages) {
        logger.warn('PDF page limit reached for OCR', { filePath, maxPages });
        break;
      }
      pages.push({ pageNum, buffer: image });
    }
  } catch (err) {
    logger.error('PDF to image conversion failed', { filePath, error: err.message });
    throw err;
  }

  return pages;
}

export async function savePdfPageImages(filePath, outDir, options = {}) {
  await fs.mkdir(outDir, { recursive: true });
  const pages = await renderPdfPages(filePath, options);
  const saved = [];
  for (const { pageNum, buffer } of pages) {
    const name = `page-${String(pageNum).padStart(3, '0')}.png`;
    const full = path.join(outDir, name);
    await fs.writeFile(full, buffer);
    saved.push({ pageNum, path: full });
  }
  return saved;
}
