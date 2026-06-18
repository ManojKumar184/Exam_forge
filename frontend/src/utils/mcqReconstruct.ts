import type { QuestionOption } from '../types';
import { runStagesReconstruction, shieldMathRegions } from './reconstructionPipeline';

const INLINE_MCQ_MARKER = /(?<![A-Za-z0-9])(?:(\(\s*([a-dA-D])\s*\))|(\b([a-dA-D])\s*[\).]))/gi;

/**
 * Extract MCQ options from text safely by running the modular 10-stage pipeline.
 */
export function extractMcqOptions(text: string): { stem: string; options: QuestionOption[] } {
  if (!text) return { stem: text, options: [] };
  
  const pipeline = runStagesReconstruction(text);
  
  if (pipeline.questionType === 'mcq') {
    return {
      stem: pipeline.stem,
      options: pipeline.options,
    };
  }
  
  return { stem: text, options: [] };
}

/**
 * Count valid unique MCQ markers in text safely by shielding math regions first.
 */
export function countMcqMarkers(text: string): number {
  if (!text) return 0;
  const { shielded } = shieldMathRegions(text);
  const labels = new Set<string>();
  const re = new RegExp(INLINE_MCQ_MARKER.source, 'gi');
  let m;
  while ((m = re.exec(shielded)) !== null) {
    const label = (m[2] || m[4] || '').toLowerCase();
    labels.add(label);
  }
  return labels.size;
}
