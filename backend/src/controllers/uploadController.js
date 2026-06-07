import * as uploadService from '../services/uploadService.js';

export async function uploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: { message: 'No file uploaded', code: 'NO_FILE' },
    });
  }

  const data = await uploadService.startAsyncUpload(req.file, req.user, {
    class: req.body.class,
    subject_id: req.body.subject_id,
    exam_type_id: req.body.exam_type_id,
  });

  res.status(202).json({ success: true, data });
}

export async function uploadManual(req, res) {
  const { html, plain, class: uploadClass, subject_id, exam_type_id } = req.body;
  if (!plain?.trim()) {
    return res.status(400).json({
      success: false,
      error: { message: 'Plain text is required for manual import', code: 'REQUIRED_FIELD' },
    });
  }

  const data = await uploadService.startManualImport(html, plain, req.user, {
    class: uploadClass,
    subject_id,
    exam_type_id,
  });

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
  
  const upload = await Upload.findById(id);
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
