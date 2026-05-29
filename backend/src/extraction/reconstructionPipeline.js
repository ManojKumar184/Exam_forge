import { preNormalizeMathText, normalizeLatexSyntax } from './mathNormalizer.js';
import { shieldMath, translateOmmlNode, translateMathmlNode } from './mathConverter.js';
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
    if (/(?:^[a-fA-F]\s*[\).:\-–—]|\(?\s*[a-fA-F]\s*\)\s*[\).:\-–—])/i.test(pContent.replace(/<[^>]+>/g, '').trim())) {
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
  'δ': ' \\delta ',
  'θ': ' \\theta ',
  'λ': ' \\lambda ',
  'μ': ' \\mu ',
  'σ': ' \\sigma ',
  'φ': ' \\phi ',
  'ψ': ' \\psi ',
  'omega': ' \\omega ',
  'ω': ' \\omega ',
};

const SAFE_MATH_CHARS = /[a-zA-Z0-9\s.,;:!?@#&%"'~$()\[\]{}=+\-*/\^_\u2229\u222a\u2282\u2286\u221a\u03c0\u2211\u222b\u2264\u2265\u2260−\u00d7\u00f7|\\{}]/;

const QUESTION_START_RE =
  /^(?:Q(?:uestion)?\s*)?(\d{1,3})[\).:\-\s]+|^\((\d{1,3})\)\s+|^(\d{1,3})\.\s+(?=[A-Za-z(\\$])/i;

const OPTION_LINE_START =
  /^\s*(?:\(?\s*([a-fA-F])\s*\)?\s*[\).:\-–—]\s*|([a-fA-F])\s*[\).:\-–—]\s+)/i;

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

