/**
 * Template Validator — validates DOCX template structure.
 *
 * Physics_cleaned_dataset.docx uses the following structure:
 *   [Question_start]
 *   Q1. Question text...
 *   (A) Option A
 *   (B) Option B
 *   [solution]
 *   Answer: X
 *   Explanation: ...
 *   [Question_end]
 *
 * This validator checks for tag-based structure and detects malformed blocks.
 * It does NOT extract content — it only validates the structure.
 */

const TEMPLATE_TAG_RE = /\[(Question_start|Question_end|solution)\]/i;

/**
 * @typedef {Object} TemplateValidationResult
 * @property {boolean} isTemplate - Whether the document matches the template structure
 * @property {number} blockCount - Number of valid [Question_start]...[Question_end] blocks found
 * @property {number} malformedBlocks - Number of blocks with structural issues
 * @property {string[]} issues - List of validation issues
 * @property {'tag_based'|'heuristic'|'unknown'} mode - Recommended processing mode
 */

/**
 * Validate raw text against the Physics_cleaned_dataset template structure.
 *
 * @param {string} rawText - The extracted raw text from the DOCX
 * @returns {TemplateValidationResult}
 */
export function validateDocxTemplate(rawText) {
  if (!rawText || !rawText.trim()) {
    return {
      isTemplate: false,
      blockCount: 0,
      malformedBlocks: 0,
      issues: ['No text content to validate'],
      mode: 'unknown',
    };
  }

  const issues = [];

  // Check if the document uses [Question_start]/[Question_end] tags
  const hasQuestionStart = /\[Question_start\]/i.test(rawText);
  const hasQuestionEnd = /\[Question_end\]/i.test(rawText);
  const hasSolution = /\[solution\]/i.test(rawText);

  if (!hasQuestionStart && !hasQuestionEnd) {
    // No tag-based structure — this is not a template document
    return {
      isTemplate: false,
      blockCount: 0,
      malformedBlocks: 0,
      issues: hasSolution
        ? ['[solution] tag found but no [Question_start]/[Question_end] — malformed document']
        : ['Document does not use tag-based structure — falling back to heuristic extraction'],
      mode: hasSolution ? 'tag_based' : 'heuristic',
    };
  }

  // Count tag occurrences
  const startCount = (rawText.match(/\[Question_start\]/gi) || []).length;
  const endCount = (rawText.match(/\[Question_end\]/gi) || []).length;
  const solutionCount = (rawText.match(/\[solution\]/gi) || []).length;

  // Validate tag pairing
  if (startCount !== endCount) {
    issues.push(`Mismatched tags: ${startCount} [Question_start] but ${endCount} [Question_end]`);
  }

  // Check for [solution] without [Question_start] or vice versa
  if (solutionCount > 0 && startCount === 0) {
    issues.push('Found [solution] tags without [Question_start] — orphaned solutions');
  }

  if (startCount > 0 && solutionCount > startCount) {
    issues.push(`More [solution] tags (${solutionCount}) than questions (${startCount}) — possible duplicate`);
  }

  // Detect malformed blocks by checking ordering
  const lines = rawText.split('\n');
  let inBlock = false;
  let inSolution = false;
  let blockDepth = 0;
  let malformedCount = 0;
  let blockCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const tagMatch = trimmed.match(TEMPLATE_TAG_RE);

    if (!tagMatch) continue;

    const tag = tagMatch[1].toLowerCase();

    if (tag === 'question_start') {
      if (inBlock) {
        issues.push(`Line ${i + 1}: Nested [Question_start] without closing [Question_end] — malformed block starting at line ${i + 1}`);
        malformedCount++;
      }
      inBlock = true;
      inSolution = false;
      blockDepth++;
    } else if (tag === 'solution') {
      if (!inBlock) {
        issues.push(`Line ${i + 1}: [solution] tag outside of [Question_start]/[Question_end] block — orphaned`);
        malformedCount++;
      }
      inSolution = true;
    } else if (tag === 'question_end') {
      if (!inBlock) {
        issues.push(`Line ${i + 1}: [Question_end] without matching [Question_start] — extra closing tag`);
        malformedCount++;
      } else {
        blockCount++;
      }
      inBlock = false;
      inSolution = false;
    }
  }

  // Check if we ended with an unclosed block
  if (inBlock) {
    issues.push('Unclosed [Question_start] at end of document — missing [Question_end]');
    malformedCount++;
  }

  // Determine template quality
  const isWellFormed = malformedCount === 0 && startCount > 0 && startCount === endCount;
  const isTemplate = startCount > 0 || endCount > 0;

  let mode = 'heuristic';
  if (isWellFormed) {
    mode = 'tag_based';
  } else if (startCount > 0 || endCount > 0) {
    mode = 'tag_based'; // still use tag-based, but with warnings
  }

  return {
    isTemplate,
    blockCount,
    malformedBlocks: malformedCount,
    issues,
    mode,
  };
}

/**
 * Quick check if raw text appears to be template-based.
 */
export function isTemplateDocument(rawText) {
  if (!rawText) return false;
  return /\[Question_start\]/i.test(rawText) && /\[Question_end\]/i.test(rawText);
}
