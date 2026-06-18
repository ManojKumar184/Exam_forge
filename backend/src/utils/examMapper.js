import { mapQuestion } from './questionMapper.js';
import { toProfile } from './userMapper.js';

function idStr(v) {
  return v?.toString?.() ?? v;
}

export function mapPaper(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: idStr(d._id),
    title: d.title,
    description: d.description ?? null,
    paper_code: d.paperCode,
    exam_type_id: d.examTypeId ? idStr(d.examTypeId._id || d.examTypeId) : null,
    subject_id: d.subjectId ? idStr(d.subjectId._id || d.subjectId) : null,
    class: d.class,
    total_marks: d.totalMarks,
    total_questions: d.totalQuestions,
    duration_minutes: d.durationMinutes,
    sections: (d.sections || []).map(s => ({
      name: s.name,
      questionCount: s.questionCount,
      marksPerQuestion: s.marksPerQuestion,
      negative_marks_per_question: s.negativeMarksPerQuestion ?? 0,
      negativeMarksPerQuestion: s.negativeMarksPerQuestion ?? 0,
    })),
    instructions: d.instructions ?? null,
    paper_set: d.paperSet,
    is_online: d.isOnline ?? false,
    status: d.status,
    export_settings: d.exportSettings ? {
      layout: d.exportSettings.layout,
      margin: d.exportSettings.margin,
      font_family: d.exportSettings.fontFamily,
      font_size: d.exportSettings.fontSize,
      line_spacing: d.exportSettings.lineSpacing,
      show_institution_logo: d.exportSettings.showInstitutionLogo,
      institution_logo_url: d.exportSettings.institutionLogoUrl,
      institution_name: d.exportSettings.institutionName,
      examination_name: d.exportSettings.examinationName,
      subject_name: d.exportSettings.subjectName,
      class_name: d.exportSettings.className,
      duration_minutes: d.exportSettings.durationMinutes,
      maximum_marks: d.exportSettings.maximumMarks,
      custom_header_text: d.exportSettings.customHeaderText,
      show_page_number: d.exportSettings.showPageNumber,
      footer_institution_name: d.exportSettings.footerInstitutionName,
      custom_footer_text: d.exportSettings.customFooterText,
      template: d.exportSettings.template,
      show_cover_page: d.exportSettings.showCoverPage,
      numbering_mode: d.exportSettings.numberingMode,
      watermark_text: d.exportSettings.watermarkText,
      watermark_opacity: d.exportSettings.watermarkOpacity,
      watermark_size: d.exportSettings.watermarkSize,
      watermark_rotation: d.exportSettings.watermarkRotation
    } : {
      layout: 'single_column',
      margin: 'normal',
      font_family: 'times_new_roman',
      font_size: 11,
      line_spacing: 1.25,
      show_institution_logo: true,
      show_page_number: true,
      template: 'default',
      show_cover_page: false,
      numbering_mode: 'continuous',
      watermark_text: null,
      watermark_opacity: 0.04,
      watermark_size: 64,
      watermark_rotation: -25
    },
    created_by: idStr(d.createdBy?._id || d.createdBy),
    created_by_profile: d.createdBy?.fullName
      ? {
          id: idStr(d.createdBy._id || d.createdBy),
          full_name: d.createdBy.fullName,
          school_institute: d.createdBy.schoolInstitute || null,
        }
      : undefined,
    created_at: d.createdAt?.toISOString?.(),
    updated_at: d.updatedAt?.toISOString?.(),
    published_at: d.publishedAt?.toISOString?.() || null,
    // Flat model populate removed (Subject, ExamType collections dropped)
    exam_type: undefined,
    subject: undefined,
    questions:
      d.questions?.map((q, index) => ({
        id: `${idStr(d._id)}-${index}`,
        paper_id: idStr(d._id),
        question_id: idStr(q.questionId?._id || q.questionId),
        section: q.section,
        section_order: q.sectionOrder ?? 0,
        question_order: q.questionOrder ?? index,
        custom_marks: q.customMarks ?? null,
        custom_negative_marks: q.customNegativeMarks ?? null,
        created_at: d.createdAt?.toISOString?.(),
        question: q.questionId?.questionText ? mapQuestion(q.questionId) : undefined,
      })) || [],
  };
}

