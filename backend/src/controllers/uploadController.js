import * as uploadService from '../services/uploadService.js';

export async function uploadFile(req, res) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: { message: 'No file uploaded', code: 'NO_FILE' },
    });
  }

  const data = await uploadService.processUpload(req.file, req.user, {
    class: req.body.class,
  });

  res.status(201).json({ success: true, data });
}

export async function list(req, res) {
  const data = await uploadService.listUploads(req.user);
  res.json({ success: true, data });
}

export async function getOne(req, res) {
  const data = await uploadService.getUploadById(req.params.id, req.user);
  res.json({ success: true, data });
}
