import { Question } from '../models/Question.js';
import { AppError } from '../utils/AppError.js';
import { mapQuestion } from '../utils/questionMapper.js';
import { normalizeQuestionType, getQuestionCategory } from '../utils/questionTypeNormalizer.js';
import { randomUUID, createHash } from 'node:crypto';

function parseIdList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function seededRandom(seed) {
  let state = createHash('sha256').update(String(seed)).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, random) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildQuestionFilter(config) {
  const filter = { status: 'approved' };
  if (config.institutionId) {
    filter.$or = [{ institutionId: config.institutionId }, { institutionId: null, visibility: 'public' }];
  }
  if (config.coreVersion !== 'legacy') {
    filter.responseType = { $in: ['MCQ', 'MSQ', 'NUMERICAL'] };
  }

  const classes = parseIdList(config.classes || config.class_list).map(Number).filter((n) => n >= 6);
  if (classes.length) filter.class = { $in: classes };
  else if (config.class) filter.class = Number(config.class);

  const difficulties = parseIdList(config.difficulties || config.difficulty_list);
  if (difficulties.length) filter.difficulty = { $in: difficulties };
  else if (config.difficulty) filter.difficulty = config.difficulty;

  const questionTypes = parseIdList(config.question_types || config.questionTypes);
  if (questionTypes.length === 1) {
    const canonical = normalizeQuestionType(questionTypes[0]);
    if (config.coreVersion !== 'legacy' && canonical === 'DESCRIPTIVE') {
      throw new AppError('Descriptive questions are not supported in Core v1 paper generation.', 400, 'UNSUPPORTED_QUESTION_TYPE');
    }
    filter.questionType = canonical !== 'UNCLASSIFIED' ? canonical : questionTypes[0];
  }

  if (config.syllabus_exam_pattern_id || config.syllabusExamPatternId) {
    filter['syllabusMappings.examPatternId'] = config.syllabus_exam_pattern_id || config.syllabusExamPatternId;
  }
  if (config.syllabus_class_id || config.syllabusClassId) {
    filter['syllabusMappings.classId'] = config.syllabus_class_id || config.syllabusClassId;
  }
  const subjectIds = parseIdList(config.subject_ids || config.subjectIds);
  if (subjectIds.length) filter['syllabusMappings.subjectId'] = { $in: subjectIds };
  else if (config.syllabus_subject_id || config.syllabusSubjectId) {
    filter['syllabusMappings.subjectId'] = config.syllabus_subject_id || config.syllabusSubjectId;
  }
  if (config.syllabus_chapter_id || config.syllabusChapterId) {
    filter['syllabusMappings.chapterId'] = config.syllabus_chapter_id || config.syllabusChapterId;
  }
  if (config.syllabus_topic_id || config.syllabusTopicId) {
    filter['syllabusMappings.topicId'] = config.syllabus_topic_id || config.syllabusTopicId;
  }


  const bankIds = parseIdList(config.bank_ids || config.bankIds || config.bank_id || config.bankId);
  if (bankIds.length) {
    filter.bankIds = { $in: bankIds };
  }

  return filter;
}

export async function countQuestionPool(config) {
  const filter = buildQuestionFilter(config);
  const pool = (await Question.find(filter).select('_id difficulty questionType responseType subtype chapterId uploadId contextGroupId sharedContext').lean())
    .filter((question) => !question.contextGroupId || question.sharedContext?.length);

  const byDifficulty = { easy: 0, medium: 0, hard: 0 };
  const byType = { mcq: 0, descriptive: 0, numerical: 0 };
  const byCanonicalType = { MCQ_SINGLE: 0, MCQ_MULTIPLE: 0, NUMERICAL_INTEGER: 0, MATCH_FOLLOWING: 0, ASSERTION_REASON: 0, DESCRIPTIVE: 0 };
  const byResponseType = { MCQ: 0, MSQ: 0, NUMERICAL: 0 };
  const byChapter = {};

  for (const q of pool) {
    if (byDifficulty[q.difficulty] !== undefined) byDifficulty[q.difficulty] += 1;
    if (byType[q.questionType] !== undefined) byType[q.questionType] += 1;
    const canonical = normalizeQuestionType(q.questionType);
    if (byCanonicalType[canonical] !== undefined) byCanonicalType[canonical] += 1;
    if (byResponseType[q.responseType] !== undefined) byResponseType[q.responseType] += 1;
    const ch = q.chapterId?.toString() || 'unassigned';
    byChapter[ch] = (byChapter[ch] || 0) + 1;
  }

  return {
    total: pool.length,
    by_difficulty: byDifficulty,
    by_type: byType,
    by_canonical_type: byCanonicalType,
    by_response_type: byResponseType,
    by_chapter: byChapter,
    filter_applied: filter,
  };
}

