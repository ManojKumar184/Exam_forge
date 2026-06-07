import path from 'path';
import { Upload } from '../models/Upload.js';
import { Question } from '../models/Question.js';
import { env } from '../config/env.js';
import { getFileType } from '../config/multer.js';
import { extractionService, normalizeQuestions } from '../extraction/index.js';
import { classifyQuestionMetadata, classifyQuestionMetadataBatch } from '../ai/classifyQuestion.js';
import { loadClassificationCatalog, parseDocumentMetadata } from '../extraction/metadataClassifier.js';
import { mapUpload, mapUploadDetail, bodyToQuestionFields } from '../utils/questionMapper.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { retryAsync } from '../utils/retry.js';
import { detectDuplicatesInScopes } from '../extraction/detectDuplicates.js';

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

    const stagedQuestions = startIdx === 0 ? [] : [...(upload.stagedQuestions || [])];
    const chunkSize = 10;
    let totalDuplicatesCount = 0;
    
    let peakMemory = upload.telemetry?.peakMemory || 0;
    let maxLoopLag = upload.telemetry?.maxLoopLag || 0;

    await onStageChange('reconstructing', 40, `Found ${blocks.length} blocks. Reconstructing and persisting staging queue incrementally in chunks of ${chunkSize}...`);

    for (let i = startIdx; i < blocks.length; i += chunkSize) {
      const chunk = blocks.slice(i, i + chunkSize);
      logger.info(`[upload-worker] Reconstructing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(blocks.length / chunkSize)} (${chunk.length} blocks)`);

      // 1. Reconstruct chunk questions using normalizeQuestions
      const reconstructedQuestions = await normalizeQuestions(chunk, {
        ...uploadContext,
        returnRawBlocks: false // do actual reconstruction for this chunk
      });

      // 3. Classify the chunk questions in a batch
      let classifiedList = [];
      try {
        classifiedList = await classifyQuestionMetadataBatch(reconstructedQuestions, catalog, docMeta, uploadContext);
      } catch (err) {
        logger.warn('[upload-worker] Batch classification failed, using fallbacks', { error: err.message });
        classifiedList = reconstructedQuestions.map(() => ({
          status: 'needs_review',
          extractionWarnings: ['Batch classification failed fallback'],
        }));
      }

      for (let j = 0; j < reconstructedQuestions.length; j++) {
        const q = reconstructedQuestions[j];
        const classified = classifiedList[j] || {};
        const blockIndex = i + j;
        
        try {
          // Detect duplicates in scopes (Faculty Workspace, Faculty Banks, Institution Banks)
          const duplicateAnalysis = await detectDuplicatesInScopes(Question, q, user);
          
          if (duplicateAnalysis.isDuplicate) {
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
  
          const status = (classified.status === 'needs_review' || duplicateAnalysis.isDuplicate || lowConfidence) ? 'needs_review' : 'pending';
  
          const extractionWarnings = [
            ...(classified.extractionWarnings || []),
            ...(docMeta.warnings || []),
            ...(q.extractionWarnings || []),
          ];
          if (lowConfidence) {
            extractionWarnings.push('Low confidence score detected');
          }
          if (duplicateAnalysis.isDuplicate) {
            extractionWarnings.push(`Probable duplicate found (${duplicateAnalysis.duplicateMethod}, score ${duplicateAnalysis.duplicateScore})`);
          }
  
          const stagedQuestionObj = {
            ...q,
            class: classified.class ?? q.class,
            subjectId: classified.subjectId ?? q.subjectId,
            chapterId: classified.chapterId ?? q.chapterId,
            examTypeId: classified.examTypeId ?? q.examTypeId,
            difficulty: classified.difficulty ?? q.difficulty,
            tags: [...new Set([...(classified.tags || []), ...(q.tags || [])])],
            status,
            renderingMetadata: {
              ...(q.renderingMetadata || {}),
            },
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
            uploadId: upload._id,
            createdBy: user._id,
            ownerId: user._id,
            isPrivate: user.role === 'faculty',
            visibility: user.role === 'faculty' ? 'private' : 'public',
            source: 'upload',
            sourceFile: file.originalname,
            debugInfo: q.debugInfo || null,
            semanticEnriched: false,
            
            // Staging flags
            isApproved: false,
            isRejected: false,
            savedQuestionId: null,
          };

          stagedQuestions.push(stagedQuestionObj);
          logger.info(`[upload-worker] Staged question ${blockIndex + 1}/${blocks.length}`);
        } catch (err) {
          logger.error(`Failed to stage question block ${blockIndex + 1} during upload`, { error: err.message });
          upload.stageLogs.push(`[UPLOAD_STAGE] warning - Failed to stage question ${blockIndex + 1}: ${err.message} - ${new Date().toISOString()}`);
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
      upload.stagedQuestions = stagedQuestions;

      const progress = 40 + Math.round((Math.min(i + chunkSize, blocks.length) / blocks.length) * 50); // scales progress from 40% to 90%
      await onStageChange('reconstructing', progress, `Processed ${Math.min(i + chunkSize, blocks.length)}/${blocks.length} questions`);

      if (global.gc) {
        try { global.gc(); } catch (e) {}
      }
    }

    // Stage 7: completed
    upload.status = 'completed';
    upload.progress = 100;
    upload.processingStage = 'completed';
    upload.questionsExtracted = stagedQuestions.length;
    upload.stagedQuestions = stagedQuestions;
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

  setTimeout(async () => {
    try {
      await processManualImportInternal(upload, html, plain, user, options);
    } catch (err) {
      logger.error('Background manual import processing failed', {
        uploadId: upload._id.toString(),
        error: err.message,
      });
    }
  }, 0);

  return mapUpload(upload);
}

async function processManualImportInternal(upload, html, plain, user, options = {}) {
  const onStageChange = async (stage, progress, logMessage) => {
    upload.processingStage = stage;
    upload.progress = progress;
    if (logMessage) {
      upload.stageLogs.push(`[UPLOAD_STAGE] ${stage} - ${logMessage} - ${new Date().toISOString()}`);
    }
    upload.lastHeartbeat = new Date();
    await upload.save();
  };

  await onStageChange('uploaded', 5, 'Manual content paste received on server');

  try {
    const catalog = await loadClassificationCatalog();
    const uploadContext = {
      class: options.class ? Number(options.class) : undefined,
      subjectId: options.subjectId || options.subject_id || null,
      examTypeId: options.examTypeId || options.exam_type_id || null,
      source: 'manual',
      onStageChange,
      skipLlm: true
    };

    await onStageChange('parsing', 15, 'Extracting structured blocks from paste');
    const { splitTextIntoBlocks } = await import('../extraction/normalizeQuestions.js');
    const blocks = splitTextIntoBlocks(plain);

    if (!blocks || !blocks.length) {
      upload.status = 'failed';
      upload.progress = 100;
      upload.processingError = 'No questions could be extracted from the manual input';
      upload.processingStage = 'failed';
      await upload.save();
      return;
    }

    await onStageChange('reconstructing', 30, `Found ${blocks.length} raw blocks. Normalizing questions...`);
    const { normalizeQuestions } = await import('../extraction/normalizeQuestions.js');
    const reconstructedQuestions = await normalizeQuestions(blocks, uploadContext);

    if (!reconstructedQuestions.length) {
      upload.status = 'failed';
      upload.progress = 100;
      upload.processingError = 'No valid questions reconstructed from blocks';
      upload.processingStage = 'failed';
      await upload.save();
      return;
    }

    await onStageChange('reconstructing', 50, `Reconstructed ${reconstructedQuestions.length} questions. Running duplicate checking...`);

    const stagedQuestions = [];
    let totalDuplicatesCount = 0;

    for (let j = 0; j < reconstructedQuestions.length; j++) {
      const q = reconstructedQuestions[j];
      const blockIndex = j;
      
      try {
        const duplicateAnalysis = await detectDuplicatesInScopes(Question, q, user);
        
        if (duplicateAnalysis.isDuplicate) {
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
          (q.metadataConfidence !== undefined && q.metadataConfidence < 0.70);

        const status = (duplicateAnalysis.isDuplicate || lowConfidence) ? 'needs_review' : 'pending';

        const extractionWarnings = [
          ...(q.extractionWarnings || []),
        ];
        if (lowConfidence) {
          extractionWarnings.push('Low confidence score detected');
        }
        if (duplicateAnalysis.isDuplicate) {
          extractionWarnings.push(`Probable duplicate found (${duplicateAnalysis.duplicateMethod}, score ${duplicateAnalysis.duplicateScore})`);
        }

        const stagedQuestionObj = {
          ...q,
          class: q.class || uploadContext.class || 11,
          subjectId: q.subjectId || uploadContext.subjectId,
          examTypeId: q.examTypeId || uploadContext.examTypeId,
          status,
          renderingMetadata: {
            ...(q.renderingMetadata || {}),
          },
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
          aiConfidence: 80,
          aiMetadata: {},
          uploadId: upload._id,
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

        stagedQuestions.push(stagedQuestionObj);
      } catch (err) {
        logger.error(`Failed to stage manual question block ${blockIndex + 1}`, { error: err.message });
      }
    }

    upload.status = 'completed';
    upload.progress = 100;
    upload.processingStage = 'completed';
    upload.questionsExtracted = stagedQuestions.length;
    upload.stagedQuestions = stagedQuestions;
    upload.extractionWarnings = totalDuplicatesCount > 0 ? ['Some duplicates flagged'] : [];
    upload.processedAt = new Date();
    upload.stageLogs.push(`[UPLOAD_STAGE] completed - Manual Import processed successfully - ${new Date().toISOString()}`);
    await upload.save();
  } catch (err) {
    logger.error('Manual Import processing failed internal', {
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
  q.isRejected = !q.isRejected; // Toggling enables recovery/restoration!
  if (q.isRejected) {
    q.isApproved = false;
  }

  upload.markModified('stagedQuestions');
  await upload.save();

  return mapUploadDetail(upload);
}

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
    if (q.isApproved) continue; // skip already approved

    // Create a real Question document
    const created = await Question.create({
      subjectId: q.subjectId || null,
      chapterId: q.chapterId || null,
      examTypeId: q.examTypeId || null,
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
      status: q.status || 'pending',
      extractionWarnings: q.extractionWarnings || [],
      duplicateOf: q.duplicateOf || null,
      source: q.source || 'upload',
      sourceFile: q.sourceFile || upload.originalName,
      uploadId: upload._id,
      createdBy: user._id,
      ownerId: upload.uploadedBy, // Preserves the original uploader as owner
      isPrivate: user.role === 'faculty',
      visibility: user.role === 'faculty' ? 'private' : 'public',
      bankIds: user.role === 'super_admin' && systemBankId ? [systemBankId] : [],
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

export async function reprocessUpload(uploadId, user) {
  const upload = await Upload.findById(uploadId).populate('uploadedBy');
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin' && upload.uploadedBy._id.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  // Prune any existing Questions created for this upload
  await Question.deleteMany({ uploadId: upload._id });

  // Reset staging state
  upload.stagedQuestions = [];
  upload.extractedQuestionIds = [];
  upload.questionsExtracted = 0;
  upload.questionsApproved = 0;
  upload.status = 'processing';
  upload.processingStage = 'parsing';
  upload.progress = 0;
  upload.attempts = (upload.attempts || 0) + 1;
  upload.stageLogs = [`[UPLOAD_STAGE] reprocess - Triggered reprocess - ${new Date().toISOString()}`];
  await upload.save();

  if (upload.fileType === 'manual') {
    setTimeout(async () => {
      try {
        await processManualImportInternal(
          upload,
          upload.originalHtml,
          upload.originalPlain,
          upload.uploadedBy,
          upload.uploadOptions
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
        await processUploadInternal(upload, file, upload.uploadedBy, upload.uploadOptions, 0);
      } catch (err) {
        logger.error('Background reprocess upload failed', { uploadId, error: err.message });
      }
    }, 0);
  }

  return mapUpload(upload);
}

export async function duplicateUploadSession(uploadId, user) {
  const upload = await Upload.findById(uploadId);
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin' && upload.uploadedBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  // Create a duplicate session (reset approved flags)
  const duplicatedQuestions = (upload.stagedQuestions || []).map(q => ({
    ...q,
    isApproved: false,
    isRejected: false,
    savedQuestionId: null
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
    stageLogs: [`[UPLOAD_STAGE] duplicate - Duplicated from session ${upload._id} - ${new Date().toISOString()}`]
  });

  return mapUploadDetail(dup);
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

  // Prune staging questions that were created after the last checkpoint
  const limitIndex = upload.checkpoint?.nextBlockIndex || 0;
  if (upload.stagedQuestions && upload.stagedQuestions.length > limitIndex) {
    upload.stagedQuestions = upload.stagedQuestions.slice(0, limitIndex);
  }

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
  const uploads = await Upload.find(filter).populate('uploadedBy').sort({ createdAt: -1 }).limit(50);
  return uploads.map(mapUpload);
}

export async function getUploadById(id, user) {
  const upload = await Upload.findById(id).populate('uploadedBy');
  if (!upload) throw new AppError('Upload not found', 404, 'NOT_FOUND');
  if (user.role !== 'super_admin' && upload.uploadedBy._id.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return mapUploadDetail(upload);
}
