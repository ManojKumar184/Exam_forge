import { OnlineTest } from '../models/OnlineTest.js';
import { TestAttempt } from '../models/TestAttempt.js';
import { AppError } from '../utils/AppError.js';
import { mapTestAttempt } from '../utils/examMapper.js';
import { recomputeLeaderboard } from './leaderboardService.js';

function assertFacultyOwnsTest(test, user) {
  if (user.role === 'super_admin') return;
  if (user.role === 'faculty' && test.createdBy.toString() === user._id.toString()) return;
  throw new AppError('Forbidden', 403, 'FORBIDDEN');
}

function buildQuestionMap(paper) {
  return new Map(
    (paper?.questions || []).map((pq) => [
      (pq.questionId?._id || pq.questionId).toString(),
      {
        question: pq.questionId,
        marks: Number(pq.customMarks || pq.questionId?.marks || 0),
      },
    ])
  );
}

export function computeGradingStatus(attempt, questionMap) {
  let needsManual = false;
  let pendingCount = 0;
  let gradedCount = 0;

  for (const answer of attempt.answers) {
    const entry = questionMap.get(answer.questionId.toString());
    const qType = entry?.question?.questionType;
    if (qType !== 'descriptive') continue;
    if (!answer.textAnswer?.trim()) continue;
    needsManual = true;
    if (answer.gradedAt) {
      gradedCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  if (!needsManual) return 'not_required';
  if (pendingCount === 0) return 'complete';
  if (gradedCount > 0) return 'partial';
  return 'pending';
}

export function recomputeAttemptTotals(attempt, questionMap) {
  let score = 0;
  let correct = 0;
  let wrong = 0;
  let skipped = 0;

  for (const answer of attempt.answers) {
    const entry = questionMap.get(answer.questionId.toString());
    const maxMarks = Number(answer.maxMarks ?? entry?.marks ?? 0);
    answer.maxMarks = maxMarks;
    const marks = Number(answer.marksObtained || 0);
    score += marks;

    if (answer.isSkipped || (entry?.question?.questionType === 'descriptive' && !answer.textAnswer)) {
      skipped += 1;
      continue;
    }
    if (answer.isCorrect === true) correct += 1;
    else if (answer.isCorrect === false) wrong += 1;
    else if (entry?.question?.questionType === 'descriptive' && answer.textAnswer && !answer.gradedAt) {
      skipped += 1;
    }
  }

  const maxScore = [...questionMap.values()].reduce((sum, q) => sum + q.marks, 0) || attempt.maxScore;
  attempt.score = score;
  attempt.maxScore = maxScore;
  attempt.percentage = maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(2)) : 0;
  attempt.correctAnswers = correct;
  attempt.wrongAnswers = wrong;
  attempt.skippedAnswers = skipped;
  attempt.gradingStatus = computeGradingStatus(attempt, questionMap);
}

export async function getGradingQueue(testId, user) {
  const test = await OnlineTest.findById(testId);
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');
  assertFacultyOwnsTest(test, user);

  const attempts = await TestAttempt.find({
    testId,
    status: { $in: ['submitted', 'auto_submitted'] },
    gradingStatus: { $in: ['pending', 'partial'] },
  })
    .populate('userId', 'fullName email role')
    .sort({ submittedAt: 1 });

  return attempts.map(mapTestAttempt);
}

export async function getAttemptDetail(testId, attemptId, user) {
  const test = await OnlineTest.findById(testId).populate({
    path: 'paperId',
    populate: [{ path: 'questions.questionId' }, 'subjectId', 'examTypeId'],
  });
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');

  const attempt = await TestAttempt.findOne({ _id: attemptId, testId })
    .populate('userId', 'fullName email role')
    .populate({ path: 'answers.questionId' });

  if (!attempt) throw new AppError('Attempt not found', 404, 'NOT_FOUND');

  if (user.role === 'student' && attempt.userId._id.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  if (user.role === 'faculty') assertFacultyOwnsTest(test, user);

  const questionMap = buildQuestionMap(test.paperId);
  for (const answer of attempt.answers) {
    const entry = questionMap.get(answer.questionId._id?.toString() || answer.questionId.toString());
    if (entry) answer.maxMarks = entry.marks;
  }

  return {
    test_id: test._id.toString(),
    attempt: mapTestAttempt(attempt),
    show_answers: test.showAnswers,
    allow_review: test.allowReview,
  };
}

export async function gradeAttemptAnswers(testId, attemptId, body, user) {
  const test = await OnlineTest.findById(testId).populate({
    path: 'paperId',
    populate: [{ path: 'questions.questionId' }],
  });
  if (!test) throw new AppError('Test not found', 404, 'NOT_FOUND');
  assertFacultyOwnsTest(test, user);

  const attempt = await TestAttempt.findOne({
    _id: attemptId,
    testId,
    status: { $in: ['submitted', 'auto_submitted'] },
  });
  if (!attempt) throw new AppError('Attempt not found', 404, 'NOT_FOUND');

  const questionMap = buildQuestionMap(test.paperId);
  const grades = body.grades || [];

  for (const item of grades) {
    const answerId = (item.answer_id || item.answerId || '').toString();
    const row = attempt.answers.id(answerId) || attempt.answers.find((a) => a._id.toString() === answerId);
    if (!row) continue;

    const entry = questionMap.get(row.questionId.toString());
    const maxMarks = Number(entry?.marks ?? row.maxMarks ?? 0);
    const marks = Math.min(Math.max(0, Number(item.marks ?? 0)), maxMarks);

    row.maxMarks = maxMarks;
    row.marksObtained = marks;
    row.gradingRemarks = item.remarks ?? item.grading_remarks ?? null;
    row.gradedBy = user._id;
    row.gradedAt = new Date();
    row.isCorrect = marks >= maxMarks * 0.5 && maxMarks > 0 ? true : marks > 0 ? null : false;
  }

  recomputeAttemptTotals(attempt, questionMap);
  if (attempt.gradingStatus === 'complete') {
    attempt.gradedBy = user._id;
    attempt.gradedAt = new Date();
  }
  await attempt.save();
  await recomputeLeaderboard(testId);

  await attempt.populate([{ path: 'answers.questionId' }, 'userId']);
  return mapTestAttempt(attempt);
}
