/**
 * Equation-safe normalization — do not split P(A), wrap fractions in options.
 */

const UNICODE_MATH = /[∫∑∏√∞±×÷²³⁰¹⁴⁵⁶⁷⁸⁹αβγδθλμπσφω∩∪∣]/;
const LATEX_HINT = /\\frac|\\sqrt|\\int|\\sum|\\begin\{|\\alpha|\\beta|\\pi|_\{|_\w|\^\{|\^\w/;

export function containsMath(text: string): boolean {
  if (!text?.trim()) return false;
  return /\$/.test(text) || LATEX_HINT.test(text) || UNICODE_MATH.test(text);
}

export function extractPrimaryLatex(text: string): string | null {
  const block = text.match(/\$\$([\s\S]+?)\$\$/) || text.match(/\\\[([\s\S]+?)\\\]/);
  if (block) return block[1].trim();
  const inline = text.match(/\$([^$\n]+?)\$/) || text.match(/\\\(([^)]+?)\\\)/);
  if (inline) return inline[1].trim();
  return null;
}

/** Wrap simple numeric fractions (e.g. 1/4) — safe for MCQ option text. */
export function wrapOptionFractions(text: string): string {
  if (!text || /\$/.test(text)) return text;
  return text.replace(/(?<![\d$\\])(\d+)\s*\/\s*(\d+)(?!\d)/g, (_, a, b) => `$\\frac{${a}}{${b}}$`);
}

/** Stem/body: unicode math only; avoid wrapping whole lines that contain P(A). */
export function autoWrapEquations(text: string): string {
  if (!text?.trim()) return text;
  if (/\$[^$]+\$/.test(text)) return text;

  let out = text;
  if (UNICODE_MATH.test(out)) {
    out = out
      .replace(/∩/g, '\\cap ')
      .replace(/∪/g, '\\cup ')
      .replace(/∣/g, '|')
      .replace(/∫/g, '\\int ')
      .replace(/∑/g, '\\sum ')
      .replace(/√\s*\(/g, '\\sqrt{')
      .replace(/√(\w+)/g, '\\sqrt{$1}')
      .replace(/∞/g, '\\infty')
      .replace(/±/g, '\\pm ')
      .replace(/×/g, '\\times ')
      .replace(/÷/g, '\\div ');
  }

  if (LATEX_HINT.test(out) && !/\$/.test(out)) {
    const lines = out.split('\n');
    out = lines
      .map((line) => {
        const t = line.trim();
        if (!t || /\$/.test(t) || /P\s*\([A-D]\)/i.test(t)) return line;
        if (LATEX_HINT.test(t) || UNICODE_MATH.test(t)) {
          return line.replace(t, `$${t}$`);
        }
        return line;
      })
      .join('\n');
  }

  return out;
}

export function enrichOptionMath(option: {
  text: string;
  latex?: string | null;
  image?: string | null;
}) {
  const wrapped = wrapOptionFractions(autoWrapEquations(option.text || ''));
  const latex = option.latex || extractPrimaryLatex(wrapped);
  return { ...option, text: wrapped, latex: latex || null };
}
