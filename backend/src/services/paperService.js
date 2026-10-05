import { v4 as uuidv4 } from 'uuid';
import { Paper } from '../models/Paper.js';
import { Question } from '../models/Question.js';
import { AppError } from '../utils/AppError.js';
import { mapPaper } from '../utils/examMapper.js';
import { mapQuestion } from '../utils/questionMapper.js';
import { selectQuestionsForPaper } from './paperSelectionService.js';
import { assertWithinEntitlement, recordUsage } from './entitlementService.js';
import { prepareQuestionBankSources } from './questionBankMembershipService.js';

function toObjectIdList(items) {
  return (items || []).filter(Boolean);
}

async function buildPaperFilter(query, user) {
  const institutionId = user.activeInstitutionId || user.defaultInstitutionId;
  const filter = user.role === 'super_admin' ? { institutionId } : { institutionId };
  if (user.role === 'faculty' && user.membershipRole !== 'INSTITUTION_ADMIN') filter.createdBy = user._id;
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
    questionFilter.$and = [
      ...(questionFilter.$and || []),
      { $or: [{ institutionId }, { institutionId: null, visibility: 'public' }] },
    ];
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
  const paper = await Paper.findOne({ _id: id, institutionId: user.activeInstitutionId || user.defaultInstitutionId })
    // Populate for flat Subject/ExamType removed — collections were dropped
    .populate('questions.questionId');
  if (!paper) throw new AppError('Paper not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && paper.createdBy.toString() !== user._id.toString() && user.membershipRole !== 'INSTITUTION_ADMIN') {
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
    subjectIds: body.subject_ids || body.subjectIds || (body.subject_id || body.subjectId ? [body.subject_id || body.subjectId] : []),
    classId: body.class_id || body.classId || null,
    class: Number(body.class),
    totalMarks: Number(body.total_marks ?? body.totalMarks ?? 0),
    totalQuestions: Number(body.total_questions ?? body.totalQuestions ?? 0),
    durationMinutes: Number(body.duration_minutes ?? body.durationMinutes ?? 180),
    sections: (body.sections || []).map((s) => ({
      id: s.id || s.section_id || null,
      name: s.name,
      questionCount: Number(s.questionCount ?? s.question_count ?? 0),
      marksPerQuestion: Number(s.marksPerQuestion ?? s.marks_per_question ?? 4),
      negativeMarksPerQuestion: Number(s.negativeMarksPerQuestion ?? s.negative_marks_per_question ?? s.negativeMarks ?? 0),
      subjectId: s.subject_id || s.subjectId || null,
      subjectName: s.subject_name || s.subjectName || null,
    })),
    instructions: body.instructions ?? null,
    paperSet: body.paper_set || body.paperSet || 'A',
    isOnline: Boolean(body.is_online ?? body.isOnline ?? false),
    status: body.status || 'draft',
    generationSeed: body.generation_seed || body.generationSeed || null,
    generationVersion: body.generation_version || body.generationVersion || null,
    generationBlueprint: body.generation_blueprint || body.generationBlueprint || null,
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

function validatePaperPublication(fields) {
  const questionRows = fields.questions || [];
  const errors = [];
  if (!fields.sections?.length) errors.push('Add at least one section.');
  if (!questionRows.length) errors.push('Add at least one question.');
  if (Number(fields.totalQuestions) !== questionRows.length) errors.push(`Question total is ${questionRows.length}, expected ${fields.totalQuestions}.`);
  for (const section of fields.sections || []) {
    const rows = questionRows.filter((row) => String(row.section) === String(section.id) || String(row.section) === String(section.name));
    if (Number(section.questionCount) !== rows.length) errors.push(`${section.name}: ${rows.length} questions are assigned, expected ${section.questionCount}.`);
    if (!Number.isFinite(Number(section.marksPerQuestion)) || Number(section.marksPerQuestion) <= 0) errors.push(`${section.name}: marks per question must be positive.`);
    if (!Number.isFinite(Number(section.negativeMarksPerQuestion)) || Number(section.negativeMarksPerQuestion) < 0) errors.push(`${section.name}: negative marks cannot be below zero.`);
  }
  const sectionIndex = new Map((fields.sections || []).flatMap((section, index) => [[String(section.id || String.fromCharCode(65 + index)), section], [String.fromCharCode(65 + index), section]]));
  for (const row of questionRows) {
    if (row.customNegativeMarks != null && (!Number.isFinite(Number(row.customNegativeMarks)) || Number(row.customNegativeMarks) < 0)) errors.push(`Question in section ${row.section}: negative marks cannot be below zero.`);
  }
  const marks = questionRows.reduce((sum, row) => {
    const section = sectionIndex.get(String(row.section)) || (fields.sections || []).find((item) => item.name === row.section);
    return sum + Number(row.customMarks ?? section?.marksPerQuestion ?? 0);
  }, 0);
  if (Number(fields.totalMarks) !== marks) errors.push(`Maximum marks total is ${marks}, expected ${fields.totalMarks}.`);
  if (errors.length) throw new AppError(`Paper preflight failed: ${errors.join(' ')}`, 400, 'PAPER_PREFLIGHT_FAILED', { errors });
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
  const tenantId = user.activeInstitutionId || user.defaultInstitutionId;
  if (tenantId) await assertWithinEntitlement(tenantId, 'papers');
  const fields = mapBodyToPaperFields(body);
  fields.institutionId = user.activeInstitutionId || user.defaultInstitutionId;
  const questions = body.questions || [];
  const questionIds = toObjectIdList(
    questions.map((q) => q.question_id || q.questionId || q.id).filter(Boolean)
  );
  const institutionId = fields.institutionId;
  const eligibleQuestions = await Question.find({
    _id: { $in: questionIds }, status: 'approved',
    $or: [{ institutionId }, { institutionId: null, visibility: 'public' }],
  }).lean();
  if (questionIds.length && eligibleQuestions.length !== questionIds.length) {
    throw new AppError('Paper includes non-approved questions', 400, 'INVALID_QUESTIONS');
  }
  const questionSnapshots = new Map(eligibleQuestions.map((question) => [String(question._id), mapQuestion(question)]));

  fields.questions = questions.map((q, idx) => ({
    questionId: q.question_id || q.questionId || q.id,
    subjectId: q.subject_id || q.subjectId || null,
    section: q.section || 'A',
    sectionOrder: Number(q.section_order ?? q.sectionOrder ?? 0),
    questionOrder: Number(q.question_order ?? q.questionOrder ?? idx),
    customMarks: q.custom_marks ?? q.customMarks ?? null,
    customNegativeMarks: q.custom_negative_marks ?? q.customNegativeMarks ?? null,
    contentSnapshot: questionSnapshots.get(String(q.question_id || q.questionId || q.id)),
  }));
  fields.createdBy = user._id;

  if (fields.status === 'published') validatePaperPublication(fields);
  await validatePaperAgainstTemplate(fields);

  const doc = await Paper.create(fields);
  if (questionIds.length) {
    await Question.updateMany({ _id: { $in: [...new Set(questionIds.map(String))] } }, { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } });
  }
  if (tenantId) await recordUsage(tenantId, 'papers');
  // Populate for flat Subject/ExamType removed; only populate questions
  await doc.populate(['questions.questionId']);
  return mapPaper(doc);
}

export async function updatePaper(id, body, user) {
  let paper = await Paper.findOne({ _id: id, institutionId: user.activeInstitutionId || user.defaultInstitutionId });
  if (!paper) throw new AppError('Paper not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && paper.createdBy.toString() !== user._id.toString() && user.membershipRole !== 'INSTITUTION_ADMIN') {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const isNewVersion = paper.status === 'published';
  const previousQuestionIds = new Set((paper.questions || []).map((entry) => String(entry.questionId?._id || entry.questionId)));
  if (paper.status === 'published') {
    const original = paper;
    paper = new Paper({
      ...original.toObject(),
      _id: undefined,
      paperCode: `${original.paperCode}-V${Number(original.versionNumber || 1) + 1}-${uuidv4().slice(0, 4).toUpperCase()}`,
      status: 'draft',
      publishedAt: null,
      versionOf: original.versionOf || original._id,
      versionNumber: Number(original.versionNumber || 1) + 1,
    });
  }

  const fields = mapBodyToPaperFields({ ...paper.toObject(), ...body });
  fields.institutionId = paper.institutionId;
  Object.assign(paper, fields);
  if (body.questions) {
    const questionIds = body.questions.map((q) => q.question_id || q.questionId || q.id).filter(Boolean);
    const eligible = await Question.countDocuments({
      _id: { $in: questionIds },
      status: 'approved',
      $or: [{ institutionId: paper.institutionId }, { institutionId: null, visibility: 'public' }],
    });
    if (eligible !== questionIds.length) throw new AppError('Paper includes questions outside this institution or not approved.', 400, 'INVALID_QUESTIONS');
    const snapshotDocs = await Question.find({
      _id: { $in: questionIds }, status: 'approved',
      $or: [{ institutionId: paper.institutionId }, { institutionId: null, visibility: 'public' }],
    }).lean();
    if (snapshotDocs.length !== questionIds.length) throw new AppError('Paper includes questions outside this institution or not approved.', 400, 'INVALID_QUESTIONS');
    const snapshots = new Map(snapshotDocs.map((question) => [String(question._id), mapQuestion(question)]));
    paper.questions = body.questions.map((q, idx) => ({
      questionId: q.question_id || q.questionId || q.id,
      subjectId: q.subject_id || q.subjectId || null,
      section: q.section || 'A',
      sectionOrder: Number(q.section_order ?? q.sectionOrder ?? 0),
      questionOrder: Number(q.question_order ?? q.questionOrder ?? idx),
      customMarks: q.custom_marks ?? q.customMarks ?? null,
      customNegativeMarks: q.custom_negative_marks ?? q.customNegativeMarks ?? null,
      contentSnapshot: snapshots.get(String(q.question_id || q.questionId || q.id)),
    }));
  }
  if (paper.status === 'published') validatePaperPublication(paper);
  if (body.status === 'published' && !paper.publishedAt) {
    paper.publishedAt = new Date();
  }

  await validatePaperAgainstTemplate(paper);

  await paper.save();
  const newlyUsedQuestionIds = [...new Set((paper.questions || [])
    .map((entry) => String(entry.questionId?._id || entry.questionId))
    .filter((questionId) => questionId && (isNewVersion || !previousQuestionIds.has(questionId))))];
  if (newlyUsedQuestionIds.length) {
    await Question.updateMany({ _id: { $in: newlyUsedQuestionIds } }, { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } });
  }
  // Populate for flat Subject/ExamType removed; only populate questions
  await paper.populate(['questions.questionId']);
  return mapPaper(paper);
}

export async function deletePaper(id, user) {
  const paper = await Paper.findOne({ _id: id, institutionId: user.activeInstitutionId || user.defaultInstitutionId });
  if (!paper) throw new AppError('Paper not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && paper.createdBy.toString() !== user._id.toString() && user.membershipRole !== 'INSTITUTION_ADMIN') {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  await paper.deleteOne();
}

export async function generatePaper(config, user) {
  config = await prepareQuestionBankSources(config, user);
  let sectionSpecs = config.sections;
  let instructions = config.instructions;
  let exportSettings = config.export_settings || config.exportSettings;

  if (config.template_id || config.template) {
    const { ExamTemplate } = await import('../models/ExamTemplate.js');
    const mongoose = (await import('mongoose')).default;
    const query = mongoose.isValidObjectId(config.template_id || config.template)
      ? { _id: config.template_id || config.template }
      : { code: config.template_id || config.template };
    const template = await ExamTemplate.findOne({ ...query, isCurrent: { $ne: false } }).sort({ version: -1 });
    if (template) {
      sectionSpecs = template.sections.map((s, idx) => ({
        id: String.fromCharCode(65 + idx),
        name: s.name,
        questionCount: s.questionCount,
        marksPerQuestion: s.marksPerQuestion,
        negativeMarksPerQuestion: s.negativeMarksPerQuestion,
        question_types: s.allowedQuestionTypes,
        response_types: s.responseTypes,
        subtypes: s.subtypes,
        subjectName: s.subjectName,
      }));
      if (template.subjectStructure?.length > 1) {
        const { SyllabusNode } = await import('../models/SyllabusNode.js');
        const patternId = config.syllabus_exam_pattern_id || config.syllabusExamPatternId || config.exam_type_id || config.examTypeId;
        const patternCode = template.code === 'jee_main' ? 'JEE_MAIN' : template.code === 'jee_advanced' ? 'JEE_ADVANCED' : template.code === 'neet' ? 'NEET' : null;
        const pattern = patternId
          ? await SyllabusNode.findOne({ type: 'exam_pattern', $or: [{ _id: patternId }, { code: String(patternId).toUpperCase() }] }).lean()
          : await SyllabusNode.findOne({ type: 'exam_pattern', code: patternCode }).lean();
        if (!pattern) throw new AppError('Select a valid exam pattern for this blueprint', 400, 'INVALID_BLUEPRINT_PATTERN');
        let classNode = config.syllabus_class_id || config.syllabusClassId
          ? await SyllabusNode.findOne({ _id: config.syllabus_class_id || config.syllabusClassId, type: 'class', parentId: pattern._id }).lean()
          : null;
        if (!classNode) {
          const classes = await SyllabusNode.find({ type: 'class', parentId: pattern._id, isActive: true }).lean();
          classNode = classes.find((node) => Number(String(node.name).match(/\d+/)?.[0]) === Number(config.class)) || null;
        }
        if (!classNode) throw new AppError('Select a class in the chosen exam pattern before generating this blueprint', 400, 'INVALID_BLUEPRINT_CLASS');
        const requestedSubjectIds = config.subject_ids || config.subjectIds;
        const subjectNodes = await SyllabusNode.find({
          type: 'subject', isActive: true, parentId: classNode._id,
          name: { $in: template.subjectStructure },
          ...(requestedSubjectIds?.length ? { _id: { $in: requestedSubjectIds } } : {}),
        }).sort({ name: 1 }).lean();
        const expectedCount = requestedSubjectIds?.length || template.subjectStructure.length;
        if (subjectNodes.length !== expectedCount) throw new AppError('This blueprint requires matching canonical subjects in the selected syllabus', 400, 'BLUEPRINT_SUBJECTS_UNAVAILABLE');
        config.subject_ids = subjectNodes.map((subject) => String(subject._id));
        config.class_id = String(classNode._id);
        config.syllabus_class_id = String(classNode._id);
        config.exam_type_id = String(pattern._id);
        sectionSpecs = subjectNodes.flatMap((subject, subjectIndex) => sectionSpecs
          .filter((spec) => !spec.subjectName || spec.subjectName === subject.name)
          .map((spec, sectionIndex) => ({
            ...spec,
            id: `${subject.code || subjectIndex}-${sectionIndex + 1}`,
            name: `${subject.name} — ${spec.name}`,
            subject_id: String(subject._id),
            subjectName: subject.name,
          })));
      }
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
    institutionId: user.activeInstitutionId || user.defaultInstitutionId,
    sections: sectionSpecs.map((s) => ({
      id: s.id || s.name,
      name: s.name,
      questionCount: s.questionCount ?? s.question_count,
      marksPerQuestion: s.marksPerQuestion ?? s.marks_per_question ?? 4,
      question_types: s.question_types || s.questionTypes,
      response_types: s.response_types || s.responseTypes,
      subtypes: s.subtypes,
      subject_id: s.subject_id || s.subjectId,
    })),
  });

  const paperQuestions = [];
  selection.sections.forEach((sec, sectionOrder) => {
    sec.questions.forEach((q, questionOrder) => {
      paperQuestions.push({
        question_id: q.id,
        subject_id: sec.subjectId || sec.subject_id || q.syllabus_mappings?.[0]?.subjectId || null,
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
      generation_seed: selection.generation_seed,
      generation_version: selection.generation_version,
      generation_blueprint: { ...config, sections: sectionSpecs },
      sections: sectionSpecs.map((s) => ({
        id: s.id,
        name: s.name,
        subject_id: s.subject_id || s.subjectId || null,
        subject_name: s.subjectName || null,
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

