import mongoose from 'mongoose';
// Flat Topic model removed — chapter_name creates entries via SyllabusNode
import { Question } from '../models/Question.js';
import { SyllabusNode } from '../models/SyllabusNode.js';
import { AppError } from '../utils/AppError.js';
import { normalizeQuestionType } from '../utils/questionTypeNormalizer.js';
import { computeDuplicateHash, findDuplicateCandidate } from '../utils/duplicateHash.js';
import { mapQuestion, bodyToQuestionFields } from '../utils/questionMapper.js';
import { canonicalContentFromLegacy, reconcileCanonicalQuestionContent } from '../utils/canonicalQuestionContent.js';
import { classifyQuestionMetadata } from '../ai/classifyQuestion.js';
import { assertWithinEntitlement, recordUsage } from './entitlementService.js';

export const CORE_OBJECTIVE_QUESTION_TYPES = new Set([
  'MCQ_SINGLE', 'MCQ_MULTIPLE', 'TRUE_FALSE', 'FILL_BLANK',
  'NUMERICAL', 'NUMERICAL_INTEGER', 'MATCH_FOLLOWING', 'ASSERTION_REASON',
]);

const QUESTION_CREATE_FIELDS = new Set([
  'questionText', 'questionType', 'contextType', 'questionLatex', 'questionImages', 'options',
  'correctOption', 'numericalAnswer', 'numericalTolerance', 'answerText', 'answerKey', 'difficulty',
  'sourceMarks', 'class', 'year', 'explanation', 'explanationLatex', 'explanationImages', 'diagrams',
  'imageMetadata', 'hasDiagram', 'hasEquation', 'hasTable', 'renderingMetadata', 'contentBlocks',
  'canonicalContent', 'tags', 'correctAnswers', 'figures', 'formulas', 'semanticBlocks', 'statementGroups',
  'syllabusMappings',
]);
const QUESTION_UPDATE_FIELDS = new Set([...QUESTION_CREATE_FIELDS, 'isPrivate', 'visibility']);

export function validateQuestionForApproval(question) {
  const type = normalizeQuestionType(question.questionType);
  if (!CORE_OBJECTIVE_QUESTION_TYPES.has(type)) {
    throw new AppError('Classify and correct this question as a supported objective type before approval', 400, 'UNSUPPORTED_QUESTION_TYPE');
  }
  const content = question.canonicalContent;
  const stem = content?.stem || [];
  const hasStem = stem.some((block) => block?.type === 'text' ? Boolean(block.text?.trim()) : block?.type === 'equation' || block?.type === 'image' || block?.type === 'table');
  if (!hasStem && !question.questionText?.trim() && !question.questionLatex && !question.questionImages?.length) {
    throw new AppError('Question content is required before approval', 400, 'INVALID_QUESTION_CONTENT');
  }
  const options = content?.options?.length ? content.options : (question.options || []);
  const answer = content?.answer ?? question.correctAnswers ?? question.correctOption ?? question.numericalAnswer ?? question.answerText ?? question.answerKey;
  if (['MCQ_SINGLE', 'MCQ_MULTIPLE', 'ASSERTION_REASON'].includes(type) && options.length < 2) {
    throw new AppError('At least two options are required before approval', 400, 'INVALID_QUESTION_CONTENT');
  }
  const singleAnswer = question.correctOption ?? answer;
  if (type === 'MCQ_SINGLE' && (singleAnswer == null || singleAnswer === '' || !Number.isInteger(Number(singleAnswer)) || Number(singleAnswer) < 0 || Number(singleAnswer) >= options.length)) {
    throw new AppError('Select a valid correct option before approval', 400, 'INVALID_QUESTION_CONTENT');
  }
  if (type === 'MCQ_MULTIPLE' && !(Array.isArray(question.correctAnswers ?? answer) && (question.correctAnswers ?? answer).length)) {
    throw new AppError('Select one or more correct options before approval', 400, 'INVALID_QUESTION_CONTENT');
  }
  if (['MCQ_MULTIPLE', 'ASSERTION_REASON'].includes(type)) {
    const refs = question.correctAnswers ?? (Array.isArray(answer) ? answer : []);
    const validRef = (ref) => {
      if (Number.isInteger(Number(ref)) && String(ref).trim() !== '') return Number(ref) >= 0 && Number(ref) < options.length;
      const label = String(ref).trim().toUpperCase();
      return options.some((option, index) => String(option.label || String.fromCharCode(65 + index)).toUpperCase() === label);
    };
    if (refs.some((ref) => !validRef(ref))) throw new AppError('Correct answers must reference existing options', 400, 'INVALID_QUESTION_CONTENT');
  }
  if (type === 'ASSERTION_REASON' && (singleAnswer == null || !Number.isInteger(Number(singleAnswer)) || Number(singleAnswer) < 0 || Number(singleAnswer) >= options.length)) {
    throw new AppError('Select a valid assertion/reason answer before approval', 400, 'INVALID_QUESTION_CONTENT');
  }
  const numericalAnswer = question.numericalAnswer ?? answer;
  if (['NUMERICAL', 'NUMERICAL_INTEGER'].includes(type) && (numericalAnswer == null || numericalAnswer === '' || !Number.isFinite(Number(numericalAnswer)))) {
    throw new AppError('Enter a valid numerical answer before approval', 400, 'INVALID_QUESTION_CONTENT');
  }
  if (['TRUE_FALSE', 'FILL_BLANK'].includes(type) && (answer == null || String(answer).trim() === '')) {
    throw new AppError('Provide the correct answer before approval', 400, 'INVALID_QUESTION_CONTENT');
  }
  if (type === 'MATCH_FOLLOWING' && (answer == null || (Array.isArray(answer) && answer.length === 0) || String(answer).trim() === '')) {
    throw new AppError('Provide the correct matching answer before approval', 400, 'INVALID_QUESTION_CONTENT');
  }
  const hasSyllabusData = question.syllabusMappings?.length > 0 &&
    question.syllabusMappings[0]?.subjectId && question.syllabusMappings[0]?.examPatternId;
  if (!hasSyllabusData) throw new AppError('Set syllabus mappings (subject + exam pattern) before approving', 400, 'INCOMPLETE_METADATA');
}

