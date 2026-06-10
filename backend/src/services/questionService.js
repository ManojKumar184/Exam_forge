import mongoose from 'mongoose';
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
  const andClauses = [];

  // Role-based accessibility boundaries
  if (user.role === 'student') {
    andClauses.push({ status: 'approved' });
    andClauses.push({ isPrivate: false });
  } else if (user.role === 'faculty') {
    // Faculty can access their own questions or any published question
    andClauses.push({
      $or: [
        { ownerId: user._id },
        { isPrivate: false }
      ]
    });
  }

  // Build filters on a separate object
  const conds = {};

  const statuses = parseListParam(query.status);
  if (statuses.length) {
    conds.status = { $in: statuses };
  } else if (user.role === 'student') {
    conds.status = 'approved';
  }

  const subjectIds = parseListParam(query.subject_ids);
  if (subjectIds.length) conds.subjectId = { $in: subjectIds };
  else if (query.subject_id) conds.subjectId = query.subject_id;

  const chapterIds = parseListParam(query.chapter_ids);
  if (chapterIds.length) conds.chapterId = { $in: chapterIds };
  else if (query.chapter_id) conds.chapterId = query.chapter_id;

  const examTypeIds = parseListParam(query.exam_type_ids);
  if (examTypeIds.length) conds.examTypeId = { $in: examTypeIds };
  else if (query.exam_type_id) conds.examTypeId = query.exam_type_id;

  const classes = parseListParam(query.classes).map(Number).filter((n) => n >= 6 && n <= 12);
  if (classes.length) conds.class = { $in: classes };
  else if (query.class) conds.class = Number(query.class);

  const difficulties = parseListParam(query.difficulties);
  if (difficulties.length) conds.difficulty = { $in: difficulties };
  else if (query.difficulty) conds.difficulty = query.difficulty;

  const questionTypes = parseListParam(query.question_types);
  if (questionTypes.length) conds.questionType = { $in: questionTypes };
  else if (query.question_type) conds.questionType = query.question_type;

  if (query.upload_id) conds.uploadId = query.upload_id;
  if (query.source) conds.source = query.source;

  const bankIds = parseListParam(query.bank_ids);
  if (bankIds.length) conds.bankIds = { $in: bankIds };
  else if (query.bank_id) conds.bankIds = query.bank_id;

  if (query.syllabus_exam_pattern_id) {
    conds['syllabusMappings.examPatternId'] = query.syllabus_exam_pattern_id;
  }
  if (query.syllabus_class_id) {
    conds['syllabusMappings.classId'] = query.syllabus_class_id;
  }
  if (query.syllabus_subject_id) {
    conds['syllabusMappings.subjectId'] = query.syllabus_subject_id;
  }
  if (query.syllabus_chapter_id) {
    conds['syllabusMappings.chapterId'] = query.syllabus_chapter_id;
  }
  if (query.syllabus_topic_id) {
    conds['syllabusMappings.topicId'] = query.syllabus_topic_id;
  }


  // Handle scopes
  const scope = query.scope;
  if (scope === 'workspace' || scope === 'private') {
    conds.isPrivate = true;
    if (user.role === 'super_admin' && query.owner_id) {
      conds.ownerId = query.owner_id;
    } else if (user.role === 'faculty') {
      conds.ownerId = user._id;
    } else if (user.role === 'student') {
      // student sees nothing
      conds.ownerId = new mongoose.Types.ObjectId();
    }
  } else if (scope === 'my_questions') {
    if (user.role === 'super_admin') {
      if (query.owner_id) conds.ownerId = query.owner_id;
    } else if (user.role === 'faculty') {
      conds.ownerId = user._id;
    }
  } else if (scope === 'published') {
    conds.isPrivate = false;
  } else if (scope === 'faculty_bank') {
    conds.visibility = 'faculty_bank';
    conds.isPrivate = false;
  } else if (scope === 'institution_bank') {
    conds.visibility = 'institution';
    conds.isPrivate = false;
  } else if (scope === 'system_bank') {
    conds.visibility = 'public';
    conds.isPrivate = false;
  }

  // Specific query overrides
  if (query.is_private !== undefined) {
    conds.isPrivate = query.is_private === 'true' || query.is_private === true;
  }
  if (query.visibility) {
    conds.visibility = query.visibility;
  }
  if (query.owner_id) {
    if (user.role === 'super_admin') {
      conds.ownerId = query.owner_id;
    } else if (user.role === 'faculty') {
      conds.ownerId = user._id;
    }
  }

  if (query.search?.trim()) {
    const term = query.search.trim();
    const qIdMatch = term.match(/^q-(\d+)$/i);
    if (qIdMatch) {
      conds.serialId = Number(qIdMatch[1]);
    } else if (/^\d+$/.test(term)) {
      const num = Number(term);
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      conds.$or = [
        { serialId: num },
        { questionText: { $regex: escaped, $options: 'i' } }
      ];
    } else {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      conds.questionText = { $regex: escaped, $options: 'i' };
    }
  }

  if (andClauses.length > 0) {
    andClauses.push(conds);
    return { $and: andClauses };
  }

  return conds;
}