export function generatePayloadFingerprint(html, plain) {
  const h = html || '';
  const p = plain || '';
  
  const containsOMML = /xmlns:m=|xmlns:o=|<m:oMath|<oMath/i.test(h);
  const containsVML = /xmlns:v=|<v:shape|<v:imagedata/i.test(h);
  const containsOLE = /o:OLEObject|ProgID=/i.test(h);
  const containsMathType = /Equation\.DSMT4|MathType/i.test(h);
  const containsWMF = /data:image\/wmf|\.wmf\b/i.test(h);
  const containsImages = /<img\b|data:image\/|clip_image/i.test(h) || /\[FIGURE_/i.test(p);
  const containsTables = /<table\b/i.test(h) || /\[TABLE\]/i.test(p);
  const containsScannedContent = /tesseract|ocr/i.test(p) || (containsImages && p.length < 100);
  const containsInlineEquations = /\bMATHPLACEHOLDER\b/i.test(p) || /\$/i.test(p) || /\\\(/i.test(p);
  const containsRenderedEquations = containsWMF || containsOLE || /clip_image/i.test(h);
  const containsOfficeArtifacts = /mso-|urn:schemas-microsoft-com|ProgID="Word\./i.test(h);
  
  let sourceType = 'unknown';
  if (/xmlns:w="urn:schemas-microsoft-com:office:word"|ProgID="Word\.Document"/i.test(h)) {
    sourceType = 'microsoft_word_html';
  } else if (/mso-|clip_image/i.test(h)) {
    sourceType = 'office_clipboard';
  } else if (/docs\.google\.com/i.test(h) || /id="docs-internal-guid/i.test(h)) {
    sourceType = 'google_docs_paste';
  } else if (/<[a-z][\s\S]*>/i.test(h)) {
    sourceType = 'browser_html';
  } else if (/pdf/i.test(p) || /pdf/i.test(h)) {
    sourceType = 'pdf_extract';
  } else if (/ocr|tesseract/i.test(p)) {
    sourceType = 'ocr_output';
  } else if (p.trim() && !h.trim()) {
    sourceType = 'plain_text';
  }
  
  return {
    sourceType,
    containsOMML,
    containsVML,
    containsOLE,
    containsMathType,
    containsWMF,
    containsImages,
    containsTables,
    containsScannedContent,
    containsInlineEquations,
    containsRenderedEquations,
    containsOfficeArtifacts
  };
}

export function normalizeOptionPrefixes(text) {
  if (!text) return '';
  let result = text;
  
  // Insert space before run-together option parentheses, e.g. "Only(B)" -> "Only (B)"
  // but avoid single letter math/probability functions like "P(B)" or "f(x)"
  result = result.replace(/\b([a-zA-Z]{2,})\((?=[a-fA-F]\))/g, '$1 (');
  
  result = result.replace(/(?<![a-zA-Z0-9_\$])[\(\[]\s*([a-fA-F])\s*[\)\]]/gi, (match, letter) => {
    return `OPTION_${letter.toUpperCase()}`;
  });
  
  result = result.replace(/(?<=^|\s)\b([a-fA-F])\s*[\).:\-–—]/gi, (match, letter) => {
    return `OPTION_${letter.toUpperCase()}`;
  });
  
  return result;
}

export function splitOptionsByMarkers(text) {
  if (!text) return { stem: '', options: [], success: false };
  
  const markerRegex = /\bOPTION_([A-F])\b/g;
  const matches = [];
  let match;
  while ((match = markerRegex.exec(text)) !== null) {
    matches.push({
      label: match[1].toLowerCase(),
      index: match.index,
      length: match[0].length
    });
  }
  
  const LABEL_ORDER = ['a', 'b', 'c', 'd', 'e', 'f'];
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

  const eqRegex = /[a-zA-Z0-9_α-ωΑ-Ω\(\)\[\]\{\}\\\^_\.]+(?:\s*[-+=\*\/<>≤≥≠∩∪−±×÷|]\s*[a-zA-Z0-9_α-ωΑ-Ω\(\)\[\]\{\}\\\^_\.]+)+/g;
  work = work.replace(eqRegex, addPlaceholder);

  work = work.replace(/\b[PQR]\s*\(\s*[a-zA-Z0-9_α-ωΑ-Ω∪∩⊂⊆\+\-\*\/|\\−\s\(\)]+?\s*\)/g, addPlaceholder);
  work = work.replace(/(?<![a-zA-Z0-9_α-ωΑ-Ω])[a-zA-Z0-9_α-ωΑ-Ω]+[\^_][-+a-zA-Z0-9_α-ωΑ-Ω\(\)]+/g, addPlaceholder);
  work = work.replace(/\b\d+\s*\/\s*\d+\b/g, addPlaceholder);
  work = work.replace(/[√π∑∫αβγδθλμσφωηε∩∪⊂⊆≤≥≠±×÷−]/g, addPlaceholder);

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
  if (!text) return '';
  let restored = text;
  const keys = Array.from(placeholders.keys()).sort((a, b) => {
    const numA = parseInt(a.replace(/[^\d]/g, ''), 10);
    const numB = parseInt(b.replace(/[^\d]/g, ''), 10);
    return numB - numA;
  });

  for (const key of keys) {
    const val = placeholders.get(key) || '';
    const numberStr = key.replace(/[^\d]/g, '');
    const regex = new RegExp(`MATHPLACEHOLDER\\s*\\_?\\s*${numberStr}`, 'gi');
    restored = restored.replace(regex, val);
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
  if (!html) return { cleaned: '', removedCount: 0, diagnostics: {} };
  let removedCount = 0;
  let cleaned = html;

  const removedTags = [];
  let strippedAttributesCount = 0;
  let removedOfficeNodesCount = 0;
  let removedVmlFragmentsCount = 0;

  const beforeMsEq = cleaned;
  cleaned = cleaned.replace(/(?:<!--)?<!\[if !msEquation\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');
  if (cleaned !== beforeMsEq) {
    removedCount++;
    removedVmlFragmentsCount++;
  }

  const beforeVml = cleaned;
  cleaned = cleaned.replace(/(?:<!--)?<!\[if gte vml[\s\S]*?\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');
  cleaned = cleaned.replace(/(?:<!--)?<!\[if gte mso[\s\S]*?\]>(?:-->)?[\s\S]*?(?:<!--)?<!\[endif\]>(?:-->)?/gi, '');
  if (cleaned !== beforeVml) {
    removedCount++;
    removedVmlFragmentsCount++;
  }

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
      removedVmlFragmentsCount++;
      removedTags.push(`v/o:${tag}`);
    }
    cleaned = cleaned.replace(new RegExp(`<(?:v|o):${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }

  const namespaceRegex = /<\/?(?:v|o|w|m|x):[^>]*>/gi;
  const matchNamespaces = cleaned.match(namespaceRegex) || [];
  if (matchNamespaces.length) {
    removedOfficeNodesCount += matchNamespaces.length;
    cleaned = cleaned.replace(namespaceRegex, '');
  }

  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/<span[^>]*>\s*<\/span>/gi, '');
    cleaned = cleaned.replace(/<p[^>]*>\s*<\/p>/gi, '');
    cleaned = cleaned.replace(/<div[^>]*>\s*<\/div>/gi, '');
  }

  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

  return {
    cleaned: cleaned.trim(),
    removedCount,
    diagnostics: {
      removedTags,
      removedOfficeNodesCount,
      removedVmlFragmentsCount,
      strippedAttributesCount
    }
  };
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
  
  // Count inline option markers in stem text
  const optionMatches = [...stemText.matchAll(/(?:^|[^a-zA-Z0-9_\$])(?:OPTION_([A-F])|[\(\[]\s*([A-F])\s*[\)\]]|\b([A-F])\s*[\).:\-–—])(?=\s|$)/gi)];
  const distinctLabels = new Set(optionMatches.map(m => (m[1] || m[2] || m[3]).toUpperCase()));
  const effectiveOptionsCount = Math.max(optionsCount, distinctLabels.size);

  if (effectiveOptionsCount >= 2) {
    const hasStatementLayer = /\b(statement|i|ii|iii|iv|a|b|c)\b/i.test(lower) && 
                              /(?:only\s+[a-f]\s+and\s+[a-f]|[a-f]\s*,\s*[a-f]\s*only)/i.test(lower);
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
/**
 * Shield math regions from text using temporary placeholders.
 */
function shieldText(text, map, counterObj) {
  if (!text) return '';
  let shielded = text;
  
  const addTempPlaceholder = (match) => {
    const key = `MATHPLACEHOLDER${counterObj.count++}`;
    map.set(key, match);
    return key;
  };
  
  shielded = shielded.replace(/\$\$([\s\S]+?)\$\$/g, addTempPlaceholder);
  shielded = shielded.replace(/\\\[([\s\S]+?)\\\]/g, addTempPlaceholder);
  shielded = shielded.replace(/\$([^$\n]+?)\$/g, addTempPlaceholder);
  shielded = shielded.replace(/\\\(([\s\S]+?)\\\)/g, addTempPlaceholder);
  
  return shielded;
}

export function extractOfficeSemantics(html, plainText) {
  const mathMap = {};
  const figures = [];
  const lineage = {};
  const unresolvedMath = [];
  let figureCounter = 1;
  let mathCounter = 1;
  
  if (!html) {
    return { html: '', mathMap, figures, lineage, unresolvedMath };
  }

  try {
    // 1. Pre-normalization: Unwrap conditional comments to expose VML/OLE tags
    let normalizedHtml = html;
    normalizedHtml = normalizedHtml.replace(/<!--\[if[^\]]*\]>\s*<xml>/gi, '<xml>');
    normalizedHtml = normalizedHtml.replace(/<\/xml>\s*<!\[endif\]-->/gi, '</xml>');
    normalizedHtml = normalizedHtml.replace(/<!--\[if[^\]]*\]>/gi, '');
    normalizedHtml = normalizedHtml.replace(/<!\[endif\]-->/gi, '');
    normalizedHtml = normalizedHtml.replace(/<!\[if[^\]]*\]>/gi, '');
    normalizedHtml = normalizedHtml.replace(/<!\[endif\]>/gi, '');
    normalizedHtml = normalizedHtml.replace(/<!--[\s\S]*?-->/g, '');

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<html><body>${normalizedHtml}</body></html>`, 'text/html');
    const body = doc.body || doc.documentElement;

    const domToAstNode = (el) => {
      if (el.nodeType === 3) {
        return el.nodeValue;
      }
      if (el.nodeType !== 1) {
        return null;
      }
      
      let tag = el.tagName.toLowerCase();
      const colonIdx = tag.indexOf(':');
      if (colonIdx !== -1) {
        tag = tag.slice(colonIdx + 1);
      }
      
      const attrs = {};
      if (el.attributes) {
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i];
          let name = attr.name.toLowerCase();
          const attrColonIdx = name.indexOf(':');
          if (attrColonIdx !== -1) {
            name = name.slice(attrColonIdx + 1);
          }
          attrs[name] = attr.value;
        }
      }
      
      const children = [];
      if (el.childNodes) {
        for (let i = 0; i < el.childNodes.length; i++) {
          const childAst = domToAstNode(el.childNodes[i]);
          if (childAst) children.push(childAst);
        }
      }
      
      return { tag, attrs, children };
    };

    const compileTableMarkdown = (tableEl) => {
      const rows = [];
      const trs = tableEl.querySelectorAll('tr');
      for (const tr of trs) {
        const cells = [];
        const tds = tr.querySelectorAll('td, th');
        for (const td of tds) {
          cells.push(td.textContent?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '');
        }
        if (cells.length) {
          rows.push('| ' + cells.join(' | ') + ' |');
        }
      }
      if (rows.length > 0) {
        const cellCount = rows[0].split('|').length - 2;
        if (cellCount > 0) {
          const sep = '| ' + Array(cellCount).fill('---').join(' | ') + ' |';
          rows.splice(1, 0, sep);
        }
        return '\n\n' + rows.join('\n') + '\n\n';
      }
      return '';
    };

    const getNodeLineage = (node, origin) => {
      if (!node) return null;
      const ancestors = [];
      let parent = node.parentNode;
      const parentTag = parent ? parent.tagName.toLowerCase().split(':').pop() : '';
      
      while (parent && parent.tagName) {
        ancestors.push(parent.tagName.toLowerCase().split(':').pop());
        parent = parent.parentNode;
      }

      let siblingIndex = 0;
      if (node.parentNode) {
        const siblings = Array.from(node.parentNode.childNodes);
        siblingIndex = siblings.indexOf(node);
      }

      return {
        parentTag,
        officeOrigin: origin,
        ancestors,
        siblingIndex
      };
    };

    // Grouping logic
    const allNodes = Array.from(body.getElementsByTagName('*'));
    const shapeGroups = new Map();
    const getOrCreateGroup = (id) => {
      if (!id) return null;
      const cleanId = id.trim();
      if (!shapeGroups.has(cleanId)) {
        shapeGroups.set(cleanId, {
          shapeId: cleanId,
          shapeNode: null,
          oleNode: null,
          imageDataNode: null,
          fallbackImgNode: null,
          ommlNode: null,
          mathmlNode: null,
          processed: false
        });
      }
      return shapeGroups.get(cleanId);
    };

    // Populate shape groups
    for (const node of allNodes) {
      const tag = node.tagName.toLowerCase();
      const cleanTag = tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag;

      if (cleanTag === 'shape') {
        const id = node.getAttribute('id') || node.getAttribute('o:spid');
        if (id) {
          const g = getOrCreateGroup(id);
          if (g) g.shapeNode = node;
        }
      } else if (cleanTag === 'oleobject') {
        const shapeId = node.getAttribute('shapeid') || node.getAttribute('ShapeID') || node.getAttribute('id');
        if (shapeId) {
          const g = getOrCreateGroup(shapeId);
          if (g) g.oleNode = node;
        }
      } else if (cleanTag === 'imagedata') {
        let parent = node.parentNode;
        while (parent && parent !== body) {
          const parentTag = parent.tagName.toLowerCase().split(':').pop();
          if (parentTag === 'shape') {
            const id = parent.getAttribute('id') || parent.getAttribute('o:spid');
            if (id) {
              const g = getOrCreateGroup(id);
              if (g) g.imageDataNode = node;
            }
            break;
          }
          parent = parent.parentNode;
        }
      } else if (tag === 'img') {
        const shapeId = node.getAttribute('v:shapes') || node.getAttribute('shapes');
        if (shapeId) {
          const g = getOrCreateGroup(shapeId);
          if (g) g.fallbackImgNode = node;
        }
      }
    }

    // Associate nested OMML / MathML inside shapes
    for (const node of allNodes) {
      const tag = node.tagName.toLowerCase();
      const cleanTag = tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag;

      if (cleanTag === 'omath' || cleanTag === 'omathpara' || cleanTag === 'math') {
        let parent = node.parentNode;
        while (parent && parent !== body) {
          const parentTag = parent.tagName.toLowerCase().split(':').pop();
          if (parentTag === 'shape') {
            const id = parent.getAttribute('id') || parent.getAttribute('o:spid');
            if (id) {
              const g = shapeGroups.get(id.trim());
              if (g) {
                if (cleanTag === 'math') g.mathmlNode = node;
                else g.ommlNode = node;
              }
            }
            break;
          }
          parent = parent.parentNode;
        }
      }
    }

    const replaceGroupWithPlaceholder = (g, placeholderText) => {
      const nodes = [g.fallbackImgNode, g.shapeNode, g.oleNode].filter(n => n && n.parentNode);
      if (nodes.length === 0) return;
      const primaryNode = nodes[0];
      const parent = primaryNode.parentNode;
      if (!parent) return;
      
      const textNode = doc.createTextNode(placeholderText);
      parent.replaceChild(textNode, primaryNode);
      
      for (let i = 1; i < nodes.length; i++) {
        nodes[i].parentNode?.removeChild(nodes[i]);
      }
      if (g.imageDataNode && g.imageDataNode.parentNode) {
        g.imageDataNode.parentNode.removeChild(g.imageDataNode);
      }
    };

    // Process Shape Groups
    for (const [shapeId, g] of shapeGroups.entries()) {
      let resolvedMath = null;
      let origin = null;
      const primaryNode = g.fallbackImgNode || g.shapeNode || g.oleNode;
      if (!primaryNode) continue;

      // 1. OMML
      if (g.ommlNode) {
        try {
          const ast = domToAstNode(g.ommlNode);
          if (ast) {
            const latex = translateOmmlNode(ast);
            if (latex && latex.trim()) {
              resolvedMath = latex.trim();
              origin = 'omml';
            }
          }
        } catch (e) {
          console.warn("Shape group OMML resolution failed:", e);
        }
      }

      // 2. MathML
      if (!resolvedMath && g.mathmlNode) {
        try {
          const ast = domToAstNode(g.mathmlNode);
          if (ast) {
            const latex = translateMathmlNode(ast);
            if (latex && latex.trim()) {
              resolvedMath = latex.trim();
              origin = 'mathml';
            }
          }
        } catch (e) {
          console.warn("Shape group MathML resolution failed:", e);
        }
      }

      // 3. OLE
      if (!resolvedMath && g.oleNode) {
        const alt = g.oleNode.getAttribute('alt') || g.oleNode.getAttribute('title') || '';
        if (alt && /[\+\-=\*\/≤≥≠]|\\|^\s*[a-zA-Z0-9_\^]+\s*$/i.test(alt)) {
          resolvedMath = alt.trim();
          origin = 'ole';
        }
      }

      // 4. VML Image metadata
      if (!resolvedMath && g.imageDataNode) {
        const title = g.imageDataNode.getAttribute('title') || g.imageDataNode.getAttribute('o:title') || '';
        if (title && /[\+\-=\*\/≤≥≠]|\\|^\s*[a-zA-Z0-9_\^]+\s*$/i.test(title)) {
          resolvedMath = title.trim();
          origin = 'vml';
        }
      }

      // 5. Fallback Image alt
      if (!resolvedMath && g.fallbackImgNode) {
        const alt = g.fallbackImgNode.getAttribute('alt') || g.fallbackImgNode.getAttribute('title') || '';
        if (alt && /[\+\-=\*\/≤≥≠]|\\|^\s*[a-zA-Z0-9_\^]+\s*$/i.test(alt)) {
          resolvedMath = alt.replace(/Equation\b/gi, '').trim();
          origin = 'img_alt';
        }
      }

      logger.info(`[SHAPE_GROUP_TRACE] Group: ${shapeId}`, {
        groupIdentifier: shapeId,
        participatingNodes: Object.keys(g).filter(k => g[k] !== null && k !== 'processed' && k !== 'shapeId'),
        sourceTypes: {
          hasOmml: !!g.ommlNode,
          hasMathml: !!g.mathmlNode,
          hasOle: !!g.oleNode,
          hasImageData: !!g.imageDataNode,
          hasFallbackImg: !!g.fallbackImgNode
        },
        extractionPriorityChosen: origin || 'none',
        fallbackReason: origin ? `Successfully extracted via ${origin}` : 'No textual math found in priority chain',
        unresolvedStatus: resolvedMath ? 'resolved' : 'unresolved'
      });

      if (resolvedMath) {
        const ph = `__MATH_PLACEHOLDER_GRP_${mathCounter++}__`;
        const parentIsBlock = primaryNode.parentNode && ['p', 'div'].includes(primaryNode.parentNode.tagName.toLowerCase()) && primaryNode.parentNode.childNodes.length === 1;
        mathMap[ph] = parentIsBlock ? `\n$$${resolvedMath}$$\n` : `$${resolvedMath}$`;
        
        lineage[ph] = getNodeLineage(primaryNode, origin);
        replaceGroupWithPlaceholder(g, ph);
      } else {
        const src = (g.imageDataNode && g.imageDataNode.getAttribute('src')) || (g.fallbackImgNode && g.fallbackImgNode.getAttribute('src')) || '';
        const isEquationImage = src.includes('math') || src.includes('equation') || src.includes('.wmf') || 
                                (g.oleNode && /Equation\./i.test(g.oleNode.getAttribute('progid') || ''));

        if (isEquationImage) {
          const ph = `__MATH_UNRESOLVED_${mathCounter++}__`;
          const outerHtml = (g.shapeNode && g.shapeNode.outerHTML) || (g.oleNode && g.oleNode.outerHTML) || primaryNode.outerHTML;
          mathMap[ph] = outerHtml;
          unresolvedMath.push(ph);
          
          lineage[ph] = getNodeLineage(primaryNode, 'unresolved_equation');
          replaceGroupWithPlaceholder(g, ph);
        } else if (src) {
          const figId = `[FIGURE_${figureCounter++}]`;
          const title = (g.imageDataNode && (g.imageDataNode.getAttribute('title') || g.imageDataNode.getAttribute('o:title'))) ||
                        (g.fallbackImgNode && (g.fallbackImgNode.getAttribute('alt') || g.fallbackImgNode.getAttribute('title'))) || null;
          figures.push({
            id: figId,
            url: src,
            caption: title,
            type: 'figure'
          });
          
          lineage[figId] = getNodeLineage(primaryNode, 'figure');
          replaceGroupWithPlaceholder(g, figId);
        } else {
          // Fallback unresolved
          const ph = `__MATH_UNRESOLVED_${mathCounter++}__`;
          const outerHtml = (g.shapeNode && g.shapeNode.outerHTML) || (g.oleNode && g.oleNode.outerHTML) || primaryNode.outerHTML;
          mathMap[ph] = outerHtml;
          unresolvedMath.push(ph);
          
          lineage[ph] = getNodeLineage(primaryNode, 'unresolved_empty');
          replaceGroupWithPlaceholder(g, ph);
        }
      }
      g.processed = true;
    }

    // Now collect and process independent elements
    const independentElements = [];
    const collectIndependent = (node) => {
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      const cleanTag = tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag;

      let wasGrouped = false;
      if (cleanTag === 'shape') {
        const id = node.getAttribute('id') || node.getAttribute('o:spid');
        if (id && shapeGroups.has(id.trim())) wasGrouped = true;
      } else if (cleanTag === 'oleobject') {
        const shapeId = node.getAttribute('shapeid') || node.getAttribute('ShapeID') || node.getAttribute('id');
        if (shapeId && shapeGroups.has(shapeId.trim())) wasGrouped = true;
      } else if (cleanTag === 'imagedata') {
        let parent = node.parentNode;
        while (parent && parent !== body) {
          const parentTag = parent.tagName.toLowerCase().split(':').pop();
          if (parentTag === 'shape') {
            const id = parent.getAttribute('id') || parent.getAttribute('o:spid');
            if (id && shapeGroups.has(id.trim())) wasGrouped = true;
            break;
          }
          parent = parent.parentNode;
        }
      } else if (tag === 'img') {
        const shapeId = node.getAttribute('v:shapes') || node.getAttribute('shapes');
        if (shapeId && shapeGroups.has(shapeId.trim())) wasGrouped = true;
      }

      const children = Array.from(node.childNodes);
      for (const child of children) {
        collectIndependent(child);
      }

      if (!wasGrouped) {
        if (['omath', 'omathpara', 'math', 'oleobject', 'imagedata', 'shape', 'img', 'table'].includes(cleanTag)) {
          independentElements.push(node);
        }
      }
    };
    collectIndependent(body);

    for (const el of independentElements) {
      if (!el.parentNode) continue;
      
      const tag = el.tagName.toLowerCase();
      const cleanTag = tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag;
      
      if (cleanTag === 'omath' || cleanTag === 'omathpara') {
        try {
          const ast = domToAstNode(el);
          if (ast) {
            const isBlock = cleanTag === 'omathpara';
            let latex = translateOmmlNode(ast);
            if (latex && latex.trim()) {
              const ph = `__MATH_PLACEHOLDER_OMML_${mathCounter++}__`;
              mathMap[ph] = isBlock ? `\n$$${latex.trim()}$$\n` : `$${latex.trim()}$`;
              lineage[ph] = getNodeLineage(el, 'omml');
              el.parentNode.replaceChild(doc.createTextNode(ph), el);
            }
          }
        } catch (err) {
          console.warn("DOM OMML translation failed:", err);
        }
        continue;
      }
      
      if (cleanTag === 'math') {
        try {
          const ast = domToAstNode(el);
          if (ast) {
            const isBlock = el.getAttribute('display') === 'block';
            let latex = translateMathmlNode(ast);
            if (latex && latex.trim()) {
              const ph = `__MATH_PLACEHOLDER_MML_${mathCounter++}__`;
              mathMap[ph] = isBlock ? `\n$$${latex.trim()}$$\n` : `$${latex.trim()}$`;
              lineage[ph] = getNodeLineage(el, 'mathml');
              el.parentNode.replaceChild(doc.createTextNode(ph), el);
            }
          }
        } catch (err) {
          console.warn("DOM MathML translation failed:", err);
        }
        continue;
      }
      
      if (cleanTag === 'oleobject') {
        const alt = el.getAttribute('alt') || el.getAttribute('title') || '';
        if (alt && /[\+\-=\*\/≤≥≠]|\\|^\s*[a-zA-Z0-9_\^]+\s*$/i.test(alt)) {
          const ph = `__MATH_PLACEHOLDER_OLE_${mathCounter++}__`;
          mathMap[ph] = `$${alt.trim()}$`;
          lineage[ph] = getNodeLineage(el, 'ole');
          el.parentNode.replaceChild(doc.createTextNode(ph), el);
        } else {
          const progId = el.getAttribute('progid') || '';
          if (/Equation/i.test(progId)) {
            const ph = `__MATH_UNRESOLVED_${mathCounter++}__`;
            mathMap[ph] = el.outerHTML;
            unresolvedMath.push(ph);
            lineage[ph] = getNodeLineage(el, 'unresolved_ole');
            el.parentNode.replaceChild(doc.createTextNode(ph), el);
          } else {
            el.parentNode.removeChild(el);
          }
        }
        continue;
      }
      
      if (cleanTag === 'imagedata') {
        const src = el.getAttribute('src') || '';
        const title = el.getAttribute('title') || el.getAttribute('o:title') || '';
        if (src) {
          const isEquation = src.includes('math') || src.includes('equation') || src.includes('.wmf') || /[\+\-=\*\/≤≥≠]|\\|^\s*[a-zA-Z0-9_\^]+\s*$/i.test(title);
          if (isEquation && title) {
            const ph = `__MATH_PLACEHOLDER_VML_${mathCounter++}__`;
            mathMap[ph] = `$${title.trim()}$`;
            lineage[ph] = getNodeLineage(el, 'vml');
            let targetNode = el;
            if (el.parentNode && el.parentNode.tagName.toLowerCase().split(':').pop() === 'shape') {
              targetNode = el.parentNode;
            }
            targetNode.parentNode?.replaceChild(doc.createTextNode(ph), targetNode);
          } else if (isEquation) {
            const ph = `__MATH_UNRESOLVED_${mathCounter++}__`;
            let targetNode = el;
            if (el.parentNode && el.parentNode.tagName.toLowerCase().split(':').pop() === 'shape') {
              targetNode = el.parentNode;
            }
            mathMap[ph] = targetNode.outerHTML;
            unresolvedMath.push(ph);
            lineage[ph] = getNodeLineage(targetNode, 'unresolved_vml');
            targetNode.parentNode?.replaceChild(doc.createTextNode(ph), targetNode);
          } else {
            const figId = `[FIGURE_${figureCounter++}]`;
            figures.push({
              id: figId,
              url: src,
              caption: title || null,
              type: 'figure'
            });
            lineage[figId] = getNodeLineage(el, 'figure');
            let targetNode = el;
            if (el.parentNode && el.parentNode.tagName.toLowerCase().split(':').pop() === 'shape') {
              targetNode = el.parentNode;
            }
            targetNode.parentNode?.replaceChild(doc.createTextNode(figId), targetNode);
          }
        }
        continue;
      }

      if (cleanTag === 'shape') {
        const title = el.getAttribute('title') || '';
        if (title && /[\+\-=\*\/≤≥≠]|\\|^\s*[a-zA-Z0-9_\^]+\s*$/i.test(title)) {
          const ph = `__MATH_PLACEHOLDER_SHAPE_${mathCounter++}__`;
          mathMap[ph] = `$${title.trim()}$`;
          lineage[ph] = getNodeLineage(el, 'shape');
          el.parentNode.replaceChild(doc.createTextNode(ph), el);
        } else {
          const ph = `__MATH_UNRESOLVED_${mathCounter++}__`;
          mathMap[ph] = el.outerHTML;
          unresolvedMath.push(ph);
          lineage[ph] = getNodeLineage(el, 'unresolved_shape');
          el.parentNode.replaceChild(doc.createTextNode(ph), el);
        }
        continue;
      }
      
      if (cleanTag === 'img') {
        const src = el.getAttribute('src') || '';
        const alt = el.getAttribute('alt') || '';
        if (src) {
          const isEquation = src.includes('equation') || alt.includes('Equation') || /[\+\-=\*\/≤≥≠]|\\|^\s*[a-zA-Z0-9_\^]+\s*$/i.test(alt);
          if (isEquation && alt) {
            const cleanAlt = alt.replace(/Equation\b/gi, '').trim();
            const ph = `__MATH_PLACEHOLDER_IMG_${mathCounter++}__`;
            mathMap[ph] = `$${cleanAlt}$`;
            lineage[ph] = getNodeLineage(el, 'img');
            el.parentNode.replaceChild(doc.createTextNode(ph), el);
          } else if (isEquation) {
            const ph = `__MATH_UNRESOLVED_${mathCounter++}__`;
            mathMap[ph] = el.outerHTML;
            unresolvedMath.push(ph);
            lineage[ph] = getNodeLineage(el, 'unresolved_img');
            el.parentNode.replaceChild(doc.createTextNode(ph), el);
          } else {
            const figId = `[FIGURE_${figureCounter++}]`;
            figures.push({
              id: figId,
              url: src,
              caption: alt || null,
              type: 'figure'
            });
            lineage[figId] = getNodeLineage(el, 'figure');
            el.parentNode.replaceChild(doc.createTextNode(figId), el);
          }
        }
        continue;
      }
      
      if (cleanTag === 'table') {
        const md = compileTableMarkdown(el);
        if (md) {
          el.parentNode.replaceChild(doc.createTextNode(md), el);
        }
        continue;
      }
    }

    // Paragraph lists normalization
    const paragraphs = body.querySelectorAll('p');
    for (const p of paragraphs) {
      const className = p.getAttribute('class') || '';
      const style = p.getAttribute('style') || '';
      if (className.includes('MsoListParagraph') || style.includes('mso-list')) {
        const listMatch = style.match(/mso-list\s*:\s*(\w+)\s+level(\d+)/i);
        const level = listMatch ? parseInt(listMatch[2], 10) : 1;
        const indent = '  '.repeat(level - 1);
        const bullet = level % 2 === 0 ? '- ' : '* ';
        const text = p.textContent?.trim() || '';
        p.textContent = `${indent}${bullet}${text}`;
        p.removeAttribute('class');
        p.removeAttribute('style');
      }
    }

    const cleanedHtml = body.innerHTML || '';
    return {
      html: cleanedHtml,
      mathMap,
      figures,
      lineage,
      unresolvedMath
    };

  } catch (err) {
    console.warn("DOM-based semantic extraction failed, falling back:", err);
    return { html: html || '', mathMap, figures, lineage, unresolvedMath };
  }
}


export async function runStagesReconstruction(plainText, htmlText = null, ocrText = null, blocks = null, rawHtml = null, pipelineOptions = {}) {
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

  stages.stage0.payloadFingerprint = generatePayloadFingerprint(srcHtml, plainText);

  // Stage 1: Office Semantic Extraction (BEFORE sanitization)
  const semanticRes = extractOfficeSemantics(srcHtml, plainText);
  let cleanedHtml = semanticRes.html;

  if (srcHtml) {
    const styleCount = (srcHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || []).length;
    if (styleCount) stages.stage1.removed_tags.push("style");
    const xmlCount = (srcHtml.match(/<\?xml[\s\S]*?\?>/gi) || []).length;
    if (xmlCount) stages.stage1.removed_tags.push("xml");

    const ommlMatch = srcHtml.match(/<m:oMath>/g) || [];
    if (ommlMatch.length) stages.stage1.math_containing_nodes.push("OMML (OfficeMath)");

    stages.stage1.removed_attributes = ["class", "style", "mso-*", "lang", "width", "height"];
    
    // Clean legacy noise, comments and VML
    const cleanedRes = cleanRenderingArtifacts(cleanedHtml);
    cleanedHtml = cleanedRes.cleaned;
    stages.stage1.after_html = cleanedHtml;
    stages.stage1.cleanup_diagnostics = cleanedRes.diagnostics;
    stages.stage1.unresolved_placeholder_count = semanticRes.unresolvedMath.length;
  }

  // Stage 2: Structural HTML Normalization (AFTER extraction)
  let normalizedHtml = cleanedHtml;
  if (normalizedHtml) {
    normalizedHtml = balanceTags(normalizedHtml);
    stages.stage2.normalization_log.push({ action: "balanced_tags", details: "Balanced document nodes" });
  }

  // Stage 3: Figure/Image Isolation
  const { isolatedHtml, isolatedPlain, figures: extraFigures } = isolateFigures(normalizedHtml, plainText || '');
  const figures = [...semanticRes.figures, ...extraFigures];
  stages.stage3.figures_extracted = figures;
  stages.stage3.isolated_html = isolatedHtml;

  // Stage 4: Semantic Math Shielding (Integrate pre-extracted and regex-matched math)
  const placeholders = new Map();
  for (const [k, v] of Object.entries(semanticRes.mathMap)) {
    placeholders.set(k, v);
    stages.stage4.equations_detail.push({ key: k, raw: v, parentBlockType: 'paragraph' });
    stages.stage4.equations_detected.push(v);
  }
  let count = placeholders.size;
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

    const eqRegex = /[a-zA-Z0-9_α-ωΑ-Ω\(\)\[\]\{\}\\\^_\.]+(?:\s*[-+=\*\/<>≤≥≠∩∪−±×÷|]\s*[a-zA-Z0-9_α-ωΑ-Ω\(\)\[\]\{\}\\\^_\.]+)+/g;
    shieldedPlain = shieldedPlain.replace(eqRegex, addPlaceholder);

    shieldedPlain = shieldedPlain.replace(/\b[PQR]\s*\(\s*[a-zA-Z0-9_α-ωΑ-Ω∪∩⊂⊆\+\-\*\/|\\−\s\(\)]+?\s*\)/g, addPlaceholder);
    shieldedPlain = shieldedPlain.replace(/(?<![a-zA-Z0-9_α-ωΑ-Ω])[a-zA-Z0-9_α-ωΑ-Ω]+[\^_][-+a-zA-Z0-9_α-ωΑ-Ω\(\)]+/g, addPlaceholder);
    shieldedPlain = shieldedPlain.replace(/\b\d+\s*\/\s*\d+\b/g, addPlaceholder);
    shieldedPlain = shieldedPlain.replace(/[√π∑∫αβγδθλμσφωηε∩∪⊂⊆≤≥≠±×÷−]/g, addPlaceholder);

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
  } else if (optionBlocks.length === 1) {
    // Try to split the single option block
    const label = optionBlocks[0].label || 'A';
    const textToSplit = `${label}. ${optionBlocks[0].content}`;
    const splitResult = splitOptionsByMarkers(normalizeOptionPrefixes(textToSplit));
    if (splitResult.success && splitResult.options.length >= 2) {
      options = splitResult.options.map(o => ({ text: o.text }));
    } else {
      // Use the single option block as is
      options = optionBlocks.map(o => ({ text: o.content }));
      
      // Fallback split on stem if option block wasn't inline-split and stem has inline options
      const stemSplit = splitOptionsByMarkers(normalizeOptionPrefixes(stem));
      if (stemSplit.success) {
        stem = stemSplit.stem.replace(QUESTION_START_RE, '').trim();
        options = stemSplit.options.map(o => ({ text: o.text }));
        if (stages.stage6.classified_type === 'DESCRIPTIVE' || stages.stage6.classified_type === 'mcq') {
          stages.stage6.classified_type = 'MCQ_SINGLE';
        }
      }
    }
  } else {
    // optionBlocks.length === 0, try splitting the stem
    const splitResult = splitOptionsByMarkers(normalizeOptionPrefixes(stem));
    if (splitResult.success) {
      stem = splitResult.stem.replace(QUESTION_START_RE, '').trim();
      options = splitResult.options.map(o => ({ text: o.text }));
      if (stages.stage6.classified_type === 'DESCRIPTIVE' || stages.stage6.classified_type === 'mcq') {
        stages.stage6.classified_type = 'MCQ_SINGLE';
      }
    }
  }

  // Restore Math regions in stem, options, and statementGroups for Stage 8
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

  // Now, shield math regions specifically for Stage 9 (Ollama refinement) to ensure they are deterministic + immutable!
  const tempPlaceholders = new Map();
  const counterObj = { count: 0 };

  const shieldedStemForOllama = shieldText(stem, tempPlaceholders, counterObj);
  const shieldedOptionsForOllama = options.map(o => ({
    ...o,
    text: shieldText(o.text, tempPlaceholders, counterObj)
  }));
  const shieldedStatementGroupsForOllama = statementGroups.map(s => shieldText(s, tempPlaceholders, counterObj));

  // Stage 9: Ollama Semantic Refinement (Local Inference)
  let correctAnswers = [];
  let explanation = "";
  let formulas = Array.from(normalizedPlaceholders.values());
  let tags = [questionType.toLowerCase()];

  const ollamaModel = env.ai.ollamaModel || 'llama3.2';
  const shouldSkipLlm = pipelineOptions.skipLlm !== false; // defaults to true unless skipLlm is explicitly set to false
  
  if (env.ai.provider === 'ollama' && !shouldSkipLlm) {
    try {
      const refined = await ollamaReconstructCleanup(
        { questionText: shieldedStemForOllama, questionType, options: shieldedOptionsForOllama },
        plainText
      );
      if (refined) {
        stages.stage9.refined = true;
        stages.stage9.response = refined;
        if (refined.stem) stem = refined.stem;
        if (refined.questionType) stages.stage6.classified_type = refined.questionType;
        if (Array.isArray(refined.options)) {
          options = refined.options.map(o => ({ text: o.text || o || '' }));
        } else {
          options = shieldedOptionsForOllama;
        }
        if (Array.isArray(refined.correctAnswers)) {
          correctAnswers = refined.correctAnswers;
        }
        if (refined.explanation) explanation = refined.explanation;
        if (Array.isArray(refined.statementGroups)) {
          statementGroups = refined.statementGroups;
        } else {
          statementGroups = shieldedStatementGroupsForOllama;
        }
        if (Array.isArray(refined.formulas)) {
          formulas = refined.formulas;
        }
        if (Array.isArray(refined.tags)) {
          tags = [...new Set([...tags, ...refined.tags])];
        }
      } else {
        stem = shieldedStemForOllama;
        options = shieldedOptionsForOllama;
        statementGroups = shieldedStatementGroupsForOllama;
        stages.stage9.warnings.push("Local semantic refinement unavailable — using deterministic parser.");
      }
    } catch (err) {
      stem = shieldedStemForOllama;
      options = shieldedOptionsForOllama;
      statementGroups = shieldedStatementGroupsForOllama;
      stages.stage9.warnings.push("Local semantic refinement unavailable — using deterministic parser.");
    }
  } else {
    stem = shieldedStemForOllama;
    options = shieldedOptionsForOllama;
    statementGroups = shieldedStatementGroupsForOllama;
    stages.stage9.warnings.push("Local semantic refinement unavailable — using deterministic parser.");
  }

  // Restore the temporary placeholders from Ollama's output (or fallbacks)
  stem = restoreMathRegions(stem, tempPlaceholders);
  options = options.map(o => ({
    ...o,
    text: restoreMathRegions(o.text, tempPlaceholders)
  }));
  statementGroups = statementGroups.map(s => restoreMathRegions(s, tempPlaceholders));
  explanation = restoreMathRegions(explanation, tempPlaceholders);

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

  // Math Preservation Confidence
  let mathPreservationConfidence = 1.0;
  if (stages.stage10.unresolved_placeholders.length > 0) {
    mathPreservationConfidence -= stages.stage10.unresolved_placeholders.length * 0.25;
  }
  if (stages.stage11.malformed_expressions.length > 0) {
    mathPreservationConfidence -= stages.stage11.malformed_expressions.length * 0.15;
  }
  const unresolvedMathCount = semanticRes.unresolvedMath ? semanticRes.unresolvedMath.length : 0;
  if (unresolvedMathCount > 0) {
    mathPreservationConfidence -= unresolvedMathCount * 0.3;
  }
  mathPreservationConfidence = Math.max(0.1, Math.min(1.0, mathPreservationConfidence));

  // Semantic Confidence
  let semanticConfidence = 1.0;
  if (!questionType || questionType === 'DESCRIPTIVE') {
    semanticConfidence -= 0.1;
  }
  if (questionType === 'MCQ_SINGLE' || questionType === 'MCQ_MULTI') {
    if (options.length < 2) {
      semanticConfidence -= 0.4;
    } else if (options.length !== 4) {
      semanticConfidence -= 0.1;
    }
  }
  if (stem.length < 20) {
    semanticConfidence -= 0.2;
  }
  semanticConfidence = Math.max(0.1, Math.min(1.0, semanticConfidence));

  // Metadata Confidence
  let metadataConfidence = 1.0;
  if (stages.stage12.tags.length === 0) {
    metadataConfidence -= 0.1;
  }
  if (!stages.stage12.class) {
    metadataConfidence -= 0.2;
  }
  metadataConfidence = Math.max(0.1, Math.min(1.0, metadataConfidence));

  const reconstructionFidelity = Math.max(0.1, 1 - (stages.stage11.malformed_expressions.length * 0.1) - (unresolved.length * 0.15) - (unresolvedMathCount * 0.25));

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
    reconstructionFidelity,
    semanticConfidence,
    mathPreservationConfidence,
    metadataConfidence,
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
    lineage: semanticRes.lineage,
    unresolvedMath: semanticRes.unresolvedMath,
    cleanupDiagnostics: stages.stage1.cleanup_diagnostics
  };

  // Log 3: Stage-by-stage outputs
  for (const [key, stage] of Object.entries(stages)) {
    logger.info(`[FORENSIC_LOG] 3. Stage-by-stage outputs - ${key} (${stage.title})`, {
      stageKey: key,
      title: stage.title,
      output: JSON.parse(JSON.stringify(stage))
    });
  }

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
    reconstructionFidelity,
    semanticConfidence,
    mathPreservationConfidence,
    metadataConfidence,
    lineage: semanticRes.lineage,
    unresolvedMath: semanticRes.unresolvedMath,
    debugInfo,
  };
}
