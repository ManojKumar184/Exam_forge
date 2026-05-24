import mongoose from 'mongoose';

const paperSectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    questionCount: { type: Number, default: 0 },
    marksPerQuestion: { type: Number, default: 4 },
  },
  { _id: false }
);

const paperQuestionSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    section: { type: String, default: 'A' },
    sectionOrder: { type: Number, default: 0 },
    questionOrder: { type: Number, required: true },
    customMarks: { type: Number, default: null },
  },
  { _id: false }
);

const paperSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    paperCode: { type: String, required: true, unique: true },
    examTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamType', default: null },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    class: { type: Number, required: true, min: 6, max: 12 },
    totalMarks: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    durationMinutes: { type: Number, default: 180 },
    sections: { type: [paperSectionSchema], default: [] },
    questions: { type: [paperQuestionSchema], default: [] },
    instructions: { type: String, default: null },
    paperSet: {
      type: String,
      enum: ['A', 'B', 'C', 'D'],
      default: 'A',
    },
    isOnline: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    publishedAt: { type: Date, default: null },
    pdfUrl: { type: String, default: null },
  },
  { timestamps: true }
);

paperSchema.index({ createdBy: 1, status: 1 });

export const Paper = mongoose.model('Paper', paperSchema);
