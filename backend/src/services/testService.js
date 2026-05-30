import { OnlineTest } from '../models/OnlineTest.js';
import { Paper } from '../models/Paper.js';
import { TestAttempt } from '../models/TestAttempt.js';
import { Leaderboard } from '../models/Leaderboard.js';
import { recomputeLeaderboard } from './leaderboardService.js';
import { AppError } from '../utils/AppError.js';
import { mapOnlineTest, mapTestAttempt, mapLeaderboardEntry } from '../utils/examMapper.js';
import {
  computeGradingStatus,
  recomputeAttemptTotals,
} from './gradingService.js';

function buildTestFilter(query, user) {
  const filter = {};
  if (user.role === 'student') {
    filter.status = { $in: ['active', 'scheduled'] };
  } else if (user.role === 'faculty') {
    filter.createdBy = user._id;
  }
  if (query.status) filter.status = query.status;
  if (query.search) filter.testCode = { $regex: query.search, $options: 'i' };
  if (query.paper_id) filter.paperId = query.paper_id;
  return filter;
}

export async function listTests(query, user) {
  const tests = await OnlineTest.find(buildTestFilter(query, user))
    .populate({
      path: 'paperId',
      populate: ['subjectId', 'examTypeId', { path: 'questions.questionId' }],
    })
    .sort({ createdAt: -1 });
  return tests.map(mapOnlineTest);
}

export async function getTestById(id, user) {
  const test = await OnlineTest.findById(id).populate({
    path: 'paperId',
    populate: ['subjectId', 'examTypeId', { path: 'questions.questionId' }],
  });
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && test.createdBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return mapOnlineTest(test);
}

export async function createTest(body, user) {
  const paper = await Paper.findById(body.paper_id || body.paperId);
  if (!paper) throw new AppError('Paper not found', 404, 'PAPER_NOT_FOUND');
  if (user.role === 'faculty' && paper.createdBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const startTime = body.start_time || body.startTime || null;
  const endTime = body.end_time || body.endTime || null;
  if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
    throw new AppError('Start time must be before end time', 400, 'INVALID_SCHEDULE');
  }

  const doc = await OnlineTest.create({
    paperId: paper._id,
    testCode: body.test_code || body.testCode,
    startTime: startTime,
    endTime: endTime,
    durationMinutes: Number(body.duration_minutes || body.durationMinutes || paper.durationMinutes),
    maxAttempts: Number(body.max_attempts || body.maxAttempts || 1),
    shuffleQuestions: Boolean(body.shuffle_questions ?? body.shuffleQuestions ?? true),
    shuffleOptions: Boolean(body.shuffle_options ?? body.shuffleOptions ?? true),
    showResults: Boolean(body.show_results ?? body.showResults ?? true),
    showAnswers: Boolean(body.show_answers ?? body.showAnswers ?? false),
    allowReview: Boolean(body.allow_review ?? body.allowReview ?? true),
    isPublic: Boolean(body.is_public ?? body.isPublic ?? true),
    accessCode: body.access_code || body.accessCode || null,
    allowedUsers: body.allowed_users || body.allowedUsers || [],
    status: body.status || 'scheduled',
    createdBy: user._id,
  });
  await doc.populate('paperId');
  return mapOnlineTest(doc);
}

export async function updateTest(id, body, user) {
  const test = await OnlineTest.findById(id);
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && test.createdBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
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

  await test.save();
  await test.populate('paperId');
  return mapOnlineTest(test);
}

export async function deleteTest(id, user) {
  const test = await OnlineTest.findById(id);
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && test.createdBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  await OnlineTest.findByIdAndDelete(id);
  await TestAttempt.deleteMany({ testId: id });
  await Leaderboard.deleteMany({ testId: id });
}

