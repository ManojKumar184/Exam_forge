import { matchSubjectSemantically, matchTopicSemantically, matchExamTypeSemantically } from './semanticTagging.js';

function findByName(items, hint, key = 'name') {
  if (!hint || !items?.length) return null;
  const h = hint.toLowerCase().trim();
  return (
    items.find((i) => i[key]?.toLowerCase() === h) ||
    items.find((i) => i[key]?.toLowerCase().includes(h) || h.includes(i[key]?.toLowerCase()))
  );
}

/**
 * Resolve Gemini text hints to catalog ObjectIds.
 */
export function resolveGeminiHints(llm, catalog, question, base = {}) {
  if (!llm?.hints) return base;

  const text = question.questionText || '';
  let subjectId = base.subjectId;
  let chapterId = base.chapterId;
  let examTypeId = base.examTypeId;

  if (llm.hints.subject) {
    const byName = findByName(catalog.subjects, llm.hints.subject);
    subjectId = byName?._id || matchSubjectSemantically(text, catalog.subjects).subject?._id || subjectId;
  }
  if (llm.hints.examType) {
    const byName = findByName(catalog.examTypes, llm.hints.examType);
    examTypeId = byName?._id || matchExamTypeSemantically(text, catalog.examTypes).examType?._id || examTypeId;
  }
  if (llm.hints.topic) {
    const byName = findByName(catalog.topics, llm.hints.topic);
    chapterId =
      byName?._id ||
      matchTopicSemantically(text, catalog.topics, subjectId, base.class).topic?._id ||
      chapterId;
  }

  return { subjectId, chapterId, examTypeId };
}
