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
  
  const includeAnswers = req.query.includeAnswers === 'true' || req.query.includeAnswers === '1';
  const includeExplanations = req.query.includeExplanations === 'true' || req.query.includeExplanations === '1';
  const includeQuestionTypeBadges = req.query.includeQuestionTypeBadges === 'true' || req.query.includeQuestionTypeBadges === '1';
  const includeDifficulty = req.query.includeDifficulty === 'true' || req.query.includeDifficulty === '1';
  const includeSource = req.query.includeSource === 'true' || req.query.includeSource === '1';
  const includeWatermark = req.query.includeWatermark === 'true' || req.query.includeWatermark === '1';
  const includeInstituteLogo = req.query.includeInstituteLogo !== 'false' && req.query.includeInstituteLogo !== '0';
  const showQuestionMarks = req.query.showQuestionMarks === 'true' || req.query.showQuestionMarks === '1';

  const { buffer, filename } = await paperExportService.exportPaperPdf(req.params.id, req.user, type, {
    allowDraft,
    paperSet,
    publicBaseUrl: publicBaseUrl(req),
    includeAnswers,
    includeExplanations,
    includeQuestionTypeBadges,
    includeDifficulty,
    includeSource,
    includeWatermark,
    includeInstituteLogo,
    showQuestionMarks,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

export async function exportHtml(req, res) {
  const type = req.query.type === 'answer_key' ? 'answer_key' : 'paper';
  const allowDraft = req.query.allow_draft === 'true' || req.query.allow_draft === '1';
  const paperSet = req.query.paper_set || req.query.set || undefined;
  
  const includeAnswers = req.query.includeAnswers === 'true' || req.query.includeAnswers === '1';
  const includeExplanations = req.query.includeExplanations === 'true' || req.query.includeExplanations === '1';
  const includeQuestionTypeBadges = req.query.includeQuestionTypeBadges === 'true' || req.query.includeQuestionTypeBadges === '1';
  const includeDifficulty = req.query.includeDifficulty === 'true' || req.query.includeDifficulty === '1';
  const includeSource = req.query.includeSource === 'true' || req.query.includeSource === '1';
  const includeWatermark = req.query.includeWatermark === 'true' || req.query.includeWatermark === '1';
  const includeInstituteLogo = req.query.includeInstituteLogo !== 'false' && req.query.includeInstituteLogo !== '0';
  const showQuestionMarks = req.query.showQuestionMarks === 'true' || req.query.showQuestionMarks === '1';

  const { html, filename } = await paperExportService.exportPaperHtml(req.params.id, req.user, type, {
    allowDraft,
    paperSet,
    publicBaseUrl: publicBaseUrl(req),
    includeAnswers,
    includeExplanations,
    includeQuestionTypeBadges,
    includeDifficulty,
    includeSource,
    includeWatermark,
    includeInstituteLogo,
    showQuestionMarks,
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(html);
}

