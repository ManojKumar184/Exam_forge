function idStr(v) {
  return v?.toString?.() ?? v;
}

export function mapQuestion(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject({ virtuals: true }) : doc;

  return {
    id: idStr(d._id),
    subject_id: d.subjectId ? idStr(d.subjectId._id || d.subjectId) : null,
    chapter_id: d.chapterId ? idStr(d.chapterId._id || d.chapterId) : null,
    exam_type_id: d.examTypeId ? idStr(d.examTypeId._id || d.examTypeId) : null,
    question_text: d.questionText,
    question_type: d.questionType,
    question_latex: d.questionLatex,
    question_images: d.questionImages || [],
    options: d.options || [],
    option_images: d.optionImages || {},
    correct_option: d.correctOption,
    numerical_answer: d.numericalAnswer,
    numerical_tolerance: d.numericalTolerance,
    answer_text: d.answerText,
    difficulty: d.difficulty,
    marks: d.marks,
    class: d.class,
    explanation: d.explanation,
    explanation_latex: d.explanationLatex,
    explanation_images: d.explanationImages || [],
    diagrams: d.diagrams || [],
    image_metadata: (d.imageMetadata || []).map((img) => ({
      url: img.url,
      order: img.order ?? 0,
      caption: img.caption ?? null,
      type: img.type || 'diagram',
    })),
    has_diagram: d.hasDiagram,
    has_equation: d.hasEquation,
    has_table: d.hasTable ?? false,
    rendering_metadata: d.renderingMetadata || {},
    tags: d.tags || [],
    ai_confidence: d.aiConfidence ?? 0,
    ai_metadata: d.aiMetadata || {},
    status: d.status,
    extraction_warnings: d.extractionWarnings || [],
    debug_info: d.debugInfo || null,
    duplicate_hash: d.duplicateHash,
    reviewed_by: d.reviewedBy ? idStr(d.reviewedBy) : null,
    reviewed_at: d.reviewedAt?.toISOString?.() || null,
    review_notes: d.reviewNotes,
    source: d.source,
    source_file: d.sourceFile,
    extracted_from: d.extractedFrom,
    created_by: d.createdBy ? idStr(d.createdBy) : null,
    created_at: d.createdAt?.toISOString?.(),
    updated_at: d.updatedAt?.toISOString?.(),
    
    // SaaS semantic metadata fields mapping
    correct_answers: d.correctAnswers || [],
    figures: d.figures || [],
    formulas: d.formulas || [],
    semantic_blocks: d.semanticBlocks || [],
    statement_groups: d.statementGroups || [],
    comprehension_links: (d.comprehensionLinks || []).map(idStr),
    parser_confidence: d.parserConfidence ?? 0,
    reconstruction_fidelity: d.reconstructionFidelity ?? 0,
    subject: d.subjectId?.name
      ? {
          id: idStr(d.subjectId._id || d.subjectId),
          name: d.subjectId.name,
          code: d.subjectId.code,
          icon: d.subjectId.icon,
          color: d.subjectId.color,
        }
      : undefined,
    chapter: d.chapterId?.name
      ? {
          id: idStr(d.chapterId._id || d.chapterId),
          name: d.chapterId.name,
          chapter_number: d.chapterId.chapterNumber,
          class: d.chapterId.class,
        }
      : undefined,
    exam_type: d.examTypeId?.name
      ? {
          id: idStr(d.examTypeId._id || d.examTypeId),
          name: d.examTypeId.name,
          code: d.examTypeId.code,
        }
      : undefined,
  };
}

export function mapUpload(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: idStr(d._id),
    filename: d.filename,
    original_name: d.originalName,
    file_path: d.filePath,
    file_type: d.fileType,
    file_size: d.fileSize,
    status: d.status,
    questions_extracted: d.questionsExtracted,
    questions_approved: d.questionsApproved,
    processing_error: d.processingError,
    processing_stage: d.processingStage,
    progress: d.progress ?? 0,
    extraction_warnings: d.extractionWarnings || [],
    uploaded_by: idStr(d.uploadedBy),
    stage_logs: d.stageLogs || [],
    created_at: d.createdAt?.toISOString?.(),
    processed_at: d.processedAt?.toISOString?.() || null,
  };
}

export function bodyToQuestionFields(body) {
  const map = {
    subject_id: 'subjectId',
    chapter_id: 'chapterId',
    exam_type_id: 'examTypeId',
    question_text: 'questionText',
    question_type: 'questionType',
    question_latex: 'questionLatex',
    question_images: 'questionImages',
    options: 'options',
    option_images: 'optionImages',
    correct_option: 'correctOption',
    numerical_answer: 'numericalAnswer',
    numerical_tolerance: 'numericalTolerance',
    answer_text: 'answerText',
    answer_key: 'answerKey',
    difficulty: 'difficulty',
    marks: 'marks',
    class: 'class',
    explanation: 'explanation',
    explanation_latex: 'explanationLatex',
    status: 'status',
    tags: 'tags',
    ai_confidence: 'aiConfidence',
    ai_metadata: 'aiMetadata',
    image_metadata: 'imageMetadata',
    has_table: 'hasTable',
    rendering_metadata: 'renderingMetadata',
    debug_info: 'debugInfo',
    debugInfo: 'debugInfo',
    
    // SaaS fields mapping
    correct_answers: 'correctAnswers',
    correctAnswers: 'correctAnswers',
    figures: 'figures',
    formulas: 'formulas',
    semantic_blocks: 'semanticBlocks',
    semanticBlocks: 'semanticBlocks',
    statement_groups: 'statementGroups',
    statementGroups: 'statementGroups',
    comprehension_links: 'comprehensionLinks',
    comprehensionLinks: 'comprehensionLinks',
    parser_confidence: 'parserConfidence',
    parserConfidence: 'parserConfidence',
    reconstruction_fidelity: 'reconstructionFidelity',
    reconstructionFidelity: 'reconstructionFidelity',
  };

  const out = {};
  for (const [snake, camel] of Object.entries(map)) {
    if (body[snake] !== undefined) out[camel] = body[snake];
    if (body[camel] !== undefined) out[camel] = body[camel];
  }
  return out;
}
