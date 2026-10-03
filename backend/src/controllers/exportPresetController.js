import { ExportPreset } from '../models/ExportPreset.js';

export async function list(req, res) {
  const presets = await ExportPreset.find({ institutionId: req.institutionId, createdBy: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: presets });
}

export async function getOne(req, res) {
  const preset = await ExportPreset.findOne({ _id: req.params.id, institutionId: req.institutionId, createdBy: req.user._id });
  if (!preset) {
    return res.status(404).json({ success: false, message: 'Preset not found' });
  }
  res.json({ success: true, data: preset });
}

export async function create(req, res) {
  const { name, layout, margin, fontFamily, fontSize, lineSpacing, showInstitutionLogo,
    institutionLogoUrl, institutionName, examinationName, customHeaderText, showPageNumber,
    footerInstitutionName, customFooterText, watermarkText, watermarkOpacity, watermarkSize,
    watermarkRotation, showCoverPage, numberingMode } = req.body;
  const payload = { name, layout, margin, fontFamily, fontSize, lineSpacing, showInstitutionLogo,
    institutionLogoUrl, institutionName, examinationName, customHeaderText, showPageNumber,
    footerInstitutionName, customFooterText, watermarkText, watermarkOpacity, watermarkSize,
    watermarkRotation, showCoverPage, numberingMode, institutionId: req.institutionId, createdBy: req.user._id };
  const preset = await ExportPreset.create(payload);
  res.status(201).json({ success: true, data: preset });
}

export async function update(req, res) {
  const preset = await ExportPreset.findOne({ _id: req.params.id, institutionId: req.institutionId, createdBy: req.user._id });
  if (!preset) {
    return res.status(404).json({ success: false, message: 'Preset not found or unauthorized' });
  }
  const allowed = ['name', 'layout', 'margin', 'fontFamily', 'fontSize', 'lineSpacing', 'showInstitutionLogo', 'institutionLogoUrl', 'institutionName', 'examinationName', 'customHeaderText', 'showPageNumber', 'footerInstitutionName', 'customFooterText', 'watermarkText', 'watermarkOpacity', 'watermarkSize', 'watermarkRotation', 'showCoverPage', 'numberingMode'];
  for (const key of allowed) if (req.body[key] !== undefined) preset[key] = req.body[key];
  await preset.save();
  res.json({ success: true, data: preset });
}

export async function remove(req, res) {
  const preset = await ExportPreset.findOneAndDelete({ _id: req.params.id, institutionId: req.institutionId, createdBy: req.user._id });
  if (!preset) {
    return res.status(404).json({ success: false, message: 'Preset not found or unauthorized' });
  }
  res.json({ success: true, message: 'Preset deleted successfully' });
}
