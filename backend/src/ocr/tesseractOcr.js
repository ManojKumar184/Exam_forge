import Tesseract from 'tesseract.js';
import { logger } from '../utils/logger.js';
import { postProcessScientificOcr } from './scientificPostProcess.js';

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            logger.debug('OCR progress', { progress: m.progress });
          }
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: '3',
      });
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * OCR a single image file or buffer.
 */
export async function recognizeImage(input, options = {}) {
  const worker = await getWorker();
  const { data } = await worker.recognize(input);
  const confidence = data.confidence ?? 0;
  const rawText = data.text || '';
  const processed = postProcessScientificOcr(rawText, confidence);

  return {
    rawText,
    text: processed.text,
    confidence,
    warnings: processed.warnings,
    uncertainSpans: processed.uncertainSpans,
    hasEquation: processed.hasEquation,
    questionLatex: processed.questionLatex,
    words: (data.words || []).map((w) => ({
      text: w.text,
      confidence: w.confidence,
      bbox: w.bbox,
    })),
  };
}

export async function terminateOcrWorker() {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
