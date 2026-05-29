import { Question } from '../models/Question.js';
import { Topic } from '../models/Topic.js';
import { AppError } from '../utils/AppError.js';
import { computeDuplicateHash, findDuplicateCandidate } from '../utils/duplicateHash.js';
import { mapQuestion, bodyToQuestionFields } from '../utils/questionMapper.js';
import { classifyQuestionMetadata } from '../ai/classifyQuestion.js';

function parseListParam(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildListFilter(query, user) {
  const filter = {};

  if (user.role === 'faculty' || user.role === 'student') {
    filter.status = 'approved';
  }

  if (query.status) filter.status = query.status;

  const subjectIds = parseListParam(query.subject_ids);
  if (subjectIds.length) filter.subjectId = { $in: subjectIds };
  else if (query.subject_id) filter.subjectId = query.subject_id;

  const chapterIds = parseListParam(query.chapter_ids);
  if (chapterIds.length) filter.chapterId = { $in: chapterIds };
  else if (query.chapter_id) filter.chapterId = query.chapter_id;

  const examTypeIds = parseListParam(query.exam_type_ids);
  if (examTypeIds.length) filter.examTypeId = { $in: examTypeIds };
  else if (query.exam_type_id) filter.examTypeId = query.exam_type_id;

  const classes = parseListParam(query.classes).map(Number).filter((n) => n >= 6 && n <= 12);
  if (classes.length) filter.class = { $in: classes };
  else if (query.class) filter.class = Number(query.class);

  const difficulties = parseListParam(query.difficulties);
  if (difficulties.length) filter.difficulty = { $in: difficulties };
  else if (query.difficulty) filter.difficulty = query.difficulty;

  const questionTypes = parseListParam(query.question_types);
  if (questionTypes.length) filter.questionType = { $in: questionTypes };
  else if (query.question_type) filter.questionType = query.question_type;

  if (query.upload_id) filter.uploadId = query.upload_id;
  if (query.source) filter.source = query.source;

  if (query.search?.trim()) {
    const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.questionText = { $regex: escaped, $options: 'i' };
  }

  return filter;
}

export async function countQuestions(query, user) {
  const filter = buildListFilter(query, user);
  const total = await Question.countDocuments(filter);
  const breakdown = await Question.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { difficulty: '$difficulty', questionType: '$questionType' },
        count: { $sum: 1 },
      },
    },
  ]);
  return { total, breakdown };
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
  if (body.chapter_name && body.chapter_name.trim()) {
    const trimmedName = body.chapter_name.trim();
    const subjectId = body.subject_id;
    const classLevel = body.class || 11;
    if (subjectId) {
      let topic = await Topic.findOne({
        subjectId,
        class: classLevel,
        name: { $regex: new RegExp(`^${trimmedName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') }
      });
      if (!topic) {
        topic = await Topic.create({
          subjectId,
          class: classLevel,
          name: trimmedName,
          chapterNumber: null
        });
      }
      body.chapter_id = topic._id.toString();
    }
  }

  const fields = bodyToQuestionFields(body);
  fields.createdBy = user._id;
  fields.duplicateHash = computeDuplicateHash(fields.questionText || body.question_text);

  const dup = await findDuplicateCandidate(Question, fields.duplicateHash);
  
  const ai = await classifyQuestionMetadata(fields);
  fields.aiConfidence = ai.aiConfidence;
  fields.aiMetadata = ai.aiMetadata;
  
  // Inherit class, subject, etc. from classifier if not specified
  if (ai.class && !fields.class) fields.class = ai.class;
  if (ai.subjectId && !fields.subjectId) fields.subjectId = ai.subjectId;
  if (ai.chapterId && !fields.chapterId) fields.chapterId = ai.chapterId;
  if (ai.examTypeId && !fields.examTypeId) fields.examTypeId = ai.examTypeId;
  if (ai.difficulty && !fields.difficulty) fields.difficulty = ai.difficulty;

  const lowConfidence = 
    (fields.parserConfidence !== undefined && fields.parserConfidence < 0.70) ||
    (fields.semanticConfidence !== undefined && fields.semanticConfidence < 0.70) ||
    (fields.mathPreservationConfidence !== undefined && fields.mathPreservationConfidence < 0.70) ||
    (fields.metadataConfidence !== undefined && fields.metadataConfidence < 0.70) ||
    (fields.aiConfidence !== undefined && fields.aiConfidence < 70);

  if (dup || lowConfidence) {
    fields.status = 'needs_review';
    if (dup) {
      fields.duplicateOf = dup._id;
      fields.extractionWarnings = [...(fields.extractionWarnings || []), 'Possible duplicate detected'];
    }
    if (lowConfidence) {
      fields.extractionWarnings = [...(fields.extractionWarnings || []), 'Low confidence score detected'];
    }
  } else {
    fields.status = 'pending';
  }

  const snapshot = {
    questionText: fields.questionText,
    questionType: fields.questionType,
    options: fields.options,
    correctOption: fields.correctOption,
    explanation: fields.explanation,
    confidence: {
      parserConfidence: fields.parserConfidence,
      semanticConfidence: fields.semanticConfidence,
      mathPreservationConfidence: fields.mathPreservationConfidence,
      metadataConfidence: fields.metadataConfidence,
    }
  };
  fields.auditHistory = [{
    action: 'ingested',
    timestamp: new Date(),
    user: user._id,
    parserVersion: 'v1.0.0',
    snapshot
  }];

  const doc = await Question.create(fields);
  await doc.populate(['subjectId', 'chapterId', 'examTypeId']);
  return mapQuestion(doc);
}

export async function updateQuestion(id, body, user) {
  const question = await Question.findById(id);
  if (!question) throw new AppError('Question not found', 404, 'NOT_FOUND');

  if (body.chapter_name && body.chapter_name.trim()) {
    const trimmedName = body.chapter_name.trim();
    const subjectId = body.subject_id || question.subjectId;
    const classLevel = body.class || question.class || 11;
    if (subjectId) {
      let topic = await Topic.findOne({
        subjectId,
        class: classLevel,
        name: { $regex: new RegExp(`^${trimmedName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') }
      });
      if (!topic) {
        topic = await Topic.create({
          subjectId,
          class: classLevel,
          name: trimmedName,
          chapterNumber: null
        });
      }
      body.chapter_id = topic._id.toString();
    }
  }

  const fields = bodyToQuestionFields(body);
  if (fields.questionText) {
    fields.duplicateHash = computeDuplicateHash(fields.questionText);
  }

  const preSnapshot = {
    questionText: question.questionText,
    questionType: question.questionType,
    options: question.options,
    correctOption: question.correctOption,
    explanation: question.explanation,
    confidence: {
      parserConfidence: question.parserConfidence,
      semanticConfidence: question.semanticConfidence,
      mathPreservationConfidence: question.mathPreservationConfidence,
      metadataConfidence: question.metadataConfidence,
    }
  };

  Object.assign(question, fields);

  question.auditHistory = [
    ...(question.auditHistory || []),
    {
      action: 'manually_corrected',
      timestamp: new Date(),
      user: user._id,
      preSnapshot,
      postSnapshot: {
        questionText: question.questionText,
        questionType: question.questionType,
        options: question.options,
        correctOption: question.correctOption,
        explanation: question.explanation,
      }
    }
  ];

  await question.save();
  await question.populate(['subjectId', 'chapterId', 'examTypeId']);
  return mapQuestion(question);
}

export async function deleteQuestion(id) {
  const result = await Question.findByIdAndDelete(id);
  if (!result) throw new AppError('Question not found', 404, 'NOT_FOUND');
}

export async function approveQuestion(id, user) {
  const existing = await Question.findById(id);
  if (!existing) throw new AppError('Question not found', 404, 'NOT_FOUND');
  if (!existing.subjectId || !existing.examTypeId) {
    throw new AppError(
      'Set subject and exam type before approving',
      400,
      'INCOMPLETE_METADATA'
    );
  }

  existing.status = 'approved';
  existing.reviewedBy = user._id;
  existing.reviewedAt = new Date();
  existing.reviewNotes = null;
  existing.auditHistory = [
    ...(existing.auditHistory || []),
    {
      action: 'approved',
      timestamp: new Date(),
      user: user._id,
    }
  ];

  await existing.save();
  await existing.populate(['subjectId', 'chapterId', 'examTypeId']);
  return mapQuestion(existing);
}

export async function rejectQuestion(id, user, notes) {
  const existing = await Question.findById(id);
  if (!existing) throw new AppError('Question not found', 404, 'NOT_FOUND');

  existing.status = 'rejected';
  existing.reviewedBy = user._id;
  existing.reviewedAt = new Date();
  existing.reviewNotes = notes;
  existing.auditHistory = [
    ...(existing.auditHistory || []),
    {
      action: 'rejected',
      timestamp: new Date(),
      user: user._id,
      notes,
    }
  ];

  await existing.save();
  await existing.populate(['subjectId', 'chapterId', 'examTypeId']);
  return mapQuestion(existing);
}

export async function bulkApprove(ids, user) {
  const questions = await Question.find({ _id: { $in: ids } });
  for (const q of questions) {
    q.status = 'approved';
    q.reviewedBy = user._id;
    q.reviewedAt = new Date();
    q.auditHistory = [
      ...(q.auditHistory || []),
      {
        action: 'approved',
        timestamp: new Date(),
        user: user._id,
      }
    ];
    await q.save();
  }
}

export async function bulkReject(ids, user, notes) {
  const questions = await Question.find({ _id: { $in: ids } });
  for (const q of questions) {
    q.status = 'rejected';
    q.reviewedBy = user._id;
    q.reviewedAt = new Date();
    q.reviewNotes = notes;
    q.auditHistory = [
      ...(q.auditHistory || []),
      {
        action: 'rejected',
        timestamp: new Date(),
        user: user._id,
        notes,
      }
    ];
    await q.save();
  }
}

export async function bulkDelete(ids) {
  await Question.deleteMany({ _id: { $in: ids } });
}

export async function bulkUpdateMetadata(ids, updates, user) {
  const fields = bodyToQuestionFields(updates);
  if (fields.questionText) {
    fields.duplicateHash = computeDuplicateHash(fields.questionText);
  }
  const result = await Question.updateMany({ _id: { $in: ids } }, { $set: fields });
  return { modified: result.modifiedCount };
}
