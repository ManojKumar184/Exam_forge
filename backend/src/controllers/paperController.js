import * as paperService from '../services/paperService.js';
import * as paperExportService from '../services/paperExportService.js';
import {
  selectQuestionsForPaper,
  countQuestionPool,
} from '../services/paperSelectionService.js';

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

export async function selectQuestions(req, res) {
  const data = await selectQuestionsForPaper(req.body);
  res.json({ success: true, data });
}

export async function poolStats(req, res) {
  const data = await countQuestionPool(req.body);
  res.json({ success: true, data });
}

function publicBaseUrl(req) {
  return process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

export async function exportPdf(req, res) {
  const type = req.query.type === 'answer_key' ? 'answer_key' : 'paper';
  const allowDraft = req.query.allow_draft === 'true' || req.query.allow_draft === '1';
  const paperSet = req.query.paper_set || req.query.set || undefined;
  const { buffer, filename } = await paperExportService.exportPaperPdf(req.params.id, req.user, type, {
    allowDraft,
    paperSet,
    publicBaseUrl: publicBaseUrl(req),
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

export async function exportHtml(req, res) {
  const type = req.query.type === 'answer_key' ? 'answer_key' : 'paper';
  const allowDraft = req.query.allow_draft === 'true' || req.query.allow_draft === '1';
  const paperSet = req.query.paper_set || req.query.set || undefined;
  const { html, filename } = await paperExportService.exportPaperHtml(req.params.id, req.user, type, {
    allowDraft,
    paperSet,
    publicBaseUrl: publicBaseUrl(req),
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(html);
}