function parseListParam(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function tenantQuestionAccess(user) {
  const institutionId = user?.activeInstitutionId || user?.defaultInstitutionId;
  if (!institutionId) return { _id: null };
  const ownTenant = { institutionId };
  const global = { institutionId: null, visibility: 'public' };
  return { $or: [ownTenant, global] };
}

function scopedQuestionId(id, user) {
  return { $and: [{ _id: id }, tenantQuestionAccess(user)] };
}

function buildListFilter(query, user) {
  const andClauses = [tenantQuestionAccess(user)];

  // Role-based accessibility boundaries
  if (user.role === 'student') {
    andClauses.push({ status: 'approved' });
    andClauses.push({ isPrivate: false });
  } else if (user.role === 'faculty' && user.membershipRole !== 'INSTITUTION_ADMIN') {
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
  const allowedSort = ['createdAt', 'updatedAt', 'sourceMarks', 'class', 'aiConfidence'];
  const sort = { [allowedSort.includes(sortField) ? sortField : 'createdAt']: sortOrder };

  const filter = buildListFilter(query, user);

  const [items, total] = await Promise.all([
    Question.find(filter)
      // Populate for flat Subject/Topic/ExamType removed — collections were dropped
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
  const question = await Question.findOne(scopedQuestionId(id, user))
    // Populate for flat Subject/Topic/ExamType removed — collections were dropped

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
  const tenantId = user.activeInstitutionId || user.defaultInstitutionId;
  if (tenantId) await assertWithinEntitlement(tenantId, 'questions');
  const fields = bodyToQuestionFields(body, QUESTION_CREATE_FIELDS);
  fields.canonicalContent = canonicalContentFromLegacy(fields);
  fields.source = 'manual';
  fields.canonicalContent.provenance = { kind: 'manual' };
  fields.createdBy = user._id;
  fields.institutionId = user.activeInstitutionId || user.defaultInstitutionId || null;
  fields.ownerId = user._id;

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
  
  // Inherit class, etc. from classifier if not specified
  if (ai.class && !fields.class) fields.class = ai.class;
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
  fields.canonicalContent.validation = {
    ...(fields.canonicalContent.validation || {}),
    status: fields.status,
    warnings: fields.extractionWarnings || [],
    fidelity: {
      parser: fields.parserConfidence ?? null,
      reconstruction: fields.reconstructionFidelity ?? null,
      math: fields.mathPreservationConfidence ?? null,
    },
  };

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

  if (!fields.bankIds?.length) {
    const { resolveDefaultQuestionBankIds } = await import('./questionBankMembershipService.js');
    fields.bankIds = await resolveDefaultQuestionBankIds(user);
  }

  const doc = await Question.create(fields);
  if (tenantId) await recordUsage(tenantId, 'questions');
  // Populate for flat Subject/Topic/ExamType removed — collections were dropped
  return mapQuestion(doc);
}

/**
 * @param {string} id
 * @param {Record<string, any>} body
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
export async function updateQuestion(id, body, user) {
  const question = await Question.findOne(scopedQuestionId(id, user));
  if (!question) throw new AppError('Question not found', 404, 'NOT_FOUND');

  if (user.role !== 'super_admin' && user.membershipRole !== 'INSTITUTION_ADMIN') {
    if (!question.ownerId || question.ownerId.toString() !== user._id.toString()) {
      throw new AppError('You do not own this question', 403, 'FORBIDDEN');
    }
  }

  const fields = bodyToQuestionFields(body, QUESTION_UPDATE_FIELDS);
  const touchesContent = ['questionText', 'questionLatex', 'questionImages', 'options', 'explanation', 'explanationLatex', 'contentBlocks', 'canonicalContent']
    .some((key) => Object.hasOwn(fields, key));
  if (touchesContent) fields.canonicalContent = reconcileCanonicalQuestionContent(question.toObject(), fields);
  for (const key of ['status', 'createdBy', 'ownerId', 'institutionId', 'reviewedBy', 'reviewedAt', 'reviewNotes', 'auditHistory', 'enrichmentAttempts', 'semanticEnriched']) delete fields[key];
  if (user.role !== 'super_admin' && user.membershipRole !== 'INSTITUTION_ADMIN') {
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
  // Populate for flat Subject/Topic/ExamType removed — collections were dropped
  return mapQuestion(question);
}

/**
 * @param {string} id
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<void>}
 */
export async function deleteQuestion(id, user) {
  const question = await Question.findOne(scopedQuestionId(id, user));
  if (!question) throw new AppError('Question not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin' && user.membershipRole !== 'INSTITUTION_ADMIN') {
    if (!question.ownerId || question.ownerId.toString() !== user._id.toString()) {
      throw new AppError('You do not own this question', 403, 'FORBIDDEN');
    }
  }
  const result = await Question.findOneAndDelete(scopedQuestionId(id, user));
  if (!result) throw new AppError('Question not found', 404, 'NOT_FOUND');
}

/**
 * @param {string} id
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
export async function approveQuestion(id, user) {
  const existing = await Question.findOne(scopedQuestionId(id, user));
  if (!existing) throw new AppError('Question not found', 404, 'NOT_FOUND');

  validateQuestionForApproval(existing);
  
  // Ownership check for faculty
  if (user.role !== 'super_admin' && user.membershipRole !== 'INSTITUTION_ADMIN') {
    if (!existing.ownerId || existing.ownerId.toString() !== user._id.toString()) {
      throw new AppError('You can only approve your own questions', 403, 'FORBIDDEN');
    }
  }
  
  // syllabusMappings required before approving — flat Subject/ExamType collections were dropped
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
  // Populate for flat Subject/Topic/ExamType removed — collections were dropped
  return mapQuestion(existing);
}

/**
 * @param {string} id
 * @param {import('../models/User.js').IUser} user
 * @param {string} [notes]
 * @returns {Promise<Record<string, any>>}
 */
export async function rejectQuestion(id, user, notes) {
  const existing = await Question.findOne(scopedQuestionId(id, user));
  if (!existing) throw new AppError('Question not found', 404, 'NOT_FOUND');
  
  // Ownership check for faculty
  if (user.role !== 'super_admin' && user.membershipRole !== 'INSTITUTION_ADMIN') {
    if (!existing.ownerId || existing.ownerId.toString() !== user._id.toString()) {
      throw new AppError('You can only reject your own questions', 403, 'FORBIDDEN');
    }
  }

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
  // Populate for flat Subject/Topic/ExamType removed — collections were dropped
  return mapQuestion(existing);
}

/**
 * @param {string[]} ids
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<void>}
 */
export async function bulkApprove(ids, user) {
  const filter = { _id: { $in: ids } };
  filter.institutionId = user.activeInstitutionId || user.defaultInstitutionId;
  if (user.role !== 'super_admin' && user.membershipRole !== 'INSTITUTION_ADMIN') {
    filter.ownerId = user._id;
  }
  const questions = await Question.find(filter);
  
  // Validate the complete batch before mutating any document.
  for (const q of questions) {
    try { validateQuestionForApproval(q); }
    catch (error) {
      if (error.code === 'INCOMPLETE_METADATA') error.message = `Question #${q.serialId || q._id} is missing syllabus mappings (subject + exam pattern)`;
      throw error;
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
  const filter = { _id: { $in: ids } };
  filter.institutionId = user.activeInstitutionId || user.defaultInstitutionId;
  if (user.role !== 'super_admin' && user.membershipRole !== 'INSTITUTION_ADMIN') {
    filter.ownerId = user._id;
  }
  const questions = await Question.find(filter);
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
    await Question.deleteMany({ _id: { $in: ids }, ownerId: user._id, institutionId: user.activeInstitutionId || user.defaultInstitutionId });
  } else {
    await Question.deleteMany({ _id: { $in: ids }, institutionId: user.activeInstitutionId });
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
  delete fields.status;
  for (const key of ['createdBy', 'ownerId', 'institutionId', 'reviewedBy', 'reviewedAt', 'reviewNotes', 'auditHistory', 'enrichmentAttempts', 'semanticEnriched']) delete fields[key];
  if (Object.keys(fields).length === 0) return { modified: 0 };
  if (fields.questionText) {
    fields.duplicateHash = computeDuplicateHash(fields.questionText);
  }
  if (user.role !== 'super_admin') {
    delete fields.ownerId;
    delete fields.isPrivate;
    delete fields.visibility;
    const result = await Question.updateMany({ _id: { $in: ids }, ownerId: user._id, institutionId: user.activeInstitutionId || user.defaultInstitutionId }, { $set: fields });
    return { modified: result.modifiedCount };
  } else {
    const result = await Question.updateMany({ _id: { $in: ids }, institutionId: user.activeInstitutionId }, { $set: fields });
    return { modified: result.modifiedCount };
  }
}
