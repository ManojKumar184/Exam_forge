import { User, Question, Paper, OnlineTest, TestAttempt, Upload } from '../models/index.js';

export async function getAdminAnalytics() {
  const [roleCounts, questionCounts, totalPapers, totalTests, totalAttempts, totalUploads] =
    await Promise.all([
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      Question.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Paper.countDocuments(),
      OnlineTest.countDocuments(),
      TestAttempt.countDocuments(),
      Upload.countDocuments(),
    ]);

  const roleMap = Object.fromEntries(roleCounts.map((r) => [r._id, r.count]));
  const questionMap = Object.fromEntries(questionCounts.map((r) => [r._id, r.count]));

  return {
    total_users: (roleMap.super_admin || 0) + (roleMap.faculty || 0) + (roleMap.student || 0),
    total_admins: roleMap.super_admin || 0,
    total_faculty: roleMap.faculty || 0,
    total_students: roleMap.student || 0,
    total_questions: Object.values(questionMap).reduce((sum, n) => sum + Number(n), 0),
    total_papers: totalPapers,
    total_tests: totalTests,
    total_attempts: totalAttempts,
    total_uploads: totalUploads,
    pending_questions: questionMap.pending || 0,
    approved_questions: questionMap.approved || 0,
    rejected_questions: questionMap.rejected || 0,
    needs_review_questions: questionMap.needs_review || 0,
  };
}

export async function getFacultyAnalytics(facultyId) {
  const [paperCount, testCount, attemptsAgg, avgScoreAgg] = await Promise.all([
    Paper.countDocuments({ createdBy: facultyId }),
    OnlineTest.countDocuments({ createdBy: facultyId }),
    TestAttempt.aggregate([
      {
        $lookup: {
          from: 'onlinetests',
          localField: 'testId',
          foreignField: '_id',
          as: 'test',
        },
      },
      { $unwind: '$test' },
      { $match: { 'test.createdBy': facultyId } },
      { $group: { _id: null, total: { $sum: 1 } } },
    ]),
    TestAttempt.aggregate([
      {
        $lookup: {
          from: 'onlinetests',
          localField: 'testId',
          foreignField: '_id',
          as: 'test',
        },
      },
      { $unwind: '$test' },
      { $match: { 'test.createdBy': facultyId, status: { $in: ['submitted', 'auto_submitted'] } } },
      { $group: { _id: null, avg: { $avg: '$percentage' } } },
    ]),
  ]);

  return {
    total_papers: paperCount,
    total_tests: testCount,
    total_attempts: attemptsAgg[0]?.total || 0,
    average_score: Number((avgScoreAgg[0]?.avg || 0).toFixed(2)),
  };
}

export async function getTestPerformanceAnalytics(testId, facultyId = null) {
  const testFilter = facultyId ? { _id: testId, createdBy: facultyId } : { _id: testId };
  const test = await OnlineTest.findOne(testFilter).populate({
    path: 'paperId',
    populate: [{ path: 'questions.questionId', populate: 'chapterId' }],
  });
  if (!test) return null;

  const attempts = await TestAttempt.find({
    testId,
    status: { $in: ['submitted', 'auto_submitted'] },
  }).populate({ path: 'answers.questionId' });

  const questionStats = new Map();
  const topicWrong = new Map();
  const descriptiveStats = [];

  for (const pq of test.paperId?.questions || []) {
    const q = pq.questionId;
    if (!q) continue;
    const qid = q._id.toString();
    questionStats.set(qid, {
      question_id: qid,
      question_type: q.questionType,
      difficulty: q.difficulty,
      chapter: q.chapterId?.name || 'Unknown',
      tags: q.tags || [],
      max_marks: Number(pq.customMarks || q.marks || 0),
      attempts: 0,
      correct: 0,
      wrong: 0,
      skipped: 0,
      total_marks_awarded: 0,
    });
  }

  for (const attempt of attempts) {
    for (const answer of attempt.answers) {
      const qid = answer.questionId?._id?.toString() || answer.questionId?.toString();
      const stat = questionStats.get(qid);
      if (!stat) continue;
      stat.attempts += 1;
      stat.total_marks_awarded += Number(answer.marksObtained || 0);
      if (answer.isSkipped || (answer.isCorrect === null && !answer.textAnswer)) {
        stat.skipped += 1;
      } else if (answer.isCorrect === true) {
        stat.correct += 1;
      } else if (answer.isCorrect === false) {
        stat.wrong += 1;
        const chapter = stat.chapter;
        topicWrong.set(chapter, (topicWrong.get(chapter) || 0) + 1);
      } else if (stat.question_type === 'descriptive' && answer.textAnswer) {
        stat.skipped += 1;
      }
    }
  }

  const question_performance = [...questionStats.values()].map((s) => ({
    ...s,
    accuracy_pct:
      s.attempts > 0 ? Number(((s.correct / s.attempts) * 100).toFixed(1)) : 0,
    avg_marks_awarded:
      s.attempts > 0 ? Number((s.total_marks_awarded / s.attempts).toFixed(2)) : 0,
  }));

  const weak_topics = [...topicWrong.entries()]
    .map(([topic, wrong_count]) => ({ topic, wrong_count }))
    .sort((a, b) => b.wrong_count - a.wrong_count)
    .slice(0, 10);

  for (const stat of question_performance.filter((s) => s.question_type === 'descriptive')) {
    descriptiveStats.push({
      question_id: stat.question_id,
      chapter: stat.chapter,
      avg_marks_awarded: stat.avg_marks_awarded,
      max_marks: stat.max_marks,
      graded_rate_pct:
        stat.attempts > 0
          ? Number((((stat.attempts - stat.skipped) / stat.attempts) * 100).toFixed(1))
          : 0,
    });
  }

  const gradedAttempts = attempts.filter((a) =>
    ['not_required', 'complete'].includes(a.gradingStatus)
  );
  const avgScore =
    gradedAttempts.length > 0
      ? gradedAttempts.reduce((sum, a) => sum + Number(a.percentage || 0), 0) / gradedAttempts.length
      : 0;

  return {
    test_id: testId.toString(),
    total_attempts: attempts.length,
    pending_grading: attempts.filter((a) => ['pending', 'partial'].includes(a.gradingStatus)).length,
    average_score: Number(avgScore.toFixed(2)),
    weak_topics,
    question_performance,
    descriptive_analytics: descriptiveStats,
  };
}

export async function getStudentAnalytics(studentId) {
  const attempts = await TestAttempt.find({ userId: studentId }).sort({ createdAt: -1 }).limit(50);
  const completed = attempts.filter((a) => ['submitted', 'auto_submitted'].includes(a.status));
  const avg = completed.length
    ? completed.reduce((sum, a) => sum + Number(a.percentage || 0), 0) / completed.length
    : 0;
  const best = completed.length ? Math.max(...completed.map((a) => Number(a.percentage || 0))) : 0;

  return {
    total_attempts: attempts.length,
    completed_attempts: completed.length,
    average_score: Number(avg.toFixed(2)),
    best_score: Number(best.toFixed(2)),
  };
}

