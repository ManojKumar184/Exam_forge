import type { QuestionOption, QuestionType } from '../types';
import type { EditorSubtype } from './questionPasteDetect';
import type { SemanticBlock } from './clipboardIngestion';
import { preNormalizeMathText, normalizeLatexSyntax } from './mathNormalizer';

export interface ReconstructionDebugInfo {
  rawClipboardHtml: string | null;
  extractedSemanticBlocks: string[] | null;
  shieldedMathPlaceholders: Record<string, string>;
  preNormalizedMath: Record<string, string>;
  postNormalizedMath: Record<string, string>;
  finalReconstructedOutput: {
    stem: string;
    options: QuestionOption[];
  };
  timings?: {
    ingestionMs: number;
    reconstructionMs: number;
    classificationMs: number;
  };
  classification?: {
    class?: number;
    difficulty?: string;
    questionType?: string;
    confidence?: number;
    hints?: {
      subject?: string;
      topic?: string;
      examType?: string;
    };
    aiMetadata?: {
      providers?: string[];
      rules?: any;
      semantic?: any;
      llm?: {
        confidence?: number;
        hints?: any;
        reasoning?: string;
      };
    };
    extractionWarnings?: string[];
  };
  stages?: any;
}

export interface PipelineResult {
  questionText: string;
  questionHtml: string | null;
  questionLatex: string | null;
  questionType: QuestionType;
  subtype: EditorSubtype;
  options: QuestionOption[];
  tags: string[];
  questionImages: string[];
  numericalAnswer: number | null;
  correctOption: number | null;
  warnings: string[];
  sources: { parser: boolean; ocr: boolean; gemini: boolean; ollama?: boolean };
  
  raw_stem: string;
  raw_options: QuestionOption[];
  layout_blocks: Array<{ lines: string[]; options: string[]; passage: string | null; tags: string[] }>;
  parser_confidence: number;
  ocr_confidence: number | null;
  debugInfo?: ReconstructionDebugInfo;
}

export interface PipelineInput {
  html?: string;
  plain?: string;
  ocrText?: string;
  images?: string[];
  useGemini?: boolean;
}

// Unicode math mappings for Stage 9 LaTeX Normalization
const UNICODE_TO_LATEX: Record<string, string> = {
  '∩': ' \\cap ',
  '∪': ' \\cup ',
  '⊂': ' \\subset ',
  '⊆': ' \\subseteq ',
  '√': ' \\sqrt ',
  'π': ' \\pi ',
  '∑': ' \\sum ',
  '∫': ' \\int ',
  '≤': ' \\le ',
  '≥': ' \\ge ',
  '≠': ' \\ne ',
  '±': ' \\pm ',
  '×': ' \\times ',
  '÷': ' \\div ',
  '−': ' - ',
  'α': ' \\alpha ',
  'β': ' \\beta ',
  'γ': ' \\gamma ',
  'delta': ' \\delta ',
  'theta': ' \\theta ',
  'lambda': ' \\lambda ',
  'mu': ' \\mu ',
  'sigma': ' \\sigma ',
  'phi': ' \\phi ',
  'psi': ' \\psi ',
  'omega': ' \\omega ',
};

// Safe mathematical characters that should NOT be stripped during Stage 2 Unicode Cleanup
const SAFE_MATH_CHARS = /[a-zA-Z0-9\s.,;:!?@#&%"'~$()\[\]{}=+\-*/\^_\u2229\u222a\u2282\u2286\u221a\u03c0\u2211\u222b\u2264\u2265\u2260−\u00d7\u00f7|\\{}]/;

const QUESTION_START_RE =
  /^(?:Q(?:uestion)?\s*)?(\d{1,3})[\).:\-\s]+|^\((\d{1,3})\)\s+|^(\d{1,3})\.\s+(?=[A-Za-z(\\$])/i;

const OPTION_LINE_START =
  /^\s*(?:\(?\s*([a-dA-D])\s*\)?\s*[\).:\-–—]\s*|([a-dA-D])\s*[\).:\-–—]\s+)/i;

const ENDS_WITH_CONTINUATION =
  /(?:such\s+that|where|and|or|is|are|if|then|=|\+|-|\*|\/|,|that)$/i;

const OFFICE_PLAIN_NOISE = [
  /Normal\s+0\s+false\s+false\s+false\s+[A-Z\-]+/gi,
  /false\s+false\s+false\s+EN-US\s+JH\s+K[0-9]+/gi,
  /false\s+false\s+false\s+EN-US/gi,
  /\bNormal\s+0\b/gi,
  /^\s*[\u00a0\f\v]+\s*$/gm,
  /\bMsoNormal\b/gi,
];

// Helper to decode HTML entities
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  // Simple regex-based replacement to avoid browser-only document dependency on backend
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function normalizeOptionPrefixes(text: string): string {
  if (!text) return '';
  let result = text;
  
  // 1. Bracket formats: (A), [A], (a), [a]
  result = result.replace(/(?<![a-zA-Z0-9_\$])[\(\[]\s*([a-dA-D])\s*[\)\]]/gi, (_, letter) => {
    return `OPTION_${letter.toUpperCase()}`;
  });
  
  // 2. Trailing punctuation formats: A., A), A:, A - followed by space or end of line
  result = result.replace(/(?<![\(\[a-zA-Z0-9_\$])\b([a-dA-D])\s*[\).:\-–—](?=\s|$)/gi, (_, letter) => {
    return `OPTION_${letter.toUpperCase()}`;
  });
  
  return result;
}

export function splitOptionsByMarkers(text: string): { stem: string; options: Array<{ label: string; text: string }>; success: boolean } {
  if (!text) return { stem: '', options: [], success: false };
  
  const markerRegex = /\bOPTION_([A-D])\b/g;
  const matches: Array<{ label: string; index: number; length: number }> = [];
  let match;
  while ((match = markerRegex.exec(text)) !== null) {
    matches.push({
      label: match[1].toLowerCase(),
      index: match.index,
      length: match[0].length
    });
  }
  
  const LABEL_ORDER = ['a', 'b', 'c', 'd'];
  const sequences: Array<Array<{ label: string; index: number; length: number }>> = [];
  for (let i = 0; i < matches.length; i++) {
    const seq = [matches[i]];
    let lastIdx = LABEL_ORDER.indexOf(matches[i].label);
    for (let j = i + 1; j < matches.length; j++) {
      const idx = LABEL_ORDER.indexOf(matches[j].label);
      if (idx === lastIdx + 1) {
        seq.push(matches[j]);
        lastIdx = idx;
      }
    }
    sequences.push(seq);
  }
  
  let longest: Array<{ label: string; index: number; length: number }> = [];
  for (const seq of sequences) {
    if (seq.length > longest.length) {
      longest = seq;
    }
  }
  
  if (longest.length >= 2) {
    const stem = text.slice(0, longest[0].index).trim();
    const options: Array<{ label: string; text: string }> = [];
    for (let i = 0; i < longest.length; i++) {
      const start = longest[i].index + longest[i].length;
      const end = i + 1 < longest.length ? longest[i + 1].index : text.length;
      const optionText = text.slice(start, end).replace(/^[\s).:\-–—]+/, '').trim();
      options.push({
        label: longest[i].label,
        text: optionText
      });
    }
    return { stem, options, success: true };
  }
  
  return { stem: text, options: [], success: false };
}

