import katex from 'katex';
import { env } from '../config/env.js';
import path from 'path';
import fs from 'fs';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMath(text, displayLatex) {
  if (displayLatex?.trim()) {
    try {
      return katex.renderToString(displayLatex.trim(), { throwOnError: false, displayMode: true });
    } catch {
      return `<pre>${escapeHtml(displayLatex)}</pre>`;
    }
  }
  if (!text) return '';
  let out = escapeHtml(text);
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    try {
      return katex.renderToString(tex.trim(), { throwOnError: false, displayMode: true });
    } catch {
      return escapeHtml(tex);
    }
  });
  out = out.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
    try {
      return katex.renderToString(tex.trim(), { throwOnError: false, displayMode: false });
    } catch {
      return escapeHtml(tex);
    }
  });
  return out.replace(/\n/g, '<br/>');
}

function diskPathForUrl(url) {
  if (!url) return null;
  const rel = url.startsWith('/') ? url.slice(1) : url;
  const disk = path.join(env.uploadDir, rel.replace(/^uploads\/?/, ''));
  return fs.existsSync(disk) ? disk : null;
}

function resolveImageSrc(url, { publicBaseUrl, embedImages }) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  const disk = diskPathForUrl(url);
  if (embedImages && disk) {
    const ext = path.extname(disk).slice(1).toLowerCase() || 'png';
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    const buf = fs.readFileSync(disk);
    return `data:image/${mime};base64,${buf.toString('base64')}`;
  }
  if (publicBaseUrl) {
    const base = publicBaseUrl.replace(/\/$/, '');
    return `${base}${url.startsWith('/') ? url : `/${url}`}`;
  }
  if (disk) return `file://${disk}`;
  return null;
}

function renderImages(question, exportOpts) {
  const urls = [
    ...(question.question_images || question.questionImages || []),
    ...(question.image_metadata || question.imageMetadata || []).map((m) => m.url),
  ].filter(Boolean);
  const unique = [...new Set(urls)];
  return unique
    .map((src) => {
      const resolved = resolveImageSrc(src, exportOpts);
      if (!resolved) return '';
      return `<figure class="q-figure"><img src="${escapeHtml(resolved)}" alt="Figure"/></figure>`;
    })
    .join('');
}

function renderOptions(options, correctIndex, showAnswers, exportOpts) {
  if (!options?.length) return '';
  return `<ol class="options" type="A">${options
    .map((opt, idx) => {
      const label = String.fromCharCode(65 + idx);
      const correct =
        showAnswers && correctIndex !== null && Number(correctIndex) === idx
          ? ' <strong class="correct">✓</strong>'
          : '';
      const img = opt.image ? renderImages({ question_images: [opt.image] }, exportOpts) : '';
      return `<li class="option"><span class="opt-label">${label}.</span> ${renderMath(
        opt.text,
        opt.latex
      )}${img}${correct}</li>`;
    })
    .join('')}</ol>`;
}

function groupBySection(paper) {
  const map = new Map();
  for (const pq of paper.questions || []) {
    const key = pq.section || 'A';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(pq);
  }
  const sectionMeta = new Map((paper.sections || []).map((s) => [s.name, s]));
  return [...map.entries()].map(([sectionKey, items]) => {
    const meta = sectionMeta.get(sectionKey);
    return {
      key: sectionKey,
      title: meta?.name || `Section ${sectionKey}`,
      items: items.sort((a, b) => (a.question_order ?? 0) - (b.question_order ?? 0)),
    };
  });
}

/**
 * Build printable HTML for question paper or answer key.
 */
