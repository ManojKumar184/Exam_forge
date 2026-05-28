import path from 'path';
import { Upload } from '../models/Upload.js';
import { Question } from '../models/Question.js';
import { env } from '../config/env.js';
import { getFileType } from '../config/multer.js';
import { extractionService, normalizeQuestions, detectDuplicatesForQuestions } from '../extraction/index.js';
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
    uploadOptions: options,
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

async function processUploadInternal(upload, file, user, options = {}, startIdx = 0) {
  const fileType = upload.fileType;
  
  // Helper for status and stage logging updates (watchdog heartbeat)
  const onStageChange = async (stage, progress, logMessage) => {
    upload.processingStage = stage;
    upload.progress = progress;
    if (logMessage) {
      upload.stageLogs.push(`[UPLOAD_STAGE] ${stage} - ${logMessage} - ${new Date().toISOString()}`);
    }
    upload.lastHeartbeat = new Date();
    await upload.save();
  };

  // Stage 0: uploaded
  await onStageChange('uploaded', 5, 'File uploaded and received on server');

  try {
    const filePath = path.join(env.uploadDir, 'documents', file.filename);
    
    // Stage 1: extracting
    await onStageChange('extracting', 15, 'XML extraction and ZIP extraction initiated');

    const catalog = await loadClassificationCatalog();
    const uploadContext = {
      imageDir: path.join(env.uploadDir, 'images'),
      class: options.class ? Number(options.class) : undefined,
      subjectId: options.subject_id || options.subjectId || null,
      examTypeId: options.exam_type_id || options.examTypeId || null,
      filename: file.originalname,
      source: 'upload',
      sourceFile: file.originalname,
      onStageChange,
      skipLlm: true, // synchronously bypass Ollama refinement during ingestion
      returnRawBlocks: true, // request raw blocks to process chunk-by-chunk!
    };

    const extractResult = await retryAsync(
      () => extractionService.processFile(filePath, fileType, uploadContext),
      { label: 'upload-extraction', retries: 1 }
    );

    if (extractResult.usedOcr) {
      await onStageChange('ocr', 35, 'Tesseract OCR fallback triggered for page images');
    }

    const docMeta = parseDocumentMetadata(
      extractResult.rawText || '',
      catalog,
      uploadContext
    );

    const blocks = extractResult.blocks || [];
    if (!blocks.length) {
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

    const questionIds = [...(upload.extractedQuestionIds || [])];
    const chunkSize = 10;
    let totalDuplicatesCount = 0;
    
    let peakMemory = upload.telemetry?.peakMemory || 0;
    let maxLoopLag = upload.telemetry?.maxLoopLag || 0;

    await onStageChange('reconstructing', 40, `Found ${blocks.length} blocks. Reconstructing and persisting incrementally in chunks of ${chunkSize}...`);

    for (let i = startIdx; i < blocks.length; i += chunkSize) {
      const chunk = blocks.slice(i, i + chunkSize);
      logger.info(`[upload-worker] Reconstructing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(blocks.length / chunkSize)} (${chunk.length} blocks)`);

      // 1. Reconstruct chunk questions using normalizeQuestions
      const reconstructedQuestions = await normalizeQuestions(chunk, {
        ...uploadContext,
        returnRawBlocks: false // do actual reconstruction for this chunk
      });

      // 2. Detect duplicates for the reconstructed chunk questions
      const questionsWithDupes = await detectDuplicatesForQuestions(Question, reconstructedQuestions);

      // 3. Persist and classify the chunk questions
      for (let j = 0; j < questionsWithDupes.length; j++) {
        const q = questionsWithDupes[j];
        const blockIndex = i + j;
        
        try {
          const classified = await classifyQuestionMetadata(q, catalog, docMeta, uploadContext);
          const { isDuplicate, ...questionFields } = q;
          
          if (isDuplicate) {
            totalDuplicatesCount++;
          }
          
          const imageMetadata = q.imageMetadata || (q.questionImages || []).map((url, order) => ({
            url,
            order,
            caption: null,
            type: 'diagram',
          }));

          const lowConfidence = 
            (q.parserConfidence !== undefined && q.parserConfidence < 0.70) ||
            (q.semanticConfidence !== undefined && q.semanticConfidence < 0.70) ||
            (q.mathPreservationConfidence !== undefined && q.mathPreservationConfidence < 0.70) ||
            (q.metadataConfidence !== undefined && q.metadataConfidence < 0.70) ||
            (classified.aiConfidence !== undefined && classified.aiConfidence < 70);

          const status = (classified.status === 'needs_review' || q.isDuplicate || lowConfidence) ? 'needs_review' : 'pending';

          const extractionWarnings = [
            ...(classified.extractionWarnings || []),
            ...(docMeta.warnings || []),
            ...(q.extractionWarnings || []),
          ];
          if (lowConfidence) {
            extractionWarnings.push('Low confidence score detected');
          }

          const doc = await Question.create({
            ...questionFields,
            class: classified.class ?? questionFields.class,
            subjectId: classified.subjectId ?? questionFields.subjectId,
            chapterId: classified.chapterId ?? questionFields.chapterId,
            examTypeId: classified.examTypeId ?? questionFields.examTypeId,
            difficulty: classified.difficulty ?? questionFields.difficulty,
            tags: [...new Set([...(classified.tags || []), ...(questionFields.tags || [])])],
            status,
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
            extractionWarnings,
            aiConfidence: classified.aiConfidence ?? 0,
            aiMetadata: classified.aiMetadata || {},
            uploadId: upload._id,
            createdBy: user._id,
            source: 'upload',
            sourceFile: file.originalname,
            debugInfo: q.debugInfo || null,
            semanticEnriched: false,
          });
          questionIds.push(doc._id);
          logger.info(`[upload-worker] Persisted question ${blockIndex + 1}/${blocks.length} (ID: ${doc._id})`);
        } catch (err) {
          logger.error(`Failed to persist question block ${blockIndex + 1} during upload`, { error: err.message });
          upload.stageLogs.push(`[UPLOAD_STAGE] warning - Failed to save question ${blockIndex + 1}: ${err.message} - ${new Date().toISOString()}`);
        }
      }

      // Update progress, checkpoint, telemetry and heartbeat
      const yieldStart = Date.now();
      await new Promise(resolve => setTimeout(resolve, 50));
      const lag = Math.max(0, Date.now() - yieldStart - 50);
      if (lag > maxLoopLag) maxLoopLag = lag;

      const mem = process.memoryUsage().heapUsed;
      if (mem > peakMemory) peakMemory = mem;

      upload.checkpoint = {
        chunkIndex: Math.floor(i / chunkSize) + 1,
        nextBlockIndex: i + chunkSize
      };
      upload.telemetry = { peakMemory, maxLoopLag };
      upload.extractedQuestionIds = questionIds;

      const progress = 40 + Math.round((Math.min(i + chunkSize, blocks.length) / blocks.length) * 50); // scales progress from 40% to 90%
      await onStageChange('reconstructing', progress, `Processed ${Math.min(i + chunkSize, blocks.length)}/${blocks.length} questions`);

      if (global.gc) {
        try { global.gc(); } catch (e) {}
      }
    }

    // Stage 6: semantic_enrichment (queued for background processing)
    await onStageChange('semantic_enrichment', 95, `Questions persisted. Queueing for background Ollama semantic enrichment...`);

    // Stage 7: completed
    upload.status = 'completed';
    upload.progress = 100;
    upload.processingStage = 'completed';
    upload.questionsExtracted = questionIds.length;
    upload.extractedQuestionIds = questionIds;
    upload.extractionWarnings = [
      ...(extractResult.warnings || []),
      ...(totalDuplicatesCount > 0 ? ['Some duplicates flagged'] : []),
    ];
    upload.processedAt = new Date();
    upload.stageLogs.push(`[UPLOAD_STAGE] completed - Upload processed successfully - ${new Date().toISOString()}`);
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

export async function resumeUpload(uploadId) {
  const upload = await Upload.findById(uploadId).populate('uploadedBy');
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');
  
  if (upload.attempts >= 3) {
    logger.warn('Upload resumption ignored - maximum attempts reached', { uploadId });
    upload.status = 'failed';
    upload.processingStage = 'failed';
    upload.processingError = 'Maximum retry attempts reached';
    await upload.save();
    return mapUpload(upload);
  }

  logger.info('Resuming upload from last checkpoint', { 
    uploadId, 
    checkpoint: upload.checkpoint,
    attempts: upload.attempts 
  });

  // Prune questions from database that were created for this upload but not committed to completed checkpoints
  const pruneRes = await Question.deleteMany({
    uploadId: upload._id,
    _id: { $nin: upload.extractedQuestionIds || [] }
  });
  logger.info('Pruned stalled chunk questions', { prunedCount: pruneRes.deletedCount });

  // Reset status to processing and increment attempts
  upload.status = 'processing';
  upload.processingStage = 'parsing';
  upload.attempts = (upload.attempts || 0) + 1;
  upload.stageLogs.push(`[UPLOAD_STAGE] resumed - Attempt #${upload.attempts} - Resuming from block index ${upload.checkpoint?.nextBlockIndex || 0} - ${new Date().toISOString()}`);
  await upload.save();

  const file = {
    filename: upload.filename,
    originalname: upload.originalName,
    size: upload.fileSize,
  };
  const user = upload.uploadedBy;
  const options = upload.uploadOptions || {};
  const startIdx = upload.checkpoint?.nextBlockIndex || 0;

  setTimeout(async () => {
    try {
      await processUploadInternal(upload, file, user, options, startIdx);
    } catch (err) {
      logger.error('Resumed background upload processing failed', {
        uploadId: upload._id.toString(),
        error: err.message,
      });
    }
  }, 0);

  return mapUpload(upload);
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
