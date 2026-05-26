import type { Question } from '../../types';
import type { SelectedQuestion } from '../../components/paper/SortableSectionQuestions';
import type { PaperSelectionResult } from '../../api/papers';

export interface Section {
  id: string;
  name: string;
  marksPerQuestion: number;
  questionTypes: ('mcq' | 'descriptive' | 'numerical')[];
  targetCount: number;
  questions: SelectedQuestion[];
}

export const DEFAULT_SECTIONS: Section[] = [
  { id: 'A', name: 'Section A - MCQ', marksPerQuestion: 4, questionTypes: ['mcq'], targetCount: 15, questions: [] },
  { id: 'B', name: 'Section B - Short Answer', marksPerQuestion: 4, questionTypes: ['descriptive', 'numerical'], targetCount: 5, questions: [] },
  { id: 'C', name: 'Section C - Long Answer', marksPerQuestion: 8, questionTypes: ['descriptive', 'numerical'], targetCount: 5, questions: [] },
];

export function applySelectionToSections(
  sections: Section[],
  selection: PaperSelectionResult,
  preserveOrder = false
): Section[] {
  return sections.map((section) => {
    const match = selection.sections.find(
      (s) => s.sectionId === section.id || s.sectionName === section.name
    );
    if (!match) return section;

    if (preserveOrder && section.questions.length > 0) {
      const newQs = match.questions;
      return {
        ...section,
        questions: section.questions.map((existing, i) => {
          const replacement = newQs[i] as unknown as Question & { custom_marks?: number };
          if (!replacement) return existing;
          return {
            ...replacement,
            customMarks: existing.customMarks,
            sectionId: section.id,
            orderIndex: existing.orderIndex,
          } as SelectedQuestion;
        }),
      };
    }

    const questions = match.questions.map((q, orderIndex) => {
      const question = q as unknown as Question & { custom_marks?: number; section_id?: string };
      return {
        ...question,
        customMarks: Number(question.custom_marks ?? section.marksPerQuestion),
        sectionId: section.id,
        orderIndex,
      } as SelectedQuestion;
    });

    return { ...section, questions };
  });
}

export interface PaperBuilderFilters {
  subjectIds: string[];
  examTypeIds: string[];
  classLevels: number[];
  chapterIds: string[];
  difficulties: string[];
}

export function buildSelectPayload(
  sections: Section[],
  config: {
    subjectId: string;
    examTypeId: string;
    classLevel: number;
    totalMarks: number;
    excludeIds?: string[];
    difficultyDistribution?: { easy: number; medium: number; hard: number };
    filters?: PaperBuilderFilters;
  }
) {
  const f = config.filters;
  return {
    subject_id: config.subjectId,
    subject_ids: f?.subjectIds?.length ? f.subjectIds : undefined,
    exam_type_id: config.examTypeId || null,
    exam_type_ids: f?.examTypeIds?.length ? f.examTypeIds : undefined,
    class: config.classLevel,
    classes: f?.classLevels?.length ? f.classLevels : undefined,
    chapter_ids: f?.chapterIds?.length ? f.chapterIds : undefined,
    difficulties: f?.difficulties?.length ? f.difficulties : undefined,
    total_marks: config.totalMarks,
    total_questions: sections.reduce((s, sec) => s + sec.targetCount, 0),
    exclude_question_ids: config.excludeIds || [],
    difficulty_distribution: config.difficultyDistribution || { easy: 30, medium: 50, hard: 20 },
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      questionCount: s.targetCount,
      marksPerQuestion: s.marksPerQuestion,
      question_types: s.questionTypes,
    })),
  };
}

export function buildPoolStatsPayload(
  config: {
    subjectId: string;
    examTypeId: string;
    classLevel: number;
    filters?: PaperBuilderFilters;
  }
) {
  const f = config.filters;
  return {
    subject_id: config.subjectId,
    subject_ids: f?.subjectIds,
    exam_type_id: config.examTypeId || null,
    exam_type_ids: f?.examTypeIds,
    class: config.classLevel,
    classes: f?.classLevels,
    chapter_ids: f?.chapterIds,
    difficulties: f?.difficulties,
  };
}

export function validateSectionsLocally(sections: Section[], totalMarks: number) {
  const actualQuestions = sections.reduce((s, sec) => s + sec.questions.length, 0);
  const actualMarks = sections.reduce(
    (s, sec) => s + sec.questions.reduce((m, q) => m + Number(q.customMarks || 0), 0),
    0
  );
  const warnings: string[] = [];

  sections.forEach((sec) => {
    if (sec.questions.length !== sec.targetCount) {
      warnings.push(`${sec.name}: ${sec.questions.length}/${sec.targetCount} questions`);
    }
  });
  if (totalMarks > 0 && actualMarks !== totalMarks) {
    warnings.push(`Marks ${actualMarks} / target ${totalMarks}`);
  }

  return { actualQuestions, actualMarks, warnings, valid: warnings.length === 0 };
}

export function paperToSections(paper: {
  sections?: { name: string; questionCount: number; marksPerQuestion: number }[];
  questions?: Array<{
    question_id: string;
    section: string;
    question_order: number;
    custom_marks: number | null;
    question?: Question;
  }>;
}): Section[] {
  const base = DEFAULT_SECTIONS.map((s) => ({ ...s, questions: [] as SelectedQuestion[] }));

  if (paper.sections?.length) {
    return paper.sections.map((ps, i) => {
      const defaultSec = base[i] || {
        id: String.fromCharCode(65 + i),
        name: ps.name,
        marksPerQuestion: ps.marksPerQuestion,
        questionTypes: ['mcq', 'descriptive', 'numerical'] as Section['questionTypes'],
        targetCount: ps.questionCount,
        questions: [],
      };
      return {
        ...defaultSec,
        id: defaultSec.id || String.fromCharCode(65 + i),
        name: ps.name,
        marksPerQuestion: ps.marksPerQuestion,
        targetCount: ps.questionCount,
        questions: [],
      };
    });
  }

  const bySection = new Map<string, SelectedQuestion[]>();
  (paper.questions || []).forEach((pq) => {
    const q = pq.question;
    if (!q) return;
    const list = bySection.get(pq.section) || [];
    list.push({
      ...q,
      customMarks: pq.custom_marks ?? q.marks,
      sectionId: pq.section,
      orderIndex: pq.question_order,
    });
    bySection.set(pq.section, list);
  });

  return base.map((s) => ({
    ...s,
    questions: (bySection.get(s.id) || []).sort((a, b) => a.orderIndex - b.orderIndex),
    targetCount: (bySection.get(s.id) || []).length || s.targetCount,
  }));
}