export function buildPaperExportHtml(paper, options = {}) {
  const {
    includeAnswers = false,
    paperSet = paper.paper_set || 'A',
    draftWatermark = paper.status === 'draft',
    publicBaseUrl = null,
    embedImages = false,
  } = options;
  const exportOpts = { publicBaseUrl, embedImages };

  const sections = groupBySection(paper);
  const subjectName = paper.subject?.name || 'Subject';
  const examName = paper.exam_type?.name || 'Exam';

  const bodySections = sections
    .map((sec) => {
      const questionsHtml = sec.items
        .map((pq, idx) => {
          const q = pq.question;
          if (!q) return '';
          const marks = pq.custom_marks ?? q.marks ?? 4;
          return `
          <div class="question-block">
            <div class="q-header">
              <span class="q-num">Q${idx + 1}.</span>
              <span class="q-marks">[${marks} marks]</span>
            </div>
            <div class="q-body">${renderMath(q.question_text, q.question_latex)}</div>
            ${renderImages(q, exportOpts)}
            ${renderOptions(q.options, q.correct_option, includeAnswers, exportOpts)}
          </div>`;
        })
        .join('');
      return `
        <section class="paper-section">
          <h2 class="section-title">${escapeHtml(sec.title)}</h2>
          ${questionsHtml}
        </section>`;
    })
    .join('');

  const watermark = draftWatermark
    ? '<div class="watermark">DRAFT</div>'
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(paper.title)} — Set ${paperSet}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"/>
  <style>
    @page { margin: 18mm 15mm; }
    body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 11pt; color: #111; line-height: 1.45; }
    .watermark { position: fixed; top: 40%; left: 15%; font-size: 72pt; color: rgba(200,0,0,0.12); transform: rotate(-30deg); z-index: 0; pointer-events: none; }
    .header { border-bottom: 2px solid #1e40af; padding-bottom: 8px; margin-bottom: 20px; position: relative; z-index: 1; }
    .header h1 { margin: 0 0 4px; font-size: 18pt; color: #1e3a8a; }
    .meta { font-size: 10pt; color: #475569; }
    .instructions { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; margin-bottom: 16px; border-radius: 6px; }
    .paper-section { margin-bottom: 22px; page-break-inside: avoid; }
    .section-title { font-size: 13pt; color: #1e40af; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
    .question-block { margin: 14px 0; padding-left: 4px; page-break-inside: avoid; }
    .q-header { font-weight: 600; margin-bottom: 6px; }
    .q-num { margin-right: 8px; }
    .q-marks { float: right; color: #64748b; font-size: 10pt; }
    .q-body { margin-bottom: 8px; }
    .q-figure img { max-width: 100%; max-height: 280px; margin: 8px 0; display: block; }
    .options { margin: 8px 0 0 20px; padding: 0; }
    .option { margin: 6px 0; list-style: none; }
    .opt-label { font-weight: 600; margin-right: 6px; }
    .correct { color: #15803d; }
    .footer-note { margin-top: 24px; font-size: 9pt; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    table.data-table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 10pt; }
    table.data-table td, table.data-table th { border: 1px solid #cbd5e1; padding: 4px 8px; }
    .katex-display { margin: 0.5em 0; overflow-x: auto; }
  </style>
</head>
<body>
  ${watermark}
  <div class="header">
    <h1>${escapeHtml(paper.title)}</h1>
    <div class="meta">
      ${escapeHtml(subjectName)} · Class ${paper.class} · ${escapeHtml(examName)} ·
      Set ${paperSet} · ${includeAnswers ? 'Answer Key' : 'Question Paper'} ·
      ${paper.total_questions} Questions · ${paper.total_marks} Marks ·
      Time: ${paper.duration_minutes} min
    </div>
    <div class="meta">Code: ${escapeHtml(paper.paper_code)} · Status: ${escapeHtml(paper.status)}</div>
  </div>
  ${paper.instructions ? `<div class="instructions"><strong>Instructions:</strong> ${escapeHtml(paper.instructions)}</div>` : ''}
  ${bodySections}
  <div class="footer-note">ExamForge — ${includeAnswers ? 'Faculty use only (Answer Key)' : 'Do not write on this sheet'}</div>
</body>
</html>`;
}
