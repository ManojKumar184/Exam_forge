import { ExportPreset } from '../models/ExportPreset.js';

export async function list(req, res) {
  const presets = await ExportPreset.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: presets });
}

export async function getOne(req, res) {
  const preset = await ExportPreset.findOne({ _id: req.params.id, createdBy: req.user._id });
  if (!preset) {
    return res.status(404).json({ success: false, message: 'Preset not found' });
  }
  res.json({ success: true, data: preset });
}

export async function create(req, res) {
  const payload = {
    ...req.body,
    createdBy: req.user._id
  };
  const preset = await ExportPreset.create(payload);
  res.status(201).json({ success: true, data: preset });
}

export async function update(req, res) {
  const preset = await ExportPreset.findOne({ _id: req.params.id, createdBy: req.user._id });
  if (!preset) {
    return res.status(404).json({ success: false, message: 'Preset not found or unauthorized' });
  }
  Object.assign(preset, req.body);
  await preset.save();
  res.json({ success: true, data: preset });
}

export async function remove(req, res) {
  const preset = await ExportPreset.findOneAndDelete({ _id: req.params.id, createdBy: req.user._id });
  if (!preset) {
    return res.status(404).json({ success: false, message: 'Preset not found or unauthorized' });
  }
  res.json({ success: true, message: 'Preset deleted successfully' });
}
