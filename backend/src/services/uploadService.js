import path from 'path';
import { Upload } from '../models/Upload.js';
import { Question } from '../models/Question.js';
import { Counter } from '../models/Counter.js';
import { env } from '../config/env.js';
import { getFileType } from '../config/multer.js';
import { extractionService, normalizeQuestions } from '../extraction/index.js';
import { classifyQuestionMetadata, classifyQuestionMetadataBatch } from '../ai/classifyQuestion.js';
import { loadClassificationCatalog, parseDocumentMetadata } from '../extraction/metadataClassifier.js';
import { loadSyllabusCatalog } from '../ai/syllabusCatalog.js';
import { mapUpload, mapUploadDetail, bodyToQuestionFields } from '../utils/questionMapper.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { retryAsync } from '../utils/retry.js';
import { detectDuplicatesInScopes } from '../extraction/detectDuplicates.js';
import { validateQuestion } from '../extraction/validationEngine.js';
import { assertWithinEntitlement, recordUsage } from './entitlementService.js';
import { assertCoreV1QuestionType, validateQuestionForApproval } from './questionService.js';
import { canonicalContentFromLegacy, projectCanonicalContentToLegacyFields, reconcileCanonicalQuestionContent } from '../utils/canonicalQuestionContent.js';

/**
 * Atomic heartbeat/stage update — no version conflicts.
 * Uses updateOne with $set instead of full document save().
 */
async function atomicStageUpdate(uploadId, updates = {}) {
  const $set = {
    lastHeartbeat: new Date(),
    ...updates,
  };
  await Upload.updateOne({ _id: uploadId }, { $set });
}

/**
 * Atomic checkpoint + staged questions push.
 * Uses $push with $each to avoid reassigning the entire array.
 */
async function atomicPushStaged(uploadId, stagedQuestionObjs) {
  if (!stagedQuestionObjs?.length) return;
  await Upload.updateOne(
    { _id: uploadId },
    {
      $push: { stagedQuestions: { $each: stagedQuestionObjs } },
      $set: { lastHeartbeat: new Date() },
    }
  );
}

/**
 * Atomic set active processing guard.
 * Claims exclusive processing rights for this upload.
 * @returns {boolean} true if claim succeeded, false if another processor is active
 */
async function claimActiveProcessing(uploadId, processingId) {
  const staleBefore = new Date(Date.now() - 180000);
  const result = await Upload.updateOne(
    {
      _id: uploadId,
      $or: [
        { activeProcessing: null },
        { 'activeProcessing.processingId': processingId },
        // Reclaim only when the worker is old AND its heartbeat has stopped.
        { 'activeProcessing.startedAt': { $lt: staleBefore }, lastHeartbeat: { $lt: staleBefore } },
      ],
    },
    {
      $set: {
        activeProcessing: {
          processingId,
          startedAt: new Date(),
        },
        lastHeartbeat: new Date(),
      },
    }
  );
  return result.modifiedCount > 0;
}

/**
 * Release active processing guard.
 */
async function releaseActiveProcessing(uploadId) {
  await Upload.updateOne(
    { _id: uploadId },
    { $set: { activeProcessing: null, lastHeartbeat: new Date() } }
  );
}

/**
 * @param {{ filename: string, originalname: string, mimetype: string, size: number }} file
 * @param {import('../models/User.js').IUser} user
 * @param {Record<string, any>} [options]
 * @returns {Promise<Record<string, any>>}
 */
export async function startAsyncUpload(file, user, options = {}) {
  const institutionId = user.activeInstitutionId || user.defaultInstitutionId;
  if (institutionId) await assertWithinEntitlement(institutionId, 'uploadsPerMonth');
  const fileType = getFileType(file.mimetype, file.originalname);
  if (!fileType) throw new AppError('Unsupported file type', 400, 'UNSUPPORTED_FILE');

  const relativePath = `/uploads/documents/${file.filename}`;
  const upload = await Upload.create({
    filename: file.filename,
    originalName: file.originalname,
    filePath: relativePath,
    fileType,
    fileSize: file.size,
    status: 'pending',
    processingStage: 'uploaded',
    progress: 0,
    uploadedBy: user._id,
    institutionId: user.activeInstitutionId || user.defaultInstitutionId,
    uploadOptions: options,
    reconstructionVersion: 'v1.0.0',
    classificationVersion: 'v1.0.0',
  });
  if (institutionId) await recordUsage(institutionId, 'uploadsPerMonth');

  return mapUpload(upload);
}

export async function processQueuedUpload(upload, processingId) {
  if (upload.fileType === 'manual') {
    await processManualImportInternal(upload, upload.originalHtml, upload.originalPlain, upload.uploadedBy, upload.uploadOptions || {}, processingId);
    return;
  }
  const file = {
    filename: upload.filename,
    originalname: upload.originalName,
    mimetype: upload.fileType === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : upload.fileType === 'pdf' ? 'application/pdf' : 'application/octet-stream',
    size: upload.fileSize || 0,
  };
  await processUploadInternal(upload, file, upload.uploadedBy, upload.uploadOptions || {}, upload.checkpoint?.nextBlockIndex || 0, processingId);
}

