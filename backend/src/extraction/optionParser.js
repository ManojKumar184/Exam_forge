/**
 * MCQ option detection — coaching layouts, OCR spacing, inline (a)(b)(c)(d).
 */

import {
  extractMcqOptionsInline,
  countMcqOptionMarkers,
  hasMcqOptionPattern,
} from './mcqOptionExtract.js';

const OPTION_LINE_START =
  /^\s*(?:\(?\s*([a-dA-D])\s*\)?\s*[\).:\-–—]\s*|([a-dA-D])\s*[\).:\-–—]\s+)(.+)$/;

/** Lines that continue previous option (wrapped OCR / Word export). */
const OPTION_CONTINUATION_RE = /^\s{2,}|^[a-z]/;

export function isOptionLine(line) {
  return OPTION_LINE_START.test(line.trim());
}

export function parseOptionLine(line) {
  const m = line.trim().match(OPTION_LINE_START);
  if (!m) return null;
  const label = (m[1] || m[2] || '').toLowerCase();
  return {
    label,
    text: (m[3] || '').trim(),
    image: null,
    latex: null,
  };
}

/**
 * Append wrapped lines to the last option when not a new question/option start.
 */
export function appendOptionContinuation(options, line) {
  if (!options.length || !line?.trim()) return options;
  const trimmed = line.trim();
  if (OPTION_LINE_START.test(trimmed) || /^(?:Q|Question)\s*\d/i.test(trimmed)) {
    return options;
  }
  const last = options[options.length - 1];
  if (!last?.text) return options;
  if (OPTION_CONTINUATION_RE.test(line) || trimmed.length < 120) {
    const copy = [...options];
    copy[copy.length - 1] = { ...last, text: `${last.text} ${trimmed}`.trim() };
    return copy;
  }
  return options;
}

/**
 * Pull (a)(b)(c)(d) options embedded in question body text.
 */
export function extractInlineOptions(text) {
  const { stem, options } = extractMcqOptionsInline(text);
  return {
    stem,
    options: options.map(({ text: t, image, latex }) => ({ text: t, image, latex })),
  };
}

export function countOptionMarkers(text) {
  return countMcqOptionMarkers(text);
}

export { hasMcqOptionPattern };
