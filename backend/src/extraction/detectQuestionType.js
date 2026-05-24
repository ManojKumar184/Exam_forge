export function detectQuestionType(block) {
  const text = (block.text || '').toLowerCase();
  const optionMatches = (block.options || []).filter((o) => o?.text?.trim()).length;

  if (optionMatches >= 2 || /\b(option\s*)?[a-d][\).:]/i.test(text)) {
    return 'mcq';
  }
  if (/\b\d+(\.\d+)?\s*(cm|m|kg|g|mol|j|n|v|a|w|hz)\b/i.test(text) || /numerical/i.test(text)) {
    return 'numerical';
  }
  return 'descriptive';
}