async function processUploadInternal(upload, file, user, options = {}, startIdx = 0, processingId = null) {
  const uploadId = upload._id;
  const startTime = Date.now();

  // Claim active processing — if another processor is running, this one aborts
  const processingTag = processingId || `${uploadId}-${Date.now()}`;
  const claimed = await claimActiveProcessing(uploadId, processingTag);
  if (!claimed) {
    logger.warn(`[upload-worker] Aborting — another processor is already active for upload ${uploadId}`);
    return;
  }

  try {
    // Stage 0: uploaded
    await atomicStageUpdate(uploadId, {
      processingStage: 'uploaded',
      progress: 5,
    });

    const filePath = path.join(env.uploadDir, 'documents', file.filename);

    // Stage 1: extracting
    await atomicStageUpdate(uploadId, {
      processingStage: 'extracting',
      progress: 15,
    });

    const [catalog, syllabusCatalog] = await Promise.all([
      loadClassificationCatalog(),
      loadSyllabusCatalog().catch(() => null),
    ]);

    if (syllabusCatalog) {
      catalog.syllabus = syllabusCatalog;
    }

    // Restore onStageChange for extraction pipeline compatibility
    // (normalizeQuestions.js calls context.onStageChange for per-question progress)
    const atomicOnStageChange = async (stage, progress, logMessage) => {
      try {
        const $set = {
          processingStage: stage,
          progress,
          lastHeartbeat: new Date(),
        };
        // Build update object conditionally — never pass $push: undefined
        const update = { $set };
        if (logMessage) {
          update.$push = { stageLogs: `[UPLOAD_STAGE] ${stage} - ${logMessage} - ${new Date().toISOString()}` };
        }
        await Upload.updateOne({ _id: uploadId }, update);
      } catch (err) {
        // Non-critical: don't let progress updates fail the upload
        logger.warn('Atomic onStageChange failed', { uploadId: uploadId.toString(), error: err.message });
      }
    };

    const uploadContext = {
      imageDir: path.join(env.uploadDir, 'images'),
      class: undefined,
      filename: file.originalname,
      source: 'upload',
      sourceFile: file.originalname,
      uploadId: uploadId.toString(),
      batchIndex: 0,
      skipLlm: false,
      skipRefinement: true,
      returnRawBlocks: true,
      onStageChange: atomicOnStageChange,
      examTypeId: options.exam_type_id || options.examTypeId || null,
      exam_type_id: options.exam_type_id || options.examTypeId || null,
    };

    const extractResult = await retryAsync(
      () => extractionService.processFile(filePath, upload.fileType, uploadContext),
      { label: 'upload-extraction', retries: 1 }
    );

    if (extractResult.usedOcr) {
      await atomicStageUpdate(uploadId, {
        processingStage: 'ocr',
        progress: 35,
      });
    }

    const docMeta = parseDocumentMetadata(
      extractResult.rawText || '',
      catalog,
      uploadContext,
      syllabusCatalog
    );

    const blocks = extractResult.blocks || [];
    if (!blocks.length) {
      await Upload.updateOne(
        { _id: uploadId },
        {
          $set: {
            status: 'failed',
            progress: 100,
            processingError: extractResult.warnings?.join('; ') || 'No questions could be extracted from this file',
            extractionWarnings: extractResult.warnings || [],
            processingStage: 'failed',
            activeProcessing: null,
            lastHeartbeat: new Date(),
          },
          $push: { stageLogs: `[UPLOAD_STAGE] failed - No questions extracted - ${new Date().toISOString()}` }
        }
      );
      return;
    }

    const chunkSize = Math.min(env.ai.batchMaxSize || 25, 10); // Default 10, but could be larger
    let totalDuplicatesCount = 0;
    let classifiedDiagnostics = [];

    await atomicStageUpdate(uploadId, {
      processingStage: 'reconstructing',
      progress: 40,
    });

    // ── Process chunks ─────────────────────────────────
    for (let i = startIdx; i < blocks.length; i += chunkSize) {
      const chunk = blocks.slice(i, i + chunkSize);
      const chunkIndex = Math.floor(i / chunkSize);
      const totalChunks = Math.ceil(blocks.length / chunkSize);
      const chunkStartTime = Date.now();

      logger.info(`[UPLOAD_CHUNK] Upload=${uploadId} Chunk=${chunkIndex + 1}/${totalChunks} Blocks=${chunk.length}`);

      // 1. Reconstruct chunk
      const reconStart = Date.now();
      const reconstructedQuestions = await normalizeQuestions(chunk, {
        ...uploadContext,
        returnRawBlocks: false,
      });
      const reconDuration = Date.now() - reconStart;

      // 2. Classify the chunk questions
      const classifyStart = Date.now();
      let classifiedList = [];
      try {
        uploadContext.batchIndex = chunkIndex;
        const classifyMeta = { ...docMeta, uploadId: uploadId.toString(), batchIndex: chunkIndex };
        classifiedList = await classifyQuestionMetadataBatch(
          reconstructedQuestions, catalog, classifyMeta, uploadContext
        );
      } catch (err) {
        logger.warn('[upload-worker] Batch classification failed, using fallbacks', { error: err.message });
        classifiedList = reconstructedQuestions.map(() => ({
          status: 'needs_review',
          extractionWarnings: ['Batch classification failed fallback'],
        }));
      }
      const classifyDuration = Date.now() - classifyStart;

      // 3. Process each question — PARALLELIZE duplicate checks
      const stagedChunk = [];
      const dupStart = Date.now();

      const duplicateResults = await Promise.all(
        reconstructedQuestions.map((q) =>
          detectDuplicatesInScopes(Question, q, user).catch(() => ({
            isDuplicate: false,
            duplicateOf: null,
            duplicateScore: 0,
            duplicateMethod: null,
            possibleMatches: [],
          }))
        )
      );
      const dupDuration = Date.now() - dupStart;

      const buildStart = Date.now();
      for (let j = 0; j < reconstructedQuestions.length; j++) {
        const q = reconstructedQuestions[j];
        const classified = classifiedList[j] || {};
        const duplicateAnalysis = duplicateResults[j] || {};
        const blockIndex = i + j;

        if (duplicateAnalysis.isDuplicate) {
          totalDuplicatesCount++;
        }

        const imageMetadata = q.imageMetadata || (q.questionImages || []).map((url, order) => ({
          url, order, caption: null, type: 'diagram',
        }));

        const lowConfidence =
          (q.parserConfidence !== undefined && q.parserConfidence < 0.70) ||
          (q.semanticConfidence !== undefined && q.semanticConfidence < 0.70) ||
          (q.mathPreservationConfidence !== undefined && q.mathPreservationConfidence < 0.70) ||
          (q.metadataConfidence !== undefined && q.metadataConfidence < 0.70) ||
          (classified.aiConfidence !== undefined && classified.aiConfidence < 70);

        const status = (classified.status === 'needs_review' || duplicateAnalysis.isDuplicate || lowConfidence)
          ? 'needs_review' : 'pending';

        const extractionWarnings = [
          ...(classified.extractionWarnings || []),
          ...(docMeta.warnings || []),
          ...(q.extractionWarnings || []),
        ];
        if (lowConfidence) extractionWarnings.push('Low confidence score detected');
        if (duplicateAnalysis.isDuplicate) {
          extractionWarnings.push(`Probable duplicate found (${duplicateAnalysis.duplicateMethod}, score ${duplicateAnalysis.duplicateScore})`);
        }

        const stagedQuestionObj = {
          ...q,
          class: classified.class ?? q.class,
          difficulty: classified.difficulty ?? q.difficulty,
          tags: [...new Set([...(classified.tags || []), ...(q.tags || [])])],
          status,
          renderingMetadata: { ...(q.renderingMetadata || {}) },
          questionImages: q.questionImages || [],
          imageMetadata,
          diagrams: q.diagrams || [],
          hasDiagram: Boolean(q.hasDiagram || imageMetadata.length),
          hasTable: Boolean(q.hasTable),
          questionLatex: q.questionLatex,
          hasEquation: Boolean(q.hasEquation || q.questionLatex),
          duplicateOf: duplicateAnalysis.duplicateOf || null,
          duplicateConfidence: duplicateAnalysis.duplicateScore,
          duplicateMethod: duplicateAnalysis.duplicateMethod,
          possibleMatches: duplicateAnalysis.possibleMatches || [],
          extractionWarnings,
          aiConfidence: classified.aiConfidence ?? 0,
          aiMetadata: classified.aiMetadata || {},
          syllabusMappings: classified.syllabusMappings || null,
          uploadId: uploadId,
          institutionId: user.activeInstitutionId || user.defaultInstitutionId,
          createdBy: user._id,
          ownerId: user._id,
          isPrivate: user.role === 'faculty',
          visibility: user.role === 'faculty' ? 'private' : 'public',
          source: 'upload',
          sourceFile: file.originalname,
          debugInfo: q.debugInfo || null,
          semanticEnriched: false,
          isApproved: false,
          isRejected: false,
          savedQuestionId: null,
        };

        // Run structural validation
        const validationResult = validateQuestion(stagedQuestionObj);
        stagedQuestionObj.validationResult = {
          valid: validationResult.valid,
          issues: validationResult.issues,
          confidence: validationResult.confidence,
        };
        if (!validationResult.valid) {
          stagedQuestionObj.extractionWarnings.push(...validationResult.issues);
          stagedQuestionObj.status = 'needs_review';
        }

        stagedChunk.push(stagedQuestionObj);
      }
      const buildDuration = Date.now() - buildStart;

      // Push staged questions atomically + update checkpoint + progress
      const dbStart = Date.now();
      if (stagedChunk.length > 0) {
        await atomicPushStaged(uploadId, stagedChunk);
      }

      const progress = 40 + Math.round((Math.min(i + chunkSize, blocks.length) / blocks.length) * 50);
      const checkpoint = { chunkIndex: chunkIndex + 1, nextBlockIndex: i + chunkSize };
      const mem = process.memoryUsage().heapUsed;

      await Upload.updateOne(
        { _id: uploadId },
        {
          $set: {
            processingStage: 'reconstructing',
            progress,
            checkpoint,
            'telemetry.peakMemory': mem,
            lastHeartbeat: new Date(),
          },
          $push: {
            stageLogs: `[UPLOAD_STAGE] reconstructing - Processed ${Math.min(i + chunkSize, blocks.length)}/${blocks.length} questions - ${new Date().toISOString()}`,
          },
        }
      );
      const dbDuration = Date.now() - dbStart;

      const chunkDuration = Date.now() - chunkStartTime;
      logger.info(`[UPLOAD_CHUNK] Upload=${uploadId} Chunk=${chunkIndex + 1}/${totalChunks} Questions=${stagedChunk.length} Recon=${reconDuration}ms Classify=${classifyDuration}ms DupCheck=${dupDuration}ms Build=${buildDuration}ms DBwrite=${dbDuration}ms Total=${chunkDuration}ms`);

      if (global.gc) {
        try { global.gc(); } catch (e) {}
      }
    }

    // ── Finalize ──────────────────────────────────────
    const totalDuration = Date.now() - startTime;
    await Upload.updateOne(
      { _id: uploadId },
      {
        $set: {
          status: 'completed',
          progress: 100,
          processingStage: 'completed',
          questionsExtracted: blocks.length,
          processingError: null,
          processedAt: new Date(),
          activeProcessing: null,
          lastHeartbeat: new Date(),
          classificationDiagnostics: classifiedDiagnostics,
        },
        $push: {
          stageLogs: `[UPLOAD_STAGE] completed - Upload processed successfully (${totalDuration}ms) - ${new Date().toISOString()}`,
        },
      }
    );

    logger.info(`[UPLOAD_SUMMARY] Upload=${uploadId} Questions=${blocks.length} Duplicates=${totalDuplicatesCount} Duration=${totalDuration}ms Status=completed`);

  } catch (err) {
    const totalDuration = Date.now() - startTime;
    logger.error(`[UPLOAD_SUMMARY] Upload=${uploadId} Duration=${totalDuration}ms Status=failed`, {
      uploadId: uploadId.toString(),
      error: err.message,
    });

    await Upload.updateOne(
      { _id: uploadId },
      {
        $set: {
          status: 'failed',
          progress: 100,
          processingError: err.message,
          processingStage: 'failed',
          activeProcessing: null,
          lastHeartbeat: new Date(),
        },
        $push: {
          stageLogs: `[UPLOAD_STAGE] failed - Error: ${err.message} - ${new Date().toISOString()}`,
        },
      }
    );
  } finally {
    // Ensure processing is released even if something panics
    try { await releaseActiveProcessing(uploadId); } catch (e) {}
  }
}

