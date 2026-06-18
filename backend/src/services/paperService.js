import { v4 as uuidv4 } from 'uuid';
import { Paper } from '../models/Paper.js';
import { Question } from '../models/Question.js';
import { AppError } from '../utils/AppError.js';
import { mapPaper } from '../utils/examMapper.js';
import { selectQuestionsForPaper } from './paperSelectionService.js';

function toObjectIdList(items) {
  return (items || []).filter(Boolean);
}

async function buildPaperFilter(query, user) {
  const filter = {};
  if (user.role === 'faculty') filter.createdBy = user._id;
  if (query.status) filter.status = query.status;
  if (query.exam_type_id) filter.examTypeId = query.exam_type_id;
  if (query.class) filter.class = Number(query.class);
  if (query.search) filter.title = { $regex: query.search, $options: 'i' };

  // Advanced filters: bank, subject, chapter, topic, subtopic
  let filterByQuestions = false;
  const questionFilter = {};

  if (query.bank_id) {
    const bankIds = Array.isArray(query.bank_id) ? query.bank_id : String(query.bank_id).split(',').map(s => s.trim()).filter(Boolean);
    questionFilter.bankIds = { $in: bankIds };
    filterByQuestions = true;
  }

  if (query.chapter_id) {
    const chapterIds = Array.isArray(query.chapter_id) ? query.chapter_id : String(query.chapter_id).split(',').map(s => s.trim()).filter(Boolean);
    questionFilter.$or = [
      { chapterId: { $in: chapterIds } },
      { 'syllabusMappings.chapterId': { $in: chapterIds } }
    ];
    filterByQuestions = true;
  }

  if (query.topic_id) {
    const topicIds = Array.isArray(query.topic_id) ? query.topic_id : String(query.topic_id).split(',').map(s => s.trim()).filter(Boolean);
    questionFilter['syllabusMappings.topicId'] = { $in: topicIds };
    filterByQuestions = true;
  }



  if (query.subject_id) {
    const subjectIds = Array.isArray(query.subject_id) ? query.subject_id : String(query.subject_id).split(',').map(s => s.trim()).filter(Boolean);
    filter.subjectId = { $in: subjectIds };
  }

  if (filterByQuestions) {
    const { Question } = await import('../models/Question.js');
    const matchingQuestions = await Question.find(questionFilter).select('_id').lean();
    const matchingIds = matchingQuestions.map(q => q._id);
    filter['questions.questionId'] = { $in: matchingIds };
  }

  return filter;
}

export async function listPapers(query, user) {
  const filter = await buildPaperFilter(query, user);
  const papers = await Paper.find(filter)
    // Populate for flat Subject/ExamType removed — collections were dropped
    .sort({ updatedAt: -1 });
  return papers.map(mapPaper);
}

