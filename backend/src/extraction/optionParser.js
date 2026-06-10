/**
 * MCQ option detection — coaching layouts, OCR spacing, inline, and reverse scanning.
 */

import {
  extractMcqOptionsInline,
  countMcqOptionMarkers,
  hasMcqOptionPattern,
  isValidOptionMarker,
  protectMathRegions,
  restoreMathRegions,
} from './mcqOptionExtract.js';

export { hasMcqOptionPattern };

const LABEL_ORDER = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

// Legacy regexes preserved for compatibility
// Strict template format: ONLY (A), (B), (C), (D)
const OPTION_LINE_START = /^\s*\(\s*([a-dA-D])\s*\)\s*(.+)$/i;

export function isOptionLine(line) {
  return OPTION_LINE_START.test(line.trim());
}

export function parseOptionLine(line) {
  const trimmed = line.trim();
  const m = trimmed.match(OPTION_LINE_START);
  if (!m) return null;
  return {
    label: m[1].toLowerCase(),
    text: m[2].trim(),
    image: null,
    latex: null,
  };
}

export function appendOptionContinuation(options, line) {
  if (!options.length || !line?.trim()) return options;
  const trimmed = line.trim();
  if (isOptionLine(trimmed) || /^(?:Q|Question)\s*\d/i.test(trimmed)) {
    return options;
  }
  const last = options[options.length - 1];
  if (!last?.text) return options;
  if (trimmed.length < 120) {
    const copy = [...options];
    copy[copy.length - 1] = { ...last, text: `${last.text} ${trimmed}`.trim() };
    return copy;
  }
  return options;
}

export function extractInlineOptions(text) {
  return extractMcqOptionsInline(text);
}

export function countOptionMarkers(text) {
  return countMcqOptionMarkers(text);
}

/**
 * Robust regex-based parser that detects if a line starts with a valid option prefix.
 */
export function matchOptionPrefix(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Strict template format: ONLY (A), (B), (C), (D)
  const m = trimmed.match(/^\(\s*([a-dA-D])\s*\)\s*(.*)$/);
  if (m) {
    return { label: m[1].toLowerCase(), style: 'letter', cleanText: m[2].trim(), originalLabel: m[1] };
  }

  return null;
}

/**
 * Searches a line for inline option markers and splits it into multiple options if valid.
 */
export function splitInlineOptionsInLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Protect math regions before scanning inline options
  const { text: protectedText, placeholders } = protectMathRegions(line);

  // Strict template format: ONLY (A), (B), (C), (D) inline
  const inlineRegex = /\(\s*([a-dA-D])\s*\)/g;
  
  const rawMarkers = [];
  let match;
  while ((match = inlineRegex.exec(protectedText)) !== null) {
    const labelChar = match[1];
    
    if (!isValidOptionMarker(protectedText, match.index, labelChar)) {
      continue;
    }

    rawMarkers.push({
      index: match.index,
      length: match[0].length,
      label: labelChar.toLowerCase(),
      style: 'letter',
      originalLabel: labelChar
    });
  }

  if (rawMarkers.length < 2) return null;

  // Verify sequence consistency
  const validMarkers = [];
  for (let i = 0; i < rawMarkers.length; i++) {
    const seq = [rawMarkers[i]];
    let lastIdx = LABEL_ORDER.indexOf(rawMarkers[i].label);
    for (let j = i + 1; j < rawMarkers.length; j++) {
      const idx = LABEL_ORDER.indexOf(rawMarkers[j].label);
      if (idx === lastIdx + 1 && rawMarkers[j].style === rawMarkers[i].style) {
        seq.push(rawMarkers[j]);
        lastIdx = idx;
      }
    }
    if (seq.length > validMarkers.length) {
      validMarkers.splice(0, validMarkers.length, ...seq);
    }
  }

  if (validMarkers.length < 2) return null;

  const options = [];
  for (let i = 0; i < validMarkers.length; i++) {
    const start = validMarkers[i].index + validMarkers[i].length;
    const end = i + 1 < validMarkers.length ? validMarkers[i + 1].index : protectedText.length;
    const optText = protectedText.slice(start, end).replace(/^[\s).:\-–—]+/, '').trim();
    options.push({
      label: validMarkers[i].label,
      text: restoreMathRegions(optText, placeholders),
      style: validMarkers[i].style
    });
  }

  const stem = restoreMathRegions(protectedText.slice(0, validMarkers[0].index).trim(), placeholders);
  return { stem, options };
}

