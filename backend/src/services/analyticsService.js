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