export async function getPaperById(id, user) {
  const paper = await Paper.findById(id)
    // Populate for flat Subject/ExamType removed — collections were dropped
    .populate('questions.questionId');
  if (!paper) throw new AppError('Paper not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && paper.createdBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return mapPaper(paper);
}

function mapBodyToPaperFields(body) {
  return {
    title: body.title,
    description: body.description ?? null,
    paperCode: body.paper_code || body.paperCode || `PAPER-${uuidv4().slice(0, 8).toUpperCase()}`,
    examTypeId: body.exam_type_id || body.examTypeId || null,
    subjectId: body.subject_id || body.subjectId || null,
    class: Number(body.class),
    totalMarks: Number(body.total_marks ?? body.totalMarks ?? 0),
    totalQuestions: Number(body.total_questions ?? body.totalQuestions ?? 0),
    durationMinutes: Number(body.duration_minutes ?? body.durationMinutes ?? 180),
    sections: (body.sections || []).map((s) => ({
      name: s.name,
      questionCount: Number(s.questionCount ?? s.question_count ?? 0),
      marksPerQuestion: Number(s.marksPerQuestion ?? s.marks_per_question ?? 4),
      negativeMarksPerQuestion: Number(s.negativeMarksPerQuestion ?? s.negative_marks_per_question ?? s.negativeMarks ?? 0),
    })),
    instructions: body.instructions ?? null,
    paperSet: body.paper_set || body.paperSet || 'A',
    isOnline: Boolean(body.is_online ?? body.isOnline ?? false),
    status: body.status || 'draft',
    exportSettings: body.export_settings || body.exportSettings ? {
      layout: (body.export_settings || body.exportSettings).layout ?? 'single_column',
      margin: (body.export_settings || body.exportSettings).margin ?? 'normal',
      fontFamily: (body.export_settings || body.exportSettings).font_family ?? (body.export_settings || body.exportSettings).fontFamily ?? 'times_new_roman',
      fontSize: Number((body.export_settings || body.exportSettings).font_size ?? (body.export_settings || body.exportSettings).fontSize ?? 11),
      lineSpacing: Number((body.export_settings || body.exportSettings).line_spacing ?? (body.export_settings || body.exportSettings).lineSpacing ?? 1.25),
      showInstitutionLogo: (body.export_settings || body.exportSettings).show_institution_logo ?? (body.export_settings || body.exportSettings).showInstitutionLogo ?? true,
      institutionLogoUrl: (body.export_settings || body.exportSettings).institution_logo_url ?? (body.export_settings || body.exportSettings).institutionLogoUrl ?? null,
      institutionName: (body.export_settings || body.exportSettings).institution_name ?? (body.export_settings || body.exportSettings).institutionName ?? null,
      examinationName: (body.export_settings || body.exportSettings).examination_name ?? (body.export_settings || body.exportSettings).examinationName ?? null,
      subjectName: (body.export_settings || body.exportSettings).subject_name ?? (body.export_settings || body.exportSettings).subjectName ?? null,
      className: (body.export_settings || body.exportSettings).class_name ?? (body.export_settings || body.exportSettings).className ?? null,
      durationMinutes: (body.export_settings || body.exportSettings).duration_minutes ?? (body.export_settings || body.exportSettings).durationMinutes ?? null,
      maximumMarks: (body.export_settings || body.exportSettings).maximum_marks ?? (body.export_settings || body.exportSettings).maximumMarks ?? null,
      customHeaderText: (body.export_settings || body.exportSettings).custom_header_text ?? (body.export_settings || body.exportSettings).customHeaderText ?? null,
      showPageNumber: (body.export_settings || body.exportSettings).show_page_number ?? (body.export_settings || body.exportSettings).showPageNumber ?? true,
      footerInstitutionName: (body.export_settings || body.exportSettings).footer_institution_name ?? (body.export_settings || body.exportSettings).footerInstitutionName ?? null,
      customFooterText: (body.export_settings || body.exportSettings).custom_footer_text ?? (body.export_settings || body.exportSettings).customFooterText ?? null,
      template: (body.export_settings || body.exportSettings).template ?? 'default',
      showCoverPage: (body.export_settings || body.exportSettings).show_cover_page ?? (body.export_settings || body.exportSettings).showCoverPage ?? false,
      numberingMode: (body.export_settings || body.exportSettings).numbering_mode ?? (body.export_settings || body.exportSettings).numberingMode ?? 'continuous',
      watermarkText: (body.export_settings || body.exportSettings).watermark_text ?? (body.export_settings || body.exportSettings).watermarkText ?? null,
      watermarkOpacity: Number((body.export_settings || body.exportSettings).watermark_opacity ?? (body.export_settings || body.exportSettings).watermarkOpacity ?? 0.04),
      watermarkSize: Number((body.export_settings || body.exportSettings).watermark_size ?? (body.export_settings || body.exportSettings).watermarkSize ?? 64),
      watermarkRotation: Number((body.export_settings || body.exportSettings).watermark_rotation ?? (body.export_settings || body.exportSettings).watermarkRotation ?? -25)
    } : undefined
  };
}

async function validatePaperAgainstTemplate(fields) {
  if (fields.examTypeId) {
    // ExamType collection was dropped — look up exam pattern from SyllabusNode tree
    const { SyllabusNode } = await import('../models/SyllabusNode.js');
    const examType = await SyllabusNode.findOne({ _id: fields.examTypeId, type: 'exam_pattern', isActive: true });
    if (examType) {
      const examCode = (examType.code || '').toUpperCase();
      const questionIds = (fields.questions || []).map(q => q.questionId || q.question_id).filter(Boolean);
      
      if (examCode === 'JEE_MAIN') {
        for (const s of fields.sections || []) {
          const sName = (s.name || '').toLowerCase();
          if (sName.includes('descriptive') || sName.includes('subjective')) {
            throw new AppError('JEE Main does not allow descriptive sections.', 400, 'INVALID_SECTION_TYPE');
          }
        }
        if (questionIds.length) {
          const descriptiveQ = await Question.findOne({
            _id: { $in: questionIds },
            $or: [
              { questionType: { $in: ['descriptive', 'DESCRIPTIVE', 'SHORT_ANSWER', 'LONG_ANSWER'] } },
              { questionType: { $regex: /DESCRIPTIVE/i } }
            ]
          });
          if (descriptiveQ) {
            throw new AppError('JEE Main does not allow descriptive questions.', 400, 'INVALID_QUESTION_TYPE');
          }
        }
      } else if (examCode === 'NEET') {
        for (const s of fields.sections || []) {
          const sName = (s.name || '').toLowerCase();
          if (sName.includes('descriptive') || sName.includes('subjective') || sName.includes('numerical') || sName.includes('integer')) {
            throw new AppError('NEET does not allow descriptive or numerical sections.', 400, 'INVALID_SECTION_TYPE');
          }
        }
        if (questionIds.length) {
          const nonMcqQ = await Question.findOne({
            _id: { $in: questionIds },
            questionType: { $nin: ['mcq', 'MCQ_SINGLE', 'MCQ'] }
          });
          if (nonMcqQ) {
            throw new AppError('NEET paper only allows single choice MCQ questions.', 400, 'INVALID_QUESTION_TYPE');
          }
        }
      } else if (examCode === 'JEE_ADVANCED' || examCode === 'JEE_MAIN_ADVANCED') {
        // No additional restrictions
      }
    }
  }
}

export async function createPaper(body, user) {
  const fields = mapBodyToPaperFields(body);
  const questions = body.questions || [];
  const questionIds = toObjectIdList(
    questions.map((q) => q.question_id || q.questionId || q.id).filter(Boolean)
  );
  const existing = await Question.countDocuments({ _id: { $in: questionIds }, status: 'approved' });
  if (questionIds.length && existing !== questionIds.length) {
    throw new AppError('Paper includes non-approved questions', 400, 'INVALID_QUESTIONS');
  }

  fields.questions = questions.map((q, idx) => ({
    questionId: q.question_id || q.questionId || q.id,
    section: q.section || 'A',
    sectionOrder: Number(q.section_order ?? q.sectionOrder ?? 0),
    questionOrder: Number(q.question_order ?? q.questionOrder ?? idx),
    customMarks: q.custom_marks ?? q.customMarks ?? null,
    customNegativeMarks: q.custom_negative_marks ?? q.customNegativeMarks ?? null,
  }));
  fields.createdBy = user._id;

  await validatePaperAgainstTemplate(fields);

  const doc = await Paper.create(fields);
  // Populate for flat Subject/ExamType removed; only populate questions
  await doc.populate(['questions.questionId']);
  return mapPaper(doc);
}

export async function updatePaper(id, body, user) {
  const paper = await Paper.findById(id);
  if (!paper) throw new AppError('Paper not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && paper.createdBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const fields = mapBodyToPaperFields({ ...paper.toObject(), ...body });
  Object.assign(paper, fields);
  if (body.questions) {
    paper.questions = body.questions.map((q, idx) => ({
      questionId: q.question_id || q.questionId || q.id,
      section: q.section || 'A',
      sectionOrder: Number(q.section_order ?? q.sectionOrder ?? 0),
      questionOrder: Number(q.question_order ?? q.questionOrder ?? idx),
      customMarks: q.custom_marks ?? q.customMarks ?? null,
      customNegativeMarks: q.custom_negative_marks ?? q.customNegativeMarks ?? null,
    }));
  }
  if (body.status === 'published' && !paper.publishedAt) {
    paper.publishedAt = new Date();
  }

  await validatePaperAgainstTemplate(paper);

  await paper.save();
  // Populate for flat Subject/ExamType removed; only populate questions
  await paper.populate(['questions.questionId']);
  return mapPaper(paper);
}

export async function deletePaper(id, user) {
  const paper = await Paper.findById(id);
  if (!paper) throw new AppError('Paper not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && paper.createdBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  await paper.deleteOne();
}

export async function generatePaper(config, user) {
  let sectionSpecs = config.sections;
  let instructions = config.instructions;
  let exportSettings = config.export_settings || config.exportSettings;

  if (config.template_id || config.template) {
    const { ExamTemplate } = await import('../models/ExamTemplate.js');
    const mongoose = (await import('mongoose')).default;
    const query = mongoose.isValidObjectId(config.template_id || config.template)
      ? { _id: config.template_id || config.template }
      : { code: config.template_id || config.template };
    const template = await ExamTemplate.findOne(query);
    if (template) {
      sectionSpecs = template.sections.map((s, idx) => ({
        id: String.fromCharCode(65 + idx),
        name: s.name,
        questionCount: s.questionCount,
        marksPerQuestion: s.marksPerQuestion,
        negativeMarksPerQuestion: s.negativeMarksPerQuestion,
        question_types: s.allowedQuestionTypes,
      }));
      instructions = instructions || template.instructions;
      exportSettings = exportSettings || {
        layout: template.layoutDefaults.layout,
        margin: template.layoutDefaults.margin,
        font_family: template.layoutDefaults.fontFamily,
        font_size: template.layoutDefaults.fontSize,
        line_spacing: template.layoutDefaults.lineSpacing,
        template: template.code || template.name,
      };
    }
  }

  if (!sectionSpecs) {
    sectionSpecs = [
      {
        id: 'A',
        name: 'Section A - MCQ',
        questionCount: Number(config.total_questions || 20),
        marksPerQuestion: Number(config.marks_per_question || 4),
        negativeMarksPerQuestion: Number(config.negative_marks_per_question || config.negativeMarks || 0),
        question_types: ['mcq'],
      },
    ];
  }

  const selection = await selectQuestionsForPaper({
    ...config,
    sections: sectionSpecs.map((s) => ({
      id: s.id || s.name,
      name: s.name,
      questionCount: s.questionCount ?? s.question_count,
      marksPerQuestion: s.marksPerQuestion ?? s.marks_per_question ?? 4,
      question_types: s.question_types || s.questionTypes,
    })),
  });

  const paperQuestions = [];
  selection.sections.forEach((sec, sectionOrder) => {
    sec.questions.forEach((q, questionOrder) => {
      paperQuestions.push({
        question_id: q.id,
        section: sec.sectionId || sec.sectionName,
        section_order: sectionOrder,
        question_order: questionOrder,
        custom_marks: q.custom_marks,
        custom_negative_marks: q.custom_negative_marks || null,
      });
    });
  });

  return createPaper(
    {
      ...config,
      total_questions: selection.total_questions,
      total_marks: selection.total_marks,
      sections: sectionSpecs.map((s) => ({
        name: s.name,
        questionCount: s.questionCount ?? s.question_count,
        marksPerQuestion: s.marksPerQuestion ?? s.marks_per_question ?? 4,
        negativeMarksPerQuestion: s.negativeMarksPerQuestion ?? s.negative_marks_per_question ?? s.negativeMarks ?? 0,
      })),
      questions: paperQuestions,
      instructions: instructions,
      export_settings: exportSettings,
      status: config.status || 'draft',
    },
    user
  );
}

