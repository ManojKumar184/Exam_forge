import { TestAttempt } from '../models/TestAttempt.js';
import { Leaderboard } from '../models/Leaderboard.js';

export async function recomputeLeaderboard(testId) {
  const attempts = await TestAttempt.find({
    testId,
    status: { $in: ['submitted', 'auto_submitted'] },
    gradingStatus: { $in: ['not_required', 'complete'] },
  }).populate('userId').sort({ score: -1, timeSpentSeconds: 1, submittedAt: 1 });

  await Leaderboard.deleteMany({ testId });
  const docs = [];
  let rank = 1;

  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i];
    if (attempt.userId && attempt.userId.role === 'student') {
      attempt.rank = rank;
      await attempt.save();
      docs.push({
        testId,
        userId: attempt.userId._id,
        attemptId: attempt._id,
        score: attempt.score,
        percentage: attempt.percentage,
        timeSpentSeconds: attempt.timeSpentSeconds,
        rank,
      });
      rank += 1;
    } else {
      attempt.rank = null;
      await attempt.save();
    }
  }
  if (docs.length) await Leaderboard.insertMany(docs);
}
