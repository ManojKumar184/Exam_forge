import path from 'path';
import { Upload } from '../models/Upload.js';
import { Question } from '../models/Question.js';
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
  const result = await Upload.updateOne(
    {
      _id: uploadId,
      $or: [
        { activeProcessing: null },
        // Allow re-claim if the previous processing was started > 3 min ago (zombie)
        { 'activeProcessing.startedAt': { $lt: new Date(Date.now() - 180000) } },
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
    reconstructionVersion: 'v1.0.0',
    classificationVersion: 'v1.0.0',
  });

  const processingId = `${upload._id}-${Date.now()}`;

  // Start background process
  setTimeout(async () => {
    try {
      await processUploadInternal(upload, file, user, options, 0, processingId);
    } catch (err) {
      logger.error('Background upload processing failed', {
        uploadId: upload._id.toString(),
        error: err.message,
      });
    }
  }, 0);

  return mapUpload(upload);
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
  const upload = await Upload.create({
    filename: 'Manual Import',
    originalName: 'Manual Import',
    filePath: 'manual',
    fileType: 'manual',
    status: 'processing',
    processingStage: 'parsing',
    progress: 0,
    uploadedBy: user._id,
    originalHtml: html || null,
    originalPlain: plain || null,
    uploadOptions: options,
    reconstructionVersion: 'v1.0.0',
    classificationVersion: 'v1.0.0',
  });

  const processingId = `${upload._id}-${Date.now()}`;

  setTimeout(async () => {
    try {
      await processManualImportInternal(upload, html, plain, user, options, processingId);
    } catch (err) {
      logger.error('Background manual import processing failed', {
        uploadId: upload._id.toString(),
        error: err.message,
      });
    }
  }, 0);

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
  const upload = await Upload.findById(uploadId);
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin' && upload.uploadedBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const idx = Number(index);
  if (idx < 0 || idx >= upload.stagedQuestions.length) {
    throw new AppError('Staged question index out of bounds', 400, 'BAD_INDEX');
  }

  const current = upload.stagedQuestions[idx];
  const mappedFields = bodyToQuestionFields(questionFields);

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
  const upload = await Upload.findById(uploadId);
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
  const upload = await Upload.findById(uploadId);
  if (!docMetaChecked(upload)) throw new AppError('Upload not found', 404, 'NOT_FOUND');

  function docMetaChecked(u) { return !!u; }

  if (user.role !== 'super_admin' && upload.uploadedBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const questionIds = [...(upload.extractedQuestionIds || [])];
  let systemBankId = null;

  if (user.role === 'super_admin') {
    try {
      const { QuestionBank } = await import('../models/QuestionBank.js');
      let systemBank = await QuestionBank.findOne({ type: 'system', name: 'System Global Bank' });
      if (!systemBank) {
        systemBank = await QuestionBank.create({
          name: 'System Global Bank',
          description: 'Global repository of questions accessible by everyone.',
          type: 'system',
          createdBy: null,
          institution: null,
          visibility: 'public',
        });
      }
      systemBankId = systemBank._id;
    } catch (bankErr) {
      logger.error('Failed to resolve System Global Bank for commit', { error: bankErr.message });
    }
  }

  for (const idx of indices) {
    const numIdx = Number(idx);
    if (numIdx < 0 || numIdx >= upload.stagedQuestions.length) continue;

    const q = upload.stagedQuestions[numIdx];
    if (q.isApproved) continue;

    const created = await Question.create({
      questionText: q.questionText,
      questionType: q.questionType,
      questionLatex: q.questionLatex || null,
      questionImages: q.questionImages || [],
      options: q.options || [],
      correctOption: q.correctOption,
      numericalAnswer: q.numericalAnswer,
      numericalTolerance: q.numericalTolerance || 0,
      answerText: q.answerText || q.answerKey || null,
      difficulty: q.difficulty || 'medium',
      class: q.class || 11,
      year: q.year || null,
      explanation: q.explanation || null,
      explanationLatex: q.explanationLatex || null,
      explanationImages: q.explanationImages || [],
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
      createdBy: user._id,
      ownerId: upload.uploadedBy,
      isPrivate: user.role === 'faculty',
      visibility: user.role === 'faculty' ? 'private' : 'public',
      bankIds: user.role === 'super_admin' && systemBankId ? [systemBankId] : [],
      syllabusMappings: q.syllabusMappings || [],
    });

    q.isApproved = true;
    q.isRejected = false;
    q.savedQuestionId = created._id;
    questionIds.push(created._id);
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
  const upload = await Upload.findById(uploadId).populate('uploadedBy');
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin' && upload.uploadedBy._id.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  await Question.deleteMany({ uploadId: upload._id });

  const processingId = `${uploadId}-reprocess-${Date.now()}`;

  await Upload.updateOne(
    { _id: upload._id },
    {
      $set: {
        stagedQuestions: [],
        extractedQuestionIds: [],
        questionsExtracted: 0,
        questionsApproved: 0,
        status: 'processing',
        processingStage: 'parsing',
        progress: 0,
        attempts: (upload.attempts || 0) + 1,
      },
      $push: {
        stageLogs: `[UPLOAD_STAGE] reprocess - Triggered reprocess - ${new Date().toISOString()}`,
      },
    }
  );

  if (upload.fileType === 'manual') {
    setTimeout(async () => {
      try {
        await processManualImportInternal(
          upload,
          upload.originalHtml,
          upload.originalPlain,
          upload.uploadedBy,
          upload.uploadOptions,
          processingId
        );
      } catch (err) {
        logger.error('Background reprocess manual failed', { uploadId, error: err.message });
      }
    }, 0);
  } else {
    const file = {
      filename: upload.filename,
      originalname: upload.originalName,
      size: upload.fileSize,
    };
    setTimeout(async () => {
      try {
        await processUploadInternal(upload, file, upload.uploadedBy, upload.uploadOptions, 0, processingId);
      } catch (err) {
        logger.error('Background reprocess upload failed', { uploadId, error: err.message });
      }
    }, 0);
  }

  return mapUpload(upload);
}

/**
 * @param {string} uploadId
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
export async function duplicateUploadSession(uploadId, user) {
  const upload = await Upload.findById(uploadId);
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

  const processingId = `${uploadId}-resume-${Date.now()}`;

  // Prune staging and set status atomically
  const limitIndex = upload.checkpoint?.nextBlockIndex || 0;
  await Upload.updateOne(
    { _id: uploadId },
    {
      $set: {
        status: 'processing',
        processingStage: 'parsing',
        attempts: (upload.attempts || 0) + 1,
        activeProcessing: {
          processingId,
          startedAt: new Date(),
        },
        lastHeartbeat: new Date(),
      },
      $push: {
        stageLogs: `[UPLOAD_STAGE] resumed - Attempt #${(upload.attempts || 0) + 1} - Resuming from block index ${limitIndex} - ${new Date().toISOString()}`,
      },
    }
  );

  // Prune staged questions that were created after the checkpoint
  if (upload.stagedQuestions && upload.stagedQuestions.length > limitIndex) {
    upload.stagedQuestions = upload.stagedQuestions.slice(0, limitIndex);
    upload.markModified('stagedQuestions');
    await upload.save();
  }

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
      await processUploadInternal(upload, file, user, options, startIdx, processingId);
    } catch (err) {
      logger.error('Resumed background upload processing failed', {
        uploadId: upload._id.toString(),
        error: err.message,
      });
    }
  }, 0);

  return mapUpload(upload);
}

/**
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function listUploads(user) {
  const filter = user.role === 'super_admin' ? {} : { uploadedBy: user._id };
  const uploads = await Upload.find(filter).populate('uploadedBy').sort({ createdAt: -1 }).limit(50);
  return uploads.map(mapUpload);
}

/**
 * @param {string} id
 * @param {import('../models/User.js').IUser} user
 * @returns {Promise<Record<string, any>>}
 */
export async function getUploadById(id, user) {
  const upload = await Upload.findById(id).populate('uploadedBy');
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin' && upload.uploadedBy._id.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return mapUploadDetail(upload);
}
