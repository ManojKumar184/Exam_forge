import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { SOURCE_TYPES } from './semanticDocumentModel.js';

const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');
const pdfParse = typeof pdfParseModule === 'function'
  ? pdfParseModule
  : pdfParseModule.default || pdfParseModule.PDFParse || pdfParseModule;

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff']);

export async function detectSource(input = {}) {
  if (input.html?.trim()) {
    return { type: SOURCE_TYPES.HTML, confidence: 0.95, signals: ['html_payload'] };
  }
  if (input.plain?.trim() || input.clipboard === true) {
    return { type: SOURCE_TYPES.CLIPBOARD, confidence: 0.9, signals: ['clipboard_plain_text'] };
  }

  const filePath = input.filePath;
  const ext = path.extname(input.filename || filePath || '').toLowerCase();
  const declared = input.fileType?.toLowerCase();

  if (declared === 'docx' || ext === '.docx') {
    return { type: SOURCE_TYPES.DOCX, confidence: 0.98, signals: ['docx_extension'] };
  }

  if (declared === 'image' || IMAGE_EXTENSIONS.has(ext)) {
    return { type: SOURCE_TYPES.IMAGE, confidence: 0.96, signals: ['image_extension'] };
  }

  if (declared === 'pdf' || ext === '.pdf') {
    const scanned = await detectPdfScanState(filePath);
    return {
      type: scanned.isScanned ? SOURCE_TYPES.SCANNED_PDF : SOURCE_TYPES.NATIVE_PDF,
      confidence: scanned.confidence,
      signals: scanned.signals,
      metadata: scanned.metadata,
    };
  }

  return { type: declared || 'unknown', confidence: 0.2, signals: ['unsupported_or_unknown'] };
}

async function detectPdfScanState(filePath) {
  if (!filePath) {
    return { isScanned: false, confidence: 0.4, signals: ['pdf_no_path'], metadata: {} };
  }

  try {
    const buffer = await fs.readFile(filePath);
    const parsed = await parsePdfBuffer(buffer);
    const textLength = (parsed.text || '').trim().length;
    const pageCount = parsed.numpages || 0;
    const charsPerPage = pageCount ? textLength / pageCount : textLength;
    const isScanned = textLength < 30 || charsPerPage < 20;
    return {
      isScanned,
      confidence: isScanned ? 0.86 : 0.9,
      signals: isScanned ? ['pdf_low_embedded_text', `chars:${textLength}`] : ['pdf_embedded_text', `chars:${textLength}`],
      metadata: { textLength, pageCount, charsPerPage },
    };
  } catch (err) {
    return {
      isScanned: true,
      confidence: 0.72,
      signals: ['pdf_parse_failed', err.message],
      metadata: {},
    };
  }
}

async function parsePdfBuffer(buffer) {
  if (typeof pdfParse === 'function' && !String(pdfParse).startsWith('class')) {
    return pdfParse(buffer);
  }
  const parser = new pdfParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy?.();
  return {
    text: result.text || '',
    numpages: result.total || result.pages?.length || null,
  };
}
