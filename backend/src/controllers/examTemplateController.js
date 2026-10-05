import { ExamTemplate } from '../models/ExamTemplate.js';

export async function list(req, res) {
  const userId = req.user._id;
  const filter = {
    $or: [
      { isSystem: true },
      { institutionId: req.institutionId, createdBy: userId }
    ]
  };
  if (req.query.include_versions !== 'true') filter.isCurrent = { $ne: false };
  const templates = await ExamTemplate.find(filter).sort({ isSystem: -1, code: 1, version: -1, createdAt: -1 });
  
  res.json({ success: true, data: templates });
}

export async function getOne(req, res) {
  const template = await ExamTemplate.findOne({ _id: req.params.id, $or: [{ isSystem: true }, { institutionId: req.institutionId }] });
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found' });
  }
  res.json({ success: true, data: template });
}

export async function create(req, res) {
  const { name, subjectStructure, sections, instructions, layoutDefaults, exportDefaults, paperCount, examYear, effectiveFrom, effectiveTo, officialSource, attemptRules, constraints } = req.body;
  const payload = {
    name, subjectStructure, sections, instructions, layoutDefaults, exportDefaults, paperCount, examYear, effectiveFrom, effectiveTo, officialSource, attemptRules, constraints,
    isSystem: false,
    isCurrent: true,
    isPublished: req.body.isPublished === true,
    version: 1,
    institutionId: req.institutionId,
    createdBy: req.user._id
  };
  const template = await ExamTemplate.create(payload);
  res.status(201).json({ success: true, data: template });
}

export async function update(req, res) {
  const template = await ExamTemplate.findOne({ _id: req.params.id, institutionId: req.institutionId, createdBy: req.user._id });
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found or unauthorized' });
  }
  const fields = ['name', 'subjectStructure', 'sections', 'instructions', 'layoutDefaults', 'exportDefaults', 'paperCount', 'examYear', 'effectiveFrom', 'effectiveTo', 'officialSource', 'attemptRules', 'constraints'];
  const changes = Object.fromEntries(fields.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
  let updated;
  if (template.isPublished) {
    template.isCurrent = false;
    await template.save();
    updated = await ExamTemplate.create({
      ...changes,
      name: changes.name || template.name,
      subjectStructure: changes.subjectStructure || template.subjectStructure,
      sections: changes.sections || template.sections,
      instructions: changes.instructions ?? template.instructions,
      layoutDefaults: changes.layoutDefaults || template.layoutDefaults,
      exportDefaults: changes.exportDefaults || template.exportDefaults,
      paperCount: changes.paperCount ?? template.paperCount,
      examYear: changes.examYear ?? template.examYear,
      effectiveFrom: changes.effectiveFrom ?? template.effectiveFrom,
      effectiveTo: changes.effectiveTo ?? template.effectiveTo,
      officialSource: changes.officialSource ?? template.officialSource,
      attemptRules: changes.attemptRules ?? template.attemptRules,
      constraints: changes.constraints ?? template.constraints,
      isSystem: false,
      isCurrent: true,
      isPublished: req.body.isPublished === true,
      version: Number(template.version || 1) + 1,
      versionOf: template.versionOf || template._id,
      schemaVersion: template.schemaVersion || 'blueprint-v1',
      code: template.code,
      createdBy: req.user._id,
      institutionId: req.institutionId,
    });
  } else {
    Object.assign(template, changes);
    if (req.body.isPublished !== undefined) template.isPublished = req.body.isPublished === true;
    await template.save();
    updated = template;
  }
  res.json({ success: true, data: updated });
}

export async function duplicate(req, res) {
  const original = await ExamTemplate.findOne({ _id: req.params.id, $or: [{ isSystem: true }, { institutionId: req.institutionId }] });
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
  payload.version = 1;
  payload.versionOf = null;
  payload.isCurrent = true;
  payload.isPublished = false;
  payload.createdBy = req.user._id;
  payload.institutionId = req.institutionId;

  const copy = await ExamTemplate.create(payload);
  res.status(201).json({ success: true, data: copy });
}

export async function remove(req, res) {
  const template = await ExamTemplate.findOneAndDelete({ _id: req.params.id, institutionId: req.institutionId, createdBy: req.user._id });
  if (!template) {
    return res.status(404).json({ success: false, message: 'Template not found or unauthorized' });
  }
  res.json({ success: true, message: 'Template deleted successfully' });
}
