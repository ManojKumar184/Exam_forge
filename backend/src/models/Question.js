import mongoose from 'mongoose';

const questionOptionSchema = new mongoose.Schema(
  {
    text: { type: String, default: '' },
    image: { type: String, default: null },
    latex: { type: String, default: null },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    chapterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', default: null },
    examTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamType', default: null },
    questionText: { type: String, required: true },
    questionType: {
      type: String,
      enum: ['mcq', 'descriptive', 'numerical'],
      required: true,
    },
    questionLatex: { type: String, default: null },
    questionImages: { type: [String], default: [] },
    options: { type: [questionOptionSchema], default: [] },
    optionImages: { type: mongoose.Schema.Types.Mixed, default: {} },
    correctOption: { type: Number, default: null },
    numericalAnswer: { type: Number, default: null },
    numericalTolerance: { type: Number, default: 0 },
    answerText: { type: String, default: null },
    answerKey: { type: String, default: null },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
    marks: { type: Number, default: 4 },
    class: { type: Number, required: true, min: 6, max: 12 },
    explanation: { type: String, default: null },
    explanationLatex: { type: String, default: null },
    explanationImages: { type: [String], default: [] },
    diagrams: { type: [mongoose.Schema.Types.Mixed], default: [] },
    imageMetadata: {
      type: [
        {
          url: { type: String, required: true },
          order: { type: Number, default: 0 },
          caption: { type: String, default: null },
          type: {
            type: String,
            enum: ['diagram', 'graph', 'table', 'biology', 'chemistry', 'geometry', 'figure'],
            default: 'diagram',
          },
        },
      ],
      default: [],
    },
    hasDiagram: { type: Boolean, default: false },
    hasEquation: { type: Boolean, default: false },
    hasTable: { type: Boolean, default: false },
    renderingMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    tags: { type: [String], default: [] },
    aiConfidence: { type: Number, default: 0 },
    aiMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'needs_review'],
      default: 'pending',
    },
    extractionWarnings: { type: [String], default: [] },
    duplicateHash: { type: String, default: null, index: true },
    duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNotes: { type: String, default: null },
    source: { type: String, default: null },
    sourceFile: { type: String, default: null },
    extractedFrom: { type: String, default: null },
    uploadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

questionSchema.index({ status: 1, subjectId: 1, class: 1, difficulty: 1 });
questionSchema.index({ status: 1, class: 1, examTypeId: 1, difficulty: 1 });
questionSchema.index({ status: 1, chapterId: 1, difficulty: 1 });
questionSchema.index({ status: 1, uploadId: 1 });
questionSchema.index({ status: 1, questionType: 1, class: 1 });
questionSchema.index({ questionText: 'text' });
questionSchema.index({ createdAt: -1 });

export const Question = mongoose.model('Question', questionSchema);
