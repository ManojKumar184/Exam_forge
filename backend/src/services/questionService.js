import { Question } from '../models/Question.js';
import { AppError } from '../utils/AppError.js';
import { computeDuplicateHash, findDuplicateCandidate } from '../utils/duplicateHash.js';
import { mapQuestion, bodyToQuestionFields } from '../utils/questionMapper.js';
import { classifyQuestionMetadata } from '../ai/classifyQuestion.js';

function buildListFilter(query, user) {
  const filter = {};

  if (user.role === 'faculty') {
    filter.status = 'approved';
  } else if (user.role === 'student') {
    filter.status = 'approved';
  }

  if (query.status) filter.status = query.status;
  if (query.subject_id) filter.subjectId = query.subject_id;
  if (query.chapter_id) filter.chapterId = query.chapter_id;
  if (query.exam_type_id) filter.examTypeId = query.exam_type_id;
  if (query.class) filter.class = Number(query.class);
  if (query.difficulty) filter.difficulty = query.difficulty;
  if (query.question_type) filter.questionType = query.question_type;
  if (query.upload_id) filter.uploadId = query.upload_id;
  if (query.source) filter.source = query.source;

  if (query.search?.trim()) {
    const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.questionText = { $regex: escaped, $options: 'i' };
  }

  return filter;
}

export async function listQuestions(query, user) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const sortField = query.sort_by || 'createdAt';
  const sortOrder = query.sort_order === 'asc' ? 1 : -1;
  const allowedSort = ['createdAt', 'updatedAt', 'marks', 'class', 'aiConfidence'];
  const sort = { [allowedSort.includes(sortField) ? sortField : 'createdAt']: sortOrder };

  const filter = buildListFilter(query, user);

  const [items, total] = await Promise.all([
    Question.find(filter)
      .populate('subjectId', 'name code icon color')
      .populate('chapterId', 'name chapterNumber class')
      .populate('examTypeId', 'name code')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Question.countDocuments(filter),
  ]);

  return {
    items: items.map(mapQuestion),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getQuestionById(id, user) {
  const question = await Question.findById(id)
    .populate('subjectId', 'name code icon color')
    .populate('chapterId', 'name chapterNumber class')
    .populate('examTypeId', 'name code');

  if (!question) throw new AppError('Question not found', 404, 'NOT_FOUND');

  if (user.role !== 'super_admin' && question.status !== 'approved') {
    throw new AppError('Question not available', 403, 'FORBIDDEN');
  }

  return mapQuestion(question);
}

export async function createQuestion(body, user) {
  const fields = bodyToQuestionFields(body);
  fields.createdBy = user._id;
  fields.duplicateHash = computeDuplicateHash(fields.questionText || body.question_text);

  const dup = await findDuplicateCandidate(Question, fields.duplicateHash);
  if (dup) {
    fields.status = 'needs_review';
    fields.duplicateOf = dup._id;
    fields.extractionWarnings = ['Possible duplicate detected'];
  }

  const ai = await classifyQuestionMetadata(fields);
  fields.aiConfidence = ai.aiConfidence;
  fields.aiMetadata = ai.aiMetadata;

  if (user.role !== 'super_admin') {
    fields.status = 'pending';
  }

  const doc = await Question.create(fields);
  await doc.populate(['subjectId', 'chapterId', 'examTypeId']);
  return mapQuestion(doc);
}

export async function updateQuestion(id, body, user) {
  const question = await Question.findById(id);
  if (!question) throw new AppError('Question not found', 404, 'NOT_FOUND');

  const fields = bodyToQuestionFields(body);
  if (fields.questionText) {
    fields.duplicateHash = computeDuplicateHash(fields.questionText);
  }

  Object.assign(question, fields);
  await question.save();
  await question.populate(['subjectId', 'chapterId', 'examTypeId']);
  return mapQuestion(question);
}

export async function deleteQuestion(id) {
  const result = await Question.findByIdAndDelete(id);
  if (!result) throw new AppError('Question not found', 404, 'NOT_FOUND');
}

export async function approveQuestion(id, user) {
  const q = await Question.findByIdAndUpdate(
    id,
    {
      status: 'approved',
      reviewedBy: user._id,
      reviewedAt: new Date(),
      reviewNotes: null,
    },
    { new: true }
  ).populate(['subjectId', 'chapterId', 'examTypeId']);
  if (!q) throw new AppError('Question not found', 404, 'NOT_FOUND');
  return mapQuestion(q);
}

export async function rejectQuestion(id, user, notes) {
  const q = await Question.findByIdAndUpdate(
    id,
    {
      status: 'rejected',
      reviewedBy: user._id,
      reviewedAt: new Date(),
      reviewNotes: notes,
    },
    { new: true }
  ).populate(['subjectId', 'chapterId', 'examTypeId']);
  if (!q) throw new AppError('Question not found', 404, 'NOT_FOUND');
  return mapQuestion(q);
}

export async function bulkApprove(ids, user) {
  await Question.updateMany(
    { _id: { $in: ids } },
    { status: 'approved', reviewedBy: user._id, reviewedAt: new Date() }
  );
}

export async function bulkReject(ids, user, notes) {
  await Question.updateMany(
    { _id: { $in: ids } },
    { status: 'rejected', reviewedBy: user._id, reviewedAt: new Date(), reviewNotes: notes }
  );
}

export async function bulkDelete(ids) {
  await Question.deleteMany({ _id: { $in: ids } });
}