function computeDifficultyTargets(total, distribution = {}, sectionOverride = null) {
  const dist = sectionOverride || distribution;
  const easyPct = dist.easy ?? 30;
  const mediumPct = dist.medium ?? 50;
  const easy = Math.round((total * easyPct) / 100);
  const medium = Math.round((total * mediumPct) / 100);
  const hard = Math.max(0, total - easy - medium);
  return { easy, medium, hard };
}

function pickFromPool(pool, needed, state) {
  const { excludeIds, usedHashes, usedQuestionIds, allowDuplicateContent } = state;
  const exclude = excludeIds;

  const candidates = shuffle(pool.filter((q) => {
      const id = q._id.toString();
      if (exclude.has(id)) return false;
      if (usedQuestionIds.has(id)) return false;
      if (!allowDuplicateContent && q.duplicateHash && usedHashes.has(q.duplicateHash)) return false;
      return true;
    }), state.random);

  const picked = [];
  for (const q of candidates) {
    if (picked.length >= needed) break;
    if (!state.allowDuplicateContent && q.duplicateHash && usedHashes.has(q.duplicateHash)) continue;
    picked.push(q);
    usedQuestionIds.add(q._id.toString());
    if (q.duplicateHash) usedHashes.add(q.duplicateHash);
  }
  return picked;
}

/** Round-robin across chapters for topic balance, then fill difficulty gaps. */
function pickBalancedSection(pool, count, distribution, state, sectionDifficulty) {
  const targets = computeDifficultyTargets(count, distribution, sectionDifficulty);
  const byDiff = {
    easy: pool.filter((q) => q.difficulty === 'easy'),
    medium: pool.filter((q) => q.difficulty === 'medium'),
    hard: pool.filter((q) => q.difficulty === 'hard'),
  };

  const selected = [];
  for (const key of ['easy', 'medium', 'hard']) {
    selected.push(...pickFromPool(byDiff[key], targets[key], state));
  }

  if (selected.length < count) {
    const byChapter = new Map();
    for (const q of pool) {
      if (selected.some((s) => s._id.toString() === q._id.toString())) continue;
      const ch = q.chapterId?.toString() || 'none';
      if (!byChapter.has(ch)) byChapter.set(ch, []);
      byChapter.get(ch).push(q);
    }
    const groups = [...byChapter.values()].map((g) => shuffle(g, state.random));
    let round = 0;
    while (selected.length < count && groups.some((g) => g.length > round)) {
      for (const group of groups) {
        if (selected.length >= count) break;
        const q = group[round];
        if (!q) continue;
        const id = q._id.toString();
        if (state.usedQuestionIds.has(id)) continue;
        if (!state.allowDuplicateContent && q.duplicateHash && state.usedHashes.has(q.duplicateHash)) continue;
        selected.push(q);
        state.usedQuestionIds.add(id);
        if (q.duplicateHash) state.usedHashes.add(q.duplicateHash);
      }
      round += 1;
    }
  }

  if (selected.length < count) {
    const remaining = pool.filter(
      (q) => !selected.some((s) => s._id.toString() === q._id.toString())
    );
    selected.push(...pickFromPool(remaining, count - selected.length, state));
  }

  return shuffle(selected, state.random).slice(0, count);
}

