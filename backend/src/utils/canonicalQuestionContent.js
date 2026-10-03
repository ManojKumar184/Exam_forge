export const CANONICAL_QUESTION_CONTENT_VERSION = 'examforge-question-content/v1';
const BLOCK_TYPES = new Set(['text', 'equation', 'image', 'table', 'embedded']);

function clonePlain(value) {
  const plain = value && typeof value.toObject === 'function' ? value.toObject({ depopulate: true }) : value;
  return structuredClone(plain);
}

function asBlock(block) {
  if (!block || typeof block !== 'object') throw new TypeError('Canonical content blocks must be objects');
  // Preserve source-specific fields (including OMML/OLE payload references and warnings).
  const copy = clonePlain(block);
  if (copy.type === 'paragraph' || copy.type === 'list_item' || copy.type === 'caption') {
    return { ...copy, originalType: copy.type, type: 'text', text: copy.text || '' };
  }
  if (!BLOCK_TYPES.has(copy.type)) {
    return { type: 'embedded', originalType: copy.type || 'unknown', payload: copy, warning: 'Unsupported legacy block retained for review' };
  }
  return copy;
}

export function createCanonicalQuestionContent(input = {}) {
  if (input.version && input.version !== CANONICAL_QUESTION_CONTENT_VERSION) {
    throw new TypeError(`Unsupported canonical question content version: ${input.version}`);
  }
  if (!Array.isArray(input.stem) || !Array.isArray(input.options || [])) {
    throw new TypeError('Canonical question content requires stem and options arrays');
  }
  const options = (input.options || []).map((option, index) => {
    if (!option || typeof option !== 'object' || !Array.isArray(option.content)) {
      throw new TypeError(`Canonical option ${index} requires a content array`);
    }
    return { ...clonePlain(option), content: option.content.map(asBlock) };
  });
  return {
    version: CANONICAL_QUESTION_CONTENT_VERSION,
    stem: input.stem.map(asBlock),
    options,
    explanation: (input.explanation || []).map(asBlock),
    answer: input.answer == null ? null : clonePlain(input.answer),
    provenance: input.provenance == null ? null : clonePlain(input.provenance),
    validation: input.validation == null ? {} : clonePlain(input.validation),
  };
}

export function canonicalContentFromLegacy(question = {}) {
  const existing = question.canonicalContent || question.canonical_content;
  if (existing) return createCanonicalQuestionContent(existing);
  const legacyBlocks = question.contentBlocks || question.content_blocks || [];
  const stem = legacyBlocks.length
    ? legacyBlocks.map((block) => block && typeof block === 'object' ? block : ({ type: 'embedded', payload: block, warning: 'Malformed legacy block retained for review' }))
    : [
        ...((question.questionText || question.question_text) ? [{ type: 'text', text: question.questionText || question.question_text }] : []),
        ...((question.questionLatex || question.question_latex) ? [{ type: 'equation', latex: question.questionLatex || question.question_latex }] : []),
        ...((question.questionImages || question.question_images || []).map((assetUrl) => ({ type: 'image', assetUrl }))),
      ];
  const options = (question.options || []).map((option, index) => ({
    label: option.label || String.fromCharCode(65 + index),
    content: option.contentBlocks || (option.text || option.image || option.latex
      ? [
          ...(option.text ? [{ type: 'text', text: option.text }] : []),
          ...(option.latex ? [{ type: 'equation', latex: option.latex }] : []),
          ...(option.image ? [{ type: 'image', assetUrl: option.image }] : []),
        ]
      : []),
  }));
  return createCanonicalQuestionContent({
    stem,
    options,
    explanation: question.explanationBlocks || (question.explanation || question.explanation_latex
      ? [
          ...(question.explanation ? [{ type: 'text', text: question.explanation }] : []),
          ...(question.explanation_latex ? [{ type: 'equation', latex: question.explanation_latex }] : []),
        ]
      : []),
    answer: question.answer ?? question.correctAnswers ?? question.correct_answers ?? null,
    provenance: question.provenance ?? {
      source: question.source || null,
      sourceFile: question.sourceFile || question.source_file || null,
      uploadId: question.uploadId?.toString?.() || question.uploadId || null,
      sourceLocation: question.sourceLocation || question.source_location || null,
    },
    validation: question.validation ?? {
      status: question.status || 'pending',
      warnings: question.extractionWarnings || question.extraction_warnings || [],
      fidelity: {
        parser: question.parserConfidence ?? question.parser_confidence ?? null,
        reconstruction: question.reconstructionFidelity ?? question.reconstruction_fidelity ?? null,
        math: question.mathPreservationConfidence ?? question.math_preservation_confidence ?? null,
      },
    },
  });
}

export function reconcileCanonicalQuestionContent(existingQuestion, updates = {}) {
  if (updates.canonicalContent || updates.canonical_content) {
    const base = canonicalContentFromLegacy(existingQuestion);
    const candidate = canonicalContentFromLegacy({ canonicalContent: updates.canonicalContent || updates.canonical_content });
    return createCanonicalQuestionContent({ ...candidate, provenance: base.provenance, validation: base.validation });
  }
  const base = canonicalContentFromLegacy(existingQuestion);
  let stem = base.stem;
  if (Array.isArray(updates.contentBlocks)) {
    stem = updates.contentBlocks;
  } else if (Object.hasOwn(updates, 'questionText')) {
    const next = structuredClone(stem);
    const firstText = next.findIndex((block) => block.type === 'text');
    if (firstText >= 0) next[firstText] = { ...next[firstText], text: updates.questionText };
    else next.unshift({ type: 'text', text: updates.questionText || '' });
    stem = next;
  }
  if (Object.hasOwn(updates, 'questionLatex') && updates.questionLatex) {
    const next = structuredClone(stem);
    const equation = next.findIndex((block) => block.type === 'equation');
    if (equation >= 0) next[equation] = { ...next[equation], latex: updates.questionLatex };
    else next.push({ type: 'equation', latex: updates.questionLatex });
    stem = next;
  }
  const options = Array.isArray(updates.options)
    ? updates.options.map((option, index) => ({
        label: option.label || String.fromCharCode(65 + index),
        content: Array.isArray(option.contentBlocks) ? option.contentBlocks : [
          ...(option.text ? [{ type: 'text', text: option.text }] : []),
          ...(option.latex ? [{ type: 'equation', latex: option.latex }] : []),
          ...(option.image ? [{ type: 'image', assetUrl: option.image }] : []),
        ],
      }))
    : base.options;
  const explanationTouched = ['explanation', 'explanationLatex'].some((field) => Object.hasOwn(updates, field));
  const explanation = explanationTouched ? [
    ...(updates.explanation ? [{ type: 'text', text: updates.explanation }] : []),
    ...(updates.explanationLatex ? [{ type: 'equation', latex: updates.explanationLatex }] : []),
  ] : base.explanation;
  const answerTouched = ['correctOption', 'numericalAnswer', 'answerText', 'correctAnswers'].some((field) => Object.hasOwn(updates, field));
  const answer = answerTouched
    ? (updates.correctAnswers ?? updates.correctOption ?? updates.numericalAnswer ?? updates.answerText ?? null)
    : base.answer;
  return createCanonicalQuestionContent({ ...base, stem, options, explanation, answer });
}