export function mapOnlineTest(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: idStr(d._id),
    paper_id: idStr(d.paperId?._id || d.paperId),
    test_code: d.testCode,
    start_time: d.startTime?.toISOString?.() || null,
    end_time: d.endTime?.toISOString?.() || null,
    duration_minutes: d.durationMinutes,
    max_attempts: d.maxAttempts,
    shuffle_questions: d.shuffleQuestions,
    shuffle_options: d.shuffleOptions,
    show_results: d.showResults,
    show_answers: d.showAnswers,
    allow_review: d.allowReview,
    is_public: d.isPublic,
    access_code: d.accessCode ?? null,
    allowed_users: (d.allowedUsers || []).map((u) => idStr(u._id || u)),
    status: d.status,
    created_by: idStr(d.createdBy?._id || d.createdBy),
    created_at: d.createdAt?.toISOString?.(),
    updated_at: d.updatedAt?.toISOString?.(),
    paper: d.paperId?.title ? mapPaper(d.paperId) : undefined,
  };
}

export function mapTestAttempt(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: idStr(d._id),
    test_id: idStr(d.testId?._id || d.testId),
    user_id: idStr(d.userId?._id || d.userId),
    attempt_number: d.attemptNumber,
    started_at: d.startedAt?.toISOString?.(),
    submitted_at: d.submittedAt?.toISOString?.() || null,
    time_spent_seconds: d.timeSpentSeconds ?? 0,
    status: d.status,
    score: d.score ?? 0,
    max_score: d.maxScore ?? 0,
    percentage: d.percentage ?? 0,
    rank: d.rank ?? null,
    correct_answers: d.correctAnswers ?? 0,
    wrong_answers: d.wrongAnswers ?? 0,
    skipped_answers: d.skippedAnswers ?? 0,
    grading_status: d.gradingStatus ?? 'not_required',
    graded_at: d.gradedAt?.toISOString?.() || null,
    graded_by: d.gradedBy ? idStr(d.gradedBy) : null,
    test: d.testId?.testCode ? mapOnlineTest(d.testId) : undefined,
    user: d.userId?.email
      ? {
          id: idStr(d.userId._id || d.userId),
          email: d.userId.email,
          full_name: d.userId.fullName ?? null,
        }
      : undefined,
    answers:
      d.answers?.map((a) => ({
        id: idStr(a._id),
        attempt_id: idStr(d._id),
        question_id: idStr(a.questionId?._id || a.questionId),
        selected_option: a.selectedOption ?? null,
        numerical_answer: a.numericalAnswer ?? null,
        text_answer: a.textAnswer ?? null,
        is_correct: a.isCorrect ?? null,
        marks_obtained: a.marksObtained ?? 0,
        max_marks: a.maxMarks ?? null,
        grading_remarks: a.gradingRemarks ?? null,
        graded_at: a.gradedAt?.toISOString?.() || null,
        graded_by: a.gradedBy ? idStr(a.gradedBy) : null,
        is_skipped: a.isSkipped ?? false,
        is_marked_for_review: a.isMarkedForReview ?? false,
        answered_at: a.answeredAt?.toISOString?.() || null,
        time_spent_seconds: a.timeSpentSeconds ?? 0,
        question: a.questionId?.questionText ? mapQuestion(a.questionId) : undefined,
      })) || [],
  };
}

export function mapLeaderboardEntry(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: idStr(d._id),
    test_id: idStr(d.testId?._id || d.testId),
    user_id: idStr(d.userId?._id || d.userId),
    score: d.score,
    percentage: d.percentage,
    time_spent_seconds: d.timeSpentSeconds ?? 0,
    rank: d.rank ?? null,
    updated_at: d.updatedAt?.toISOString?.(),
    profile: d.userId?.email ? toProfile(d.userId) : undefined,
  };
}

