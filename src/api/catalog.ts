// Flat Subject, Topic, ExamType collections were dropped.
// These functions now fetch from the SyllabusNode tree via the syllabus API.
import type { Subject, Chapter, ExamType } from '../types';
import { fetchSyllabusList } from './syllabus';

/** Map a SyllabusNode to the legacy Subject shape. */
function toSubject(node: { _id: string; name: string; code?: string }): Subject {
  return {
    id: node._id,
    name: node.name,
    code: node.code || '',
    icon: '',
    color: '',
    created_at: '',
    updated_at: '',
  };
}

/** Map a SyllabusNode (type: 'chapter') to the legacy Chapter shape. */
function toChapter(node: {
  _id: string;
  name: string;
  parentId?: string | null;
  code?: string;
}): Chapter {
  return {
    id: node._id,
    subject_id: node.parentId || '',
    name: node.name,
    chapter_number: null,
    class: 0,
    description: null,
    created_at: '',
    updated_at: '',
  };
}

/** Map a SyllabusNode (type: 'exam_pattern') to the legacy ExamType shape. */
function toExamType(node: {
  _id: string;
  name: string;
  code?: string;
  isActive?: boolean;
}): ExamType {
  return {
    id: node._id,
    name: node.name,
    code: node.code || '',
    description: null,
    is_active: node.isActive ?? true,
    created_at: '',
  };
}

export async function fetchSubjectsApi(): Promise<Subject[]> {
  const nodes = await fetchSyllabusList({ type: 'subject' });
  return nodes.map(toSubject);
}

export async function fetchChaptersApi(subjectId?: string): Promise<Chapter[]> {
  const params: Record<string, string> = { type: 'chapter' };
  if (subjectId) params.parentId = subjectId;
  const nodes = await fetchSyllabusList(params);
  return nodes.map(toChapter);
}

export async function fetchExamTypesApi(): Promise<ExamType[]> {
  const nodes = await fetchSyllabusList({ type: 'exam_pattern' });
  return nodes.map(toExamType);
}