export async function selectQuestionsForPaper(config) {
  const generationSeed = String(config.generation_seed || config.generationSeed || randomUUID());
  const excludeIds = new Set(
    parseIdList(config.exclude_question_ids || config.excludeQuestionIds)
  );
  const state = {
    excludeIds,
    usedHashes: new Set(),
    usedQuestionIds: new Set(),
    allowDuplicateContent: config.allow_duplicate_content === true,
    random: seededRandom(generationSeed),
  };

  const filter = buildQuestionFilter(config);

  // Resolve exam type rules to restrict questionType (ExamType collection was dropped — use SyllabusNode)
  let resolvedExamTypes = [];
  const examIdList = parseIdList(config.syllabus_exam_pattern_id || config.syllabusExamPatternId || config.exam_type_ids || config.examTypeIds || config.exam_type_id || config.examTypeId);
  if (examIdList.length) {
    const { SyllabusNode } = await import('../models/SyllabusNode.js');
    resolvedExamTypes = await SyllabusNode.find({
      type: 'exam_pattern',
      isActive: true,
      $or: [
        { _id: { $in: examIdList } },
        { code: { $in: examIdList.map(c => c.toUpperCase()) } }
      ]
    });
  }

  const isJeeMain = resolvedExamTypes.some(e => e.code === 'JEE_MAIN');
  const isNeet = resolvedExamTypes.some(e => e.code === 'NEET');

  if (config.coreVersion === 'legacy' && isJeeMain) {
    // JEE Main: no descriptive questions
    filter.questionType = { $nin: ['descriptive', 'DESCRIPTIVE', 'SHORT_ANSWER', 'LONG_ANSWER'] };
    for (const spec of config.sections || []) {
      const sName = (spec.name || '').toLowerCase();
      if (sName.includes('descriptive') || sName.includes('subjective')) {
        throw new AppError('JEE Main does not allow descriptive sections.', 400, 'INVALID_SECTION_TYPE');
      }
    }
  } else if (config.coreVersion === 'legacy' && isNeet) {
    // NEET: MCQ only
    filter.questionType = { $in: ['mcq', 'MCQ_SINGLE', 'MCQ'] };
    for (const spec of config.sections || []) {
      const sName = (spec.name || '').toLowerCase();
      if (sName.includes('descriptive') || sName.includes('subjective') || sName.includes('numerical') || sName.includes('integer')) {
        throw new AppError('NEET does not allow descriptive or numerical sections.', 400, 'INVALID_SECTION_TYPE');
      }
    }
  }

  const pool = (await Question.find(filter).lean())
    .filter((question) => !question.contextGroupId || question.sharedContext?.length);
  const poolStats = await countQuestionPool(config);

  if (!pool.length) {
    throw new AppError('No approved questions match your filters', 400, 'INSUFFICIENT_QUESTIONS');
  }

  const sectionSpecs = config.sections || [];
  const resultSections = [];
  const warnings = [];

  for (const spec of sectionSpecs) {
    const count = Number(spec.questionCount || spec.question_count || 0);
    if (count <= 0) {
      resultSections.push({
        sectionId: spec.id || spec.sectionId,
        sectionName: spec.name,
        questions: [],
      });
      continue;
    }

    let sectionPool = pool;
    const sectionSubjectId = spec.subjectId || spec.subject_id;
    if (sectionSubjectId) sectionPool = sectionPool.filter((q) => (q.syllabusMappings || []).some((mapping) => String(mapping.subjectId) === String(sectionSubjectId)));
    const types = spec.question_types || (spec.question_type ? [spec.question_type] : []);
    const responseTypes = spec.response_types || spec.responseTypes || [];
    if (responseTypes.length) sectionPool = sectionPool.filter((q) => responseTypes.includes(q.responseType));
    const subtypes = spec.subtypes || [];
    if (subtypes.length) sectionPool = sectionPool.filter((q) => subtypes.includes(q.subtype));
    if (types.length) {
      const targetTypes = new Set(types.map(normalizeQuestionType).filter((type) => type !== 'UNCLASSIFIED'));
      if (config.coreVersion !== 'legacy' && types.some((type) => normalizeQuestionType(type) === 'DESCRIPTIVE')) {
        throw new AppError('Descriptive questions are not supported in Core v1 paper generation.', 400, 'UNSUPPORTED_QUESTION_TYPE');
      }
      if (targetTypes.size) {
        sectionPool = sectionPool.filter((q) => targetTypes.has(normalizeQuestionType(q.questionType)));
      } else {
        const targetCategories = types.map((type) => getQuestionCategory(type));
        sectionPool = sectionPool.filter((q) => targetCategories.includes(getQuestionCategory(q.questionType)));
      }
    }

    if (sectionPool.length < count) {
      warnings.push(
        `Section "${spec.name}": pool has ${sectionPool.length}, need ${count}`
      );
    }

    const sectionDifficulty = spec.difficulty_distribution || spec.difficultyDistribution;
    const picked = pickBalancedSection(
      sectionPool,
      count,
      config.difficulty_distribution || config.difficultyDistribution,
      state,
      sectionDifficulty
    );

    assertSufficientQuestionAvailability(spec.name || spec.id || 'Section', count, picked.length);



    resultSections.push({
      sectionId: spec.id || spec.sectionId,
      sectionName: spec.name,
      subjectId: spec.subject_id || spec.subjectId || null,
      subjectName: spec.subjectName || null,
      marksPerQuestion: Number(spec.marksPerQuestion || spec.marks_per_question || 4),
      questions: picked.map((q, orderIndex) => ({
        ...mapQuestion(q),
        custom_marks: Number(spec.marksPerQuestion || spec.marks_per_question || 4),
        custom_negative_marks: Number(spec.negativeMarksPerQuestion || spec.negative_marks_per_question || 0),
        section_id: spec.id || spec.sectionId,
        order_index: orderIndex,
      })),
    });
  }

  const totalQuestions = resultSections.reduce((sum, s) => sum + s.questions.length, 0);
  const totalMarks = resultSections.reduce(
    (sum, s) => sum + s.questions.reduce((m, q) => m + Number(q.custom_marks || 0), 0),
    0
  );

  const validation = validatePaperCounts(sectionSpecs, resultSections, config);
  validation.warnings = [...validation.warnings, ...warnings];
  if (poolStats.total < totalQuestions) {
    validation.warnings.push(`Filtered pool (${poolStats.total}) is smaller than paper size (${totalQuestions})`);
  }

  return {
    generation_seed: generationSeed,
    generation_version: 'selection-v1',
    sections: resultSections,
    total_questions: totalQuestions,
    total_marks: totalMarks,
    pool_stats: poolStats,
    validation,
  };
}

