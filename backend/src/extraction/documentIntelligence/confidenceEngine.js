export function applyConfidence(question, scores = {}) {
  const confidence = {
    boundary: scores.boundary ?? question.parserConfidence ?? 0.7,
    answer: scores.answer ?? 0.3,
    explanation: scores.explanation ?? (question.explanation ? 0.75 : 0.35),
    math: scores.math ?? question.mathPreservationConfidence ?? 0.8,
    classification: scores.classification ?? question.semanticConfidence ?? 0.7,
    validation: scores.validation ?? 0.8,
  };
  const aggregate = Object.values(confidence).reduce((sum, value) => sum + value, 0) / Object.values(confidence).length;
  const needsReview = Object.values(confidence).some((value) => value < 0.7) || aggregate < 0.74;

  return {
    ...question,
    parserConfidence: confidence.boundary,
    semanticConfidence: confidence.classification,
    mathPreservationConfidence: confidence.math,
    metadataConfidence: Math.min(confidence.answer, confidence.validation),
    aiConfidence: Math.round(aggregate * 100),
    status: needsReview ? 'needs_review' : question.status || 'pending',
    renderingMetadata: {
      ...(question.renderingMetadata || {}),
      confidence,
      reviewRequired: needsReview,
    },
  };
}
