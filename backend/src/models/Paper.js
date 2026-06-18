import mongoose from 'mongoose';

const paperSectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    questionCount: { type: Number, default: 0 },
    marksPerQuestion: { type: Number, default: 4 },
    negativeMarksPerQuestion: { type: Number, default: 0 },
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
    customNegativeMarks: { type: Number, default: null },
  },
  { _id: false }
);

const paperExportSettingsSchema = new mongoose.Schema(
  {
    layout: { type: String, enum: ['single_column', 'two_column'], default: 'single_column' },
    margin: { type: String, enum: ['narrow', 'normal', 'wide'], default: 'normal' },
    fontFamily: { type: String, default: 'times_new_roman' },
    fontSize: { type: Number, default: 11 },
    lineSpacing: { type: Number, default: 1.25 },
    // Header
    showInstitutionLogo: { type: Boolean, default: true },
    institutionLogoUrl: { type: String, default: null },
    institutionName: { type: String, default: null },
    examinationName: { type: String, default: null },
    subjectName: { type: String, default: null },
    className: { type: String, default: null },
    durationMinutes: { type: Number, default: null },
    maximumMarks: { type: Number, default: null },
    customHeaderText: { type: String, default: null },
    // Footer
    showPageNumber: { type: Boolean, default: true },
    footerInstitutionName: { type: String, default: null },
    customFooterText: { type: String, default: null },
    // Template
    template: { type: String, default: 'default' },
    // Cover page & numbering modes
    showCoverPage: { type: Boolean, default: false },
    numberingMode: { type: String, enum: ['continuous', 'section_wise'], default: 'continuous' },
    // Watermark
    watermarkText: { type: String, default: null },
    watermarkOpacity: { type: Number, default: 0.04 },
    watermarkSize: { type: Number, default: 64 },
    watermarkRotation: { type: Number, default: -25 }
  },
  { _id: false }
);

const paperSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    paperCode: { type: String, required: true, unique: true },
    // Flat model fields removed (Subject, ExamType collections dropped); use syllabusMappings or string-based references
    examTypeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    subjectId: { type: mongoose.Schema.Types.ObjectId, default: null },
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
    exportSettings: { type: paperExportSettingsSchema, default: () => ({}) },

  },
  { timestamps: true }
);

paperSchema.index({ createdBy: 1, status: 1 });

export const Paper = mongoose.model('Paper', paperSchema);
