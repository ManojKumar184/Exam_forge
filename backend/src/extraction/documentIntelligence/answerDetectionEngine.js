const EXPLICIT_ANSWER_RE = /(?:answer|ans|correct\s+option|key)\s*[:\-]?\s*\(?\s*([A-Ha-h](?:\s*[,/&]\s*[A-Ha-h])*)\s*\)?/i;
const CHECK_RE = /[✓✔]/;

export function detectAnswer(segment, options = []) {
  const answerText = (segment.answerBlocks?.map((block) => block.text).join('\n') || '')
    .split(/(?:solution|explanation|detailed\s+solution|soln|reason)\s*[:\-]?/i)[0];
  const explicit = answerText.match(EXPLICIT_ANSWER_RE);
  if (explicit) {
    return buildAnswer(explicit[1], 1, 'explicit_label', 0.96, options);
  }

  const tableBlocks = [...(segment.stemBlocks || []), ...(segment.optionBlocks || [])].filter((block) => block.table);
  for (const block of tableBlocks) {
    const cells = block.table?.rows?.flatMap((row) => row.flatMap((cell) => cell?.text ? [cell.text] : [])) || [];
    const joined = cells.join(' ');
    const match = joined.match(EXPLICIT_ANSWER_RE);
    if (match) return buildAnswer(match[1], 3, 'structured_answer_table', 0.82, options);
  }

  for (const [index, block] of (segment.optionBlocks || []).entries()) {
    if (CHECK_RE.test(block.text || '') || block.raw?.isBoldCorrect) {
      return buildAnswer(block.raw?.label || String.fromCharCode(65 + index), 4, 'option_annotation', 0.74, options);
    }
  }

  return {
    answerText: null,
    answerKey: null,
    correctOption: null,
    correctAnswers: [],
    confidence: 0.25,
    level: 5,
    method: 'semantic_inference_not_available',
    warnings: ['Answer not detected with high confidence'],
  };
}

function buildAnswer(raw, level, method, confidence, options) {
  const labels = String(raw)
    .split(/[,/&\s]+/)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  const correctOption = labels.length === 1 ? labels[0].charCodeAt(0) - 65 : null;
  const validLabels = new Set(options.map((_, index) => String.fromCharCode(65 + index)));
  const unmatched = labels.filter((label) => !validLabels.has(label));
  return {
    answerText: labels.join(','),
    answerKey: labels.join(','),
    correctOption,
    correctAnswers: labels,
    confidence: unmatched.length ? Math.min(confidence, 0.58) : confidence,
    level,
    method,
    warnings: unmatched.length ? [`Answer label does not match available options: ${unmatched.join(', ')}`] : [],
  };
}