/**
 * @param {string} [html]
 * @param {string} [plain]
 * @param {import('../models/User.js').IUser} user
 * @param {Record<string, any>} [options]
 * @returns {Promise<Record<string, any>>}
 */
export async function startManualImport(html, plain, user, options = {}) {
  const institutionId = user.activeInstitutionId || user.defaultInstitutionId;
  if (institutionId) await assertWithinEntitlement(institutionId, 'uploadsPerMonth');
  const upload = await Upload.create({
    filename: 'Manual Import',
    originalName: 'Manual Import',
    filePath: 'manual',
    fileType: 'manual',
    status: 'pending',
    processingStage: 'uploaded',
    progress: 0,
    uploadedBy: user._id,
    institutionId: user.activeInstitutionId || user.defaultInstitutionId,
    originalHtml: html || null,
    originalPlain: plain || null,
    uploadOptions: options,
    reconstructionVersion: 'v1.0.0',
    classificationVersion: 'v1.0.0',
  });
  if (institutionId) await recordUsage(institutionId, 'uploadsPerMonth');

  return mapUpload(upload);
}

async function processManualImportInternal(upload, html, plain, user, options = {}, processingId = null) {
  const uploadId = upload._id;
  const startTime = Date.now();

  const processingTag = processingId || `${uploadId}-${Date.now()}`;
  const claimed = await claimActiveProcessing(uploadId, processingTag);
  if (!claimed) {
    logger.warn(`[manual-import] Aborting — another processor is already active for upload ${uploadId}`);
    return;
  }

  try {
    await atomicStageUpdate(uploadId, {
      processingStage: 'uploaded',
      progress: 5,
    });

    const [catalog, syllabusCatalog] = await Promise.all([
      loadClassificationCatalog(),
      loadSyllabusCatalog().catch(() => null),
    ]);

    if (syllabusCatalog) {
      catalog.syllabus = syllabusCatalog;
    }

    const atomicOnStageChange = async (stage, progress, logMessage) => {
      try {
        const $set = {
          processingStage: stage,
          progress,
          lastHeartbeat: new Date(),
        };
        const update = { $set };
        if (logMessage) {
          update.$push = { stageLogs: `[UPLOAD_STAGE] ${stage} - ${logMessage} - ${new Date().toISOString()}` };
        }
        await Upload.updateOne({ _id: uploadId }, update);
      } catch (err) {
        logger.warn('Atomic onStageChange failed', { uploadId: uploadId.toString(), error: err.message });
      }
    };

    const uploadContext = {
      class: undefined,
      source: 'manual',
      uploadId: uploadId.toString(),
      batchIndex: 0,
      skipLlm: false,
      skipRefinement: true,
      onStageChange: atomicOnStageChange,
      examTypeId: options.exam_type_id || options.examTypeId || null,
      exam_type_id: options.exam_type_id || options.examTypeId || null,
    };

    await atomicStageUpdate(uploadId, {
      processingStage: 'parsing',
      progress: 15,
    });

    const extractResult = await extractionService.processClipboard(
      { html, plain },
      {
        ...uploadContext,
        sourceFile: 'Manual Import',
        returnRawBlocks: false,
      }
    );
    const reconstructedQuestions = extractResult.questions || [];

    if (!reconstructedQuestions.length) {
      await Upload.updateOne(
        { _id: uploadId },
        {
          $set: {
            status: 'failed',
            progress: 100,
            processingError: extractResult.warnings?.join('; ') || 'No valid questions reconstructed from paste',
            processingStage: 'failed',
            activeProcessing: null,
            lastHeartbeat: new Date(),
            extractionWarnings: extractResult.warnings || [],
          },
        }
      );
      return;
    }

    await atomicStageUpdate(uploadId, {
      processingStage: 'reconstructing',
      progress: 50,
    });

    // Run AI classification
    let classifiedList = [];
    try {
      const meta = parseDocumentMetadata(plain || '', catalog, uploadContext, syllabusCatalog);
      meta.uploadId = uploadId.toString();
      meta.batchIndex = 0;
      classifiedList = await classifyQuestionMetadataBatch(reconstructedQuestions, catalog, meta, uploadContext);
    } catch (err) {
      logger.warn('[manual-import] Batch classification failed, using fallbacks', { error: err.message });
      classifiedList = reconstructedQuestions.map(() => ({
        status: 'needs_review',
        extractionWarnings: ['AI classification failed'],
      }));
    }

    // Parallelize duplicate checks
    const duplicateResults = await Promise.all(
      reconstructedQuestions.map((q) =>
        detectDuplicatesInScopes(Question, q, user).catch(() => ({
          isDuplicate: false, duplicateOf: null, duplicateScore: 0,
          duplicateMethod: null, possibleMatches: [],
        }))
      )
    );

    let totalDuplicatesCount = 0;
    const stagedQuestions = [];

    for (let j = 0; j < reconstructedQuestions.length; j++) {
      const q = reconstructedQuestions[j];
      const classified = classifiedList[j] || {};
      const duplicateAnalysis = duplicateResults[j] || {};

      if (duplicateAnalysis.isDuplicate) totalDuplicatesCount++;

      const imageMetadata = q.imageMetadata || (q.questionImages || []).map((url, order) => ({
        url, order, caption: null, type: 'diagram',
      }));

      const lowConfidence =
        (q.parserConfidence !== undefined && q.parserConfidence < 0.70) ||
        (q.semanticConfidence !== undefined && q.semanticConfidence < 0.70) ||
        (q.mathPreservationConfidence !== undefined && q.mathPreservationConfidence < 0.70) ||
        (q.metadataConfidence !== undefined && q.metadataConfidence < 0.70) ||
        (classified.aiConfidence !== undefined && classified.aiConfidence < 70);

      const status = (classified.status === 'needs_review' || duplicateAnalysis.isDuplicate || lowConfidence)
        ? 'needs_review' : 'pending';

      const extractionWarnings = [
        ...(classified.extractionWarnings || []),
        ...(q.extractionWarnings || []),
      ];
      if (lowConfidence) extractionWarnings.push('Low confidence score detected');
      if (duplicateAnalysis.isDuplicate) {
        extractionWarnings.push(`Probable duplicate found (${duplicateAnalysis.duplicateMethod}, score ${duplicateAnalysis.duplicateScore})`);
      }

      const stagedQuestionObj = {
        ...q,
        class: classified.class ?? q.class ?? 11,
        difficulty: classified.difficulty ?? q.difficulty,
        tags: [...new Set([...(classified.tags || []), ...(q.tags || [])])],
        status,
        renderingMetadata: { ...(q.renderingMetadata || {}) },
        questionImages: q.questionImages || [],
        imageMetadata,
        diagrams: q.diagrams || [],
        hasDiagram: Boolean(q.hasDiagram || imageMetadata.length),
        hasTable: Boolean(q.hasTable),
        questionLatex: q.questionLatex,
        hasEquation: Boolean(q.hasEquation || q.questionLatex),
        duplicateOf: duplicateAnalysis.duplicateOf || null,
        duplicateConfidence: duplicateAnalysis.duplicateScore,
        duplicateMethod: duplicateAnalysis.duplicateMethod,
        possibleMatches: duplicateAnalysis.possibleMatches || [],
        extractionWarnings,
        aiConfidence: classified.aiConfidence ?? 80,
        aiMetadata: classified.aiMetadata || {},
        syllabusMappings: classified.syllabusMappings || null,
        uploadId: uploadId,
        institutionId: user.activeInstitutionId || user.defaultInstitutionId,
        createdBy: user._id,
        ownerId: user._id,
        isPrivate: user.role === 'faculty',
        visibility: user.role === 'faculty' ? 'private' : 'public',
        source: 'manual',
        sourceFile: 'Manual Import',
        debugInfo: q.debugInfo || null,
        semanticEnriched: false,
        isApproved: false,
        isRejected: false,
        savedQuestionId: null,
      };

      const validationResult = validateQuestion(stagedQuestionObj);
      stagedQuestionObj.validationResult = {
        valid: validationResult.valid,
        issues: validationResult.issues,
        confidence: validationResult.confidence,
      };
      if (!validationResult.valid) {
        stagedQuestionObj.extractionWarnings.push(...validationResult.issues);
        stagedQuestionObj.status = 'needs_review';
      }

      stagedQuestions.push(stagedQuestionObj);
    }

    // Atomic push all staged questions
    if (stagedQuestions.length > 0) {
      await atomicPushStaged(uploadId, stagedQuestions);
    }

    const totalDuration = Date.now() - startTime;
    await Upload.updateOne(
      { _id: uploadId },
      {
        $set: {
          status: 'completed',
          progress: 100,
          processingStage: 'completed',
          questionsExtracted: stagedQuestions.length,
          processingError: null,
          processedAt: new Date(),
          activeProcessing: null,
          lastHeartbeat: new Date(),
          extractionWarnings: totalDuplicatesCount > 0 ? ['Some duplicates flagged'] : [],
        },
        $push: {
          stageLogs: `[UPLOAD_STAGE] completed - Manual Import processed successfully (${totalDuration}ms) - ${new Date().toISOString()}`,
        },
      }
    );

    logger.info(`[UPLOAD_SUMMARY] Upload=${uploadId} Questions=${stagedQuestions.length} Duplicates=${totalDuplicatesCount} Duration=${totalDuration}ms Status=completed`);

  } catch (err) {
    const totalDuration = Date.now() - startTime;
    logger.error(`[UPLOAD_SUMMARY] Upload=${uploadId} Duration=${totalDuration}ms Status=failed`, {
      uploadId: uploadId.toString(),
      error: err.message,
    });

    await Upload.updateOne(
      { _id: uploadId },
      {
        $set: {
          status: 'failed',
          progress: 100,
          processingError: err.message,
          processingStage: 'failed',
          activeProcessing: null,
          lastHeartbeat: new Date(),
        },
        $push: {
          stageLogs: `[UPLOAD_STAGE] failed - Error: ${err.message} - ${new Date().toISOString()}`,
        },
      }
    );
  } finally {
    try { await releaseActiveProcessing(uploadId); } catch (e) {}
  }
}

