import mongoose from 'mongoose';
import { Counter } from './Counter.js';

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
      enum: [
        // Canonical types
        'MCQ_SINGLE', 'MCQ_MULTIPLE', 'NUMERICAL_INTEGER',
        'MATCH_FOLLOWING', 'ASSERTION_REASON', 'DESCRIPTIVE',
        // Legacy backward-compatible aliases
        'mcq', 'descriptive', 'numerical',
        'MCQ_MULTI', 'INTEGER', 'NUMERICAL',
        'MATCH_COLUMNS', 'SHORT_ANSWER', 'LONG_ANSWER',
        // Complex patterns (context_type, not canonical)
        'COMPREHENSION', 'PARAGRAPH_BASED', 'STATEMENT_SET',
        'MATRIX_MATCH', 'TRUE_FALSE', 'NESTED_OPTION_MCQ',
        'CASE_STUDY',
      ],
      required: true,
    },
    // Complex assessment patterns preserved as context type metadata
    contextType: {
      type: String,
      enum: [
        null, 'COMPREHENSION', 'CASE_STUDY', 'PARAGRAPH_BASED',
        'STATEMENT_SET', 'MATRIX_MATCH', 'TRUE_FALSE',
        'NESTED_OPTION_MCQ', 'MATCH_FOLLOWING', 'ASSERTION_REASON',
      ],
      default: null,
    },
    questionLatex: { type: String, default: null },
    questionImages: { type: [String], default: [] },
    options: { type: [questionOptionSchema], default: [] },
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
    marks: { type: Number, default: null },
    class: { type: Number, required: true, min: 6, max: 12 },
    year: { type: String, default: null },
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
    debugInfo: { type: mongoose.Schema.Types.Mixed, default: null },
    semanticEnriched: { type: Boolean, default: false },
    enrichmentAttempts: { type: Number, default: 0 },
    
    // SaaS semantic metadata fields
    correctAnswers: { type: [String], default: [] },
    figures: { type: [mongoose.Schema.Types.Mixed], default: [] },
    formulas: { type: [String], default: [] },
    semanticBlocks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    statementGroups: { type: [mongoose.Schema.Types.Mixed], default: [] },
    comprehensionLinks: { type: [mongoose.Schema.Types.ObjectId], ref: 'Question', default: [] },
    parserConfidence: { type: Number, default: 0 },
    reconstructionFidelity: { type: Number, default: 0 },
    semanticConfidence: { type: Number, default: 0 },
    mathPreservationConfidence: { type: Number, default: 0 },
    metadataConfidence: { type: Number, default: 0 },
    auditHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
    serialId: { type: Number, unique: true, index: true },
    syllabusMappings: {
      type: [{
        examPatternId: { type: mongoose.Schema.Types.ObjectId, ref: 'SyllabusNode', default: null },
        classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SyllabusNode', default: null },
        subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'SyllabusNode', default: null },
        chapterId: { type: mongoose.Schema.Types.ObjectId, ref: 'SyllabusNode', default: null },
        topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'SyllabusNode', default: null },
      }],
      default: [],
    },
    bankIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'QuestionBank' }],
      default: [],
    },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isPrivate: { type: Boolean, default: true },
    visibility: {
      type: String,
      enum: ['private', 'faculty_bank', 'institution', 'public'],
      default: 'private',
    },
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
questionSchema.index({ uploadId: 1, status: 1 });
questionSchema.index({ duplicateOf: 1 });
questionSchema.index({ subjectId: 1, class: 1, status: 1, difficulty: 1 });
questionSchema.index({ aiConfidence: 1, status: 1 });
questionSchema.index({ "syllabusMappings.examPatternId": 1 });
questionSchema.index({ "syllabusMappings.classId": 1 });
questionSchema.index({ "syllabusMappings.subjectId": 1 });
questionSchema.index({ "syllabusMappings.chapterId": 1 });
questionSchema.index({ "syllabusMappings.topicId": 1 });
questionSchema.index({ bankIds: 1 });
questionSchema.index({ ownerId: 1 });
questionSchema.index({ isPrivate: 1 });
questionSchema.index({ visibility: 1 });

questionSchema.pre('save', async function (next) {
  if (this.isNew && !this.serialId) {
    const counter = await Counter.findOneAndUpdate(
      { _id: 'questions' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.serialId = counter.seq;
  }
  next();
});

export const Question = mongoose.model('Question', questionSchema);
