import mongoose from 'mongoose';

const templateSectionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  allowedQuestionTypes: [{ type: String }],
  marksPerQuestion: { type: Number, default: 4 },
  negativeMarksPerQuestion: { type: Number, default: 0 },
  questionCount: { type: Number, default: 10 }
}, { _id: false });

const examTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, default: null, index: true },
  subjectStructure: [{ type: String }],
  sections: [templateSectionSchema],
  instructions: { type: String, default: null },
  layoutDefaults: {
    layout: { type: String, enum: ['single_column', 'two_column'], default: 'single_column' },
    margin: { type: String, enum: ['narrow', 'normal', 'wide'], default: 'normal' },
    fontFamily: { type: String, default: 'times_new_roman' },
    fontSize: { type: Number, default: 11 },
    lineSpacing: { type: Number, default: 1.25 }
  },
  exportDefaults: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isSystem: { type: Boolean, default: false }
}, { timestamps: true });

export const ExamTemplate = mongoose.model('ExamTemplate', examTemplateSchema);
