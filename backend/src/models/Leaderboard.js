import mongoose from 'mongoose';

const leaderboardSchema = new mongoose.Schema(
  {
    testId: { type: mongoose.Schema.Types.ObjectId, ref: 'OnlineTest', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestAttempt', required: true },
    score: { type: Number, required: true },
    percentage: { type: Number, required: true },
    timeSpentSeconds: { type: Number, default: 0 },
    rank: { type: Number, default: null },
  },
  { timestamps: true }
);

leaderboardSchema.index({ testId: 1, score: -1, timeSpentSeconds: 1 });

export const Leaderboard = mongoose.model('Leaderboard', leaderboardSchema);