/**
 * Stage 1: OCR Normalization
 */
export function normalizeOcrText(text: string): string {
  if (!text) return '';
  return decodeHtmlEntities(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Stage 2: Unicode Cleanup
 */
export function cleanUnicodeText(text: string): string {
  if (!text) return '';
  let out = text;
  for (const re of OFFICE_PLAIN_NOISE) {
    out = out.replace(re, ' ');
  }
  out = out
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '');

  // Strip non-safe mathematical characters, preserving the structure
  const chars = Array.from(out);
  const cleaned = chars
    .map((ch) => (SAFE_MATH_CHARS.test(ch) ? ch : ''))
    .join('');

  return cleaned
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Stage 3: Math Shielding
 */
export function shieldMathRegions(text: string): { shielded: string; placeholders: Map<string, string> } {
  const placeholders = new Map<string, string>();
  let count = 0;
  let work = text;

  const addPlaceholder = (match: string): string => {
    const key = `MATHPLACEHOLDER${count++}`;
    placeholders.set(key, match);
    return key;
  };

  // 1. Double Dollar block LaTeX
  work = work.replace(/\$\$([\s\S]+?)\$\$/g, addPlaceholder);

  // 2. Display Bracket LaTeX
  work = work.replace(/\\\[([\s\S]+?)\\\]/g, addPlaceholder);

  // 3. Single Dollar inline LaTeX
  work = work.replace(/\$([^$\n]+?)\$/g, addPlaceholder);

  // 4. Inline Bracket LaTeX
  work = work.replace(/\\\(([\s\S]+?)\\\)/g, addPlaceholder);

  // 5. Mathematical equations & relations (with explicit operators including +, -, *, /, =, <, >, etc.)
  const eqRegex = /[a-zA-Z0-9_\(\)\[\]\{\}\\\^_\.]+(?:\s*[-+=\*\/<>≤≥≠∩∪−±×÷|]\s*[a-zA-Z0-9_\(\)\[\]\{\}\\\^_\.]+)+/g;
  work = work.replace(eqRegex, addPlaceholder);

  // 6. Probability notation (e.g. P(A))
  work = work.replace(/\b[PQR]\s*\(\s*[a-zA-Z0-9_∪∩⊂⊆\+\-\*\/|\\−\s\(\)]+?\s*\)/g, addPlaceholder);

  // 7. Subscripts & Superscripts
  work = work.replace(/\b[a-zA-Z0-9_]+[\^_][-+a-zA-Z0-9_\(\)]+/g, addPlaceholder);

  // 8. Fractions (e.g. 3/4)
  work = work.replace(/\b\d+\s*\/\s*\d+\b/g, addPlaceholder);

  // 9. Greek letters and other unicode math symbols
  work = work.replace(/[√π∑∫αβγδθλμσφω∩∪⊂⊆≤≥≠±×÷−]/g, addPlaceholder);

  return { shielded: work, placeholders };
}

/**
 * Stage 4: Semantic Line Merging
 */
export function mergeLinesSemantically(text: string): string {
  const lines = text.split('\n').map((l) => l.trimEnd());
  const merged: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i].trim();
    if (!current) continue;

    if (merged.length === 0) {
      merged.push(current);
      continue;
    }

    const prevIdx = merged.length - 1;
    const prev = merged[prevIdx];

    const isPrevShort = prev.length < 55;
    const prevEndsNoPunc = !/[.?!:;]$/.test(prev) && !OPTION_LINE_START.test(prev);
    const prevEndsWithContinuation = ENDS_WITH_CONTINUATION.test(prev);

    const nextStartsLowercase = /^[a-z]/.test(current);
    const nextStartsMath = /^MATHPLACEHOLDER/.test(current);
    const nextStartsPunc = /^[,\.;\?]/.test(current);

    const isNextQuestionOrOption = QUESTION_START_RE.test(current) || OPTION_LINE_START.test(current);

    if (!isNextQuestionOrOption && (
      nextStartsLowercase ||
      nextStartsPunc ||
      nextStartsMath ||
      prevEndsWithContinuation ||
      (prevEndsNoPunc && isPrevShort)
    )) {
      merged[prevIdx] = `${prev} ${current}`.trim();
    } else {
      merged.push(current);
    }
  }

  return merged.join('\n');
}

/**
 * Stage 8: Math Restoration
 */
export function restoreMathRegions(text: string, placeholders: Map<string, string>): string {
  let restored = text;
  const keys = Array.from(placeholders.keys()).sort((a, b) => {
    const numA = parseInt(a.replace(/[^\d]/g, ''), 10);
    const numB = parseInt(b.replace(/[^\d]/g, ''), 10);
    return numB - numA;
  });

  for (const key of keys) {
    const val = placeholders.get(key) || '';
    restored = restored.split(key).join(val);
  }

  return restored;
}

/**
 * Final Sanitization Stage: deterministically clean legacy Word fallback branches, VML nodes, and comments.
 */