export function assertSufficientQuestionAvailability(groupName, requested, available) {
  if (available < requested) {
    throw new AppError(`Only ${available} approved questions are available for the selected filters in ${groupName}; ${requested} requested.`, 400, 'INSUFFICIENT_QUESTIONS');
  }
}

export function validatePaperCounts(sectionSpecs, resultSections, config = {}) {
  const warnings = [];
  const expectedMarks = Number(config.total_marks || config.totalMarks || 0);
  const expectedQuestions = Number(config.total_questions || config.totalQuestions || 0);

  const actualQuestions = resultSections.reduce((s, sec) => s + sec.questions.length, 0);
  const actualMarks = resultSections.reduce(
    (s, sec) => s + sec.questions.reduce((m, q) => m + Number(q.custom_marks || 0), 0),
    0
  );

  if (expectedQuestions > 0 && actualQuestions !== expectedQuestions) {
    warnings.push(`Question count ${actualQuestions} differs from target ${expectedQuestions}`);
  }
  if (expectedMarks > 0 && actualMarks !== expectedMarks) {
    warnings.push(`Total marks ${actualMarks} differs from target ${expectedMarks}`);
  }

  for (const spec of sectionSpecs) {
    const sec = resultSections.find((s) => s.sectionId === (spec.id || spec.sectionId));
    const expected = Number(spec.questionCount || spec.question_count || 0);
    const actual = sec?.questions?.length || 0;
    if (expected > 0 && actual !== expected) {
      warnings.push(`Section "${spec.name}": expected ${expected} questions, got ${actual}`);
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
    actual_questions: actualQuestions,
    actual_marks: actualMarks,
  };
}
