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
