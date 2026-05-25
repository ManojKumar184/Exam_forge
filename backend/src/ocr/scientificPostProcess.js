import { containsLatex, enrichTextWithLatexFields } from '../extraction/latexUtils.js';

const UNCERTAIN_PATTERNS = [
  { re: /[Il1|]{3,}/, reason: 'ambiguous_characters' },
  { re: /\?\?+/, reason: 'ocr_garbage' },
  { re: /[^\x00-\x7F]{5,}/, reason: 'non_ascii_run' },
];

const CHEM_PATTERN = /\b([A-Z][a-z]?)(\d+)([A-Z][a-z]?\d*)*/g;
const SUPER_PATTERN = /(\w)([²³⁰¹⁴⁵⁶⁷⁸⁹]|\^[0-9+\-]+)/g;
const FRAC_PATTERN = /(\d+)\s*\/\s*(\d+)/g;
const INTEGRAL_CHARS = /[∫∑∏√∞±×÷]/;

function unicodeSuperToLatex(match, base, sup) {
  const map = { '²': '2', '³': '3', '⁰': '0', '¹': '1', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  const exp = map[sup] || sup.replace(/^\^/, '');
  return `${base}^{${exp}}`;
}

/**
 * Heuristic conversion of OCR text toward LaTeX; flags uncertain regions.
 */
export function postProcessScientificOcr(rawText, ocrConfidence = 0) {
  const warnings = [];
  const uncertainSpans = [];
  let text = rawText || '';

  for (const { re, reason } of UNCERTAIN_PATTERNS) {
    let m;
    while ((m = re.exec(text)) !== null) {
      uncertainSpans.push({ start: m.index, end: m.index + m[0].length, reason });
    }
  }

  if (ocrConfidence > 0 && ocrConfidence < 65) {
    warnings.push('Low OCR confidence — verify equations and symbols');
    uncertainSpans.push({ start: 0, end: text.length, reason: 'low_confidence' });
  }

  if (INTEGRAL_CHARS.test(text)) {
    text = text
      .replace(/∫/g, '\\int ')
      .replace(/∑/g, '\\sum ')
      .replace(/√\s*\(/g, '\\sqrt{')
      .replace(/√(\w+)/g, '\\sqrt{$1}')
      .replace(/∞/g, '\\infty')
      .replace(/±/g, '\\pm ');
    warnings.push('Converted unicode math symbols to LaTeX — verify');
  }

  text = text.replace(SUPER_PATTERN, unicodeSuperToLatex);
  text = text.replace(FRAC_PATTERN, (m, a, b) => {
    if (Number(b) === 0) return m;
    return `\\frac{${a}}{${b}}`;
  });

  if (CHEM_PATTERN.test(text)) {
    text = text.replace(CHEM_PATTERN, (formula) => {
      return formula.replace(/([A-Z][a-z]?)(\d+)/g, '$1_{$2}');
    });
    warnings.push('Chemistry formula subscripts inferred — verify');
  }

  const result = { text, warnings, uncertainSpans, hasEquation: containsLatex(text) };
  enrichTextWithLatexFields(text, result);
  if (result.hasEquation && !result.questionLatex) {
    result.questionLatex = text;
  }

  if (uncertainSpans.length > 0 && !warnings.some((w) => w.includes('Low OCR'))) {
    warnings.push('Uncertain OCR regions detected — needs review');
  }

  return result;
}
