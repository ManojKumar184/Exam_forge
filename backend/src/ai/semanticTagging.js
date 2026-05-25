import { tokenizeForSimilarity, combinedTextSimilarity } from '../utils/textSimilarity.js';

function topicKeywords(topic) {
  const name = (topic.name || '').toLowerCase();
  const desc = (topic.description || '').toLowerCase();
  const tokens = tokenizeForSimilarity(`${name} ${desc}`);
  return [...new Set([...tokens, ...name.split(/\s+/).filter((w) => w.length > 3)])];
}

/**
 * Semantic topic/chapter match using token overlap (no external embeddings).
 */
export function matchTopicSemantically(questionText, topics, subjectId, classLevel) {
  const scoped = (topics || []).filter(
    (t) =>
      (!subjectId || t.subjectId?.toString() === subjectId?.toString()) &&
      (!classLevel || t.class === classLevel)
  );
  if (!scoped.length) return { topic: null, score: 0 };

  let best = null;
  let bestScore = 0;

  for (const topic of scoped) {
    const profile = topicKeywords(topic).join(' ');
    const score = combinedTextSimilarity(questionText, profile);
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }

  return { topic: bestScore >= 0.12 ? best : null, score: bestScore };
}

export function matchSubjectSemantically(questionText, subjects) {
  let best = null;
  let bestScore = 0;
  for (const s of subjects || []) {
    const profile = `${s.name} ${s.code}`.toLowerCase();
    const score = combinedTextSimilarity(questionText, profile);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return { subject: bestScore >= 0.15 ? best : null, score: bestScore };
}

export function matchExamTypeSemantically(questionText, examTypes) {
  let best = null;
  let bestScore = 0;
  for (const e of examTypes || []) {
    const profile = `${e.name} ${e.code} ${e.description || ''}`;
    const score = combinedTextSimilarity(questionText, profile);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return { examType: bestScore >= 0.12 ? best : null, score: bestScore };
}

export function applySemanticCatalogHints(question, catalog, base = {}) {
  const text = question.questionText || '';
  const subjectHit = matchSubjectSemantically(text, catalog.subjects);
  const topicHit = matchTopicSemantically(
    text,
    catalog.topics,
    base.subjectId || subjectHit.subject?._id,
    base.class
  );
  const examHit = matchExamTypeSemantically(text, catalog.examTypes);

  const scores = [];
  if (subjectHit.subject) scores.push(subjectHit.score);
  if (topicHit.topic) scores.push(topicHit.score);
  if (examHit.examType) scores.push(examHit.score);

  return {
    subjectId: base.subjectId || subjectHit.subject?._id || null,
    chapterId: base.chapterId || topicHit.topic?._id || null,
    examTypeId: base.examTypeId || examHit.examType?._id || null,
    semanticConfidence: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    semanticScores: {
      subject: subjectHit.score,
      topic: topicHit.score,
      examType: examHit.score,
    },
  };
}
