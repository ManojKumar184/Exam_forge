import { Question } from '../models/Question.js';
import { AppError } from '../utils/AppError.js';
import { mapQuestion } from '../utils/questionMapper.js';

function parseIdList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildQuestionFilter(config) {
  const filter = { status: 'approved' };

  const classes = parseIdList(config.classes || config.class_list).map(Number).filter((n) => n >= 6);
  if (classes.length) filter.class = { $in: classes };
  else if (config.class) filter.class = Number(config.class);

  const subjectIds = parseIdList(config.subject_ids || config.subjectIds);
  if (subjectIds.length) filter.subjectId = { $in: subjectIds };
  else if (config.subject_id || config.subjectId) {
    filter.subjectId = config.subject_id || config.subjectId;
  }

  const chapterIds = parseIdList(config.chapter_ids || config.chapterIds);
  if (chapterIds.length) filter.chapterId = { $in: chapterIds };

  const examTypeIds = parseIdList(config.exam_type_ids || config.examTypeIds);
  if (examTypeIds.length) filter.examTypeId = { $in: examTypeIds };
  else if (config.exam_type_id || config.examTypeId) {
    filter.examTypeId = config.exam_type_id || config.examTypeId;
  }

  const difficulties = parseIdList(config.difficulties || config.difficulty_list);
  if (difficulties.length) filter.difficulty = { $in: difficulties };
  else if (config.difficulty) filter.difficulty = config.difficulty;

  const questionTypes = parseIdList(config.question_types || config.questionTypes);
  if (questionTypes.length === 1) filter.questionType = questionTypes[0];

  return filter;
}

export async function countQuestionPool(config) {
  const filter = buildQuestionFilter(config);
  const pool = await Question.find(filter).select('_id difficulty questionType chapterId uploadId').lean();

  const byDifficulty = { easy: 0, medium: 0, hard: 0 };
  const byType = { mcq: 0, descriptive: 0, numerical: 0 };
  const byChapter = {};

  for (const q of pool) {
    if (byDifficulty[q.difficulty] !== undefined) byDifficulty[q.difficulty] += 1;
    if (byType[q.questionType] !== undefined) byType[q.questionType] += 1;
    const ch = q.chapterId?.toString() || 'unassigned';
    byChapter[ch] = (byChapter[ch] || 0) + 1;
  }

  return {
    total: pool.length,
    by_difficulty: byDifficulty,
    by_type: byType,
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
  const { excludeIds, usedHashes, usedQuestionIds } = state;
  const exclude = excludeIds;

  const candidates = shuffle(
    pool.filter((q) => {
      const id = q._id.toString();
      if (exclude.has(id)) return false;
      if (usedQuestionIds.has(id)) return false;
      if (q.duplicateHash && usedHashes.has(q.duplicateHash)) return false;
      return true;
    })
  );

  const picked = [];
  for (const q of candidates) {
    if (picked.length >= needed) break;
    if (q.duplicateHash && usedHashes.has(q.duplicateHash)) continue;
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
    const groups = [...byChapter.values()].map((g) => shuffle(g));
    let round = 0;
    while (selected.length < count && groups.some((g) => g.length > round)) {
      for (const group of groups) {
        if (selected.length >= count) break;
        const q = group[round];
        if (!q) continue;
        const id = q._id.toString();
        if (state.usedQuestionIds.has(id)) continue;
        if (q.duplicateHash && state.usedHashes.has(q.duplicateHash)) continue;
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

  return shuffle(selected).slice(0, count);
}

export async function selectQuestionsForPaper(config) {
  const excludeIds = new Set(
    parseIdList(config.exclude_question_ids || config.excludeQuestionIds)
  );
  const state = {
    excludeIds,
    usedHashes: new Set(),
    usedQuestionIds: new Set(),
  };

  const filter = buildQuestionFilter(config);
  const pool = await Question.find(filter).lean();
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
    const types = spec.question_types || (spec.question_type ? [spec.question_type] : []);
    if (types.length) {
      sectionPool = pool.filter((q) => types.includes(q.questionType));
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



    resultSections.push({
      sectionId: spec.id || spec.sectionId,
      sectionName: spec.name,
      marksPerQuestion: Number(spec.marksPerQuestion || spec.marks_per_question || 4),
      questions: picked.map((q, orderIndex) => ({
        ...mapQuestion(q),
        custom_marks: Number(spec.marksPerQuestion || spec.marks_per_question || q.marks || 4),
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
    sections: resultSections,
    total_questions: totalQuestions,
    total_marks: totalMarks,
    pool_stats: poolStats,
    validation,
  };
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
