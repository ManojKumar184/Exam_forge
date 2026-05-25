import { preNormalizeMathText, normalizeLatexSyntax } from './mathNormalizer.js';

// Unicode math mappings for Stage 9 LaTeX Normalization
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

/**
 * Stage 1: OCR Normalization
 */
export function normalizeOcrText(text) {
  if (!text) return '';
  return decodeHtmlEntities(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Stage 2: Unicode Cleanup
 */
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

/**
 * Stage 3: Math Shielding
 */
export function shieldMathRegions(text) {
  const placeholders = new Map();
  let count = 0;
  let work = text;

  const addPlaceholder = (match) => {
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

/**
 * Stage 8: Math Restoration
 */
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

/**
 * Stage 9: LaTeX Normalization
 */
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

export function normalizeAllMathPlaceholders(placeholders) {
  const rawResolved = new Map();
  
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
  const normalized = new Map();
  for (const [key, rawVal] of rawResolved.entries()) {
    normalized.set(key, normalizeLatexRegion(rawVal));
  }
  return { normalized, rawResolved };
}

/**
 * Stage 10: Validation Engine
 */
export function validateReconstruction(stem, options) {
  const warnings = [];
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

const mapToRecord = (map) => {
  const rec = {};
  for (const [k, v] of map.entries()) {
    rec[k] = v;
  }
  return rec;
};

/**
 * Execute the full 10-stage parser pipeline.
 */
export function runStagesReconstruction(plainText, htmlText = null, ocrText = null, blocks = null) {
  // If structured blocks are provided, parse directly from blocks
  if (blocks && blocks.length > 0) {
    const placeholders = new Map();
    let count = 0;
    const htmlPlaceholders = new Map();
    let htmlCount = 0;

    const addPlaceholder = (match) => {
      const key = `MATHPLACEHOLDER${count++}`;
      placeholders.set(key, match);
      return key;
    };

    const addHtmlPlaceholder = (match) => {
      const key = `HTMLTAGPLACEHOLDER${htmlCount++}`;
      htmlPlaceholders.set(key, match);
      return key;
    };

    const cleanUnicodeTextForHtml = (out) => {
      let work = out;
      for (const re of OFFICE_PLAIN_NOISE) {
        work = work.replace(re, ' ');
      }
      return work
        .replace(/\u00a0/g, ' ')
        .replace(/[\u200b-\u200d\ufeff]/g, '');
    };

    // Shield a single string using shared placeholders
    const shieldBlockContent = (txt) => {
      let work = normalizeOcrText(txt);
      // Run preNormalizeMathText on raw block content
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

    const optionBlocks = shieldedBlocks.filter(b => b.type === 'option');
    const stemBlocks = shieldedBlocks.filter(b => b.type !== 'option');

    let finalShieldedStem = stemBlocks
      .map(b => b.content)
      .join('\n')
      .trim();

    finalShieldedStem = finalShieldedStem.replace(QUESTION_START_RE, '').trim();

    const isMcq = optionBlocks.length >= 2;
    let finalOptions = [];
    let stem = finalShieldedStem;
    let questionType = 'descriptive';
    let subtype = 'descriptive';

    if (isMcq) {
      const order = ['A', 'B', 'C', 'D'];
      const map = new Map();
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
      stem = shieldedBlocks.map(b => b.content).join('\n').trim().replace(QUESTION_START_RE, '').trim();
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

    const { normalized: normalizedPlaceholders, rawResolved } = normalizeAllMathPlaceholders(placeholders);
    let restoredStem = restoreMathRegions(stem, normalizedPlaceholders);
    
    const htmlKeys = Array.from(htmlPlaceholders.keys()).sort((a, b) => b.length - a.length);

    // Restore HTML tags for stem
    for (const key of htmlKeys) {
      restoredStem = restoredStem.split(key).join(htmlPlaceholders.get(key));
    }

    const restoredOptions = finalOptions.map(o => {
      let txt = restoreMathRegions(o.text, normalizedPlaceholders);
      for (const key of htmlKeys) {
        txt = txt.split(key).join(htmlPlaceholders.get(key));
      }
      return {
        ...o,
        text: txt,
      };
    });

    const validation = validateReconstruction(restoredStem, restoredOptions);

    const debugInfo = {
      rawClipboardHtml: htmlText,
      extractedSemanticBlocks: blocks.map(b => `[${b.type}${b.label ? `:${b.label}` : ''}]: ${b.content}`),
      shieldedMathPlaceholders: mapToRecord(placeholders),
      preNormalizedMath: mapToRecord(rawResolved),
      postNormalizedMath: mapToRecord(normalizedPlaceholders),
      finalReconstructedOutput: {
        stem: restoredStem,
        options: restoredOptions,
      },
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
  // Run preNormalizeMathText on raw text first
  let text = plainText || ocrText || '';
  text = preNormalizeMathText(text);

  // Stage 1: OCR Normalization
  text = normalizeOcrText(text);

  // Stage 2: Unicode Cleanup
  text = cleanUnicodeText(text);

  // Stage 3: Math Shielding
  const { shielded, placeholders } = shieldMathRegions(text);

  // Stage 4: Semantic Line Merging
  const merged = mergeLinesSemantically(shielded);

  // Stage 5 & 6: Question Boundary & Option Detection
  const lines = merged.split('\n');
  const optionLines = [];
  const stemLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const optMatch = trimmed.match(OPTION_LINE_START);
    if (optMatch) {
      const label = (optMatch[1] || optMatch[2] || '').toLowerCase();
      optionLines.push({
        label,
        text: trimmed.replace(OPTION_LINE_START, '').trim(),
      });
    } else if (optionLines.length > 0 && trimmed && !QUESTION_START_RE.test(trimmed)) {
      const last = optionLines[optionLines.length - 1];
      last.text = `${last.text} ${trimmed}`.trim();
    } else {
      stemLines.push(line);
    }
  }

  let finalShieldedStem = stemLines.join('\n').trim();
  let finalShieldedOptions = optionLines;

  // Enforce Option Detection rule: classify as MCQ only if >=2 valid options exist
  const validateOptionContent = (optText) => {
    const t = optText.trim();
    if (!t) return false;
    return t.length >= 2 || /^\d+$/.test(t) || /MATHPLACEHOLDER/.test(t);
  };

  const validOptionsCount = finalShieldedOptions.filter(o => validateOptionContent(o.text)).length;
  const isMcq = finalShieldedOptions.length >= 2 && validOptionsCount >= 2;

  let options = [];
  let stem = '';
  let questionType = 'descriptive';
  let subtype = 'descriptive';

  // Stage 7: Structural Reconstruction
  if (isMcq) {
    const order = ['a', 'b', 'c', 'd'];
    const map = new Map();
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
    if (
      /one\s+or\s+more\s+correct|multiple\s+correct|more\s+than\s+one\s+correct|select\s+all\s+that\s+apply/i.test(
        lowerStem
      )
    ) {
      subtype = 'mcq_multiple';
    }
  } else {
    options = [];
    stem = merged;
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

  // Strip question number prefixes
  stem = stem.replace(QUESTION_START_RE, '').trim();

  // Stage 9: LaTeX Normalization
  const { normalized: normalizedPlaceholders, rawResolved } = normalizeAllMathPlaceholders(placeholders);

  // Stage 8: Math Restoration
  const finalStem = restoreMathRegions(stem, normalizedPlaceholders);
  const finalOptions = options.map(o => ({
    ...o,
    text: restoreMathRegions(o.text, normalizedPlaceholders),
  }));

  // Stage 10: Validation Pass
  const validation = validateReconstruction(finalStem, finalOptions);

  const debugInfo = {
    rawClipboardHtml: htmlText,
    extractedSemanticBlocks: null,
    shieldedMathPlaceholders: mapToRecord(placeholders),
    preNormalizedMath: mapToRecord(rawResolved),
    postNormalizedMath: mapToRecord(normalizedPlaceholders),
    finalReconstructedOutput: {
      stem: finalStem,
      options: finalOptions,
    },
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