/**
 * @param {string} uploadId
 * @param {string|number} index
 * @param {Record<string, any>} questionFields
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
export async function updateStagedQuestion(uploadId, index, questionFields, user) {
  const upload = await Upload.findOne({ _id: uploadId, institutionId: user.activeInstitutionId || user.defaultInstitutionId });
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin' && upload.uploadedBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const idx = Number(index);
  if (idx < 0 || idx >= upload.stagedQuestions.length) {
    throw new AppError('Staged question index out of bounds', 400, 'BAD_INDEX');
  }

  const current = upload.stagedQuestions[idx];
  const mappedFields = bodyToQuestionFields(questionFields, new Set([
    'questionText', 'questionType', 'contextType', 'questionLatex', 'questionImages', 'options',
    'correctOption', 'numericalAnswer', 'numericalTolerance', 'answerText', 'answerKey', 'difficulty',
    'sourceMarks', 'class', 'year', 'explanation', 'explanationLatex', 'explanationImages', 'diagrams',
    'imageMetadata', 'hasDiagram', 'hasEquation', 'hasTable', 'renderingMetadata', 'contentBlocks',
    'canonicalContent', 'tags', 'correctAnswers', 'figures', 'formulas', 'semanticBlocks', 'statementGroups',
    'syllabusMappings', 'bankIds',
  ]));
  if (mappedFields.bankIds) {
    const { validateQuestionBankIds } = await import('./questionBankMembershipService.js');
    mappedFields.bankIds = await validateQuestionBankIds(mappedFields.bankIds, user);
  }
  if (mappedFields.questionType) mappedFields.questionType = assertCoreV1QuestionType(mappedFields.questionType);
  const currentFields = current.toObject ? current.toObject() : current;
  mappedFields.canonicalContent = reconcileCanonicalQuestionContent({ ...currentFields, questionType: mappedFields.questionType || current.questionType }, mappedFields);
  Object.assign(mappedFields, projectCanonicalContentToLegacyFields(mappedFields.canonicalContent, mappedFields.questionType || current.questionType, mappedFields));

  upload.stagedQuestions[idx] = {
    ...current,
    ...mappedFields,
    options: mappedFields.options !== undefined ? mappedFields.options : current.options,
  };

  upload.markModified('stagedQuestions');
  await upload.save();

  return mapUploadDetail(upload);
}

/**
 * @param {string} uploadId
 * @param {string|number} index
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
export async function rejectStagedQuestion(uploadId, index, user) {
  const upload = await Upload.findOne({ _id: uploadId, institutionId: user.activeInstitutionId || user.defaultInstitutionId });
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin' && upload.uploadedBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const idx = Number(index);
  if (idx < 0 || idx >= upload.stagedQuestions.length) {
    throw new AppError('Staged question index out of bounds', 400, 'BAD_INDEX');
  }

  const q = upload.stagedQuestions[idx];
  q.isRejected = !q.isRejected;
  if (q.isRejected) {
    q.isApproved = false;
    q.status = 'rejected';
  } else {
    q.status = q.validationResult?.valid === false ? 'needs_review' : 'pending';
  }
  q.canonicalContent = canonicalContentFromLegacy(q);
  q.canonicalContent.validation = { ...q.canonicalContent.validation, status: q.status };

  upload.markModified('stagedQuestions');
  await upload.save();

  return mapUploadDetail(upload);
}

/**
 * @param {string} uploadId
 * @param {number[]} indices
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
export async function bulkRejectStagedQuestions(uploadId, indices, user) {
  const upload = await Upload.findOne({ _id: uploadId, institutionId: user.activeInstitutionId || user.defaultInstitutionId });
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin' && upload.uploadedBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  for (const index of indices) {
    const idx = Number(index);
    if (idx < 0 || idx >= upload.stagedQuestions.length) continue;
    const q = upload.stagedQuestions[idx];
    q.isRejected = true;
    q.isApproved = false;
    q.status = 'rejected';
    q.canonicalContent = canonicalContentFromLegacy(q);
    q.canonicalContent.validation = { ...q.canonicalContent.validation, status: 'rejected' };
  }

  upload.markModified('stagedQuestions');
  await upload.save();

  return mapUploadDetail(upload);
}


/**
 * @param {string} uploadId
 * @param {string[]} indices
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
export async function commitStagedQuestions(uploadId, indices, user) {
  const upload = await Upload.findOne({ _id: uploadId, institutionId: user.activeInstitutionId || user.defaultInstitutionId });
  if (!docMetaChecked(upload)) throw new AppError('Upload not found', 404, 'NOT_FOUND');

  function docMetaChecked(u) { return !!u; }

  if (user.role !== 'super_admin' && upload.uploadedBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const questionIds = [...(upload.extractedQuestionIds || [])];
  let defaultBankIds = [];
  try {
    const { resolveDefaultQuestionBankIds } = await import('./questionBankMembershipService.js');
    defaultBankIds = await resolveDefaultQuestionBankIds(user);
  } catch (bankErr) {
    logger.error('Failed to resolve default question bank for commit', { error: bankErr.message });
  }

  const docsToCreate = [];
  const validStagedQuestions = [];

  for (const idx of indices) {
    const numIdx = Number(idx);
    if (numIdx < 0 || numIdx >= upload.stagedQuestions.length) continue;

    const q = upload.stagedQuestions[numIdx];
    if (q.isApproved || q.isRejected) continue;

    try {
      validateQuestionForApproval(q);
    } catch (error) {
      if (!['UNSUPPORTED_QUESTION_TYPE', 'INCOMPLETE_METADATA'].includes(error.code)) throw error;
      q.isApproved = false;
      q.isRejected = false;
      q.status = 'needs_review';
      continue;
    }

    const canonicalContent = canonicalContentFromLegacy(q);
    const projectedContent = projectCanonicalContentToLegacyFields(canonicalContent, q.questionType, q);
    const questionBankIds = q.bankIds?.length
      ? await (await import('./questionBankMembershipService.js')).validateQuestionBankIds(q.bankIds, user)
      : defaultBankIds;
    docsToCreate.push({
      questionText: projectedContent.questionText,
      contentBlocks: projectedContent.contentBlocks,
      canonicalContent: {
        ...canonicalContent,
        validation: {
          ...(q.canonicalContent?.validation || {}),
          status: 'approved',
          warnings: q.extractionWarnings || [],
          fidelity: {
            parser: q.parserConfidence ?? null,
            reconstruction: q.reconstructionFidelity ?? null,
            math: q.mathPreservationConfidence ?? null,
          },
        },
      },
      questionType: q.questionType,
      questionLatex: projectedContent.questionLatex,
      questionImages: projectedContent.questionImages,
      options: projectedContent.options,
      correctOption: projectedContent.correctOption,
      correctAnswers: projectedContent.correctAnswers || [],
      numericalAnswer: projectedContent.numericalAnswer,
      numericalTolerance: projectedContent.numericalTolerance ?? q.numericalTolerance ?? 0,
      answerText: projectedContent.answerText || q.answerKey || null,
      difficulty: q.difficulty || 'medium',
      class: q.class || 11,
      year: q.year || null,
      explanation: projectedContent.explanation,
      explanationLatex: projectedContent.explanationLatex,
      explanationImages: projectedContent.explanationImages,
      diagrams: q.diagrams || [],
      imageMetadata: q.imageMetadata || [],
      hasDiagram: q.hasDiagram || false,
      hasEquation: q.hasEquation || false,
      hasTable: q.hasTable || false,
      renderingMetadata: q.renderingMetadata || {},
      tags: q.tags || [],
      aiConfidence: q.aiConfidence || 0,
      aiMetadata: q.aiMetadata || {},
      status: 'approved',
      extractionWarnings: q.extractionWarnings || [],
      duplicateOf: q.duplicateOf || null,
      source: q.source || 'upload',
      sourceFile: q.sourceFile || upload.originalName,
      uploadId: upload._id,
      institutionId: upload.institutionId,
      createdBy: user._id,
      ownerId: upload.uploadedBy,
      isPrivate: user.role === 'faculty',
      visibility: user.role === 'faculty' ? 'private' : 'public',
      bankIds: questionBankIds,
      syllabusMappings: q.syllabusMappings || [],
    });
    validStagedQuestions.push(q);
  }

  if (docsToCreate.length > 0) {
    if (upload.institutionId) await assertWithinEntitlement(upload.institutionId, 'questions', docsToCreate.length);
    const counter = await Counter.findOneAndUpdate(
      { _id: 'questions' },
      { $inc: { seq: docsToCreate.length } },
      { new: true, upsert: true }
    );
    const startSeq = counter.seq - docsToCreate.length + 1;
    for (let i = 0; i < docsToCreate.length; i++) {
      docsToCreate[i].serialId = startSeq + i;
    }

    const createdDocs = await Question.insertMany(docsToCreate);
    if (upload.institutionId) await recordUsage(upload.institutionId, 'questions', createdDocs.length);
    for (let k = 0; k < createdDocs.length; k++) {
      const created = createdDocs[k];
      const q = validStagedQuestions[k];
      q.isApproved = true;
      q.isRejected = false;
      q.status = 'approved';
      q.canonicalContent = canonicalContentFromLegacy(q);
      q.canonicalContent.validation = { ...q.canonicalContent.validation, status: 'approved' };
      q.savedQuestionId = created._id;
      questionIds.push(created._id);
    }
  }

  upload.extractedQuestionIds = questionIds;
  upload.questionsApproved = upload.stagedQuestions.filter(q => q.isApproved).length;
  upload.markModified('stagedQuestions');
  await upload.save();

  return mapUploadDetail(upload);
}

/**
 * @param {string} uploadId
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
export async function reprocessUpload(uploadId, user) {
  const upload = await Upload.findOne({ _id: uploadId, institutionId: user.activeInstitutionId || user.defaultInstitutionId }).populate('uploadedBy');
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin' && upload.uploadedBy._id.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  // Retain every canonical Question: downstream papers, tests, and attempts may
  // reference them. Claim the upload atomically so concurrent reprocess calls
  // cannot reset an active extraction.
  const reset = await Upload.updateOne(
    {
      _id: upload._id,
      $or: [
        { activeProcessing: null },
        { activeProcessing: { $exists: false } },
      ],
    },
    {
      $set: {
        stagedQuestions: [],
        extractedQuestionIds: [],
        questionsExtracted: 0,
        questionsApproved: 0,
        status: 'pending',
        nextAttemptAt: null,
        processingStage: 'uploaded',
        activeProcessing: null,
        progress: 0,
        attempts: upload.attempts || 0,
      },
      $push: {
        stageLogs: `[UPLOAD_STAGE] reprocess - Triggered reprocess - ${new Date().toISOString()}`,
      },
    }
  );
  if (!reset.modifiedCount) throw new AppError('Upload is already being processed', 409, 'UPLOAD_PROCESSING');

  upload.status = 'pending';
  upload.processingStage = 'uploaded';
  upload.activeProcessing = null;
  upload.progress = 0;
  upload.stagedQuestions = [];
  upload.extractedQuestionIds = [];

  return mapUpload(upload);
}

/**
 * @param {string} uploadId
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
export async function duplicateUploadSession(uploadId, user) {
  const upload = await Upload.findOne({ _id: uploadId, institutionId: user.activeInstitutionId || user.defaultInstitutionId });
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin' && upload.uploadedBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const duplicatedQuestions = (upload.stagedQuestions || []).map(q => ({
    ...q,
    isApproved: false,
    isRejected: false,
    savedQuestionId: null,
  }));

  const dup = await Upload.create({
    filename: `${upload.filename}-copy`,
    originalName: `${upload.originalName} (Copy)`,
    filePath: upload.filePath,
    fileType: upload.fileType,
    fileSize: upload.fileSize,
    status: 'completed',
    processingStage: 'completed',
    progress: 100,
    uploadedBy: user._id,
    institutionId: upload.institutionId,
    uploadOptions: upload.uploadOptions,
    stagedQuestions: duplicatedQuestions,
    questionsExtracted: duplicatedQuestions.length,
    questionsApproved: 0,
    reconstructionVersion: upload.reconstructionVersion || 'v1.0.0',
    classificationVersion: upload.classificationVersion || 'v1.0.0',
    originalHtml: upload.originalHtml,
    originalPlain: upload.originalPlain,
    stageLogs: [`[UPLOAD_STAGE] duplicate - Duplicated from session ${upload._id} - ${new Date().toISOString()}`],
  });

  return mapUploadDetail(dup);
}

/**
 * @param {string} uploadId
 * @returns {Promise<Record<string, any>>}
 */
