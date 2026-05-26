import path from 'path';
import { Upload } from '../models/Upload.js';
import { Question } from '../models/Question.js';
import { env } from '../config/env.js';
import { getFileType } from '../config/multer.js';
import { extractionService } from '../extraction/index.js';
import { classifyQuestionMetadata } from '../ai/classifyQuestion.js';
import { loadClassificationCatalog, parseDocumentMetadata } from '../extraction/metadataClassifier.js';
import { mapUpload } from '../utils/questionMapper.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { retryAsync } from '../utils/retry.js';

export async function startAsyncUpload(file, user, options = {}) {
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
    progress: 0,
    uploadedBy: user._id,
  });

  // Start background process
  setTimeout(async () => {
    try {
      await processUploadInternal(upload, file, user, options);
    } catch (err) {
      logger.error('Background upload processing failed', {
        uploadId: upload._id.toString(),
        error: err.message,
      });
    }
  }, 0);

  return mapUpload(upload);
}

async function processUploadInternal(upload, file, user, options = {}) {
  const fileType = upload.fileType;
  
  // Stage 0: file_received
  upload.progress = 5;
  upload.processingStage = 'parsing';
  upload.stageLogs = [`[UPLOAD_STAGE] 0 file_received - ${new Date().toISOString()}`];
  await upload.save();

  try {
    const filePath = path.join(env.uploadDir, 'documents', file.filename);
    
    // Stage 1: docx_unzip_done
    upload.progress = 15;
    upload.processingStage = 'parsing';
    upload.stageLogs.push(`[UPLOAD_STAGE] 1 docx_unzip_done - ${new Date().toISOString()}`);
    await upload.save();

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

    // Stage 2: xml_parse_done
    upload.progress = 25;
    upload.processingStage = 'extracting_xml';
    upload.stageLogs.push(`[UPLOAD_STAGE] 2 xml_parse_done - ${new Date().toISOString()}`);
    await upload.save();

    const extractResult = await retryAsync(
      () => extractionService.processAndDeduplicate(filePath, fileType, uploadContext),
      { label: 'upload-extraction', retries: 1 }
    );

    // Stage 3 & 4: omml_extract_done and semantic_blocks_done
    upload.progress = 40;
    upload.processingStage = 'reconstructing';
    upload.stageLogs.push(`[UPLOAD_STAGE] 3 omml_extract_done - ${new Date().toISOString()}`);
    upload.stageLogs.push(`[UPLOAD_STAGE] 4 semantic_blocks_done - ${new Date().toISOString()}`);
    if (extractResult.usedOcr) {
      upload.processingStage = 'ocr';
    }
    await upload.save();

    const docMeta = parseDocumentMetadata(
      extractResult.rawText || extractResult.questions?.map((q) => q.questionText).join('\n') || '',
      catalog,
      uploadContext
    );

    if (!extractResult.questions?.length) {
      upload.status = 'failed';
      upload.progress = 100;
      upload.processingError =
        extractResult.warnings?.join('; ') || 'No questions could be extracted from this file';
      upload.extractionWarnings = extractResult.warnings || [];
      upload.processingStage = 'failed';
      upload.stageLogs.push(`[UPLOAD_STAGE] failed - No questions extracted - ${new Date().toISOString()}`);
      await upload.save();
      return;
    }

    // Stage 5: reconstruction_done
    upload.progress = 45;
    upload.processingStage = 'classifying';
    upload.stageLogs.push(`[UPLOAD_STAGE] 5 reconstruction_done - ${new Date().toISOString()}`);
    await upload.save();

    const questionIds = [];
    const questions = extractResult.questions;

    // Stage 6: classification_done
    upload.progress = 50;
    upload.processingStage = 'saving';
    upload.stageLogs.push(`[UPLOAD_STAGE] 6 classification_done - ${new Date().toISOString()}`);
    await upload.save();

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const classified = await classifyQuestionMetadata(q, catalog, docMeta, uploadContext);
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
        tags: [
          ...new Set([...(classified.tags || []), ...(questionFields.tags || [])]),
        ],
        status: classified.status || (q.isDuplicate ? 'needs_review' : 'pending'),
        renderingMetadata: {
          ...(questionFields.renderingMetadata || {}),
          ...(q.renderingMetadata || {}),
        },
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
        aiConfidence: classified.aiConfidence ?? 0,
        aiMetadata: classified.aiMetadata || {},
        uploadId: upload._id,
        createdBy: user._id,
        source: 'upload',
        sourceFile: file.originalname,
        debugInfo: q.debugInfo || null,
      });
      questionIds.push(doc._id);

      upload.progress = 50 + Math.round(((i + 1) / questions.length) * 45);
      await upload.save();
    }

    // Stage 7: db_save_done
    upload.progress = 98;
    upload.processingStage = 'completed';
    upload.stageLogs.push(`[UPLOAD_STAGE] 7 db_save_done - ${new Date().toISOString()}`);
    await upload.save();

    // Stage 8: completed
    upload.status = 'completed';
    upload.progress = 100;
    upload.processingStage = 'completed';
    upload.questionsExtracted = questionIds.length;
    upload.extractedQuestionIds = questionIds;
    upload.extractionWarnings = [
      ...(extractResult.warnings || []),
      ...(extractResult.questions.some((q) => q.isDuplicate) ? ['Some duplicates flagged'] : []),
    ];
    upload.processedAt = new Date();
    upload.stageLogs.push(`[UPLOAD_STAGE] 8 completed - ${new Date().toISOString()}`);
    await upload.save();
  } catch (err) {
    logger.error('Upload processing failed internal', {
      uploadId: upload._id.toString(),
      error: err.message,
    });
    upload.status = 'failed';
    upload.progress = 100;
    upload.processingError = err.message;
    upload.processingStage = 'failed';
    upload.stageLogs.push(`[UPLOAD_STAGE] failed - Error: ${err.message} - ${new Date().toISOString()}`);
    await upload.save();
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
