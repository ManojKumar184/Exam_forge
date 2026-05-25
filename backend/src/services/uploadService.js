import path from 'path';
import { Upload } from '../models/Upload.js';
import { Question } from '../models/Question.js';
import { env } from '../config/env.js';
import { getFileType } from '../config/multer.js';
import { extractionService } from '../extraction/index.js';
import { classifyQuestionMetadata } from '../ai/classifyQuestion.js';
import {
  loadClassificationCatalog,
  parseDocumentMetadata,
  classifyExtractedQuestion,
} from '../extraction/metadataClassifier.js';
import { mapUpload } from '../utils/questionMapper.js';
import { AppError } from '../utils/AppError.js';

export async function processUpload(file, user, options = {}) {
  const fileType = getFileType(file.mimetype, file.originalname);
  if (!fileType) throw new AppError('Unsupported file type', 400, 'UNSUPPORTED_FILE');

  const relativePath = `/uploads/documents/${file.filename}`;
  const upload = await Upload.create({
    filename: file.filename,
    originalName: file.originalname,
    filePath: relativePath,
    fileType,
    fileSize: file.size,
    status: 'processing',
    processingStage: 'parsing',
    uploadedBy: user._id,
  });

  try {
    const filePath = path.join(env.uploadDir, 'documents', file.filename);
    const catalog = await loadClassificationCatalog();
    const uploadContext = {
      imageDir: path.join(env.uploadDir, 'images'),
      class: options.class ? Number(options.class) : undefined,
      subjectId: options.subject_id || options.subjectId || null,
      examTypeId: options.exam_type_id || options.examTypeId || null,
      filename: file.originalname,
      source: 'upload',
      sourceFile: file.originalname,
    };

    const extractResult = await extractionService.processAndDeduplicate(
      filePath,
      fileType,
      uploadContext
    );

    const docMeta = parseDocumentMetadata(
      extractResult.rawText || extractResult.questions?.map((q) => q.questionText).join('\n') || '',
      catalog,
      uploadContext
    );

    if (!extractResult.questions?.length) {
      upload.status = 'failed';
      upload.processingError =
        extractResult.warnings?.join('; ') || 'No questions could be extracted from this file';
      upload.extractionWarnings = extractResult.warnings || [];
      upload.processingStage = 'done';
      await upload.save();
      throw new AppError(upload.processingError, 422, 'EXTRACTION_EMPTY');
    }

    upload.processingStage = 'classifying';
    const questionIds = [];

    for (const q of extractResult.questions) {
      const classified = classifyExtractedQuestion(q, catalog, docMeta, uploadContext);
      const ai = await classifyQuestionMetadata(q, catalog, docMeta);
      const { isDuplicate, ...questionFields } = q;
      const imageMetadata =
        q.imageMetadata ||
        (q.questionImages || []).map((url, order) => ({
          url,
          order,
          caption: null,
          type: 'diagram',
        }));

      const doc = await Question.create({
        ...questionFields,
        class: classified.class ?? questionFields.class,
        subjectId: classified.subjectId ?? questionFields.subjectId,
        chapterId: classified.chapterId ?? questionFields.chapterId,
        examTypeId: classified.examTypeId ?? questionFields.examTypeId,
        difficulty: classified.difficulty ?? questionFields.difficulty,
        tags: classified.tags?.length ? classified.tags : questionFields.tags,
        status: classified.status || (q.isDuplicate ? 'needs_review' : 'pending'),
        questionImages: q.questionImages || questionFields.questionImages || [],
        imageMetadata,
        diagrams: q.diagrams || [],
        hasDiagram: Boolean(q.hasDiagram || imageMetadata.length),
        hasTable: Boolean(q.hasTable),
        questionLatex: q.questionLatex || questionFields.questionLatex,
        hasEquation: Boolean(q.hasEquation || questionFields.hasEquation),
        duplicateOf: q.duplicateOf || null,
        extractionWarnings: [
          ...(classified.extractionWarnings || []),
          ...(docMeta.warnings || []),
          ...(q.extractionWarnings || []),
        ],
        aiConfidence: classified.aiConfidence ?? ai.aiConfidence,
        aiMetadata: { ...ai.aiMetadata, ...classified.aiMetadata },
        uploadId: upload._id,
        createdBy: user._id,
        source: 'upload',
        sourceFile: file.originalname,
      });
      questionIds.push(doc._id);
    }

    upload.status = 'completed';
    upload.processingStage = 'done';
    upload.questionsExtracted = questionIds.length;
    upload.extractedQuestionIds = questionIds;
    upload.extractionWarnings = [
      ...(extractResult.warnings || []),
      ...(extractResult.questions.some((q) => q.isDuplicate) ? ['Some duplicates flagged'] : []),
    ];
    upload.processedAt = new Date();
    await upload.save();

    return {
      upload: mapUpload(upload),
      questionsExtracted: questionIds.length,
      warnings: upload.extractionWarnings,
    };
  } catch (err) {
    upload.status = 'failed';
    upload.processingError = err.message;
    upload.processingStage = 'done';
    await upload.save();
    throw err;
  }
}

export async function listUploads(user) {
  const filter = user.role === 'super_admin' ? {} : { uploadedBy: user._id };
  const uploads = await Upload.find(filter).sort({ createdAt: -1 }).limit(50);
  return uploads.map(mapUpload);
}

export async function getUploadById(id, user) {
  const upload = await Upload.findById(id);
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin' && upload.uploadedBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return mapUpload(upload);
}
