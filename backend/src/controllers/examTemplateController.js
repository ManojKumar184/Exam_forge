import { ExamTemplate } from '../models/ExamTemplate.js';

export async function list(req, res) {
  const userId = req.user._id;
  const templates = await ExamTemplate.find({
    $or: [
      { isSystem: true },
      { createdBy: userId }
    ]
  }).sort({ isSystem: -1, createdAt: -1 });
  
  res.json({ success: true, data: templates });
}

export async function getOne(req, res) {
  const template = await ExamTemplate.findById(req.params.id);
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found' });
  }
  res.json({ success: true, data: template });
}

export async function create(req, res) {
  const payload = {
    ...req.body,
    isSystem: false,
    createdBy: req.user._id
  };
  const template = await ExamTemplate.create(payload);
  res.status(201).json({ success: true, data: template });
}

export async function update(req, res) {
  const template = await ExamTemplate.findOne({ _id: req.params.id, createdBy: req.user._id });
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found or unauthorized' });
  }
  Object.assign(template, req.body);
  await template.save();
  res.json({ success: true, data: template });
}

export async function duplicate(req, res) {
  const original = await ExamTemplate.findById(req.params.id);
  if (!original) {
    return res.status(404).json({ success: false, message: 'Template not found' });
  }
  const payload = original.toObject();
  delete payload._id;
  delete payload.createdAt;
  delete payload.updatedAt;
  payload.name = `${original.name} (Copy)`;
  payload.isSystem = false;
  payload.code = null;
  payload.createdBy = req.user._id;

  const copy = await ExamTemplate.create(payload);
  res.status(201).json({ success: true, data: copy });
}

export async function remove(req, res) {
  const template = await ExamTemplate.findOneAndDelete({ _id: req.params.id, createdBy: req.user._id });
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found or unauthorized' });
  }
  res.json({ success: true, message: 'Template deleted successfully' });
}
