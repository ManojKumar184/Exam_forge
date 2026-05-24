import { v4 as uuidv4 } from 'uuid';
import { Paper } from '../models/Paper.js';
import { Question } from '../models/Question.js';
import { AppError } from '../utils/AppError.js';
import { mapPaper } from '../utils/examMapper.js';

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
  const subjectId = config.subject_id || config.subjectId;
  const examTypeId = config.exam_type_id || config.examTypeId;
  const classLevel = Number(config.class || 11);
  const totalQuestions = Number(config.total_questions || 20);

  const questionFilter = {
    status: 'approved',
    ...(subjectId ? { subjectId } : {}),
    ...(examTypeId ? { examTypeId } : {}),
    class: classLevel,
  };

  const pool = await Question.find(questionFilter).lean();
  if (pool.length < totalQuestions) {
    throw new AppError('Not enough approved questions for generation', 400, 'INSUFFICIENT_QUESTIONS');
  }

  const difficultyDist = config.difficulty_distribution || { easy: 30, medium: 50, hard: 20 };
  const target = {
    easy: Math.round((totalQuestions * (difficultyDist.easy || 0)) / 100),
    medium: Math.round((totalQuestions * (difficultyDist.medium || 0)) / 100),
    hard: Math.max(0, totalQuestions),
  };
  target.hard = totalQuestions - target.easy - target.medium;

  const selected = [];
  const byDifficulty = {
    easy: pool.filter((q) => q.difficulty === 'easy'),
    medium: pool.filter((q) => q.difficulty === 'medium'),
    hard: pool.filter((q) => q.difficulty === 'hard'),
  };

  for (const key of ['easy', 'medium', 'hard']) {
    const needed = target[key];
    const candidates = [...byDifficulty[key]].sort(() => Math.random() - 0.5);
    selected.push(...candidates.slice(0, needed));
  }
  if (selected.length < totalQuestions) {
    const fallback = pool
      .filter((q) => !selected.some((s) => s._id.toString() === q._id.toString()))
      .sort(() => Math.random() - 0.5);
    selected.push(...fallback.slice(0, totalQuestions - selected.length));
  }

  const sections = (config.sections || [
    { name: 'Section A', questionCount: totalQuestions, marksPerQuestion: Number(config.marks_per_question || 4) },
  ]).map((s) => ({
    name: s.name,
    questionCount: Number(s.questionCount),
    marksPerQuestion: Number(s.marksPerQuestion),
  }));

  let cursor = 0;
  const paperQuestions = [];
  sections.forEach((section, sectionOrder) => {
    for (let i = 0; i < section.questionCount && cursor < selected.length; i += 1) {
      const q = selected[cursor];
      paperQuestions.push({
        questionId: q._id,
        section: section.name,
        sectionOrder,
        questionOrder: i,
        customMarks: section.marksPerQuestion,
      });
      cursor += 1;
    }
  });

  return createPaper(
    {
      ...config,
      total_questions: selected.length,
      total_marks: paperQuestions.reduce((sum, q) => sum + Number(q.customMarks || 0), 0),
      sections,
      questions: paperQuestions.map((q) => ({
        question_id: q.questionId.toString(),
        section: q.section,
        section_order: q.sectionOrder,
        question_order: q.questionOrder,
        custom_marks: q.customMarks,
      })),
      status: config.status || 'draft',
    },
    user
  );
}

