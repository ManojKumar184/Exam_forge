import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { OnlineTest } from '../models/OnlineTest.js';
import { Paper } from '../models/Paper.js';
import { TestAttempt } from '../models/TestAttempt.js';
import { Question } from '../models/Question.js';
import { User } from '../models/User.js';
import { Membership } from '../models/Membership.js';
import { Leaderboard } from '../models/Leaderboard.js';
import { recomputeLeaderboard } from './leaderboardService.js';
import { getQuestionCategory as getNormalizedCategory, normalizeQuestionType } from '../utils/questionTypeNormalizer.js';
import { parseNumericalAnswer } from '../utils/numericalAnswer.js';
import { AppError } from '../utils/AppError.js';
import { mapOnlineTest, mapTestAttempt, mapLeaderboardEntry, removeAnswersFromOnlineTest } from '../utils/examMapper.js';
import { mapQuestion } from '../utils/questionMapper.js';
import {
  computeGradingStatus,
  recomputeAttemptTotals,
} from './gradingService.js';
import { assertWithinEntitlement, recordUsage } from './entitlementService.js';

function shuffleOptionIndexes(options = []) {
  const indexes = options.map((_, index) => index);
  for (let i = indexes.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return indexes;
}

function effectiveExamConfig(test) {
  return { ...test.toObject?.(), ...test.examSnapshot };
}

async function buildTestFilter(query, user) {
  const filter = { institutionId: user.activeInstitutionId || user.defaultInstitutionId };
  if (user.role === 'student') {
    filter.status = { $in: ['active', 'scheduled'] };
  } else if (user.role === 'faculty' && user.membershipRole !== 'INSTITUTION_ADMIN') {
    filter.createdBy = user._id;
  }
  if (query.status) filter.status = query.status;
  if (query.search) filter.testCode = { $regex: query.search, $options: 'i' };
  if (query.paper_id) {
    filter.paperId = query.paper_id;
  } else {
    // Advanced filters: bank, subject, chapter, topic, subtopic
    const paperFilter = {};
    let filterByQuestions = false;
    const questionFilter = {};

    if (query.bank_id) {
      const bankIds = Array.isArray(query.bank_id) ? query.bank_id : String(query.bank_id).split(',').map(s => s.trim()).filter(Boolean);
      questionFilter.bankIds = { $in: bankIds };
      filterByQuestions = true;
    }

    if (query.chapter_id) {
      const chapterIds = Array.isArray(query.chapter_id) ? query.chapter_id : String(query.chapter_id).split(',').map(s => s.trim()).filter(Boolean);
      questionFilter['syllabusMappings.chapterId'] = { $in: chapterIds };
      filterByQuestions = true;
    }

    if (query.topic_id) {
      const topicIds = Array.isArray(query.topic_id) ? query.topic_id : String(query.topic_id).split(',').map(s => s.trim()).filter(Boolean);
      questionFilter['syllabusMappings.topicId'] = { $in: topicIds };
      filterByQuestions = true;
    }

    if (query.syllabus_subject_id) {
      questionFilter['syllabusMappings.subjectId'] = query.syllabus_subject_id;
      filterByQuestions = true;
    }

    if (query.syllabus_exam_pattern_id) {
      questionFilter['syllabusMappings.examPatternId'] = query.syllabus_exam_pattern_id;
      filterByQuestions = true;
    }



    if (query.subject_id && !query.syllabus_subject_id) {
      const subjectIds = Array.isArray(query.subject_id) ? query.subject_id : String(query.subject_id).split(',').map(s => s.trim()).filter(Boolean);
      paperFilter.subjectId = { $in: subjectIds };
    }

    if (query.syllabus_subject_id) {
      questionFilter['syllabusMappings.subjectId'] = query.syllabus_subject_id;
      filterByQuestions = true;
    }

    if (filterByQuestions) {
      const { Question } = await import('../models/Question.js');
      questionFilter.$or = [
        { institutionId: user.activeInstitutionId || user.defaultInstitutionId },
        { institutionId: null, visibility: 'public' },
      ];
      const matchingQuestions = await Question.find(questionFilter).select('_id').lean();
      const matchingIds = matchingQuestions.map(q => q._id);
      paperFilter['questions.questionId'] = { $in: matchingIds };
    }

    if (Object.keys(paperFilter).length > 0) {
      const { Paper } = await import('../models/Paper.js');
      paperFilter.institutionId = user.activeInstitutionId || user.defaultInstitutionId;
      const matchingPapers = await Paper.find(paperFilter).select('_id').lean();
      const paperIds = matchingPapers.map(p => p._id);
      filter.paperId = { $in: paperIds };
    }
  }
  return filter;
}

export async function listTests(query, user) {
  const filter = await buildTestFilter(query, user);
  const tests = await OnlineTest.find(filter)
    .populate({
      path: 'paperId',
      populate: [{ path: 'questions.questionId' }],
    })
    .sort({ createdAt: -1 });
  return tests.map((test) => {
    const mapped = mapOnlineTest(test);
    return user.role === 'student' ? removeAnswersFromOnlineTest(mapped) : mapped;
  });
}

export async function getTestById(id, user) {
  const studentFilter = user.role === 'student' ? { status: { $in: ['active', 'scheduled'] } } : {};
  const test = await OnlineTest.findOne({ _id: id, institutionId: user.activeInstitutionId || user.defaultInstitutionId, ...studentFilter }).populate({
    path: 'paperId',
    populate: [{ path: 'questions.questionId' }],
  });
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');

  if (user.role === 'student' && !['active', 'scheduled'].includes(test.status)) throw new AppError('Test not found', 404, 'NOT_FOUND');
  if (user.role === 'student' && !test.isPublic && !test.allowedUsers.some((id) => id.toString() === user._id.toString())) throw new AppError('Test not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && test.createdBy.toString() !== user._id.toString() && user.membershipRole !== 'INSTITUTION_ADMIN') {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  const mapped = mapOnlineTest(test);
  return user.role === 'student' ? removeAnswersFromOnlineTest(mapped) : mapped;
}

export async function createTest(body, user) {
  const institutionId = user.activeInstitutionId || user.defaultInstitutionId;
  if (institutionId) await assertWithinEntitlement(institutionId, 'onlineExams');
  const paper = await Paper.findOne({ _id: body.paper_id || body.paperId, institutionId }).populate('questions.questionId');
  if (!paper) throw new AppError('Paper not found', 404, 'PAPER_NOT_FOUND');
  if (user.role === 'faculty' && paper.createdBy.toString() !== user._id.toString() && user.membershipRole !== 'INSTITUTION_ADMIN') {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  const allowedUsers = body.allowed_users || body.allowedUsers || [];
  await validateAllowedUsers(allowedUsers, institutionId);

  const startTime = body.start_time || body.startTime || null;
  const endTime = body.end_time || body.endTime || null;
  if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
    throw new AppError('Start time must be before end time', 400, 'INVALID_SCHEDULE');
  }

  const doc = await OnlineTest.create({
    institutionId,
    paperId: paper._id,
    testCode: body.test_code || body.testCode,
    startTime: startTime,
    endTime: endTime,
    durationMinutes: Number(body.duration_minutes || body.durationMinutes || paper.durationMinutes),
    maxAttempts: Number(body.max_attempts || body.maxAttempts || 1),
    shuffleQuestions: Boolean(body.shuffle_questions ?? body.shuffleQuestions ?? true),
    shuffleOptions: Boolean(body.shuffle_options ?? body.shuffleOptions ?? true),
    showResults: Boolean(body.show_results ?? body.showResults ?? true),
    showAnswers: Boolean(body.show_answers ?? body.showAnswers ?? true),
    allowReview: Boolean(body.allow_review ?? body.allowReview ?? true),
    isPublic: Boolean(body.is_public ?? body.isPublic ?? true),
    accessCode: body.access_code || body.accessCode || null,
    allowedUsers,
    status: body.status || 'scheduled',
    createdBy: user._id,
    paperSnapshot: {
      ...paper.toObject(),
      questions: (paper.questions || []).map((paperQuestion) => ({
        ...paperQuestion.toObject(),
        questionId: paperQuestion.questionId?._id || paperQuestion.questionId,
        contentSnapshot: paperQuestion.contentSnapshot || (paperQuestion.questionId?.questionText ? mapQuestion(paperQuestion.questionId) : null),
      })),
    },
    examSnapshot: {
      startTime,
      endTime,
      durationMinutes: Number(body.duration_minutes || body.durationMinutes || paper.durationMinutes),
      maxAttempts: Number(body.max_attempts || body.maxAttempts || 1),
      shuffleQuestions: Boolean(body.shuffle_questions ?? body.shuffleQuestions ?? true),
      shuffleOptions: Boolean(body.shuffle_options ?? body.shuffleOptions ?? true),
      showResults: Boolean(body.show_results ?? body.showResults ?? true),
      showAnswers: Boolean(body.show_answers ?? body.showAnswers ?? true),
      allowReview: Boolean(body.allow_review ?? body.allowReview ?? true),
      isPublic: Boolean(body.is_public ?? body.isPublic ?? true),
      accessCode: body.access_code || body.accessCode || null,
      allowedUsers,
    },
  });
  if (institutionId) await recordUsage(institutionId, 'onlineExams');
  await doc.populate('paperId');
  return mapOnlineTest(doc);
}

export async function updateTest(id, body, user) {
  const test = await OnlineTest.findOne({ _id: id, institutionId: user.activeInstitutionId || user.defaultInstitutionId });
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && test.createdBy.toString() !== user._id.toString() && user.membershipRole !== 'INSTITUTION_ADMIN') {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  const hasAttempts = await TestAttempt.exists({ testId: test._id });
  const examSettings = ['allowed_users', 'allowedUsers', 'start_time', 'end_time', 'duration_minutes', 'shuffle_questions', 'shuffle_options', 'show_results', 'show_answers', 'allow_review', 'is_public'];
  if (hasAttempts && examSettings.some((key) => body[key] !== undefined)) {
    throw new AppError('Exam settings are locked after the first attempt has started.', 409, 'TEST_CONFIGURATION_LOCKED');
  }
  if (body.allowed_users !== undefined || body.allowedUsers !== undefined) {
    const ids = body.allowed_users ?? body.allowedUsers;
    await validateAllowedUsers(ids, test.institutionId);
    test.allowedUsers = ids;
  }

  const startTime = body.start_time !== undefined ? (body.start_time || null) : test.startTime;
  const endTime = body.end_time !== undefined ? (body.end_time || null) : test.endTime;
  if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
    throw new AppError('Start time must be before end time', 400, 'INVALID_SCHEDULE');
  }

  if (body.start_time !== undefined) test.startTime = body.start_time || null;
  if (body.end_time !== undefined) test.endTime = body.end_time || null;
  if (body.status !== undefined) test.status = body.status;
  if (body.duration_minutes !== undefined) test.durationMinutes = Number(body.duration_minutes);
  if (body.shuffle_questions !== undefined) test.shuffleQuestions = Boolean(body.shuffle_questions);
  if (body.shuffle_options !== undefined) test.shuffleOptions = Boolean(body.shuffle_options);
  if (body.show_results !== undefined) test.showResults = Boolean(body.show_results);
  if (body.show_answers !== undefined) test.showAnswers = Boolean(body.show_answers);
  if (body.allow_review !== undefined) test.allowReview = Boolean(body.allow_review);
  if (body.is_public !== undefined) test.isPublic = Boolean(body.is_public);

  if (!hasAttempts) {
    test.examSnapshot = {
      startTime: test.startTime,
      endTime: test.endTime,
      durationMinutes: test.durationMinutes,
      maxAttempts: test.maxAttempts,
      shuffleQuestions: test.shuffleQuestions,
      shuffleOptions: test.shuffleOptions,
      showResults: test.showResults,
      showAnswers: test.showAnswers,
      allowReview: test.allowReview,
      isPublic: test.isPublic,
      accessCode: test.accessCode,
      allowedUsers: test.allowedUsers,
    };
  }

  await test.save();
  await test.populate('paperId');
  return mapOnlineTest(test);
}

async function validateAllowedUsers(ids, institutionId) {
  if (!ids?.length) return;
  if (ids.some((id) => !mongoose.isValidObjectId(id))) throw new AppError('allowedUsers contains an invalid user ID', 400, 'INVALID_ALLOWED_USERS');
  if (new Set(ids.map(String)).size !== ids.length) throw new AppError('allowedUsers contains duplicates', 400, 'INVALID_ALLOWED_USERS');
  const users = await User.find({ _id: { $in: ids }, role: 'student', isActive: true, approvalStatus: 'approved' }).select('_id').lean();
  const userIds = users.map((u) => u._id);
  const members = await Membership.find({ userId: { $in: userIds }, institutionId, role: 'STUDENT', status: 'ACTIVE' }).select('userId').lean();
  if (users.length !== ids.length || members.length !== ids.length) {
    throw new AppError('Every allowed user must be an active student in this institution', 400, 'INVALID_ALLOWED_USERS');
  }
}

export async function deleteTest(id, user) {
  const test = await OnlineTest.findOne({ _id: id, institutionId: user.activeInstitutionId || user.defaultInstitutionId });
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && test.createdBy.toString() !== user._id.toString() && user.membershipRole !== 'INSTITUTION_ADMIN') {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  await OnlineTest.findByIdAndDelete(id);
  await TestAttempt.deleteMany({ testId: id });
  await Leaderboard.deleteMany({ testId: id });
}

export async function startAttempt(testId, user, accessCode = null) {
  const test = await OnlineTest.findOne({ _id: testId, institutionId: user.activeInstitutionId || user.defaultInstitutionId }).populate({
    path: 'paperId',
    populate: [{ path: 'questions.questionId' }],
  });
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');
  const exam = effectiveExamConfig(test);

  if (user.role === 'student' && !['active', 'scheduled'].includes(test.status)) throw new AppError('Test not found', 404, 'NOT_FOUND');

  if (user.role === 'student' && !exam.isPublic && !(exam.allowedUsers || []).some((id) => id.toString() === user._id.toString())) {
    throw new AppError('Test not found', 404, 'NOT_FOUND');
  }

  const now = Date.now();
  if (exam.startTime && now < new Date(exam.startTime).getTime()) {
    throw new AppError('Test has not started yet', 400, 'TEST_NOT_STARTED');
  }
  if (exam.endTime && now > new Date(exam.endTime).getTime()) {
    throw new AppError('Test has ended', 400, 'TEST_ENDED');
  }

  let attempt = await TestAttempt.findOne({
    testId: test._id,
    userId: user._id,
    status: 'in_progress',
  }).populate('testId');

  if (!attempt) {
      if (exam.accessCode && exam.accessCode.trim() !== '') {
      if (!accessCode || accessCode.trim() !== exam.accessCode.trim()) {
        throw new AppError('Access code required or invalid', 403, 'INVALID_ACCESS_CODE');
      }
    }
    const count = await TestAttempt.countDocuments({ testId: test._id, userId: user._id });
    if (count >= (test.maxAttempts || 1)) {
      attempt = await TestAttempt.findOne({ testId: test._id, userId: user._id, status: 'in_progress' }).populate('testId');
      if (!attempt) throw new AppError('Maximum attempts reached', 400, 'MAX_ATTEMPTS_REACHED');
    }

    if (!attempt) {
      const attemptPaper = test.paperSnapshot || test.paperId;
      const shuffledQuestions = [...(attemptPaper?.questions || [])];
      if (exam.shuffleQuestions) {
        // Use a stable attempt seed and unbiased Fisher-Yates shuffle. Persisted
        // answer order is the authoritative presentation order on every reload.
        for (let i = shuffledQuestions.length - 1; i > 0; i -= 1) {
          const j = crypto.randomInt(i + 1);
          [shuffledQuestions[i], shuffledQuestions[j]] = [shuffledQuestions[j], shuffledQuestions[i]];
        }
      }

      try {
        const attemptAnswers = shuffledQuestions.map((pq) => {
          const section = attemptPaper?.sections?.find((candidate) => candidate.name === pq.section);
          const questionSnapshot = pq.contentSnapshot || (pq.questionId?.questionText ? mapQuestion(pq.questionId) : null);
          const options = questionSnapshot?.options || [];
          return {
            questionId: pq.questionId?._id || pq.questionId,
            contentSnapshot: questionSnapshot,
            optionOrder: exam.shuffleOptions ? shuffleOptionIndexes(options) : options.map((_, index) => index),
            marksSnapshot: Number(pq.customMarks ?? section?.marksPerQuestion ?? 4),
            negativeMarksSnapshot: Number(pq.customNegativeMarks ?? section?.negativeMarksPerQuestion ?? 0),
            selectedOption: null,
            numericalAnswer: null,
            textAnswer: null,
            isMarkedForReview: false,
            timeSpentSeconds: 0,
          };
        });
        attempt = await TestAttempt.create({
          testId: test._id,
          userId: user._id,
          institutionId: test.institutionId,
          attemptNumber: count + 1,
          status: 'in_progress',
          maxScore: attemptAnswers.reduce((sum, answer) => sum + answer.marksSnapshot, 0),
          answers: attemptAnswers,
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        // Concurrent starters race on the unique attempt number. Reuse the
        // winner's in-progress attempt; do not turn the race into a 500.
        attempt = await TestAttempt.findOne({ testId: test._id, userId: user._id, status: 'in_progress' }).populate('testId');
        if (!attempt) {
          const actualCount = await TestAttempt.countDocuments({ testId: test._id, userId: user._id });
          if (actualCount >= (test.maxAttempts || 1)) throw new AppError('Maximum attempts reached', 400, 'MAX_ATTEMPTS_REACHED');
          throw error;
        }
      }
    }
  }

  await attempt.populate('testId');
  return {
    test: user.role === 'student' ? removeAnswersFromOnlineTest(mapOnlineTest(test)) : mapOnlineTest(test),
    attempt: mapTestAttempt(attempt),
  };
}

export async function autosaveAttempt(testId, user, payload) {
  const attempt = await TestAttempt.findOne({
    testId,
    userId: user._id,
    status: 'in_progress',
  });
  if (!attempt) throw new AppError('Active attempt not found', 404, 'ATTEMPT_NOT_FOUND');

  const test = await OnlineTest.findOne({ _id: testId, institutionId: user.activeInstitutionId || user.defaultInstitutionId }).select('durationMinutes endTime examSnapshot').lean();
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');
  const exam = { ...test, ...test.examSnapshot };
  const endsAt = Math.min(
    attempt.startedAt.getTime() + Number(exam.durationMinutes) * 60000,
    exam.endTime ? new Date(exam.endTime).getTime() : Number.POSITIVE_INFINITY,
  );
  if (Date.now() >= endsAt) {
    await submitAttempt(testId, user, { auto: true });
    throw new AppError('The exam time has expired and your attempt was submitted.', 409, 'TEST_TIME_EXPIRED');
  }

  if (Array.isArray(payload.answers)) {
    const existing = new Map(attempt.answers.map((a) => [a.questionId.toString(), a]));
    const selectedQuestionIds = payload.answers
      .filter((answer) => answer.selected_options !== undefined || answer.selected_option !== undefined)
      .map((answer) => answer.question_id || answer.questionId)
      .filter(Boolean);
    const selectedQuestions = await Question.find({ _id: { $in: selectedQuestionIds } }).select('_id options').lean();
    const optionCounts = new Map(selectedQuestions.map((question) => [question._id.toString(), question.options?.length || 0]));
    const updates = {};
    const arrayFilters = [];
    for (const [index, incoming] of payload.answers.entries()) {
      const key = (incoming.question_id || incoming.questionId || '').toString();
      if (!key) continue;
      const row = existing.get(key);
      if (!row) continue;
      const identifier = `answer${index}`;
      const answerUpdates = {};
      if (incoming.selected_option !== undefined) {
        const selected = incoming.selected_option;
        const optionCount = row.contentSnapshot?.options?.length ?? optionCounts.get(key);
        if (selected !== null && (!Number.isInteger(selected) || selected < 0 || optionCount === undefined || selected >= optionCount)) {
          throw new AppError('selected_option must be a valid option index', 400, 'INVALID_SELECTED_OPTION');
        }
        answerUpdates[`answers.$[${identifier}].selectedOption`] = selected;
      }
      if (incoming.selected_options !== undefined) {
        const values = incoming.selected_options;
        const optionCount = row.contentSnapshot?.options?.length ?? optionCounts.get(key);
        if (!Array.isArray(values) || optionCount === undefined || values.some((index) => !Number.isInteger(index) || index < 0 || index >= optionCount) || new Set(values).size !== values.length) {
          throw new AppError('selected_options must contain unique valid option indices', 400, 'INVALID_SELECTED_OPTIONS');
        }
        answerUpdates[`answers.$[${identifier}].selectedOptions`] = values;
      }
      if (incoming.numerical_answer !== undefined) {
        const parsed = incoming.numerical_answer === null ? null : parseNumericalAnswer(incoming.numerical_answer);
        if (incoming.numerical_answer !== null && parsed === null) throw new AppError('Enter a valid numerical answer', 400, 'INVALID_NUMERICAL_ANSWER');
        if (parsed !== null && row.contentSnapshot?.subtype === 'INTEGER_RESPONSE' && !Number.isInteger(parsed)) throw new AppError('Enter a whole number for this answer', 400, 'INVALID_INTEGER_ANSWER');
        answerUpdates[`answers.$[${identifier}].numericalAnswer`] = parsed;
      }
      if (incoming.text_answer !== undefined) answerUpdates[`answers.$[${identifier}].textAnswer`] = incoming.text_answer;
      if (incoming.is_marked_for_review !== undefined) answerUpdates[`answers.$[${identifier}].isMarkedForReview`] = incoming.is_marked_for_review;
      if (incoming.time_spent_seconds !== undefined) {
        answerUpdates[`answers.$[${identifier}].timeSpentSeconds`] = Number(incoming.time_spent_seconds || 0);
      }
      if (!Object.keys(answerUpdates).length) continue;
      answerUpdates[`answers.$[${identifier}].answeredAt`] = new Date();
      Object.assign(updates, answerUpdates);
      arrayFilters.push({ [`${identifier}.questionId`]: row.questionId });
    }
    if (Object.keys(updates).length) {
      await TestAttempt.updateOne({ _id: attempt._id, status: 'in_progress' }, { $set: updates }, { arrayFilters });
    }
  }
  const timeUpdate = {};
  if (payload.time_spent_seconds !== undefined) {
    timeUpdate.$max = { timeSpentSeconds: Number(payload.time_spent_seconds || 0) };
  }
  if (Object.keys(timeUpdate).length) await TestAttempt.updateOne({ _id: attempt._id, status: 'in_progress' }, timeUpdate);
  const updated = await TestAttempt.findOne({ _id: attempt._id, status: 'in_progress' });
  if (!updated) throw new AppError('Attempt is no longer editable', 409, 'ATTEMPT_NOT_ACTIVE');
  return mapTestAttempt(updated);
}

function getQuestionCategory(type) {
  return getNormalizedCategory(type);
}

export function scoreAnswer(answer, question, marks, negativeMarks = 0) {
  if (!question) return { isCorrect: null, marks: 0, skipped: true };
  // Attempt snapshots are API-mapped objects (snake_case); normalize both
  // snapshot and populated Mongoose documents for the same grading logic.
  question = {
    ...question,
    questionType: question.questionType || question.question_type,
    canonicalContent: question.canonicalContent || question.canonical_content,
    correctOption: question.correctOption ?? question.correct_option,
    correctAnswers: question.correctAnswers || question.correct_answers,
    numericalAnswer: question.numericalAnswer ?? question.numerical_answer,
    numericalTolerance: question.numericalTolerance ?? question.numerical_tolerance,
    numericalComparisonPolicy: question.numericalComparisonPolicy ?? question.numerical_comparison_policy,
    subtype: question.subtype,
    answerText: question.answerText ?? question.answer_text,
    answerKey: question.answerKey ?? question.answer_key,
  };
  const category = getQuestionCategory(question.questionType);
  const canonicalAnswer = question.canonicalContent?.answer;
  const canonicalValue = canonicalAnswer && typeof canonicalAnswer === 'object' && !Array.isArray(canonicalAnswer)
    ? canonicalAnswer.value
    : canonicalAnswer;
  if (category === 'mcq') {
    if (normalizeQuestionType(question.questionType) === 'MCQ_MULTIPLE') {
      const selected = (answer.selectedOptions?.length ? answer.selectedOptions : (answer.selectedOption == null ? [] : [answer.selectedOption])).map(Number).sort((a, b) => a - b);
      if (!selected.length) return { isCorrect: null, marks: 0, skipped: true };
      const correct = (Array.isArray(canonicalAnswer) ? canonicalAnswer : question.correctAnswers || []).map((value) => {
        const label = String(value).trim().toUpperCase();
        return /^[A-H]$/.test(label) ? label.charCodeAt(0) - 65 : Number(label);
      }).filter(Number.isInteger).sort((a, b) => a - b);
      const isCorrect = correct.length > 0 && selected.length === correct.length && selected.every((value, index) => value === correct[index]);
      return { isCorrect, marks: isCorrect ? marks : -Math.abs(negativeMarks), skipped: false };
    }
    if (answer.selectedOption === null || answer.selectedOption === undefined) {
      return { isCorrect: null, marks: 0, skipped: true };
    }
    const expected = canonicalAnswer !== undefined && canonicalAnswer !== null ? canonicalValue : question.correctOption;
    const expectedLabel = String(expected ?? '').trim().toUpperCase();
    const expectedIndex = Number.isInteger(Number(expected)) && String(expected).trim() !== ''
      ? Number(expected)
      : (question.canonicalContent?.options || question.options || []).findIndex((option, index) => String(option.label || String.fromCharCode(65 + index)).toUpperCase() === expectedLabel);
    const isCorrect = expected !== null && expected !== undefined && expectedIndex >= 0 && expectedIndex === Number(answer.selectedOption);
    return { isCorrect, marks: isCorrect ? marks : -Math.abs(negativeMarks), skipped: false };
  }
  if (category === 'numerical') {
    const submittedValue = answer.numericalAnswer === null || answer.numericalAnswer === undefined ? null : parseNumericalAnswer(answer.numericalAnswer);
    if (submittedValue === null) {
      return { isCorrect: null, marks: 0, skipped: true };
    }
    const tolerance = Number(canonicalAnswer?.tolerance ?? question.numericalTolerance ?? 0);
    const expectedValue = parseNumericalAnswer(canonicalValue ?? question.numericalAnswer);
    if (question.subtype === 'INTEGER_RESPONSE' && (!Number.isInteger(submittedValue) || !Number.isInteger(expectedValue))) return { isCorrect: false, marks: -Math.abs(negativeMarks), skipped: false };
    const policy = canonicalAnswer?.comparisonPolicy || question.numericalComparisonPolicy || 'EXACT';
    const isCorrect = expectedValue !== null && (policy === 'TOLERANCE'
      ? Math.abs(submittedValue - expectedValue) <= tolerance
      : submittedValue === expectedValue);
    return { isCorrect, marks: isCorrect ? marks : -Math.abs(negativeMarks), skipped: false };
  }
  if (category === 'fill_blank') {
    const response = String(answer.textAnswer || '').trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
    if (!response) return { isCorrect: null, marks: 0, skipped: true };
    const acceptedAnswers = [
      ...(Array.isArray(canonicalAnswer) ? canonicalAnswer : question.correctAnswers || []),
      ...(canonicalAnswer && typeof canonicalAnswer === 'object' ? (canonicalAnswer.acceptedAnswers || []) : []),
      canonicalAnswer != null && !Array.isArray(canonicalAnswer) && typeof canonicalAnswer !== 'object' ? canonicalAnswer : question.answerText,
      question.answerKey,
    ].filter(Boolean).map(value => String(value).trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase());
    const isCorrect = acceptedAnswers.length > 0 && acceptedAnswers.includes(response);
    return { isCorrect, marks: isCorrect ? marks : -Math.abs(negativeMarks), skipped: false };
  }
  // descriptive evaluated later by faculty; keep pending
  if (!answer.textAnswer) return { isCorrect: null, marks: 0, skipped: true };
  return { isCorrect: null, marks: 0, skipped: false };
}


export async function submitAttempt(testId, user, { auto = false } = {}) {
  const institutionId = user.activeInstitutionId || user.defaultInstitutionId;
  const claimId = crypto.randomUUID();
  const attempt = await TestAttempt.findOneAndUpdate({
    testId,
    userId: user._id,
    institutionId,
    $or: [
      { status: 'in_progress' },
      { status: 'submitting', submissionStartedAt: { $lt: new Date(Date.now() - 60_000) } },
    ],
  }, {
    $set: { status: 'submitting', submissionStartedAt: new Date(), submissionClaimId: claimId },
  }, { new: true });
  if (!attempt) {
    const alreadySubmitted = await TestAttempt.findOne({ testId, userId: user._id, institutionId, status: { $in: ['submitted', 'auto_submitted'] } }).sort({ submittedAt: -1 });
    if (alreadySubmitted) return mapTestAttempt(alreadySubmitted);
    const submissionInProgress = await TestAttempt.exists({ testId, userId: user._id, institutionId, status: 'submitting' });
    if (submissionInProgress) throw new AppError('Submission is already being processed', 409, 'SUBMISSION_IN_PROGRESS');
    throw new AppError('Active attempt not found', 404, 'ATTEMPT_NOT_FOUND');
  }

  try {
  const test = await OnlineTest.findOne({ _id: testId, institutionId: user.activeInstitutionId || user.defaultInstitutionId }).populate({
    path: 'paperId',
    populate: [{ path: 'questions.questionId' }],
  });
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');
  const exam = effectiveExamConfig(test);
  const serverEnd = Math.min(
    attempt.startedAt.getTime() + Number(exam.durationMinutes) * 60000,
    exam.endTime ? new Date(exam.endTime).getTime() : Number.POSITIVE_INFINITY,
  );
  const timedOut = Date.now() >= serverEnd;

  const attemptPaper = test.paperSnapshot || test.paperId;
  const questionMap = new Map(
    (attemptPaper?.questions || []).map((pq) => {
      const sectionName = pq.section || 'A';
      const sectionObj = attemptPaper?.sections?.find(s => s.name === sectionName || s.id === sectionName);
      const defaultNegMarks = sectionObj?.negativeMarksPerQuestion || 0;
      const negativeMarks = pq.customNegativeMarks !== null && pq.customNegativeMarks !== undefined
        ? pq.customNegativeMarks
        : defaultNegMarks;

      return [
        (pq.questionId?._id || pq.questionId).toString(),
        {
          question: pq.contentSnapshot || (pq.questionId?.questionText ? mapQuestion(pq.questionId) : pq.questionId),
          marks: Number(pq.customMarks !== null && pq.customMarks !== undefined ? pq.customMarks : (sectionObj?.marksPerQuestion ?? 4)),
          negativeMarks: Number(negativeMarks || 0),
        },
      ];
    })
  );

  let score = 0;
  let correct = 0;
  let wrong = 0;
  let skipped = 0;

  for (const answer of attempt.answers) {
    const entry = questionMap.get(answer.questionId.toString());
    const maxMarks = answer.marksSnapshot ?? entry?.marks ?? 0;
    const negativeMarks = answer.negativeMarksSnapshot ?? entry?.negativeMarks ?? 0;
    answer.maxMarks = maxMarks;
    const evalResult = scoreAnswer(answer, answer.contentSnapshot || entry?.question, maxMarks, negativeMarks);
    answer.isCorrect = evalResult.isCorrect;
    answer.marksObtained = evalResult.marks;
    if (evalResult.skipped) {
      skipped += 1;
    } else if (evalResult.isCorrect === true) {
      correct += 1;
    } else if (evalResult.isCorrect === false) {
      wrong += 1;
    }
    score += evalResult.marks;
  }

  const maxScore = attempt.answers.length
    ? attempt.answers.reduce((sum, answer) => sum + Number(answer.marksSnapshot ?? questionMap.get(answer.questionId.toString())?.marks ?? 0), 0)
    : attempt.maxScore;

  attempt.status = auto || timedOut ? 'auto_submitted' : 'submitted';
  attempt.submittedAt = new Date();
  attempt.correctAnswers = correct;
  attempt.wrongAnswers = wrong;
  attempt.skippedAnswers = skipped;
  attempt.score = score;
  attempt.maxScore = maxScore;
  attempt.percentage = maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(2)) : 0;
  attempt.gradingStatus = computeGradingStatus(attempt, questionMap);
  recomputeAttemptTotals(attempt, questionMap);
  const finalized = await TestAttempt.findOneAndUpdate({ _id: attempt._id, status: 'submitting', submissionClaimId: claimId }, {
    $set: {
      status: attempt.status,
      submittedAt: attempt.submittedAt,
      correctAnswers: attempt.correctAnswers,
      wrongAnswers: attempt.wrongAnswers,
      skippedAnswers: attempt.skippedAnswers,
      score: attempt.score,
      maxScore: attempt.maxScore,
      percentage: attempt.percentage,
      gradingStatus: attempt.gradingStatus,
      answers: attempt.answers,
      submissionClaimId: null,
    },
  }, { new: true, runValidators: true });
  if (!finalized) throw new AppError('Submission could not be finalized. Please retry.', 409, 'SUBMISSION_CLAIM_LOST');

  await recomputeLeaderboard(test._id);
  await finalized.populate('testId');
  return mapTestAttempt(finalized);
  } catch (error) {
    await TestAttempt.updateOne({ _id: attempt._id, status: 'submitting', submissionClaimId: claimId }, {
      $set: { status: 'in_progress', submissionStartedAt: null, submissionClaimId: null },
    }).catch(() => {});
    throw error;
  }
}

export async function getAttemptHistory(user, testId = null) {
  const filter = { institutionId: user.activeInstitutionId || user.defaultInstitutionId };
  if (user.role === 'student') filter.userId = user._id;
  else if (user.role === 'faculty' && user.membershipRole !== 'INSTITUTION_ADMIN') {
    const ownedTests = await OnlineTest.find({ institutionId: filter.institutionId, createdBy: user._id }).select('_id').lean();
    const ownedIds = ownedTests.map((test) => test._id);
    filter.testId = testId ? { $in: ownedIds.filter((id) => id.toString() === testId.toString()) } : { $in: ownedIds };
  } else if (testId) {
    filter.testId = testId;
  }
  const attempts = await TestAttempt.find(filter).populate('testId').sort({ createdAt: -1 });
  return attempts.map(mapTestAttempt);
}

export async function getLeaderboard(testId, user) {
  await getTestById(testId, user);
  const test = await OnlineTest.findOne({ _id: testId, institutionId: user.activeInstitutionId || user.defaultInstitutionId }).select('_id status').lean();
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');
  const rows = await Leaderboard.find({ testId })
    .populate('userId')
    .sort({ rank: 1, score: -1 });
  return rows.map(mapLeaderboardEntry);
}

