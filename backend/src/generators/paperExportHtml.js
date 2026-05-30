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
  
  const hasHtml = /<(table|tr|td|th|p|div|span|br|img)\b/i.test(text);
  let out = hasHtml ? text : escapeHtml(text);
  
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    try {
      return katex.renderToString(tex.trim(), { throwOnError: false, displayMode: true });
    } catch {
      return hasHtml ? tex : escapeHtml(tex);
    }
  });
  out = out.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
    try {
      return katex.renderToString(tex.trim(), { throwOnError: false, displayMode: false });
    } catch {
      return hasHtml ? tex : escapeHtml(tex);
    }
  });
  
  if (!hasHtml) {
    out = out.replace(/\n/g, '<br/>');
  }
  return out;
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
  const institutionName = paper.created_by_profile?.school_institute || 'ExamForge Academy';

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
    @page { margin: 24mm 15mm 20mm 15mm; }
    body { font-family: Georgia, 'Times New Roman', Times, serif; font-size: 11pt; color: #111; line-height: 1.5; }
    .watermark { position: fixed; top: 40%; left: 15%; font-size: 72pt; color: rgba(200,0,0,0.12); transform: rotate(-30deg); z-index: 0; pointer-events: none; }
    
    .header { text-align: center; border-bottom: 3px double #111; padding-bottom: 12px; margin-bottom: 20px; position: relative; z-index: 1; }
    .institution-name { font-size: 18pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; font-family: 'Segoe UI', Arial, sans-serif; }
    .exam-name { font-size: 13pt; font-weight: 600; text-transform: uppercase; color: #334155; margin-bottom: 6px; font-family: 'Segoe UI', Arial, sans-serif; }
    .paper-title { font-size: 14pt; font-style: italic; margin-bottom: 12px; }
    
    .meta-table { border-collapse: collapse; width: 100%; font-size: 9.5pt; font-family: 'Segoe UI', Arial, sans-serif; border-top: 1px solid #cbd5e1; padding-top: 8px; margin-top: 8px; }
    .meta-table td { border: none; padding: 4px 0; color: #334155; }
    
    .instructions { border: 1.5px solid #111; padding: 12px; margin-bottom: 20px; border-radius: 4px; font-size: 9.5pt; font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.45; }
    .instructions strong { font-size: 10pt; text-transform: uppercase; }
    
    .paper-section { margin-bottom: 24px; }
    .section-title { font-size: 11pt; font-weight: bold; text-transform: uppercase; border-bottom: 1.5px solid #111; padding-bottom: 3px; margin-top: 20px; margin-bottom: 14px; font-family: 'Segoe UI', Arial, sans-serif; letter-spacing: 0.5px; }
    
    .question-block { margin: 16px 0; padding-left: 4px; page-break-inside: avoid; }
    .q-header { font-weight: bold; margin-bottom: 6px; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; }
    .q-num { margin-right: 8px; }
    .q-marks { float: right; font-weight: normal; color: #475569; font-size: 9.5pt; }
    .q-body { margin-bottom: 8px; word-wrap: break-word; }
    
    .q-figure img { max-width: 100%; max-height: 250px; margin: 8px 0; display: block; object-fit: contain; }
    
    .options { display: flex; flex-wrap: wrap; gap: 10px 20px; margin: 10px 0 10px 24px; padding: 0; }
    .option { flex: 1 1 45%; min-width: 250px; margin: 0; list-style: none; display: flex; align-items: flex-start; }
    .opt-label { font-weight: bold; margin-right: 8px; font-family: 'Segoe UI', Arial, sans-serif; }
    .correct { color: #166534; font-weight: bold; margin-left: 4px; }
    
    .footer-note { margin-top: 30px; font-size: 8.5pt; color: #64748b; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 10px; font-family: 'Segoe UI', Arial, sans-serif; }
    
    table.data-table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 10pt; }
    table.data-table td, table.data-table th { border: 1px solid #111; padding: 6px 10px; text-align: left; }
    table.data-table th { background-color: #f1f5f9; font-weight: bold; }
    
    .katex-display { margin: 0.6em 0; overflow-x: auto; }
  </style>
</head>
<body>
  ${watermark}
  <div class="header">
    <div class="institution-name">${escapeHtml(institutionName)}</div>
    <div class="exam-name">${escapeHtml(examName)}</div>
    <div class="paper-title">${escapeHtml(paper.title)}</div>
    <table class="meta-table">
      <tr>
        <td style="width: 35%;"><strong>Subject:</strong> ${escapeHtml(subjectName)}</td>
        <td style="width: 30%; text-align: center;"><strong>Class:</strong> ${paper.class}</td>
        <td style="width: 35%; text-align: right;"><strong>Set:</strong> ${paperSet} ${includeAnswers ? '(Answer Key)' : ''}</td>
      </tr>
      <tr>
        <td><strong>Time Allowed:</strong> ${paper.duration_minutes} Mins</td>
        <td style="text-align: center;"><strong>Total Questions:</strong> ${paper.total_questions}</td>
        <td style="text-align: right;"><strong>Max. Marks:</strong> ${paper.total_marks}</td>
      </tr>
    </table>
  </div>
  ${paper.instructions ? `<div class="instructions"><strong>Instructions:</strong> ${escapeHtml(paper.instructions)}</div>` : ''}
  ${bodySections}
  <div class="footer-note">ExamForge — ${includeAnswers ? 'Faculty use only (Answer Key)' : 'Do not write on this sheet'}</div>
</body>
</html>`;
}
