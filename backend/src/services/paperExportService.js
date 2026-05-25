import { Paper } from '../models/Paper.js';
import { AppError } from '../utils/AppError.js';
import { mapPaper } from '../utils/examMapper.js';
import { buildPaperExportHtml } from '../generators/paperExportHtml.js';
import { generatePdfFromHtml } from '../generators/pdfGenerator.js';

async function loadPaperForExport(paperId, user) {
  const paper = await Paper.findById(paperId)
    .populate('subjectId', 'name code icon color')
    .populate('examTypeId', 'name code description isActive createdAt')
    .populate('questions.questionId');
  if (!paper) throw new AppError('Paper not found', 404, 'NOT_FOUND');
  if (user.role === 'faculty' && paper.createdBy.toString() !== user._id.toString()) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return mapPaper(paper);
}

/**
 * @param {'paper'|'answer_key'} exportType
 * @param {{ paperSet?: string, allowDraft?: boolean, publicBaseUrl?: string }} opts
 */
export async function exportPaperDocument(paperId, user, exportType, opts = {}) {
  const paper = await loadPaperForExport(paperId, user);
  const paperSet = opts.paperSet || paper.paper_set || 'A';

  if (paper.status === 'draft' && !opts.allowDraft) {
    throw new AppError('Publish the paper or pass allow_draft=true to export drafts', 400, 'DRAFT_EXPORT');
  }

  const includeAnswers = exportType === 'answer_key';
  const html = buildPaperExportHtml(
    { ...paper, paper_set: paperSet },
    {
      includeAnswers,
      paperSet,
      draftWatermark: paper.status === 'draft',
      publicBaseUrl: opts.publicBaseUrl,
      embedImages: true,
    }
  );

  return {
    paper,
    html,
    filename: `${paper.paper_code || paper.id}-${paperSet}-${includeAnswers ? 'answer-key' : 'question-paper'}.pdf`,
  };
}

export async function exportPaperPdf(paperId, user, exportType, opts = {}) {
  const { html, filename } = await exportPaperDocument(paperId, user, exportType, opts);
  const buffer = await generatePdfFromHtml(html);
  return { buffer, filename, contentType: 'application/pdf' };
}

export async function exportPaperHtml(paperId, user, exportType, opts = {}) {
  const { html, filename } = await exportPaperDocument(paperId, user, exportType, opts);
  return {
    html,
    filename: filename.replace('.pdf', '.html'),
    contentType: 'text/html; charset=utf-8',
  };
}
