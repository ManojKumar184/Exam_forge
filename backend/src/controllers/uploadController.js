import * as uploadService from '../services/uploadService.js';
import fs from 'node:fs/promises';
import { AppError } from '../utils/AppError.js';

export async function uploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: { message: 'No file uploaded', code: 'NO_FILE' },
    });
  }

  // Verify the actual bytes; multipart Content-Type and filenames are client controlled.
  const handle = await fs.open(req.file.path, 'r');
  let signature;
  try {
    signature = Buffer.alloc(16);
    await handle.read(signature, 0, signature.length, 0);
  } finally {
    await handle.close();
  }
  const b = signature;
  const valid = req.file.mimetype === 'application/pdf'
    ? b.subarray(0, 5).toString() === '%PDF-'
    : req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ? b[0] === 0x50 && b[1] === 0x4b
      : req.file.mimetype === 'image/png' ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : ['image/jpeg', 'image/jpg'].includes(req.file.mimetype) ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
          : req.file.mimetype === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString())
            : req.file.mimetype === 'image/bmp' ? b.subarray(0, 2).toString() === 'BM' : false;
  if (!valid) {
    await fs.unlink(req.file.path).catch(() => {});
    throw new AppError('File contents do not match an accepted file type', 400, 'INVALID_FILE_SIGNATURE');
  }

  let data;
  try { data = await uploadService.startAsyncUpload(req.file, req.user, req.body || {}); }
  catch (error) { await fs.unlink(req.file.path).catch(() => {}); throw error; }

  res.status(202).json({ success: true, data });
}

export async function uploadManual(req, res) {
  const { html, plain } = req.body;
  if (!plain?.trim()) {
    return res.status(400).json({
      success: false,
      error: { message: 'Plain text is required for manual import', code: 'REQUIRED_FIELD' },
    });
  }

  const data = await uploadService.startManualImport(html, plain, req.user, {});

  res.status(202).json({ success: true, data });
}

export async function updateStagedQuestion(req, res) {
  const data = await uploadService.updateStagedQuestion(req.params.id, req.params.index, req.body, req.user);
  res.json({ success: true, data });
}

export async function rejectStagedQuestion(req, res) {
  const data = await uploadService.rejectStagedQuestion(req.params.id, req.params.index, req.user);
  res.json({ success: true, data });
}

export async function bulkRejectStagedQuestions(req, res) {
  const { indices } = req.body;
  if (!Array.isArray(indices)) {
    return res.status(400).json({
      success: false,
      error: { message: 'indices array is required', code: 'REQUIRED_FIELD' },
    });
  }

  const data = await uploadService.bulkRejectStagedQuestions(req.params.id, indices, req.user);
  res.json({ success: true, data });
}

export async function commitStagedQuestions(req, res) {
  const { indices } = req.body;
  if (!Array.isArray(indices)) {
    return res.status(400).json({
      success: false,
      error: { message: 'indices array is required', code: 'REQUIRED_FIELD' },
    });
  }

  const data = await uploadService.commitStagedQuestions(req.params.id, indices, req.user);
  res.json({ success: true, data });
}

export async function reprocess(req, res) {
  const data = await uploadService.reprocessUpload(req.params.id, req.user);
  res.json({ success: true, data });
}

export async function duplicateSession(req, res) {
  const data = await uploadService.duplicateUploadSession(req.params.id, req.user);
  res.json({ success: true, data });
}

export async function getStagedQuestionDuplicates(req, res) {
  const { id, index } = req.params;
  const { Upload } = await import('../models/Upload.js');
  const { Question } = await import('../models/Question.js');
  const { detectDuplicatesInScopes } = await import('../extraction/detectDuplicates.js');
  
  const upload = await Upload.findOne({ _id: id, institutionId: req.institutionId });
  if (!upload) {
    return res.status(404).json({ success: false, error: { message: 'Upload not found' } });
  }
  
  const idx = Number(index);
  if (idx < 0 || idx >= upload.stagedQuestions.length) {
    return res.status(400).json({ success: false, error: { message: 'Invalid staged question index' } });
  }
  
  const q = upload.stagedQuestions[idx];
  const duplicateAnalysis = await detectDuplicatesInScopes(Question, q, req.user);
  
  res.json({ success: true, data: duplicateAnalysis });
}

export async function list(req, res) {
  const data = await uploadService.listUploads(req.user);
  res.json({ success: true, data });
}

export async function getOne(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const data = await uploadService.getUploadById(req.params.id, req.user);
  res.json({ success: true, data });
}