export async function resumeUpload(uploadId) {
  const upload = await Upload.findById(uploadId).populate('uploadedBy');
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');

  if (upload.attempts >= 3) {
    logger.warn('Upload resumption ignored - maximum attempts reached', { uploadId });
    await Upload.updateOne(
      { _id: uploadId },
      {
        $set: {
          status: 'failed',
          processingStage: 'failed',
          processingError: 'Maximum retry attempts reached',
          activeProcessing: null,
          lastHeartbeat: new Date(),
        },
      }
    );
    return mapUpload(upload);
  }

  logger.info('Resuming upload from last checkpoint', {
    uploadId,
    checkpoint: upload.checkpoint,
    attempts: upload.attempts,
  });

  // Prune staging and set status atomically
  const limitIndex = upload.checkpoint?.nextBlockIndex || 0;
  const staleBefore = new Date(Date.now() - (upload.activeProcessing ? 180000 : 60000));
  const resumed = await Upload.updateOne(
    {
      _id: uploadId,
      status: 'processing',
      $and: [
        { $or: [{ lastHeartbeat: { $lt: staleBefore } }, { lastHeartbeat: { $exists: false }, updatedAt: { $lt: staleBefore } }] },
        { $or: [{ activeProcessing: null }, { activeProcessing: { $exists: false } }, { 'activeProcessing.startedAt': { $lt: new Date(Date.now() - 180000) } }] },
      ],
    },
    {
      $set: {
      status: 'pending',
      nextAttemptAt: null,
        processingStage: 'parsing',
        attempts: upload.attempts || 0,
      activeProcessing: null,
        lastHeartbeat: new Date(),
      },
      $push: {
        stageLogs: `[UPLOAD_STAGE] resumed - Attempt #${(upload.attempts || 0) + 1} - Resuming from block index ${limitIndex} - ${new Date().toISOString()}`,
      },
    }
  );

  if (!resumed.modifiedCount) {
    throw new AppError('Upload is no longer stalled', 409, 'UPLOAD_NOT_STALLED');
  }

  upload.status = 'pending';
  upload.processingStage = 'parsing';
  upload.activeProcessing = null;

  // Prune staged questions that were created after the checkpoint
  if (upload.stagedQuestions && upload.stagedQuestions.length > limitIndex) {
    upload.stagedQuestions = upload.stagedQuestions.slice(0, limitIndex);
    upload.markModified('stagedQuestions');
    await upload.save();
  }

  return mapUpload(upload);
}

/**
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function listUploads(user) {
  const filter = { institutionId: user.activeInstitutionId || user.defaultInstitutionId };
  if (user.role !== 'super_admin') filter.uploadedBy = user._id;
  const uploads = await Upload.find(filter).populate('uploadedBy').sort({ createdAt: -1 }).limit(50);
  return uploads.map(mapUpload);
}

/**
 * @param {string} id
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
export async function getUploadById(id, user) {
  const upload = await Upload.findOne({ _id: id, institutionId: user.activeInstitutionId || user.defaultInstitutionId }).populate('uploadedBy');
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin' && upload.uploadedBy._id.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return mapUploadDetail(upload);
}