export async function startAttempt(testId, user, accessCode = null) {
  const test = await OnlineTest.findById(testId).populate({
    path: 'paperId',
    populate: [{ path: 'questions.questionId' }, 'subjectId', 'examTypeId'],
  });
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');

  const now = Date.now();
  if (test.startTime && now < new Date(test.startTime).getTime()) {
    throw new AppError('Test has not started yet', 400, 'TEST_NOT_STARTED');
  }
  if (test.endTime && now > new Date(test.endTime).getTime()) {
    throw new AppError('Test has ended', 400, 'TEST_ENDED');
  }

  let attempt = await TestAttempt.findOne({
    testId: test._id,
    userId: user._id,
    status: 'in_progress',
  }).populate('testId');

  if (!attempt) {
    if (test.accessCode && test.accessCode.trim() !== '') {
      if (!accessCode || accessCode.trim() !== test.accessCode.trim()) {
        throw new AppError('Access code required or invalid', 403, 'INVALID_ACCESS_CODE');
      }
    }
    const count = await TestAttempt.countDocuments({ testId: test._id, userId: user._id });
    if (count >= (test.maxAttempts || 1)) {
      throw new AppError('Maximum attempts reached', 400, 'MAX_ATTEMPTS_REACHED');
    }

    const shuffledQuestions = [...(test.paperId?.questions || [])];
    if (test.shuffleQuestions) shuffledQuestions.sort(() => Math.random() - 0.5);

    attempt = await TestAttempt.create({
      testId: test._id,
      userId: user._id,
      attemptNumber: count + 1,
      status: 'in_progress',
      maxScore: shuffledQuestions.reduce((sum, q) => sum + Number(q.customMarks || 0), 0),
      answers: shuffledQuestions.map((pq) => ({
        questionId: pq.questionId?._id || pq.questionId,
        selectedOption: null,
        numericalAnswer: null,
        textAnswer: null,
        isMarkedForReview: false,
        timeSpentSeconds: 0,
      })),
    });
  }

  await attempt.populate('testId');
  return {
    test: mapOnlineTest(test),
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

  if (Array.isArray(payload.answers)) {
    const existing = new Map(attempt.answers.map((a) => [a.questionId.toString(), a]));
    for (const incoming of payload.answers) {
      const key = (incoming.question_id || incoming.questionId || '').toString();
      if (!key) continue;
      const row = existing.get(key);
      if (!row) continue;
      if (incoming.selected_option !== undefined) row.selectedOption = incoming.selected_option;
      if (incoming.numerical_answer !== undefined) row.numericalAnswer = incoming.numerical_answer;
      if (incoming.text_answer !== undefined) row.textAnswer = incoming.text_answer;
      if (incoming.is_marked_for_review !== undefined) {
        row.isMarkedForReview = incoming.is_marked_for_review;
      }
      if (incoming.time_spent_seconds !== undefined) {
        row.timeSpentSeconds = Number(incoming.time_spent_seconds || 0);
      }
      row.answeredAt = new Date();
    }
  }
  if (payload.time_spent_seconds !== undefined) {
    attempt.timeSpentSeconds = Number(payload.time_spent_seconds || 0);
  }
  await attempt.save();
  return mapTestAttempt(attempt);
}

function scoreAnswer(answer, question, marks, negativeMarks = 0) {
  if (!question) return { isCorrect: null, marks: 0, skipped: true };
  if (question.questionType === 'mcq') {
    if (answer.selectedOption === null || answer.selectedOption === undefined) {
      return { isCorrect: null, marks: 0, skipped: true };
    }
    const isCorrect = Number(question.correctOption) === Number(answer.selectedOption);
    return { isCorrect, marks: isCorrect ? marks : -Math.abs(negativeMarks), skipped: false };
  }
  if (question.questionType === 'numerical') {
    if (answer.numericalAnswer === null || answer.numericalAnswer === undefined) {
      return { isCorrect: null, marks: 0, skipped: true };
    }
    const tolerance = Number(question.numericalTolerance || 0);
    const isCorrect =
      Math.abs(Number(answer.numericalAnswer) - Number(question.numericalAnswer)) <= tolerance;
    return { isCorrect, marks: isCorrect ? marks : -Math.abs(negativeMarks), skipped: false };
  }
  // descriptive evaluated later by faculty; keep pending
  if (!answer.textAnswer) return { isCorrect: null, marks: 0, skipped: true };
  return { isCorrect: null, marks: 0, skipped: false };
}

export async function submitAttempt(testId, user, { auto = false } = {}) {
  const attempt = await TestAttempt.findOne({
    testId,
    userId: user._id,
    status: 'in_progress',
  });
  if (!attempt) throw new AppError('Active attempt not found', 404, 'ATTEMPT_NOT_FOUND');

  const test = await OnlineTest.findById(testId).populate({
    path: 'paperId',
    populate: [{ path: 'questions.questionId' }],
  });
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');

  const questionMap = new Map(
    (test.paperId?.questions || []).map((pq) => {
      const sectionName = pq.section || 'A';
      const sectionObj = test.paperId?.sections?.find(s => s.name === sectionName || s.id === sectionName);
      const defaultNegMarks = sectionObj?.negativeMarksPerQuestion || 0;
      const negativeMarks = pq.customNegativeMarks !== null && pq.customNegativeMarks !== undefined
        ? pq.customNegativeMarks
        : defaultNegMarks;

      return [
        (pq.questionId?._id || pq.questionId).toString(),
        {
          question: pq.questionId,
          marks: Number(pq.customMarks || 0),
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
    const maxMarks = entry?.marks || 0;
    const negativeMarks = entry?.negativeMarks || 0;
    answer.maxMarks = maxMarks;
    const evalResult = scoreAnswer(answer, entry?.question, maxMarks, negativeMarks);
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

  const maxScore = questionMap.size
    ? [...questionMap.values()].reduce((sum, q) => sum + q.marks, 0)
    : attempt.maxScore;

  attempt.status = auto ? 'auto_submitted' : 'submitted';
  attempt.submittedAt = new Date();
  attempt.correctAnswers = correct;
  attempt.wrongAnswers = wrong;
  attempt.skippedAnswers = skipped;
  attempt.score = score;
  attempt.maxScore = maxScore;
  attempt.percentage = maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(2)) : 0;
  attempt.gradingStatus = computeGradingStatus(attempt, questionMap);
  recomputeAttemptTotals(attempt, questionMap);
  await attempt.save();

  await recomputeLeaderboard(test._id);
  await attempt.populate('testId');
  return mapTestAttempt(attempt);
}

export async function getAttemptHistory(user, testId = null) {
  const filter = user.role === 'student' ? { userId: user._id } : {};
  if (testId) filter.testId = testId;
  const attempts = await TestAttempt.find(filter).populate('testId').sort({ createdAt: -1 });
  return attempts.map(mapTestAttempt);
}

export async function getLeaderboard(testId) {
  const rows = await Leaderboard.find({ testId })
    .populate('userId')
    .sort({ rank: 1, score: -1 });
  return rows.map(mapLeaderboardEntry);
}

