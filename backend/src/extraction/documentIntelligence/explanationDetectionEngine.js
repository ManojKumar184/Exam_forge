const EXPLANATION_RE = /^(?:solution|explanation|detailed\s+solution|soln|reason)\s*[:\-]?\s*/i;

export function detectExplanation(segment) {
  const blocks = segment.explanationBlocks || [];
  if (!blocks.length) {
    return { explanation: null, confidence: 0.3, warnings: ['Explanation not detected'] };
  }

  const explanation = blocks
    .map((block) => (block.text || '').replace(EXPLANATION_RE, '').trim())
    .filter(Boolean)
    .join('\n\n');

  return {
    explanation,
    confidence: explanation.length > 20 ? 0.9 : 0.68,
    images: blocks.flatMap((block) => block.images || []),
    tables: blocks.map((block) => block.table).filter(Boolean),
    equations: blocks.flatMap((block) => block.equations || []),
    warnings: [],
  };
}
