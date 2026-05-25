/**
 * Extract and preserve LaTeX from question/option text.
 */

const INLINE_PATTERNS = [
  /\$\$([\s\S]+?)\$\$/g,
  /\\\[([\s\S]+?)\\\]/g,
  /\$([^$\n]+?)\$/g,
  /\\\(([^)]+?)\\\)/g,
];

export function containsLatex(text) {
  if (!text) return false;
  return /\$|\\frac|\\sqrt|\\int|\\sum|\\begin\{|\\alpha|\\beta|\\pi|_\{|_\w|\^\{|\^\w/.test(text);
}

export function extractPrimaryLatex(text) {
  if (!text) return null;
  const block = text.match(/\$\$([\s\S]+?)\$\$/) || text.match(/\\\[([\s\S]+?)\\\]/);
  if (block) return block[1].trim();
  const inline = text.match(/\$([^$\n]+?)\$/) || text.match(/\\\(([^)]+?)\\\)/);
  if (inline) return inline[1].trim();
  return null;
}

export function stripLatexDelimiters(text) {
  if (!text) return '';
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, '$1')
    .replace(/\\\[([\s\S]+?)\\\]/g, '$1')
    .replace(/\$([^$\n]+?)\$/g, '$1')
    .replace(/\\\(([^)]+?)\\\)/g, '$1')
    .trim();
}

export function enrichTextWithLatexFields(text, target = {}) {
  const hasEq = containsLatex(text);
  if (hasEq && !target.questionLatex) {
    target.questionLatex = extractPrimaryLatex(text) || text;
    target.hasEquation = true;
  }
  return target;
}

export function enrichOptionWithLatex(option) {
  const text = option.text || '';
  if (containsLatex(text)) {
    return {
      ...option,
      latex: option.latex || extractPrimaryLatex(text) || text,
      text: stripLatexDelimiters(text) || text,
    };
  }
  return option;
}
