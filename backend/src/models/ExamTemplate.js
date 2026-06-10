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

examTemplateSchema.pre('save', function (next) {
  const code = (this.code || '').toLowerCase();
  const name = (this.name || '').toLowerCase();
  
  const isJeeMain = code === 'jee_main' || name.includes('jee main') || name.includes('jee-main');
  const isNeet = code === 'neet' || name.includes('neet');
  const isJeeAdvanced = code === 'jee_advanced' || name.includes('jee advanced') || name.includes('jee-advanced');
  const isCbse = code === 'cbse' || name.includes('cbse');
  
  if (isJeeMain) {
    // allowed subjects
    const invalidSubjects = this.subjectStructure.filter(s => !['Physics', 'Chemistry', 'Mathematics'].includes(s));
    if (invalidSubjects.length > 0) {
      return next(new Error(`JEE Main templates only allow Physics, Chemistry, and Mathematics subjects. Found: ${invalidSubjects.join(', ')}`));
    }
    // allowed question types (no descriptive)
    for (const section of this.sections) {
      const allowed = (section.allowedQuestionTypes || []).map(t => t.toLowerCase());
      if (allowed.some(t => t.includes('descriptive') || t.includes('comprehension') || t.includes('case'))) {
        return next(new Error(`JEE Main template section "${section.name}" cannot allow descriptive, comprehension, or case-study question types.`));
      }
      if (section.marksPerQuestion <= 0) {
        return next(new Error(`JEE Main template section "${section.name}" must have positive marking.`));
      }
      if (section.negativeMarksPerQuestion < 0) {
        return next(new Error(`JEE Main template section "${section.name}" cannot have negative values for negative marking.`));
      }
    }
  } else if (isNeet) {
    // allowed subjects
    const invalidSubjects = this.subjectStructure.filter(s => !['Physics', 'Chemistry', 'Biology'].includes(s));
    if (invalidSubjects.length > 0) {
      return next(new Error(`NEET templates only allow Physics, Chemistry, and Biology subjects. Found: ${invalidSubjects.join(', ')}`));
    }
    // allowed question types (MCQ only)
    for (const section of this.sections) {
      const allowed = (section.allowedQuestionTypes || []).map(t => t.toLowerCase());
      if (allowed.some(t => !t.includes('mcq') && !t.includes('single'))) {
        return next(new Error(`NEET template section "${section.name}" only allows single choice MCQ questions.`));
      }
      if (section.marksPerQuestion <= 0) {
        return next(new Error(`NEET template section "${section.name}" must have positive marking.`));
      }
      if (section.negativeMarksPerQuestion < 0) {
        return next(new Error(`NEET template section "${section.name}" cannot have negative values for negative marking.`));
      }
    }
  } else if (isJeeAdvanced) {
    // allowed subjects
    const invalidSubjects = this.subjectStructure.filter(s => !['Physics', 'Chemistry', 'Mathematics'].includes(s));
    if (invalidSubjects.length > 0) {
      return next(new Error(`JEE Advanced templates only allow Physics, Chemistry, and Mathematics subjects.`));
    }
    // allowed question types
    for (const section of this.sections) {
      const allowed = (section.allowedQuestionTypes || []).map(t => t.toLowerCase());
      if (allowed.some(t => t.includes('descriptive'))) {
        return next(new Error(`JEE Advanced template section "${section.name}" cannot allow descriptive question types.`));
      }
      if (section.marksPerQuestion <= 0) {
        return next(new Error(`JEE Advanced template section "${section.name}" must have positive marking.`));
      }
      if (section.negativeMarksPerQuestion < 0) {
        return next(new Error(`JEE Advanced template section "${section.name}" cannot have negative values for negative marking.`));
      }
    }
  } else if (isCbse) {
    // allowed subjects
    const invalidSubjects = this.subjectStructure.filter(s => !['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'General', 'Social Science', 'Science'].includes(s));
    if (invalidSubjects.length > 0) {
      return next(new Error(`CBSE template subject structure contains invalid subject: ${invalidSubjects.join(', ')}`));
    }
    // allowed question types
    for (const section of this.sections) {
      if (section.marksPerQuestion <= 0) {
        return next(new Error(`CBSE template section "${section.name}" must have positive marking.`));
      }
      if (section.negativeMarksPerQuestion !== 0) {
        return next(new Error(`CBSE template section "${section.name}" must have 0 negative marks.`));
      }
    }
  }
  next();
});

export const ExamTemplate = mongoose.model('ExamTemplate', examTemplateSchema);
