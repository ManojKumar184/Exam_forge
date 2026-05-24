import mongoose from 'mongoose';

const onlineTestSchema = new mongoose.Schema(
  {
    paperId: { type: mongoose.Schema.Types.ObjectId, ref: 'Paper', required: true },
    testCode: { type: String, required: true, unique: true },
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null },
    durationMinutes: { type: Number, required: true },
    maxAttempts: { type: Number, default: 1 },
    shuffleQuestions: { type: Boolean, default: false },
    shuffleOptions: { type: Boolean, default: false },
    showResults: { type: Boolean, default: true },
    showAnswers: { type: Boolean, default: false },
    allowReview: { type: Boolean, default: true },
    isPublic: { type: Boolean, default: true },
    accessCode: { type: String, default: null },
    allowedUsers: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'active', 'completed', 'archived'],
      default: 'draft',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const OnlineTest = mongoose.model('OnlineTest', onlineTestSchema);
