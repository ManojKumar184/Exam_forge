import * as paperService from '../services/paperService.js';

export async function list(req, res) {
  const data = await paperService.listPapers(req.query, req.user);
  res.json({ success: true, data });
}

export async function getOne(req, res) {
  const data = await paperService.getPaperById(req.params.id, req.user);
  res.json({ success: true, data });
}

export async function create(req, res) {
  const data = await paperService.createPaper(req.body, req.user);
  res.status(201).json({ success: true, data });
}

export async function update(req, res) {
  const data = await paperService.updatePaper(req.params.id, req.body, req.user);
  res.json({ success: true, data });
}

export async function remove(req, res) {
  await paperService.deletePaper(req.params.id, req.user);
  res.json({ success: true, message: 'Paper deleted' });
}

export async function generate(req, res) {
  const data = await paperService.generatePaper(req.body, req.user);
  res.status(201).json({ success: true, data });
}