function isOptionBlockBoundary(line) {
  const trimmed = line.trim();
  if (/^(?:Answer|Ans|Explanation|Solution|Sol|Correct\s+Answer|Key)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Scan a question block's lines from bottom-to-top to extract options cleanly.
 * Returns { stem: string, options: Array, confidence: number, trailingText: string, answerLine: string|null, explanationLine: string|null }
 *
 * trailingText contains lines that come after the options (e.g., Answer:, Explanation:)
 * that should be captured as metadata rather than discarded.
 */
export function extractOptionsReverse(lines) {
  if (!lines || lines.length === 0) {
    return { stem: '', options: [], confidence: 1.0, trailingText: '', answerLine: null, explanationLine: null };
  }

  const detectedOptions = [];
  let expectedIndex = -1; // Index in LABEL_ORDER
  let sequenceStyle = null;

  let currentContinuationLines = [];
  let lastScannedIdx = lines.length;
  let trailingText = '';    // Lines after options (Answer:, Explanation:, etc.)
  let answerLine = null;    // The Answer: line if found
  let explanationLine = null; // The Explanation: line if found

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check if line matches a strict Q<number>) question start.
    // Sprint 4.8 mandates ONLY Q<number>) format for question boundaries.
    // The old broad regex matched lines like "6 MCQswith..." as question starts,
    // causing the reverse scan to break before reaching Answer/Explanation lines.
    const strictQStart = /^Q(\d{1,3})\)\s*/i.test(line);
    
    if (strictQStart) {
      const single = matchOptionPrefix(line);
      const isExpectedFirstOption = single && expectedIndex === 0 && single.style === sequenceStyle;
      if (!isExpectedFirstOption) {
        break;
      }
    }

    // Handle Answer:/Explanation: boundary lines BEFORE option detection
    // These should NOT be added to continuation buffer or appended to options
    if (isOptionBlockBoundary(line) && expectedIndex === -1) {
      if (/^Answer|^Ans|^Correct/i.test(line) && !answerLine) {
        answerLine = line;
      } else if (/^Explanation|^Solution|^Reason|^Sol/i.test(line) && !explanationLine) {
        explanationLine = line;
      } else {
        // Collect other boundary lines as trailing text
        if (trailingText) trailingText = line + '\n' + trailingText;
        else trailingText = line;
      }
      // Clear continuation lines — they belong to post-option content, not options
      if (currentContinuationLines.length > 0) {
        const contText = currentContinuationLines.reverse().join('\n');
        trailingText = trailingText ? contText + '\n' + trailingText : contText;
        currentContinuationLines = [];
      }
      continue;
    }

    // 1. Check if the line contains multiple inline options
    const inline = splitInlineOptionsInLine(lines[i]);
    if (inline && inline.options.length >= 2) {
      const firstOpt = inline.options[0];
      const lastOpt = inline.options[inline.options.length - 1];
      const firstIdx = LABEL_ORDER.indexOf(firstOpt.label);
      const lastIdx = LABEL_ORDER.indexOf(lastOpt.label);

      // Verify if it aligns with our current reverse sequence
      const aligns = expectedIndex === -1 || lastIdx === expectedIndex;
      const matchingStyle = !sequenceStyle || firstOpt.style === sequenceStyle;

      if (aligns && matchingStyle) {
        // Prepend all inline options
        const formattedOpts = inline.options.map(o => ({
          label: o.label.toUpperCase(),
          text: o.text,
          image: null,
          latex: null
        }));
        
        // If there was a continuation buffer, append it to the last option in this inline group
        if (currentContinuationLines.length > 0 && formattedOpts.length > 0) {
          const last = formattedOpts[formattedOpts.length - 1];
          last.text = `${last.text}\n${currentContinuationLines.reverse().join('\n')}`.trim();
          currentContinuationLines = [];
        }

        detectedOptions.unshift(...formattedOpts);
        expectedIndex = firstIdx - 1;
        sequenceStyle = firstOpt.style;
        lastScannedIdx = i;

        // If we reached 'A' (index 0), we successfully finished the sequence!
        if (firstIdx === 0) {
          break;
        }
        continue;
      }
    }

    // 2. Check if the line starts with a single option prefix
    const single = matchOptionPrefix(lines[i]);
    if (single) {
      const idx = LABEL_ORDER.indexOf(single.label);
      const aligns = expectedIndex === -1 || idx === expectedIndex;
      const matchingStyle = !sequenceStyle || single.style === sequenceStyle;

      if (aligns && matchingStyle) {
        let text = single.cleanText;
        if (currentContinuationLines.length > 0) {
          text = `${text}\n${currentContinuationLines.reverse().join('\n')}`.trim();
          currentContinuationLines = [];
        }

        detectedOptions.unshift({
          label: single.label.toUpperCase(),
          text: text,
          image: null,
          latex: null
        });

        expectedIndex = idx - 1;
        sequenceStyle = single.style;
        lastScannedIdx = i;

        if (idx === 0) {
          break;
        }
        continue;
      }
    }

    // 3. Otherwise, it is a continuation line or noise. 
    // If we've already started detecting options, or if we are before the first option but it's not a boundary, buffer it.
    if (expectedIndex !== -1 || (!isOptionBlockBoundary(line) && !/^Q(\d{1,3})\)\s*/i.test(line))) {
      currentContinuationLines.push(lines[i]);
      lastScannedIdx = i;
    }
  }

  // If we found options
  if (detectedOptions.length >= 2) {
    const stem = lines.slice(0, lastScannedIdx).join('\n').trim();
    
    // Collect remaining trailing lines (between last option and end of block)
    // that weren't captured as trailingText during reverse scan
    if (lastScannedIdx < lines.length) {
      const remaining = lines.slice(lastScannedIdx).join('\n').trim();
      if (remaining && !trailingText.includes(remaining)) {
        // Only add if these lines are not already in trailingText
        const trailingLines = lines.slice(lastScannedIdx);
        for (const tl of trailingLines) {
          const t = tl.trim();
          if (!t) continue;
          if (!trailingText.includes(t)) {
            trailingText = trailingText ? trailingText + '\n' + t : t;
          }
        }
      }
    }
    
    // Calculate option parser confidence
    let confidence = 0.7;
    const hasD = detectedOptions.some(o => o.label === 'D');
    const hasC = detectedOptions.some(o => o.label === 'C');
    const hasB = detectedOptions.some(o => o.label === 'B');
    const hasA = detectedOptions.some(o => o.label === 'A');

    if (hasA && hasB && hasC && hasD && detectedOptions.length === 4) {
      confidence = 0.98; // High (95%+)
    } else if (hasA && hasB && hasC && detectedOptions.length === 3) {
      confidence = 0.88; // Medium (70-95%)
    } else if (hasA && hasB && detectedOptions.length === 2) {
      confidence = 0.78; // Medium (70-95%)
    } else {
      confidence = 0.60; // Low (<70%)
    }

    return {
      stem,
      options: detectedOptions,
      confidence,
      trailingText,
      answerLine,
      explanationLine
    };
  }

  // Fallback to inline parsing on whole block
  const fullText = lines.join('\n');
  const inlineExtract = extractMcqOptionsInline(fullText);
  if (inlineExtract.options && inlineExtract.options.length >= 2) {
    const formattedOpts = inlineExtract.options.map((o, idx) => ({
      label: (o.label || LABEL_ORDER[idx] || 'A').toUpperCase(),
      text: o.text,
      image: o.image || null,
      latex: o.latex || null
    }));
    return {
      stem: inlineExtract.stem,
      options: formattedOpts,
      confidence: formattedOpts.length === 4 ? 0.96 : 0.82,
      trailingText: '',
      answerLine: null,
      explanationLine: null
    };
  }

  // No options found — preserve any captured answer/explanation data
  // (This handles numeric/integer questions where Answer: lines are detected
  // during reverse scan but no MCQ options exist)
  const stemEndIdx = lastScannedIdx === lines.length ? lines.length : lastScannedIdx;
  const hasCapturedData = answerLine || explanationLine || currentContinuationLines.length > 0;
  const stemFromCaptured = hasCapturedData && stemEndIdx > 0
    ? lines.slice(0, stemEndIdx).join('\n').trim()
    : fullText;
  
  // If answerLine or explanationLine was captured, build trailingText from them
  let noOptTrailing = trailingText;
  if (answerLine && !noOptTrailing.includes(answerLine)) {
    noOptTrailing = noOptTrailing ? answerLine + '\n' + noOptTrailing : answerLine;
  }
  if (explanationLine && !noOptTrailing.includes(explanationLine)) {
    noOptTrailing = noOptTrailing ? explanationLine + '\n' + noOptTrailing : explanationLine;
  }
  // Also capture the continuation buffer as trailing text
  if (currentContinuationLines.length > 0) {
    const contText = currentContinuationLines.reverse().join('\n');
    noOptTrailing = noOptTrailing ? noOptTrailing + '\n' + contText : contText;
  }

  return {
    stem: stemFromCaptured,
    options: [],
    confidence: 1.0,
    trailingText: noOptTrailing,
    answerLine,
    explanationLine
  };
}