export function sanitizeFinalOutput(html: string): string {
  if (!html) return '';
  let out = html;

  // 1. Remove the entire [if !msEquation] block completely
  // Handles: <!--[if !msEquation]--> ... <![endif]--> AND <![if !msEquation]> ... <![endif]>
  out = out.replace(/(?:<!--)?<!\[if !msEquation\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');

  // 2. Remove the entire [if gte vml ...] and [if gte mso 9] blocks completely
  out = out.replace(/(?:<!--)?<!\[if gte vml[\s\S]*?\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');
  out = out.replace(/(?:<!--)?<!\[if gte mso[\s\S]*?\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');

  // 3. Remove all conditional comment tags, but preserve their inner contents
  out = out.replace(/(?:<!--)?<!\[if[^\]]*\]>(?:-->)?/gi, '');
  out = out.replace(/(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');

  // 4. Remove all other HTML comments
  out = out.replace(/<!--[\s\S]*?-->/g, '');

  // 5. Strip all VML and namespaced tags completely (both tags and content for shape elements)
  const vmlTags = [
    'shape', 'imagedata', 'stroke', 'path', 'formulas', 'f', 'handles', 'textbox', 'shadow',
    'lock', 'oleobject', 'rect', 'line', 'oval', 'arc', 'curve', 'polyline', 'group', 'image',
    'shapetype'
  ];
  for (const tag of vmlTags) {
    out = out.replace(new RegExp(`<(?:v|o):${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:v|o):${tag}>`, 'gi'), '');
    out = out.replace(new RegExp(`<(?:v|o):${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }

  // 6. Strip any remaining namespace tags
  out = out.replace(/<\/?(?:v|o|w|m|x):[^>]*>/gi, '');

  // 7. Remove any empty spans, paragraphs, or divs recursively
  for (let i = 0; i < 3; i++) {
    out = out.replace(/<span[^>]*>\s*<\/span>/gi, '');
    out = out.replace(/<p[^>]*>\s*<\/p>/gi, '');
    out = out.replace(/<div[^>]*>\s*<\/div>/gi, '');
  }

  // 8. Normalize spacing
  out = out.replace(/[ \t]{2,}/g, ' ');

  return out.trim();
}

/**
 * Final HTML tag balancing using browser DOM parser.
 */
export function balanceTags(html: string): string {
  if (!html) return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<html><body>${html}</body></html>`, 'text/html');
    
    // Clean empty inline wrappers recursively
    const stripEmpty = (el: HTMLElement) => {
      const children = Array.from(el.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          stripEmpty(child as HTMLElement);
        }
      }
      const tag = el.tagName.toLowerCase();
      const isInlineWrapper = ['span', 'font', 'b', 'i', 'u', 'strong', 'em', 'sup', 'sub'].includes(tag);
      if (isInlineWrapper && !el.textContent?.trim() && !el.querySelector('img, table, iframe')) {
        el.parentNode?.removeChild(el);
      }
    };
    stripEmpty(doc.body);
    
    return doc.body.innerHTML.trim();
  } catch {
    return html;
  }
}



/**
 * Stage 9: LaTeX Normalization
 */
export function normalizeLatexRegion(mathText: string): string {
  let trimmed = mathText.trim();
  if (!trimmed) return trimmed;

  let delimiter = '';
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
    delimiter = '$$';
    trimmed = trimmed.slice(2, -2).trim();
  } else if (trimmed.startsWith('$') && trimmed.endsWith('$')) {
    delimiter = '$';
    trimmed = trimmed.slice(1, -1).trim();
  } else if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) {
    delimiter = '$$';
    trimmed = trimmed.slice(2, -2).trim();
  } else if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) {
    delimiter = '$';
    trimmed = trimmed.slice(2, -2).trim();
  } else {
    // If it's a simple hyphenated word or slash word without math context, don't wrap in math delimiters
    const hasMathContext = /[=<>+\*\\^_\u2229\u222a\u221a\u2264\u2265\u2260−±×÷]/.test(trimmed) || 
                           /\b[PQR]\s*\(/.test(trimmed) ||
                           /\d+/.test(trimmed);
    
    if (!hasMathContext && /^[a-zA-Z]+[-/][a-zA-Z]+$/.test(trimmed)) {
      return trimmed; // Return raw, e.g. "co-ordinate"
    }
    delimiter = '$';
  }

  // Convert unicode characters to latex commands
  for (const [uni, lat] of Object.entries(UNICODE_TO_LATEX)) {
    trimmed = trimmed.split(uni).join(lat);
  }

  // Run Pass 2 Math Normalizer (standardize operators, fix braces, sanitize unknown commands)
  trimmed = normalizeLatexSyntax(trimmed);

  // Fractions inside LaTeX region
  trimmed = trimmed.replace(/(?<![\d\\])(\d+)\s*\/\s*(\d+)(?!\d)/g, '\\frac{$1}{$2}');

  // Normalization cleanup
  trimmed = trimmed.replace(/\s+/g, ' ').trim();

  return `${delimiter}${trimmed}${delimiter}`;
}

export function normalizeAllMathPlaceholders(placeholders: Map<string, string>): {
  normalized: Map<string, string>;
  rawResolved: Map<string, string>;
} {
  const rawResolved = new Map<string, string>();
  
  // 1. Resolve nesting in ascending order of placeholder creation
  const keys = Array.from(placeholders.keys()).sort((a, b) => {
    const numA = parseInt(a.replace(/[^\d]/g, ''), 10);
    const numB = parseInt(b.replace(/[^\d]/g, ''), 10);
    return numA - numB;
  });

  for (const key of keys) {
    let val = placeholders.get(key) || '';
    for (const [rKey, rVal] of rawResolved.entries()) {
      val = val.split(rKey).join(rVal);
    }
    rawResolved.set(key, val);
  }

  // 2. Normalize raw expressions to LaTeX
  const normalized = new Map<string, string>();
  for (const [key, rawVal] of rawResolved.entries()) {
    normalized.set(key, normalizeLatexRegion(rawVal));
  }
  return { normalized, rawResolved };
}

/**
 * Stage 10: Validation Engine
 */
export function validateReconstruction(
  stem: string,
  options: QuestionOption[]
): { warnings: string[]; confidence: number } {
  const warnings: string[] = [];
  let confidence = 1.0;

  // 1. Missing or unreplaced placeholders
  if (/MATHPLACEHOLDER\d+/.test(stem) || options.some(o => /MATHPLACEHOLDER\d+/.test(o.text))) {
    warnings.push('Mathematical equations failed to restore properly');
    confidence -= 0.3;
  }

  // 2. Empty options in MCQ
  if (options.length > 0) {
    if (options.length < 2) {
      warnings.push('MCQ has fewer than 2 options');
      confidence -= 0.3;
    } else {
      const emptyOpts = options.filter(o => !o.text || !o.text.trim());
      if (emptyOpts.length > 0) {
        warnings.push('MCQ contains empty option texts');
        confidence -= 0.25;
      }
    }
  }

  // 3. Unbalanced brackets
  const checkBrackets = (t: string) => {
    const stack: string[] = [];
    const open = ['(', '[', '{'];
    const close = [')', ']', '}'];
    for (const char of t) {
      const oIdx = open.indexOf(char);
      if (oIdx !== -1) stack.push(char);
      const cIdx = close.indexOf(char);
      if (cIdx !== -1) {
        if (stack.length === 0) return false;
        const last = stack.pop();
        if (last !== open[cIdx]) return false;
      }
    }
    return stack.length === 0;
  };

  if (!checkBrackets(stem) || options.some(o => !checkBrackets(o.text))) {
    warnings.push('Question contains unbalanced brackets');
    confidence -= 0.15;
  }

  // 4. Unbalanced math delimiters
  const countDollars = (stem.match(/\$/g) || []).length + options.reduce((acc, o) => acc + (o.text.match(/\$/g) || []).length, 0);
  if (countDollars % 2 !== 0) {
    warnings.push('Mathematical KaTeX delimiters are unbalanced');
    confidence -= 0.2;
  }

  // 5. Incomplete reconstruction
  if (stem.length < 15) {
    warnings.push('Extracted question stem is unusually short');
    confidence -= 0.2;
  }

  if (warnings.length > 0) {
    warnings.unshift('⚠ Reconstruction uncertain');
  }

  return {
    warnings,
    confidence: Math.max(0.1, Math.min(1.0, confidence)),
  };
}

const mapToRecord = (map: Map<string, string>): Record<string, string> => {
  const rec: Record<string, string> = {};
  for (const [k, v] of map.entries()) {
    rec[k] = v;
  }
  return rec;
};

function getParentBlockType(html: string | null, xmlMatch: string): string {
  if (!html || !xmlMatch) return 'paragraph';
  const idx = html.indexOf(xmlMatch);
  if (idx === -1) return 'paragraph';
  
  const before = html.slice(0, idx);
  const openTable = before.lastIndexOf('<table');
  const closeTable = before.lastIndexOf('</table>');
  if (openTable > closeTable) return 'table';
  
  const openLi = before.lastIndexOf('<li');
  const closeLi = before.lastIndexOf('</li>');
  if (openLi > closeLi) return 'list_item';
  
  const openP = before.lastIndexOf('<p');
  const closeP = before.lastIndexOf('</p>');
  if (openP > closeP) {
    const pContent = before.slice(openP);
    if (/(?:^[a-dA-D]\s*[\).:\-–—]|\(?\s*[a-dA-D]\s*\)\s*[\).:\-–—])/i.test(pContent.replace(/<[^>]+>/g, '').trim())) {
      return 'option';
    }
  }
  
  return 'paragraph';
}

function checkMalformedExpressions(text: string): string[] {
  const malformed: string[] = [];
  const allFrac = text.match(/\\frac/g) || [];
  const validFracCount = (text.match(/\\frac\s*\{[^{}]*\}\s*\{[^{}]*\}/g) || []).length;
  if (validFracCount < allFrac.length) {
    malformed.push("Malformed fraction: missing numerator or denominator braces");
  }
  
  if (/\b[PQR]\s*\([^)]*$/.test(text)) {
    malformed.push("Malformed probability expression: missing closing parenthesis");
  }
  
  const dollarCount = (text.match(/\$/g) || []).length;
  if (dollarCount % 2 !== 0) {
    malformed.push("Malformed KaTeX delimiters: odd number of dollar signs ($)");
  }
  
  return malformed;
}

function cleanRenderingArtifacts(html: string): { cleaned: string; removedCount: number } {
  if (!html) return { cleaned: '', removedCount: 0 };
  let removedCount = 0;
  let cleaned = html;

  // 1. Remove the entire [if !msEquation] block completely
  const beforeMsEq = cleaned;
  cleaned = cleaned.replace(/(?:<!--)?<!\[if !msEquation\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');
  if (cleaned !== beforeMsEq) removedCount++;

  // 2. Remove the entire [if gte vml ...] and [if gte mso 9] blocks completely
  const beforeVml = cleaned;
  cleaned = cleaned.replace(/(?:<!--)?<!\[if gte vml[\s\S]*?\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');
  cleaned = cleaned.replace(/(?:<!--)?<!\[if gte mso[\s\S]*?\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');
  if (cleaned !== beforeVml) removedCount++;

  // 3. Remove all conditional comment tags, but preserve their contents
  cleaned = cleaned.replace(/(?:<!--)?<!\[if[^\]]*\]>(?:-->)?/gi, '');
  cleaned = cleaned.replace(/(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');

  // 4. Remove all other HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // 5. Strip all VML and namespaced tags completely (both tags and content for shape elements)
  const vmlTags = [
    'shape', 'imagedata', 'stroke', 'path', 'formulas', 'f', 'handles', 'textbox', 'shadow',
    'lock', 'oleobject', 'rect', 'line', 'oval', 'arc', 'curve', 'polyline', 'group', 'image',
    'shapetype'
  ];
  for (const tag of vmlTags) {
    const vmlRegex = new RegExp(`<(?:v|o):${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:v|o):${tag}>`, 'gi');
    if (vmlRegex.test(cleaned)) {
      cleaned = cleaned.replace(vmlRegex, '');
      removedCount++;
    }
    cleaned = cleaned.replace(new RegExp(`<(?:v|o):${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }

  // 6. Strip any remaining namespace tags
  cleaned = cleaned.replace(/<\/?(?:v|o|w|m|x):[^>]*>/gi, '');

  // 7. Remove any empty spans, paragraphs, or divs recursively
  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/<span[^>]*>\s*<\/span>/gi, '');
    cleaned = cleaned.replace(/<p[^>]*>\s*<\/p>/gi, '');
    cleaned = cleaned.replace(/<div[^>]*>\s*<\/div>/gi, '');
  }

  // 8. Normalize spacing
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

  return { cleaned: cleaned.trim(), removedCount };
}

/**
 * Execute the full 10-stage parser pipeline.
 */
export function runStagesReconstruction(
  plainText: string,
  _htmlText: string | null = null,
  ocrText: string | null = null,
  blocks?: SemanticBlock[],
  rawHtml: string | null = null
): {
  stem: string;
  options: QuestionOption[];
  questionType: QuestionType;
  subtype: EditorSubtype;
  warnings: string[];
  confidence: number;
  debugInfo: ReconstructionDebugInfo;
} {
  const stages: any = {
    stage0: {
      title: "Stage 0 — Clipboard Capture",
      mime_types: [],
      payload_sizes: {},
      preview_snippets: {},
      raw_clipboard_html: rawHtml || _htmlText || null,
    },
    stage1: {
      title: "Stage 1 — Word Nuclear Cleaner",
      before_html: rawHtml || _htmlText || null,
      after_html: _htmlText || null,
      removed_tags: [],
      removed_attributes: [],
      math_containing_nodes: [],
    },
    stage2: {
      title: "Stage 2 — Structural HTML Normalize",
      normalization_log: [],
    },
    stage3: {
      title: "Stage 3 — DOM Block Extraction",
      blocks: [],
    },
    stage4: {
      title: "Stage 4 — Semantic Math Shield",
      equations_detected: [],
      equations_detail: [],
      shield_map: {},
      failed_math_detections: [],
      total_math_count: 0,
      preserved_math_count: 0,
      dropped_math_count: 0,
    },
    stage5: {
      title: "Stage 5 — Question Merge",
      log: [],
      detected_boundaries: [],
      numbering_confidence: 1.0,
      boundary_source_locations: [],
    },
    stage6: {
      title: "Stage 6 — MCQ Split",
      strategy: "",
      split_success: false,
    },
    stage7: {
      title: "Stage 7 — Option Extraction",
      options: [],
    },
    stage8: {
      title: "Stage 8 — Reconstruction",
      reconstructed_stem: "",
      reconstructed_options: [],
      warnings: [],
      parser_confidence: 1.0,
      unresolved_placeholders: [],
      renderingGarbageRemoved: 0,
      normalization_details: [],
    },
    stage9: {
      title: "Stage 9 — KaTeX Validation",
      final_katex_source: "",
      malformed_expressions: [],
      report: {},
    },
  };

  // Populate Stage 0
  if (plainText !== null && plainText !== undefined) {
    stages.stage0.mime_types.push("text/plain");
    stages.stage0.payload_sizes["text/plain"] = plainText.length;
    stages.stage0.preview_snippets["text/plain"] = plainText.slice(0, 150) + (plainText.length > 150 ? "..." : "");
  }
  const srcHtml = rawHtml || _htmlText;
  if (srcHtml) {
    stages.stage0.mime_types.push("text/html");
    stages.stage0.payload_sizes["text/html"] = srcHtml.length;
    stages.stage0.preview_snippets["text/html"] = srcHtml.slice(0, 150) + (srcHtml.length > 150 ? "..." : "");
  }
  if (ocrText !== null && ocrText !== undefined) {
    stages.stage0.mime_types.push("text/ocr");
    stages.stage0.payload_sizes["text/ocr"] = ocrText.length;
    stages.stage0.preview_snippets["text/ocr"] = ocrText.slice(0, 150) + (ocrText.length > 150 ? "..." : "");
  }

  // Populate Stage 1 HTML Cleaning / Word Nuclear Cleaner
  if (srcHtml) {
    const styleCount = (srcHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || []).length;
    if (styleCount) stages.stage1.removed_tags.push("style");
    const xmlCount = (srcHtml.match(/<\?xml[\s\S]*?\?>/gi) || []).length;
    if (xmlCount) stages.stage1.removed_tags.push("xml");
    
    const ommlMatch = srcHtml.match(/<m:oMath>/g) || [];
    const mathmlMatch = srcHtml.match(/<math>/g) || [];
    if (ommlMatch.length) {
      stages.stage1.math_containing_nodes.push("OMML (OfficeMath)");
    }
    if (mathmlMatch.length) {
      stages.stage1.math_containing_nodes.push("MathML");
    }
    
    stages.stage1.removed_attributes = ["class", "style", "mso-*", "lang", "width", "height", "face", "align"];
  }

  // If structured blocks are provided, parse directly from blocks
  if (blocks && blocks.length > 0) {
    stages.stage3.blocks = JSON.parse(JSON.stringify(blocks));

    const placeholders = new Map<string, string>();
    let count = 0;
    const htmlPlaceholders = new Map<string, string>();
    let htmlCount = 0;

    const addPlaceholder = (match: string): string => {
      const key = `MATHPLACEHOLDER${count++}`;
      placeholders.set(key, match);
      const parentType = getParentBlockType(_htmlText || rawHtml || '', match);
      stages.stage4.equations_detail.push({ key, raw: match, parentBlockType: parentType });
      stages.stage4.equations_detected.push(match);
      return key;
    };

    const addHtmlPlaceholder = (match: string): string => {
      const key = `HTMLTAGPLACEHOLDER${htmlCount++}`;
      htmlPlaceholders.set(key, match);
      return key;
    };

    const cleanUnicodeTextForHtml = (out: string): string => {
      let work = out;
      for (const re of OFFICE_PLAIN_NOISE) {
        work = work.replace(re, ' ');
      }
      return work
        .replace(/\u00a0/g, ' ')
        .replace(/[\u200b-\u200d\ufeff]/g, '');
    };

    // Shield a single string using shared placeholders (Stage 4)
    const shieldBlockContent = (txt: string): string => {
      let work = normalizeOcrText(txt);
      work = preNormalizeMathText(work);
      work = cleanUnicodeTextForHtml(work);
      
      // Protect HTML tags from math shielding regexes
      work = work.replace(/<[^>]+>/g, addHtmlPlaceholder);
      
      work = work.replace(/\$\$([\s\S]+?)\$\$/g, addPlaceholder);
      work = work.replace(/\\\[([\s\S]+?)\\\]/g, addPlaceholder);
      work = work.replace(/\$([^$\n]+?)\$/g, addPlaceholder);
      work = work.replace(/\\\(([\s\S]+?)\\\)/g, addPlaceholder);
      
      const eqRegex = /[a-zA-Z0-9_\(\)\[\]\{\}\\\^_\.]+(?:\s*[-+=\*\/<>≤≥≠∩∪−±×÷|]\s*[a-zA-Z0-9_\(\)\[\]\{\}\\\^_\.]+)+/g;
      work = work.replace(eqRegex, addPlaceholder);
      
      work = work.replace(/\b[PQR]\s*\(\s*[a-zA-Z0-9_∪∩⊂⊆\+\-\*\/|\\−\s\(\)]+?\s*\)/g, addPlaceholder);
      work = work.replace(/\b[a-zA-Z0-9_]+[\^_][-+a-zA-Z0-9_\(\)]+/g, addPlaceholder);
      work = work.replace(/\b\d+\s*\/\s*\d+\b/g, addPlaceholder);
      work = work.replace(/[√π∑∫αβγδθλμσφω∩∪⊂⊆≤≥≠±×÷−]/g, addPlaceholder);
      
      return work;
    };

    const shieldedBlocks = blocks.map(b => ({
      ...b,
      content: shieldBlockContent(b.content)
    }));

    stages.stage4.shield_map = mapToRecord(placeholders);
    stages.stage4.total_math_count = count;
    stages.stage4.preserved_math_count = count;

    const optionBlocks = shieldedBlocks.filter(b => b.type === 'option');
    const stemBlocks = shieldedBlocks.filter(b => b.type !== 'option');

    let finalShieldedStem = stemBlocks
      .map(b => b.content)
      .join('\n')
      .trim();

    const hasQNumber = QUESTION_START_RE.test(finalShieldedStem);
    if (hasQNumber) {
      stages.stage5.detected_boundaries.push(finalShieldedStem.match(QUESTION_START_RE)![0]);
      stages.stage5.numbering_confidence = 1.0;
      stages.stage5.boundary_source_locations.push("block_start");
    } else {
      stages.stage5.numbering_confidence = 0.5;
    }

    finalShieldedStem = finalShieldedStem.replace(QUESTION_START_RE, '').trim();

    const isMcq = optionBlocks.length >= 2;
    let finalOptions: QuestionOption[] = [];
    let stem = finalShieldedStem;
    let questionType: QuestionType = 'descriptive';
    let subtype: EditorSubtype = 'descriptive';

    if (isMcq) {
      stages.stage6.strategy = "structured_block";
      stages.stage6.split_success = true;

      stages.stage7.options = optionBlocks.map(o => ({
        raw: o.content,
        cleaned: o.content,
        strategy: "structured_block",
        confidence: 1.0,
      }));

      const order = ['A', 'B', 'C', 'D'];
      const map = new Map<string, string>();
      for (const o of optionBlocks) {
        if (o.label) map.set(o.label.toUpperCase(), o.content);
      }
      
      const deduplicated = order
        .map(label => ({ label, text: map.get(label) || '' }))
        .filter(o => o.text !== '');

      finalOptions = deduplicated.map(o => ({ text: o.text }));
      questionType = 'mcq';
      subtype = 'mcq_single';

      const lowerStem = stem.toLowerCase();
      if (/one\s+or\s+more\s+correct|multiple\s+correct|more\s+than\s+one\s+correct|select\s+all\s+that\s+apply/i.test(lowerStem)) {
        subtype = 'mcq_multiple';
      }
    } else {
      // Option split path on block contents
      const mergedContent = shieldedBlocks.map(b => b.content).join('\n').trim();
      const normalizedMerged = normalizeOptionPrefixes(mergedContent);
      const splitResult = splitOptionsByMarkers(normalizedMerged);

      if (splitResult.success) {
        stages.stage6.strategy = "marker_split_block";
        stages.stage6.split_success = true;

        splitResult.options.forEach(o => {
          stages.stage7.options.push({
            raw: `OPTION_${o.label.toUpperCase()}`,
            cleaned: o.text,
            strategy: "marker_split_block",
            confidence: 0.95,
          });
        });

        finalOptions = splitResult.options.map(o => ({ text: o.text }));
        stem = splitResult.stem.replace(QUESTION_START_RE, '').trim();
        questionType = 'mcq';
        subtype = 'mcq_single';

        const lowerStem = stem.toLowerCase();
        if (/one\s+or\s+more\s+correct|multiple\s+correct|more\s+than\s+one\s+correct|select\s+all\s+that\s+apply/i.test(lowerStem)) {
          subtype = 'mcq_multiple';
        }
      } else {
        stages.stage6.strategy = "marker_split_block";
        stages.stage6.split_success = false;

        stem = mergedContent.replace(QUESTION_START_RE, '').trim();
        questionType = 'descriptive';
        subtype = 'descriptive';

        const lowerStem = stem.toLowerCase();
        if (/integer\s+(?:value|answer|type)|answer\s+in\s+integer/i.test(lowerStem)) {
          questionType = 'numerical';
          subtype = 'integer';
        } else if (/numerical\s+(?:value|answer|type)|numeric\s+answer|decimal\s+places/i.test(lowerStem)) {
          questionType = 'numerical';
          subtype = 'numerical';
        } else if (/match\s+(?:the\s+)?following|column\s+i\b|list-?\s*i\b/i.test(lowerStem)) {
          subtype = 'match_following';
        } else if (/comprehension|passage\s*based|read\s+the\s+following\s+passage/i.test(lowerStem)) {
          subtype = 'comprehension';
        }
      }
    }

    const { normalized: normalizedPlaceholders, rawResolved } = normalizeAllMathPlaceholders(placeholders);
    const placeholderStats = [];
    for (const [key, rawVal] of rawResolved.entries()) {
      const normalized = normalizedPlaceholders.get(key) || '';
      const success = normalized && normalized.trim() !== '' && !/MATHPLACEHOLDER/.test(normalized);
      placeholderStats.push({ key, raw: rawVal, normalized, success });
    }
    
    stages.stage4.total_math_count = placeholderStats.length;
    stages.stage4.preserved_math_count = placeholderStats.filter(p => p.success).length;
    stages.stage4.dropped_math_count = placeholderStats.filter(p => !p.success).length;
    stages.stage4.failed_math_detections = [];
    stages.stage8.normalization_details = placeholderStats;

    let restoredStem = restoreMathRegions(stem, normalizedPlaceholders);
    const htmlKeys = Array.from(htmlPlaceholders.keys()).sort((a, b) => b.length - a.length);

    for (const key of htmlKeys) {
      restoredStem = restoredStem.split(key).join(htmlPlaceholders.get(key) || '');
    }

    let totalGarbage = 0;
    const stemClean = cleanRenderingArtifacts(restoredStem);
    restoredStem = balanceTags(stemClean.cleaned);
    totalGarbage += stemClean.removedCount;

    const restoredOptions = finalOptions.map(o => {
      let txt = restoreMathRegions(o.text, normalizedPlaceholders);
      for (const key of htmlKeys) {
        txt = txt.split(key).join(htmlPlaceholders.get(key) || '');
      }
      const res = cleanRenderingArtifacts(txt);
      totalGarbage += res.removedCount;
      return {
        ...o,
        text: balanceTags(res.cleaned),
      };
    });
    stages.stage8.renderingGarbageRemoved = totalGarbage;

    const validation = validateReconstruction(restoredStem, restoredOptions);

    stages.stage5.log.push({
      action: "block_merges",
      reason: "structured blocks preserved sequentially",
      text: restoredStem,
    });

    stages.stage8.reconstructed_stem = restoredStem;
    stages.stage8.reconstructed_options = restoredOptions;
    stages.stage8.warnings = validation.warnings;
    stages.stage8.parser_confidence = validation.confidence;
    
    const unresolved: string[] = restoredStem.match(/MATHPLACEHOLDER\d+/g) || [];
    restoredOptions.forEach(o => {
      const match = o.text.match(/MATHPLACEHOLDER\d+/g);
      if (match) unresolved.push(...match);
    });
    stages.stage8.unresolved_placeholders = [...new Set(unresolved)];

    stages.stage9.final_katex_source = restoredStem;
    stages.stage9.malformed_expressions = checkMalformedExpressions(restoredStem);
    restoredOptions.forEach(o => {
      const mal = checkMalformedExpressions(o.text);
      if (mal.length) stages.stage9.malformed_expressions.push(...mal);
    });

    stages.stage9.report = {
      inputType: _htmlText ? "manual_paste" : "docx_upload",
      totalQuestions: 1,
      totalMathExpressions: count,
      preservedMathExpressions: count - unresolved.length,
      droppedMathExpressions: unresolved.length,
      reconstructionAccuracy: validation.confidence,
      optionAccuracy: isMcq ? 1.0 : 0.0,
      parserWarnings: validation.warnings,
      unresolvedBlocks: unresolved.length,
      confidence: validation.confidence,
      mathPlaceholdersTotal: placeholderStats.length,
      mathPlaceholdersSuccess: placeholderStats.filter(p => p.success).length,
      mathPlaceholdersFailed: placeholderStats.filter(p => !p.success).length,
      renderingGarbageRemoved: totalGarbage,
    };

    const src = rawHtml || _htmlText || '';
    const vmlDetected = /<v:shape|<v:imagedata|o:OLEObject/i.test(src) || /clip_image\d+/i.test(src);
    const shapeMatches = src.match(/<v:shape|<v:imagedata/gi) || [];
    const clipMatches = src.match(/clip_image\d+/gi) || [];
    const degradedCount = Math.max(shapeMatches.length, clipMatches.length);
    
    const ommlMatch = src.match(/<m:oMath\b|<oMath\b/gi) || [];
    const ommlCount = ommlMatch.length;
    
    const malformedCount = stages.stage9.malformed_expressions.length;
    const totalMath = stages.stage9.report.totalMathExpressions || 0;
    const unresolvedCount = stages.stage9.report.unresolvedBlocks || 0;
    const convertedCount = Math.max(0, totalMath - unresolvedCount - malformedCount);
    const latexValid = malformedCount === 0;

    stages.stage9.report.totalSemanticMathBlocks = totalMath;
    stages.stage9.report.extractedOmmlBlocks = ommlCount;
    stages.stage9.report.convertedEquations = convertedCount;
    stages.stage9.report.failedConversions = malformedCount;
    stages.stage9.report.vmlImageEquationsDetected = vmlDetected;
    stages.stage9.report.degradedClipboardEquations = degradedCount;
    stages.stage9.report.latexValidity = latexValid;
    stages.stage9.report.unresolvedEquations = unresolvedCount;

    const debugInfo = {
      rawClipboardHtml: _htmlText,
      extractedSemanticBlocks: blocks.map(b => `[${b.type}${b.label ? `:${b.label}` : ''}]: ${b.content}`),
      shieldedMathPlaceholders: mapToRecord(placeholders),
      preNormalizedMath: mapToRecord(rawResolved),
      postNormalizedMath: mapToRecord(normalizedPlaceholders),
      finalReconstructedOutput: {
        stem: restoredStem,
        options: restoredOptions,
      },
      stages,
    };

    return {
      stem: restoredStem,
      options: restoredOptions,
      questionType,
      subtype,
      warnings: validation.warnings,
      confidence: validation.confidence,
      debugInfo,
    };
  }

  // Fallback to normal text parse if no structured blocks provided
  let text = plainText || ocrText || '';
  text = preNormalizeMathText(text);
  text = normalizeOcrText(text);
  text = cleanUnicodeText(text);

  stages.stage3.blocks = [{ type: "raw_text", content: text }];

  const { shielded, placeholders } = shieldMathRegions(text);
  stages.stage4.equations_detected = Array.from(placeholders.values());
  stages.stage4.shield_map = mapToRecord(placeholders);
  stages.stage4.total_math_count = placeholders.size;
  stages.stage4.preserved_math_count = placeholders.size;

  const merged = mergeLinesSemantically(shielded);
  
  stages.stage5.log.push({
    action: "merge_lines",
    reason: "semantic layout formatting",
    text: merged,
  });

  const normalizedMerged = normalizeOptionPrefixes(merged);
  const splitResult = splitOptionsByMarkers(normalizedMerged);

  let finalShieldedStem = '';
  let finalShieldedOptions: Array<{ label: string; text: string }> = [];
  let isMcq = false;

  if (splitResult.success) {
    isMcq = true;
    finalShieldedStem = splitResult.stem;
    finalShieldedOptions = splitResult.options;
  } else {
    finalShieldedStem = normalizedMerged;
    finalShieldedOptions = [];
  }

  // Populate MCQ Split & Option Extraction details
  stages.stage6.strategy = "marker_split";
  stages.stage6.split_success = isMcq;

  finalShieldedOptions.forEach(o => {
    stages.stage7.options.push({
      raw: `OPTION_${o.label.toUpperCase()}`,
      cleaned: o.text,
      strategy: "marker_split",
      confidence: 0.95,
    });
  });

  let options: QuestionOption[] = [];
  let stem = '';
  let questionType: QuestionType = 'descriptive';
  let subtype: EditorSubtype = 'descriptive';

  if (isMcq) {
    const order = ['a', 'b', 'c', 'd'];
    const map = new Map<string, string>();
    for (const o of finalShieldedOptions) {
      if (o.label) map.set(o.label, o.text);
    }
    const deduplicated = order
      .map(label => ({ label, text: map.get(label) || '' }))
      .filter(o => o.text !== '');

    options = deduplicated.map(o => ({ text: o.text }));
    stem = finalShieldedStem;
    questionType = 'mcq';
    subtype = 'mcq_single';

    const lowerStem = stem.toLowerCase();
    if (/one\s+or\s+more\s+correct|multiple\s+correct|more\s+than\s+one\s+correct|select\s+all\s+that\s+apply/i.test(lowerStem)) {
      subtype = 'mcq_multiple';
    }
  } else {
    options = [];
    stem = finalShieldedStem;
    questionType = 'descriptive';
    subtype = 'descriptive';

    const lowerStem = stem.toLowerCase();
    if (/integer\s+(?:value|answer|type)|answer\s+in\s+integer/i.test(lowerStem)) {
      questionType = 'numerical';
      subtype = 'integer';
    } else if (/numerical\s+(?:value|answer|type)|numeric\s+answer|decimal\s+places/i.test(lowerStem)) {
      questionType = 'numerical';
      subtype = 'numerical';
    } else if (/match\s+(?:the\s+)?following|column\s+i\b|list-?\s*i\b/i.test(lowerStem)) {
      subtype = 'match_following';
    } else if (/comprehension|passage\s*based|read\s+the\s+following\s+passage/i.test(lowerStem)) {
      subtype = 'comprehension';
    }
  }

  const hasQNumber = QUESTION_START_RE.test(stem);
  if (hasQNumber) {
    stages.stage5.detected_boundaries.push(stem.match(QUESTION_START_RE)![0]);
    stages.stage5.numbering_confidence = 1.0;
  }
  stem = stem.replace(QUESTION_START_RE, '').trim();

  const { normalized: normalizedPlaceholders, rawResolved } = normalizeAllMathPlaceholders(placeholders);

  let totalGarbage = 0;
  const stemClean = cleanRenderingArtifacts(restoreMathRegions(stem, normalizedPlaceholders));
  const finalStem = balanceTags(stemClean.cleaned);
  totalGarbage += stemClean.removedCount;

  const finalOptions = options.map(o => {
    const res = cleanRenderingArtifacts(restoreMathRegions(o.text, normalizedPlaceholders));
    totalGarbage += res.removedCount;
    return {
      ...o,
      text: balanceTags(res.cleaned),
    };
  });
  stages.stage8.renderingGarbageRemoved = totalGarbage;

  const validation = validateReconstruction(finalStem, finalOptions);

  stages.stage8.reconstructed_stem = finalStem;
  stages.stage8.reconstructed_options = finalOptions;
  stages.stage8.warnings = validation.warnings;
  stages.stage8.parser_confidence = validation.confidence;
  
  const unresolved: string[] = finalStem.match(/MATHPLACEHOLDER\d+/g) || [];
  finalOptions.forEach(o => {
    const match = o.text.match(/MATHPLACEHOLDER\d+/g);
    if (match) unresolved.push(...match);
  });
  stages.stage8.unresolved_placeholders = [...new Set(unresolved)];

  stages.stage9.final_katex_source = finalStem;
  stages.stage9.malformed_expressions = checkMalformedExpressions(finalStem);
  finalOptions.forEach(o => {
    const mal = checkMalformedExpressions(o.text);
    if (mal.length) stages.stage9.malformed_expressions.push(...mal);
  });

  stages.stage9.report = {
    inputType: _htmlText ? "manual_paste" : "ocr_fallback",
    totalQuestions: 1,
    totalMathExpressions: placeholders.size,
    preservedMathExpressions: placeholders.size - unresolved.length,
    droppedMathExpressions: unresolved.length,
    reconstructionAccuracy: validation.confidence,
    optionAccuracy: isMcq ? 1.0 : 0.0,
    parserWarnings: validation.warnings,
    unresolvedBlocks: unresolved.length,
    confidence: validation.confidence,
    renderingGarbageRemoved: totalGarbage,
  };

  // Compute final stage 9 report metrics
  const src = rawHtml || _htmlText || '';
  const vmlDetected = /<v:shape|<v:imagedata|o:OLEObject/i.test(src) || /clip_image\d+/i.test(src);
  const shapeMatches = src.match(/<v:shape|<v:imagedata/gi) || [];
  const clipMatches = src.match(/clip_image\d+/gi) || [];
  const degradedCount = Math.max(shapeMatches.length, clipMatches.length);
  
  const ommlMatch = src.match(/<m:oMath\b|<oMath\b/gi) || [];
  const ommlCount = ommlMatch.length;
  
  const malformedCount = stages.stage9.malformed_expressions.length;
  const totalMath = stages.stage9.report.totalMathExpressions || 0;
  const unresolvedCount = stages.stage9.report.unresolvedBlocks || 0;
  const convertedCount = Math.max(0, totalMath - unresolvedCount - malformedCount);
  const latexValid = malformedCount === 0;

  stages.stage9.report.totalSemanticMathBlocks = totalMath;
  stages.stage9.report.extractedOmmlBlocks = ommlCount;
  stages.stage9.report.convertedEquations = convertedCount;
  stages.stage9.report.failedConversions = malformedCount;
  stages.stage9.report.vmlImageEquationsDetected = vmlDetected;
  stages.stage9.report.degradedClipboardEquations = degradedCount;
  stages.stage9.report.latexValidity = latexValid;
  stages.stage9.report.unresolvedEquations = unresolvedCount;

  const debugInfo = {
    rawClipboardHtml: _htmlText,
    extractedSemanticBlocks: stages.stage3.blocks ? stages.stage3.blocks.map((b: any) => `[${b.type}]: ${b.content}`) : null,
    shieldedMathPlaceholders: mapToRecord(placeholders),
    preNormalizedMath: mapToRecord(rawResolved),
    postNormalizedMath: mapToRecord(normalizedPlaceholders),
    finalReconstructedOutput: {
      stem: finalStem,
      options: finalOptions,
    },
    stages,
  };

  return {
    stem: finalStem,
    options: finalOptions,
    questionType,
    subtype,
    warnings: validation.warnings,
    confidence: validation.confidence,
    debugInfo,
  };
}
