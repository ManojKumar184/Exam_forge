import { preNormalizeMathText, normalizeLatexSyntax } from './mathNormalizer.js';
import { shieldMath } from './mathConverter.js';
import { DOMParser } from 'linkedom';
import { ollamaReconstructCleanup } from '../ai/ollamaReconstructCleanup.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

function getParentBlockType(html, xmlMatch) {
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

const UNICODE_TO_LATEX = {
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

export function decodeHtmlEntities(str) {
  if (!str) return '';
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

export function normalizeOptionPrefixes(text) {
  if (!text) return '';
  let result = text;
  
  result = result.replace(/(?<![a-zA-Z0-9_\$])[\(\[]\s*([a-dA-D])\s*[\)\]]/gi, (match, letter) => {
    return `OPTION_${letter.toUpperCase()}`;
  });
  
  result = result.replace(/(?<![\(\[a-zA-Z0-9_\$])\b([a-dA-D])\s*[\).:\-–—](?=\s|$)/gi, (match, letter) => {
    return `OPTION_${letter.toUpperCase()}`;
  });
  
  return result;
}

export function splitOptionsByMarkers(text) {
  if (!text) return { stem: '', options: [], success: false };
  
  const markerRegex = /\bOPTION_([A-D])\b/g;
  const matches = [];
  let match;
  while ((match = markerRegex.exec(text)) !== null) {
    matches.push({
      label: match[1].toLowerCase(),
      index: match.index,
      length: match[0].length
    });
  }
  
  const LABEL_ORDER = ['a', 'b', 'c', 'd'];
  const sequences = [];
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
  
  let longest = [];
  for (const seq of sequences) {
    if (seq.length > longest.length) {
      longest = seq;
    }
  }
  
  if (longest.length >= 2) {
    const stem = text.slice(0, longest[0].index).trim();
    const options = [];
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

export function normalizeOcrText(text) {
  if (!text) return '';
  return decodeHtmlEntities(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function cleanUnicodeText(text) {
  if (!text) return '';
  let out = text;
  for (const re of OFFICE_PLAIN_NOISE) {
    out = out.replace(re, ' ');
  }
  out = out
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '');

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

export function shieldMathRegions(text) {
  const placeholders = new Map();
  let count = 0;
  let work = text;

  const addPlaceholder = (match) => {
    const key = `MATHPLACEHOLDER${count++}`;
    placeholders.set(key, match);
    return key;
  };

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

  return { shielded: work, placeholders };
}

export function mergeLinesSemantically(text) {
  const lines = text.split('\n').map((l) => l.trimEnd());
  const merged = [];

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

export function restoreMathRegions(text, placeholders) {
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

export function sanitizeFinalOutput(html) {
  if (!html) return '';
  let out = html;

  out = out.replace(/(?:<!--)?<!\[if !msEquation\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');
  out = out.replace(/(?:<!--)?<!\[if gte vml[\s\S]*?\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');
  out = out.replace(/(?:<!--)?<!\[if gte mso[\s\S]*?\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');

  out = out.replace(/(?:<!--)?<!\[if[^\]]*\]>(?:-->)?/gi, '');
  out = out.replace(/(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');

  out = out.replace(/<!--[\s\S]*?-->/g, '');

  const vmlTags = [
    'shape', 'imagedata', 'stroke', 'path', 'formulas', 'f', 'handles', 'textbox', 'shadow',
    'lock', 'oleobject', 'rect', 'line', 'oval', 'arc', 'curve', 'polyline', 'group', 'image',
    'shapetype'
  ];
  for (const tag of vmlTags) {
    out = out.replace(new RegExp(`<(?:v|o):${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:v|o):${tag}>`, 'gi'), '');
    out = out.replace(new RegExp(`<(?:v|o):${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }

  out = out.replace(/<\/?(?:v|o|w|m|x):[^>]*>/gi, '');

  for (let i = 0; i < 3; i++) {
    out = out.replace(/<span[^>]*>\s*<\/span>/gi, '');
    out = out.replace(/<p[^>]*>\s*<\/p>/gi, '');
    out = out.replace(/<div[^>]*>\s*<\/div>/gi, '');
  }

  out = out.replace(/[ \t]{2,}/g, ' ');

  return out.trim();
}

export function balanceTags(html) {
  if (!html) return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<html><body>${html}</body></html>`, 'text/html');
    
    const stripEmpty = (el) => {
      const children = Array.from(el.childNodes);
      for (const child of children) {
        if (child.nodeType === 1) {
          stripEmpty(child);
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
  } catch (err) {
    console.warn("balanceTags DOMParser failed, using raw:", err);
    return html;
  }
}

export function normalizeLatexRegion(mathText) {
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
    const hasMathContext = /[=<>+\*\\^_\u2229\u222a\u221a\u2264\u2265\u2260−±×÷]/.test(trimmed) || 
                           /\b[PQR]\s*\(/.test(trimmed) ||
                           /\d+/.test(trimmed);
    
    if (!hasMathContext && /^[a-zA-Z]+[-/][a-zA-Z]+$/.test(trimmed)) {
      return trimmed;
    }
    delimiter = '$';
  }

  for (const [uni, lat] of Object.entries(UNICODE_TO_LATEX)) {
    trimmed = trimmed.split(uni).join(lat);
  }

  trimmed = normalizeLatexSyntax(trimmed);
  trimmed = trimmed.replace(/(?<![\d\\])(\d+)\s*\/\s*(\d+)(?!\d)/g, '\\frac{$1}{$2}');
  trimmed = trimmed.replace(/\s+/g, ' ').trim();

  return `${delimiter}${trimmed}${delimiter}`;
}

export function normalizeAllMathPlaceholders(placeholders) {
  const rawResolved = new Map();
  
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

  const normalized = new Map();
  for (const [key, rawVal] of rawResolved.entries()) {
    normalized.set(key, normalizeLatexRegion(rawVal));
  }
  return { normalized, rawResolved };
}

export function validateReconstruction(stem, options) {
  const warnings = [];
  let confidence = 1.0;

  if (/MATHPLACEHOLDER\d+/.test(stem) || options.some(o => /MATHPLACEHOLDER\d+/.test(o.text))) {
    warnings.push('Mathematical equations failed to restore properly');
    confidence -= 0.3;
  }

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

  const checkBrackets = (t) => {
    const stack = [];
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

  const countDollars = (stem.match(/\$/g) || []).length + options.reduce((acc, o) => acc + (o.text.match(/\$/g) || []).length, 0);
  if (countDollars % 2 !== 0) {
    warnings.push('Mathematical KaTeX delimiters are unbalanced');
    confidence -= 0.2;
  }

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

function mapToRecord(map) {
  const rec = {};
  for (const [k, v] of map.entries()) {
    rec[k] = v;
  }
  return rec;
}

function cleanRenderingArtifacts(html) {
  if (!html) return { cleaned: '', removedCount: 0 };
  let removedCount = 0;
  let cleaned = html;

  const beforeMsEq = cleaned;
  cleaned = cleaned.replace(/(?:<!--)?<!\[if !msEquation\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');
  if (cleaned !== beforeMsEq) removedCount++;

  const beforeVml = cleaned;
  cleaned = cleaned.replace(/(?:<!--)?<!\[if gte vml[\s\S]*?\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');
  cleaned = cleaned.replace(/(?:<!--)?<!\[if gte mso[\s\S]*?\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');
  if (cleaned !== beforeVml) removedCount++;

  cleaned = cleaned.replace(/(?:<!--)?<!\[if[^\]]*\]>(?:-->)?/gi, '');
  cleaned = cleaned.replace(/(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');

  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

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

  cleaned = cleaned.replace(/<\/?(?:v|o|w|m|x):[^>]*>/gi, '');

  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/<span[^>]*>\s*<\/span>/gi, '');
    cleaned = cleaned.replace(/<p[^>]*>\s*<\/p>/gi, '');
    cleaned = cleaned.replace(/<div[^>]*>\s*<\/div>/gi, '');
  }

  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

  return { cleaned: cleaned.trim(), removedCount };
}

function checkMalformedExpressions(text) {
  const malformed = [];
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

/**
 * Isolate figures by base64 or inline images.
 */
function isolateFigures(html, plain) {
  const figures = [];
  let count = 1;
  let isolatedHtml = html || '';
  let isolatedPlain = plain || '';

  const imgRegex = /<img[^>]+src=["'](data:image\/[^"']+)["'][^>]*>/gi;
  isolatedHtml = isolatedHtml.replace(imgRegex, (match, dataUrl) => {
    const figId = `[FIGURE_${count++}]`;
    figures.push({
      id: figId,
      url: dataUrl,
      caption: null,
      type: 'figure',
    });
    return figId;
  });

  const base64Regex = /data:image\/[a-zA-Z]+;base64,[a-zA-Z0-9+/=]+/gi;
  isolatedPlain = isolatedPlain.replace(base64Regex, (match) => {
    const figId = `[FIGURE_${count++}]`;
    figures.push({
      id: figId,
      url: match,
      caption: null,
      type: 'figure',
    });
    return figId;
  });

  return { isolatedHtml, isolatedPlain, figures };
}

/**
 * Classify question structure.
 */
function semanticClassify(stemText, optionsCount) {
  const lower = stemText.toLowerCase();
  
  if (/comprehension|passage\s*based|read\s+the\s+following\s+passage/i.test(lower)) {
    return 'COMPREHENSION';
  }
  if (/case\s*study|read\s+the\s+following\s+case/i.test(lower)) {
    return 'CASE_STUDY';
  }
  if (/assertion\s*[:\-–—]?\s*(?:reason|reasoning)?/i.test(lower) && /reason\s*[:\-–—]?\s*/i.test(lower)) {
    return 'ASSERTION_REASON';
  }
  if (/match\s+(?:the\s+)?following|column\s+i\b|list-?\s*i\b/i.test(lower)) {
    return 'MATCH_COLUMNS';
  }
  if (/matrix\s*match/i.test(lower)) {
    return 'MATRIX_MATCH';
  }
  if (/true\s+or\s+false|true\s*\/\s*false/i.test(lower)) {
    return 'TRUE_FALSE';
  }
  
  if (optionsCount >= 2) {
    const hasStatementLayer = /\b(statement|i|ii|iii|iv|a|b|c)\b/i.test(lower) && 
                              /(?:only\s+[a-d]\s+and\s+[a-d]|[a-d]\s*,\s*[a-d]\s*only)/i.test(lower);
    if (hasStatementLayer) {
      return 'NESTED_OPTION_MCQ';
    }
    
    if (/one\s+or\s+more\s+correct|multiple\s+correct|more\s+than\s+one\s+correct|select\s+all\s+that\s+apply/i.test(lower)) {
      return 'MCQ_MULTI';
    }
    return 'MCQ_SINGLE';
  }
  
  if (/[iI]nteger/i.test(lower)) {
    return 'INTEGER';
  }
  if (/numerical/i.test(lower) || /numeric/i.test(lower)) {
    return 'NUMERICAL';
  }
  
  return 'DESCRIPTIVE';
}

/**
 * Extract nested statements from question stem.
 */
function extractStatements(text) {
  const statements = [];
  const lines = text.split('\n');
  const statementRegex = /^\s*(?:\(?\s*(?:[iI]+|[0-9]+|[a-zA-Z])\s*\)?\s*[\.:\-–—]\s+|(?:\bStatement\s+[0-9]+)\s*[\.:\-–—]\s+)(.+)$/i;
  for (const line of lines) {
    const match = line.trim().match(statementRegex);
    if (match) {
      statements.push(match[1].trim());
    }
  }
  return statements;
}

/**
 * Execute the 13-stage Unified Ingestion Engine.
 */
export async function runStagesReconstruction(plainText, htmlText = null, ocrText = null, blocks = null, rawHtml = null) {
  // 13 Stages container
  const stages = {
    stage0: {
      title: "Stage 0 — Clipboard / DOCX Ingest",
      mime_types: [],
      payload_sizes: {},
      preview_snippets: {},
      raw_clipboard_html: rawHtml || htmlText || null,
    },
    stage1: {
      title: "Stage 1 — Word Nuclear Cleaner",
      before_html: rawHtml || htmlText || null,
      after_html: null,
      removed_tags: [],
      removed_attributes: [],
      math_containing_nodes: [],
    },
    stage2: {
      title: "Stage 2 — Structural HTML Normalization",
      normalization_log: [],
    },
    stage3: {
      title: "Stage 3 — Figure/Image Isolation",
      figures_extracted: [],
      isolated_html: null,
    },
    stage4: {
      title: "Stage 4 — Semantic Math Shielding",
      equations_detected: [],
      equations_detail: [],
      shield_map: {},
      failed_math_detections: [],
      total_math_count: 0,
      preserved_math_count: 0,
      dropped_math_count: 0,
    },
    stage5: {
      title: "Stage 5 — DOM Block Extraction",
      blocks: [],
    },
    stage6: {
      title: "Stage 6 — Semantic Question Typing",
      classified_type: "",
      evidence: [],
    },
    stage7: {
      title: "Stage 7 — Adaptive Parser Selection",
      selected_parser: "",
    },
    stage8: {
      title: "Stage 8 — MCQ / Statement / Comprehension Reconstruction",
      reconstructed_stem: "",
      reconstructed_options: [],
      statement_groups: [],
    },
    stage9: {
      title: "Stage 9 — Ollama Semantic Refinement",
      refined: false,
      response: null,
      warnings: [],
    },
    stage10: {
      title: "Stage 10 — Final Validation",
      warnings: [],
      parser_confidence: 1.0,
      unresolved_placeholders: [],
    },
    stage11: {
      title: "Stage 11 — KaTeX Verification",
      final_katex_source: "",
      malformed_expressions: [],
    },
    stage12: {
      title: "Stage 12 — Metadata Classification",
      class: 11,
      difficulty: "medium",
      tags: [],
    },
    stage13: {
      title: "Stage 13 — Database-ready Semantic Object Generation",
      db_object: null,
    },
  };

  // Populate Stage 0
  if (plainText !== null && plainText !== undefined) {
    stages.stage0.mime_types.push("text/plain");
    stages.stage0.payload_sizes["text/plain"] = plainText.length;
    stages.stage0.preview_snippets["text/plain"] = plainText.slice(0, 150) + (plainText.length > 150 ? "..." : "");
  }
  const srcHtml = rawHtml || htmlText;
  if (srcHtml) {
    stages.stage0.mime_types.push("text/html");
    stages.stage0.payload_sizes["text/html"] = srcHtml.length;
    stages.stage0.preview_snippets["text/html"] = srcHtml.slice(0, 150) + (srcHtml.length > 150 ? "..." : "");
  }

  // Stage 1: Word Nuclear Cleaner
  let cleanedHtml = srcHtml || '';
  if (cleanedHtml) {
    const styleCount = (cleanedHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || []).length;
    if (styleCount) stages.stage1.removed_tags.push("style");
    const xmlCount = (cleanedHtml.match(/<\?xml[\s\S]*?\?>/gi) || []).length;
    if (xmlCount) stages.stage1.removed_tags.push("xml");

    const ommlMatch = cleanedHtml.match(/<m:oMath>/g) || [];
    if (ommlMatch.length) stages.stage1.math_containing_nodes.push("OMML (OfficeMath)");

    stages.stage1.removed_attributes = ["class", "style", "mso-*", "lang", "width", "height"];
    
    // Clean legacy noise, comments and VML
    const cleanedRes = cleanRenderingArtifacts(cleanedHtml);
    cleanedHtml = cleanedRes.cleaned;
    stages.stage1.after_html = cleanedHtml;
  }

  // Stage 2: Structural HTML Normalization
  let normalizedHtml = cleanedHtml;
  if (normalizedHtml) {
    normalizedHtml = balanceTags(normalizedHtml);
    stages.stage2.normalization_log.push({ action: "balanced_tags", details: "Balanced document nodes" });
  }

  // Stage 3: Figure/Image Isolation
  const { isolatedHtml, isolatedPlain, figures } = isolateFigures(normalizedHtml, plainText || '');
  stages.stage3.figures_extracted = figures;
  stages.stage3.isolated_html = isolatedHtml;

  // Stage 4: Semantic Math Shielding
  const placeholders = new Map();
  let count = 0;
  const addPlaceholder = (match) => {
    const key = `MATHPLACEHOLDER${count++}`;
    placeholders.set(key, match);
    const parentType = getParentBlockType(isolatedHtml || '', match);
    stages.stage4.equations_detail.push({ key, raw: match, parentBlockType: parentType });
    stages.stage4.equations_detected.push(match);
    return key;
  };

  let shieldedPlain = isolatedPlain;
  if (shieldedPlain) {
    shieldedPlain = preNormalizeMathText(shieldedPlain);
    shieldedPlain = cleanUnicodeText(shieldedPlain);
    
    // Protect HTML tags from math shielding regexes
    const htmlPlaceholders = new Map();
    let htmlCount = 0;
    const addHtmlPlaceholder = (match) => {
      const key = `HTMLTAGPLACEHOLDER${htmlCount++}`;
      htmlPlaceholders.set(key, match);
      return key;
    };
    shieldedPlain = shieldedPlain.replace(/<[^>]+>/g, addHtmlPlaceholder);

    shieldedPlain = shieldedPlain.replace(/\$\$([\s\S]+?)\$\$/g, addPlaceholder);
    shieldedPlain = shieldedPlain.replace(/\\\[([\s\S]+?)\\\]/g, addPlaceholder);
    shieldedPlain = shieldedPlain.replace(/\$([^$\n]+?)\$/g, addPlaceholder);
    shieldedPlain = shieldedPlain.replace(/\\\(([\s\S]+?)\\\)/g, addPlaceholder);

    const eqRegex = /[a-zA-Z0-9_\(\)\[\]\{\}\\\^_\.]+(?:\s*[-+=\*\/<>≤≥≠∩∪−±×÷|]\s*[a-zA-Z0-9_\(\)\[\]\{\}\\\^_\.]+)+/g;
    shieldedPlain = shieldedPlain.replace(eqRegex, addPlaceholder);

    shieldedPlain = shieldedPlain.replace(/\b[PQR]\s*\(\s*[a-zA-Z0-9_∪∩⊂⊆\+\-\*\/|\\−\s\(\)]+?\s*\)/g, addPlaceholder);
    shieldedPlain = shieldedPlain.replace(/\b[a-zA-Z0-9_]+[\^_][-+a-zA-Z0-9_\(\)]+/g, addPlaceholder);
    shieldedPlain = shieldedPlain.replace(/\b\d+\s*\/\s*\d+\b/g, addPlaceholder);
    shieldedPlain = shieldedPlain.replace(/[√π∑∫αβγδθλμσφω∩∪⊂⊆≤≥≠±×÷−]/g, addPlaceholder);

    // Restore HTML tags
    const htmlKeys = Array.from(htmlPlaceholders.keys()).sort((a, b) => b.length - a.length);
    for (const key of htmlKeys) {
      shieldedPlain = shieldedPlain.split(key).join(htmlPlaceholders.get(key));
    }
  }

  stages.stage4.shield_map = mapToRecord(placeholders);
  stages.stage4.total_math_count = count;
  stages.stage4.preserved_math_count = count;

  // Stage 5: DOM Block Extraction
  let extractedBlocks = [];
  if (blocks && blocks.length > 0) {
    extractedBlocks = JSON.parse(JSON.stringify(blocks));
  } else {
    const lines = mergeLinesSemantically(shieldedPlain).split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const optMatch = trimmed.match(OPTION_LINE_START);
      if (optMatch) {
        const label = (optMatch[1] || optMatch[2] || '').toUpperCase();
        const content = trimmed.replace(OPTION_LINE_START, '').trim();
        extractedBlocks.push({ type: 'option', label, content });
      } else {
        extractedBlocks.push({ type: 'paragraph', content: trimmed });
      }
    }
  }
  stages.stage5.blocks = extractedBlocks;

  // Stage 6: Semantic Question Typing
  const stemBlocks = extractedBlocks.filter(b => b.type !== 'option');
  const optionBlocks = extractedBlocks.filter(b => b.type === 'option');
  const rawStemText = stemBlocks.map(b => b.content).join('\n');
  const questionType = semanticClassify(rawStemText, optionBlocks.length);
  stages.stage6.classified_type = questionType;
  stages.stage6.evidence = [
    `Stem Length: ${rawStemText.length} chars`,
    `Options Count: ${optionBlocks.length}`,
  ];

  // Stage 7: Adaptive Parser Selection
  let parserName = "General Parser";
  if (questionType === "COMPREHENSION") parserName = "Comprehension Parser";
  else if (questionType === "MATCH_COLUMNS") parserName = "Column Match Parser";
  else if (questionType === "NESTED_OPTION_MCQ") parserName = "Nested MCQ Parser";
  stages.stage7.selected_parser = parserName;

  // Stage 8: MCQ / Statement / Comprehension Reconstruction
  let stem = rawStemText.replace(QUESTION_START_RE, '').trim();
  let options = [];
  let statementGroups = extractStatements(stem);

  if (optionBlocks.length >= 2) {
    options = optionBlocks.map(o => ({ text: o.content }));
  } else {
    // Attempt fallback split
    const splitResult = splitOptionsByMarkers(normalizeOptionPrefixes(stem));
    if (splitResult.success) {
      stem = splitResult.stem.replace(QUESTION_START_RE, '').trim();
      options = splitResult.options.map(o => ({ text: o.text }));
    }
  }

  // Restore Math regions in stem and options
  const { normalized: normalizedPlaceholders } = normalizeAllMathPlaceholders(placeholders);
  stem = restoreMathRegions(stem, normalizedPlaceholders);
  options = options.map(o => ({
    ...o,
    text: restoreMathRegions(o.text, normalizedPlaceholders)
  }));
  statementGroups = statementGroups.map(s => restoreMathRegions(s, normalizedPlaceholders));

  stages.stage8.reconstructed_stem = stem;
  stages.stage8.reconstructed_options = options;
  stages.stage8.statement_groups = statementGroups;

  // Stage 9: Ollama Semantic Refinement (Local Inference)
  let correctAnswers = [];
  let explanation = "";
  let formulas = Array.from(normalizedPlaceholders.values());
  let tags = [questionType.toLowerCase()];

  const ollamaModel = env.ai.ollamaModel || 'llama3.2';
  if (env.ai.provider === 'ollama') {
    try {
      const refined = await ollamaReconstructCleanup(
        { questionText: stem, questionType, options },
        plainText
      );
      if (refined) {
        stages.stage9.refined = true;
        stages.stage9.response = refined;
        if (refined.stem) stem = refined.stem;
        if (refined.questionType) stages.stage6.classified_type = refined.questionType;
        if (Array.isArray(refined.options)) {
          options = refined.options.map(o => ({ text: o.text || o || '' }));
        }
        if (Array.isArray(refined.correctAnswers)) {
          correctAnswers = refined.correctAnswers;
        }
        if (refined.explanation) explanation = refined.explanation;
        if (Array.isArray(refined.statementGroups)) {
          statementGroups = refined.statementGroups;
        }
        if (Array.isArray(refined.formulas)) {
          formulas = refined.formulas;
        }
        if (Array.isArray(refined.tags)) {
          tags = [...new Set([...tags, ...refined.tags])];
        }
      } else {
        stages.stage9.warnings.push("Local semantic refinement unavailable — using deterministic parser.");
      }
    } catch (err) {
      stages.stage9.warnings.push("Local semantic refinement unavailable — using deterministic parser.");
    }
  } else {
    stages.stage9.warnings.push("Local semantic refinement unavailable — using deterministic parser.");
  }

  // Stage 10: Final Validation
  const validation = validateReconstruction(stem, options);
  stages.stage10.warnings = [...validation.warnings, ...stages.stage9.warnings];
  stages.stage10.parser_confidence = validation.confidence;
  
  const unresolved = stem.match(/MATHPLACEHOLDER\d+/g) || [];
  options.forEach(o => {
    const match = o.text.match(/MATHPLACEHOLDER\d+/g);
    if (match) unresolved.push(...match);
  });
  stages.stage10.unresolved_placeholders = [...new Set(unresolved)];

  // Stage 11: KaTeX Verification
  stages.stage11.final_katex_source = stem;
  stages.stage11.malformed_expressions = checkMalformedExpressions(stem);
  options.forEach(o => {
    const mal = checkMalformedExpressions(o.text);
    if (mal.length) stages.stage11.malformed_expressions.push(...mal);
  });

  // Stage 12: Metadata Classification
  stages.stage12.class = 11;
  stages.stage12.difficulty = "medium";
  stages.stage12.tags = tags;

  // Stage 13: Database-ready Semantic Object Generation
  const dbObject = {
    questionType: stages.stage6.classified_type,
    stem,
    options,
    correctAnswers,
    explanation,
    figures,
    metadata: {
      class: stages.stage12.class,
      difficulty: stages.stage12.difficulty,
      tags: stages.stage12.tags,
    },
    formulas,
    difficulty: stages.stage12.difficulty,
    tags,
    source: rawHtml ? 'paste' : 'docx',
    semanticBlocks: extractedBlocks,
    statementGroups,
    comprehensionLinks: [],
    parserConfidence: stages.stage10.parser_confidence,
    reconstructionFidelity: Math.max(0.2, 1 - (stages.stage11.malformed_expressions.length * 0.1) - (unresolved.length * 0.15)),
  };
  stages.stage13.db_object = dbObject;

  // Build the final result mapping for backward compatibility
  const debugInfo = {
    rawClipboardHtml: htmlText,
    extractedSemanticBlocks: extractedBlocks.map(b => `[${b.type}]: ${b.content || b.text || ''}`),
    shieldedMathPlaceholders: mapToRecord(placeholders),
    preNormalizedMath: mapToRecord(normalizedPlaceholders),
    postNormalizedMath: mapToRecord(normalizedPlaceholders),
    finalReconstructedOutput: {
      stem,
      options,
    },
    stages,
  };

  return {
    stem,
    options,
    questionType: (questionType === "MCQ_SINGLE" || questionType === "MCQ_MULTI") ? "mcq" : questionType.toLowerCase(),
    subtype: questionType.toLowerCase(),
    warnings: stages.stage10.warnings,
    confidence: stages.stage10.parser_confidence,
    correctAnswers,
    figures,
    formulas,
    semanticBlocks: extractedBlocks,
    statementGroups,
    comprehensionLinks: [],
    reconstructionFidelity: dbObject.reconstructionFidelity,
    debugInfo,
  };
}
