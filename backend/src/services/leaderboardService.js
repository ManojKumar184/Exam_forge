import { TestAttempt } from '../models/TestAttempt.js';
import { Leaderboard } from '../models/Leaderboard.js';

export async function recomputeLeaderboard(testId) {
  const attempts = await TestAttempt.find({
    testId,
    status: { $in: ['submitted', 'auto_submitted'] },
    gradingStatus: { $in: ['not_required', 'complete'] },
  }).sort({ score: -1, timeSpentSeconds: 1, submittedAt: 1 });

  await Leaderboard.deleteMany({ testId });
  const docs = [];
  for (let i = 0; i < attempts.length; i += 1) {
    const rank = i + 1;
    attempts[i].rank = rank;
    await attempts[i].save();
    docs.push({
      testId,
      userId: attempts[i].userId,
      attemptId: attempts[i]._id,
      score: attempts[i].score,
      percentage: attempts[i].percentage,
      timeSpentSeconds: attempts[i].timeSpentSeconds,
      rank,
    });
  }
  if (docs.length) await Leaderboard.insertMany(docs);
}