/**
 * @param {Record<string, any>} query
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<{ total: number, breakdown: Array<{ _id: { difficulty: string, questionType: string }, count: number }> }>}
 */
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

/**
 * @param {Record<string, any>} query
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<{ items: Array<Record<string, any>>, pagination: { page: number, limit: number, total: number, totalPages: number } }>}
 */
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

/**
 * @param {string} id
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
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

/**
 * @param {Record<string, any>} body
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
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
  fields.ownerId = fields.ownerId || user._id;

  if (user.role === 'faculty') {
    fields.isPrivate = true;
    fields.visibility = 'private';
    fields.bankIds = [];
  } else if (user.role === 'super_admin') {
    fields.isPrivate = body.is_private !== undefined ? (body.is_private === 'true' || body.is_private === true) : false;
    fields.visibility = body.visibility || 'public';
  }
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

  if (user.role === 'super_admin' && (!fields.bankIds || fields.bankIds.length === 0)) {
    const { QuestionBank } = await import('../models/QuestionBank.js');
    let systemBank = await QuestionBank.findOne({ type: 'system', name: 'System Global Bank' });
    if (!systemBank) {
      systemBank = await QuestionBank.create({
        name: 'System Global Bank',
        description: 'Global repository of questions accessible by everyone.',
        type: 'system',
        createdBy: null,
        institution: null,
        visibility: 'public',
      });
    }
    fields.bankIds = [systemBank._id];
  }

  const doc = await Question.create(fields);
  await doc.populate(['subjectId', 'chapterId', 'examTypeId']);
  return mapQuestion(doc);
}

/**
 * @param {string} id
 * @param {Record<string, any>} body
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
export async function updateQuestion(id, body, user) {
  const question = await Question.findById(id);
  if (!question) throw new AppError('Question not found', 404, 'NOT_FOUND');

  if (user.role !== 'super_admin') {
    if (!question.ownerId || question.ownerId.toString() !== user._id.toString()) {
      throw new AppError('You do not own this question', 403, 'FORBIDDEN');
    }
  }

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
  if (user.role !== 'super_admin') {
    delete fields.ownerId;
    delete fields.isPrivate;
    delete fields.visibility;
  }
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

/**
 * @param {string} id
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<void>}
 */
export async function deleteQuestion(id, user) {
  const question = await Question.findById(id);
  if (!question) throw new AppError('Question not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin') {
    if (!question.ownerId || question.ownerId.toString() !== user._id.toString()) {
      throw new AppError('You do not own this question', 403, 'FORBIDDEN');
    }
  }
  const result = await Question.findByIdAndDelete(id);
  if (!result) throw new AppError('Question not found', 404, 'NOT_FOUND');
}

/**
 * @param {string} id
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
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

/**
 * @param {string} id
 * @param {import('../models/User.js').IUser} user
 * @param {string} [notes]
 * @returns {Promise<Record<string, any>>}
 */
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

/**
 * @param {string[]} ids
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<void>}
 */
export async function bulkApprove(ids, user) {
  const questions = await Question.find({ _id: { $in: ids } });
  for (const q of questions) {
    if (!q.subjectId || !q.examTypeId) {
      throw new AppError(
        'Set subject and exam type before approving',
        400,
        'INCOMPLETE_METADATA'
      );
    }
  }
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

/**
 * @param {string[]} ids
 * @param {import('../models/User.js').IUser} user
 * @param {string} [notes]
 * @returns {Promise<void>}
 */
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

/**
 * @param {string[]} ids
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<void>}
 */
export async function bulkDelete(ids, user) {
  if (user.role !== 'super_admin') {
    await Question.deleteMany({ _id: { $in: ids }, ownerId: user._id });
  } else {
    await Question.deleteMany({ _id: { $in: ids } });
  }
}

/**
 * @param {string[]} ids
 * @param {Record<string, any>} updates
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<{ modified: number }>}
 */
export async function bulkUpdateMetadata(ids, updates, user) {
  const fields = bodyToQuestionFields(updates);
  if (fields.questionText) {
    fields.duplicateHash = computeDuplicateHash(fields.questionText);
  }
  if (user.role !== 'super_admin') {
    delete fields.ownerId;
    delete fields.isPrivate;
    delete fields.visibility;
    const result = await Question.updateMany({ _id: { $in: ids }, ownerId: user._id }, { $set: fields });
    return { modified: result.modifiedCount };
  } else {
    const result = await Question.updateMany({ _id: { $in: ids } }, { $set: fields });
    return { modified: result.modifiedCount };
  }
}
