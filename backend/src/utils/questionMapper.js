function idStr(v) {
  return v?.toString?.() ?? v;
}

export function mapQuestion(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject({ virtuals: true }) : doc;

  return {
    id: idStr(d._id),
    serial_id: d.serialId ?? null,
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
    owner_id: d.ownerId ? idStr(d.ownerId) : null,
    is_private: d.isPrivate ?? true,
    visibility: d.visibility || 'private',
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
    semantic_confidence: d.semanticConfidence ?? 0,
    math_preservation_confidence: d.mathPreservationConfidence ?? 0,
    metadata_confidence: d.metadataConfidence ?? 0,
    audit_history: d.auditHistory || [],
    
    syllabus_mappings: (d.syllabusMappings || []).map((m) => ({
      examPatternId: m.examPatternId ? idStr(m.examPatternId._id || m.examPatternId) : null,
      classId: m.classId ? idStr(m.classId._id || m.classId) : null,
      subjectId: m.subjectId ? idStr(m.subjectId._id || m.subjectId) : null,
      chapterId: m.chapterId ? idStr(m.chapterId._id || m.chapterId) : null,
      topicId: m.topicId ? idStr(m.topicId._id || m.topicId) : null,
      subtopicId: m.subtopicId ? idStr(m.subtopicId._id || m.subtopicId) : null,
    })),

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
    bank_ids: (d.bankIds || []).map(idStr),
  };
}

export function mapUpload(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  const base = {
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
    uploaded_by: idStr(d.uploadedBy?._id || d.uploadedBy),
    stage_logs: d.stageLogs || [],
    reconstruction_version: d.reconstructionVersion || 'v1.0.0',
    classification_version: d.classificationVersion || 'v1.0.0',
    original_html: d.originalHtml || null,
    original_plain: d.originalPlain || null,
    upload_options: d.uploadOptions || {},
    created_at: d.createdAt?.toISOString?.(),
    processed_at: d.processedAt?.toISOString?.() || null,
  };

  if (d.uploadedBy && typeof d.uploadedBy === 'object') {
    base.uploaded_by_user = {
      id: idStr(d.uploadedBy._id),
      full_name: d.uploadedBy.fullName,
      email: d.uploadedBy.email,
      role: d.uploadedBy.role
    };
  }
  return base;
}

export function mapUploadDetail(doc) {
  if (!doc) return null;
  const base = mapUpload(doc);
  const d = doc.toObject ? doc.toObject() : doc;

  base.staged_questions = (d.stagedQuestions || []).map((q, idx) => {
    const mapped = mapQuestion(q);
    if (mapped) {
      mapped.index = idx;
      mapped.is_approved = q.isApproved ?? false;
      mapped.is_rejected = q.isRejected ?? false;
      mapped.saved_question_id = q.savedQuestionId ? idStr(q.savedQuestionId) : null;
      mapped.duplicate_confidence = q.duplicateConfidence ?? null;
      mapped.duplicate_method = q.duplicateMethod ?? null;
      mapped.possible_matches = q.possibleMatches || [];
    }
    return mapped;
  }).filter(Boolean);

  return base;
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
    has_diagram: 'hasDiagram',
    has_equation: 'hasEquation',
    source: 'source',
    source_file: 'sourceFile',
    extracted_from: 'extractedFrom',
    upload_id: 'uploadId',
    created_by: 'createdBy',
    owner_id: 'ownerId',
    ownerId: 'ownerId',
    is_private: 'isPrivate',
    isPrivate: 'isPrivate',
    visibility: 'visibility',
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
    semantic_confidence: 'semanticConfidence',
    semanticConfidence: 'semanticConfidence',
    math_preservation_confidence: 'mathPreservationConfidence',
    mathPreservationConfidence: 'mathPreservationConfidence',
    metadata_confidence: 'metadataConfidence',
    metadataConfidence: 'metadataConfidence',
    audit_history: 'auditHistory',
    auditHistory: 'auditHistory',

    // Syllabus mapping
    syllabus_mappings: 'syllabusMappings',
    syllabusMappings: 'syllabusMappings',

    // Bank IDs mapping
    bank_ids: 'bankIds',
    bankIds: 'bankIds',
  };

  const out = {};
  const objectIdFields = ['subjectId', 'chapterId', 'examTypeId', 'uploadId', 'createdBy', 'reviewedBy', 'duplicateOf', 'ownerId'];
  for (const [snake, camel] of Object.entries(map)) {
    let val = undefined;
    if (body[snake] !== undefined) val = body[snake];
    if (body[camel] !== undefined) val = body[camel];

    if (val !== undefined) {
      if (objectIdFields.includes(camel) && val === '') {
        out[camel] = null;
      } else {
        out[camel] = val;
      }
    }
  }
  return out;
}
