import mongoose from 'mongoose';

const testAnswerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    selectedOption: { type: Number, default: null },
    numericalAnswer: { type: Number, default: null },
    textAnswer: { type: String, default: null },
    isCorrect: { type: Boolean, default: null },
    marksObtained: { type: Number, default: 0 },
    maxMarks: { type: Number, default: null },
    gradingRemarks: { type: String, default: null },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    gradedAt: { type: Date, default: null },
    isSkipped: { type: Boolean, default: false },
    isMarkedForReview: { type: Boolean, default: false },
    answeredAt: { type: Date, default: null },
    timeSpentSeconds: { type: Number, default: 0 },
  },
  { _id: true }
);

const testAttemptSchema = new mongoose.Schema(
  {
    testId: { type: mongoose.Schema.Types.ObjectId, ref: 'OnlineTest', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attemptNumber: { type: Number, default: 1 },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date, default: null },
    timeSpentSeconds: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['in_progress', 'submitted', 'auto_submitted', 'abandoned'],
      default: 'in_progress',
    },
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    rank: { type: Number, default: null },
    correctAnswers: { type: Number, default: 0 },
    wrongAnswers: { type: Number, default: 0 },
    skippedAnswers: { type: Number, default: 0 },
    gradingStatus: {
      type: String,
      enum: ['not_required', 'pending', 'partial', 'complete'],
      default: 'not_required',
    },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    gradedAt: { type: Date, default: null },
    answers: { type: [testAnswerSchema], default: [] },
  },
  { timestamps: true }
);

testAttemptSchema.index({ testId: 1, userId: 1 });

export const TestAttempt = mongoose.model('TestAttempt', testAttemptSchema);
