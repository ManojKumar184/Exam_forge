import path from 'path';
import { Upload } from '../models/Upload.js';
import { Question } from '../models/Question.js';
import { env } from '../config/env.js';
import { getFileType } from '../config/multer.js';
import { extractionService } from '../extraction/index.js';
import { classifyQuestionMetadata } from '../ai/classifyQuestion.js';
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
    const extractResult = await extractionService.processAndDeduplicate(filePath, fileType, {
      imageDir: path.join(env.uploadDir, 'images'),
      class: options.class ? Number(options.class) : 11,
      source: 'upload',
      sourceFile: file.originalname,
    });

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
      const ai = await classifyQuestionMetadata(q);
      const { isDuplicate, ...questionFields } = q;
      const doc = await Question.create({
        ...questionFields,
        duplicateOf: q.duplicateOf || null,
        aiConfidence: ai.aiConfidence,
        aiMetadata: ai.aiMetadata,
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
