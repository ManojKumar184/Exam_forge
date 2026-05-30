import { TestAttempt } from '../models/TestAttempt.js';
import { Leaderboard } from '../models/Leaderboard.js';

export async function recomputeLeaderboard(testId) {
  const attempts = await TestAttempt.find({
    testId,
    status: { $in: ['submitted', 'auto_submitted'] },
    gradingStatus: { $in: ['not_required', 'complete'] },
  }).populate('userId');

  const studentAttempts = attempts.filter(
    (a) => a.userId && a.userId.role === 'student'
  );

  const nonStudentAttempts = attempts.filter(
    (a) => !a.userId || a.userId.role !== 'student'
  );

  // Group student attempts by user ID
  const attemptsByUser = {};
  for (const attempt of studentAttempts) {
    const userIdStr = attempt.userId._id.toString();
    if (!attemptsByUser[userIdStr]) {
      attemptsByUser[userIdStr] = [];
    }
    attemptsByUser[userIdStr].push(attempt);
  }

  // Comparison logic:
  // 1. score DESC
  // 2. timeSpentSeconds ASC
  // 3. attemptNumber ASC
  // 4. submittedAt ASC
  function compareAttempts(a, b) {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.timeSpentSeconds !== b.timeSpentSeconds) {
      return a.timeSpentSeconds - b.timeSpentSeconds;
    }
    if (a.attemptNumber !== b.attemptNumber) {
      return a.attemptNumber - b.attemptNumber;
    }
    const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    return timeA - timeB;
  }

  const bestAttempts = [];

  // For each user, find their best attempt and clear ranks for others
  for (const userIdStr of Object.keys(attemptsByUser)) {
    const userAttempts = attemptsByUser[userIdStr];
    userAttempts.sort(compareAttempts);
    bestAttempts.push(userAttempts[0]);

    for (let k = 1; k < userAttempts.length; k += 1) {
      userAttempts[k].rank = null;
      await userAttempts[k].save();
    }
  }

  // Clear ranks for non-students
  for (const attempt of nonStudentAttempts) {
    attempt.rank = null;
    await attempt.save();
  }

  // Sort best attempts globally to compute ranks
  bestAttempts.sort(compareAttempts);

  await Leaderboard.deleteMany({ testId });
  const docs = [];
  let rank = 1;

  for (const attempt of bestAttempts) {
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
  }

  if (docs.length) await Leaderboard.insertMany(docs);
}
