import { extractPrimaryLatex, stripLatexDelimiters, containsLatex } from '../extraction/latexUtils.js';
import { normalizeQuestionText } from './duplicateHash.js';

/**
 * Normalize equation-bearing text for duplicate comparison.
 */
export function equationFingerprint(text, latex = null) {
  const raw = latex || extractPrimaryLatex(text) || text || '';
  const stripped = stripLatexDelimiters(raw)
    .replace(/\\frac\s*\{([^}]+)\}\s*\{([^}]+)\}/g, '$1/$2')
    .replace(/\\sqrt\s*\{([^}]+)\}/g, 'sqrt($1)')
    .replace(/\\int/g, 'integral')
    .replace(/\\sum/g, 'sum')
    .replace(/[_^]\{([^}]+)\}/g, '$1')
    .replace(/[_^](\w)/g, '$1')
    .replace(/\s+/g, '');
  return normalizeQuestionText(stripped);
}

export function equationSimilarity(textA, textB, latexA = null, latexB = null) {
  if (!containsLatex(textA) && !containsLatex(textB) && !latexA && !latexB) return 0;
  const fpA = equationFingerprint(textA, latexA);
  const fpB = equationFingerprint(textB, latexB);
  if (!fpA || !fpB) return 0;
  if (fpA === fpB) return 1;
  const shorter = fpA.length < fpB.length ? fpA : fpB;
  const longer = fpA.length < fpB.length ? fpB : fpA;
  if (longer.includes(shorter) && shorter.length > 8) return 0.85;
  return 0;
}
