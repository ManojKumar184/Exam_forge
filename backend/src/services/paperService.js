import { v4 as uuidv4 } from 'uuid';
import { Paper } from '../models/Paper.js';
import { Question } from '../models/Question.js';
import { AppError } from '../utils/AppError.js';
import { mapPaper } from '../utils/examMapper.js';
import { selectQuestionsForPaper } from './paperSelectionService.js';

function toObjectIdList(items) {
  return (items || []).filter(Boolean);
}

function buildPaperFilter(query, user) {
  const filter = {};
  if (user.role === 'faculty') filter.createdBy = user._id;
  if (query.status) filter.status = query.status;
  if (query.subject_id) filter.subjectId = query.subject_id;
  if (query.exam_type_id) filter.examTypeId = query.exam_type_id;
  if (query.class) filter.class = Number(query.class);
  if (query.search) filter.title = { $regex: query.search, $options: 'i' };
  return filter;
}

export async function listPapers(query, user) {
  const filter = buildPaperFilter(query, user);
  const papers = await Paper.find(filter)
    .populate('subjectId', 'name code icon color')
    .populate('examTypeId', 'name code description isActive createdAt')
    .sort({ updatedAt: -1 });
  return papers.map(mapPaper);
}

export async function getPaperById(id, user) {
  const paper = await Paper.findById(id)
    .populate('subjectId', 'name code icon color')
    .populate('examTypeId', 'name code description isActive createdAt')
    .populate('questions.questionId');
  if (!paper) throw new AppError('Paper not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && paper.createdBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return mapPaper(paper);
}

function mapBodyToPaperFields(body) {
  return {
    title: body.title,
    description: body.description ?? null,
    paperCode: body.paper_code || body.paperCode || `PAPER-${uuidv4().slice(0, 8).toUpperCase()}`,
    examTypeId: body.exam_type_id || body.examTypeId || null,
    subjectId: body.subject_id || body.subjectId || null,
    class: Number(body.class),
    totalMarks: Number(body.total_marks ?? body.totalMarks ?? 0),
    totalQuestions: Number(body.total_questions ?? body.totalQuestions ?? 0),
    durationMinutes: Number(body.duration_minutes ?? body.durationMinutes ?? 180),
    sections: body.sections || [],
    instructions: body.instructions ?? null,
    paperSet: body.paper_set || body.paperSet || 'A',
    isOnline: Boolean(body.is_online ?? body.isOnline ?? false),
    status: body.status || 'draft',
  };
}

export async function createPaper(body, user) {
  const fields = mapBodyToPaperFields(body);
  const questions = body.questions || [];
  const questionIds = toObjectIdList(
    questions.map((q) => q.question_id || q.questionId || q.id).filter(Boolean)
  );
  const existing = await Question.countDocuments({ _id: { $in: questionIds }, status: 'approved' });
  if (questionIds.length && existing !== questionIds.length) {
    throw new AppError('Paper includes non-approved questions', 400, 'INVALID_QUESTIONS');
  }

  fields.questions = questions.map((q, idx) => ({
    questionId: q.question_id || q.questionId || q.id,
    section: q.section || 'A',
    sectionOrder: Number(q.section_order ?? q.sectionOrder ?? 0),
    questionOrder: Number(q.question_order ?? q.questionOrder ?? idx),
    customMarks: q.custom_marks ?? q.customMarks ?? null,
  }));
  fields.createdBy = user._id;
  const doc = await Paper.create(fields);
  await doc.populate(['subjectId', 'examTypeId', 'questions.questionId']);
  return mapPaper(doc);
}

export async function updatePaper(id, body, user) {
  const paper = await Paper.findById(id);
  if (!paper) throw new AppError('Paper not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && paper.createdBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const fields = mapBodyToPaperFields({ ...paper.toObject(), ...body });
  Object.assign(paper, fields);
  if (body.questions) {
    paper.questions = body.questions.map((q, idx) => ({
      questionId: q.question_id || q.questionId || q.id,
      section: q.section || 'A',
      sectionOrder: Number(q.section_order ?? q.sectionOrder ?? 0),
      questionOrder: Number(q.question_order ?? q.questionOrder ?? idx),
      customMarks: q.custom_marks ?? q.customMarks ?? null,
    }));
  }
  if (body.status === 'published' && !paper.publishedAt) {
    paper.publishedAt = new Date();
  }
  await paper.save();
  await paper.populate(['subjectId', 'examTypeId', 'questions.questionId']);
  return mapPaper(paper);
}

export async function deletePaper(id, user) {
  const paper = await Paper.findById(id);
  if (!paper) throw new AppError('Paper not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && paper.createdBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  await paper.deleteOne();
}

export async function generatePaper(config, user) {
  const sectionSpecs =
    config.sections ||
    [
      {
        id: 'A',
        name: 'Section A - MCQ',
        questionCount: Number(config.total_questions || 20),
        marksPerQuestion: Number(config.marks_per_question || 4),
        question_types: ['mcq'],
      },
    ];

  const selection = await selectQuestionsForPaper({
    ...config,
    sections: sectionSpecs.map((s) => ({
      id: s.id || s.name,
      name: s.name,
      questionCount: s.questionCount ?? s.question_count,
      marksPerQuestion: s.marksPerQuestion ?? s.marks_per_question ?? 4,
      question_types: s.question_types || s.questionTypes,
    })),
  });

  const paperQuestions = [];
  selection.sections.forEach((sec, sectionOrder) => {
    sec.questions.forEach((q, questionOrder) => {
      paperQuestions.push({
        question_id: q.id,
        section: sec.sectionId || sec.sectionName,
        section_order: sectionOrder,
        question_order: questionOrder,
        custom_marks: q.custom_marks,
      });
    });
  });

  return createPaper(
    {
      ...config,
      total_questions: selection.total_questions,
      total_marks: selection.total_marks,
      sections: sectionSpecs.map((s) => ({
        name: s.name,
        questionCount: s.questionCount ?? s.question_count,
        marksPerQuestion: s.marksPerQuestion ?? s.marks_per_question ?? 4,
      })),
      questions: paperQuestions,
      status: config.status || 'draft',
    },
    user
  );
}

