/**
 * Explanation Detector — extracts explanation/ solution text from question blocks.
 *
 * Supports patterns present in Physics_cleaned_dataset.docx:
 *   Explanation: ... (preserves subsequent paragraph body)
 *   Solution: ...
 *   Reason: ...
 *   Detailed Solution: ...
 *
 * For tag-based documents ([solution]...[Question_end]), the explanation
 * is automatically available as the solution lines.
 */

/**
 * @typedef {Object} ExplanationResult
 * @property {string|null} explanation - The extracted explanation text
 * @property {string|null} explanationLatex - Any LaTeX content within the explanation
 * @property {number} confidence - Detection confidence (0-1)
 * @property {string[]} warnings - Any warnings
 */

const EXPLANATION_LABEL_RE = /^(Explanation|Solution|Reason|Detailed Solution|Sol)\s*[:：]/i;

// Section/Part/Topic header patterns that should NOT be included in explanations
const SECTION_HEADER_RE = /^(?:SECTION|PART)\s+[A-Z0-9]/i;
const TOPIC_HEADER_RE = /^(?:Topic|Subject|Class)\s+\d+/i;

/**
 * Detect explanation within a block of text (e.g., the [solution] section content).
 *
 * Strategy:
 * 1. Find the first line matching `Explanation:`, `Solution:`, `Reason:`, etc.
 * 2. Collect all subsequent lines until the end of the block or the next section marker
 * 3. Return the collected text
 *
 * @param {string} text - Text to search for explanation content
 * @returns {ExplanationResult}
 */
export function detectExplanation(text) {
  if (!text || !text.trim()) {
    return {
      explanation: null,
      explanationLatex: null,
      confidence: 0,
      warnings: ['No text provided for explanation detection'],
    };
  }

  const warnings = [];
  const lines = text.split('\n');
  let explanationStart = -1;
  let labelLength = 0;

  // Find the first explanation label line
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const match = trimmed.match(EXPLANATION_LABEL_RE);
    if (match) {
      explanationStart = i;
      labelLength = match[0].length;
      break;
    }
  }

  if (explanationStart === -1) {
    // No explanation label found — check if text is a section header (should NOT be treated as explanation)
    const firstLine = text.trim().split('\n')[0]?.trim() || '';
    if (SECTION_HEADER_RE.test(firstLine) || TOPIC_HEADER_RE.test(firstLine)) {
      return {
        explanation: null,
        explanationLatex: null,
        confidence: 0,
        warnings: ['Text is a section/header — not treated as explanation'],
      };
    }
    
    // No explanation label found — maybe the entire text IS the explanation?
    // Only if the text has reasonable length and no answer-like prefix
    if (text.trim().length > 30 && !/^(?:Answer|Ans|Correct)\b/i.test(text.trim())) {
      return {
        explanation: text.trim(),
        explanationLatex: extractLatex(text),
        confidence: 0.5,
        warnings: ['No explanation label found — using entire text as explanation'],
      };
    }
    return {
      explanation: null,
      explanationLatex: null,
      confidence: 0,
      warnings: ['No explanation pattern found'],
    };
  }

  // Collect lines after the label
  const explanationLines = [];
  let hasLatex = false;

  for (let i = explanationStart; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Stop if we hit another section boundary or a new question
    if (i > explanationStart) {
      if (/^\[Question_(start|end)\]$/i.test(trimmed) || /^\[solution\]$/i.test(trimmed)) {
        break;
      }
      // If we hit another answer-like prefix, it's likely part of the explanation
      // (e.g., "Answer: B" followed by "Explanation: ...")
      if (/^(?:Answer|Ans|Correct)\b/i.test(trimmed) && i !== explanationStart) {
        // But if we already have content, stop before another answer
        if (explanationLines.length > 0 && /^(?:Answer|Ans|Correct)\b/i.test(trimmed)) {
          // Check if it's a label for continuation (rare, but handle)
          if (explanationLines.some(l => /explanation|solution|reason/i.test(l))) {
            break; // This is likely a new section
          }
        }
      }
    }

    // Remove the label text from the first line
    if (i === explanationStart) {
      const afterLabel = line.slice(labelLength).trim();
      if (afterLabel) {
        explanationLines.push(afterLabel);
      }
    } else {
      explanationLines.push(line);
    }

    if (line.includes('$') || /\\\\[a-zA-Z]/.test(line)) {
      hasLatex = true;
    }
  }

  if (explanationLines.length === 0) {
    return {
      explanation: null,
      explanationLatex: null,
      confidence: 0.3,
      warnings: ['Explanation label found but no content after it'],
    };
  }

  const explanation = explanationLines.join('\n').trim();
  const explanationLatex = hasLatex ? extractLatex(explanation) : null;

  // Confidence scoring
  let confidence = 0.85;
  if (explanation.length < 20) {
    confidence -= 0.2; // Too short
  }
  if (/^\[(TABLE|FIGURE)/.test(explanation)) {
    confidence -= 0.3; // Only has placeholder content
  }
  confidence = Math.max(0.1, Math.min(1.0, confidence));

  return {
    explanation,
    explanationLatex,
    confidence,
    warnings: [],
  };
}

/**
 * Extract LaTeX content from text for the explanationLatex field.
 */
function extractLatex(text) {
  const displayMath = text.match(/\$\$([\s\S]+?)\$\$/g);
  const inlineMath = text.match(/\$([^$\n]+?)\$/g);
  if (displayMath || inlineMath) {
    const all = [...(displayMath || []), ...(inlineMath || [])];
    return all.join(' ');
  }
  return null;
}

/**
 * Detect explanation from a raw line (quick check).
 *
 * @param {string} line - A single line of text
 * @returns {boolean} - Whether the line starts an explanation section
 */
export function isExplanationLine(line) {
  if (!line) return false;
  return EXPLANATION_LABEL_RE.test(line.trim());
}
