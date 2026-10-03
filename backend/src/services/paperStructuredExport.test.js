import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import { env } from '../config/env.js';
import { buildPaperExportDocx } from './paperDocxService.js';
import { buildPaperExportHtml } from '../generators/paperExportHtml.js';
import { generatePdfFromHtml } from '../generators/pdfGenerator.js';

test('canonical paper structured content exports to DOCX and printable HTML with answer key and marks', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'examforge-paper-export-'));
  const originalUploadDir = env.uploadDir;
  try {
    env.uploadDir = tempDir;
    const imageDir = path.join(tempDir, 'images');
    await fs.mkdir(imageDir, { recursive: true });
    const fixtureZip = await JSZip.loadAsync(await fs.readFile(path.resolve('src/extraction/fixtures/image_table.docx')));
    const imageAsset = Object.values(fixtureZip.files).find((file) => /^word\/media\//.test(file.name) && !file.dir);
    assert.ok(imageAsset, 'image fixture has media part');
    await fs.writeFile(path.join(imageDir, 'diagram.png'), await imageAsset.async('nodebuffer'));

    const question = {
      question_text: 'Find the value.',
      question_type: 'MCQ_SINGLE',
      correct_option: 1,
      correct_answers: ['B'],
      options: [{ text: 'one' }, { text: 'two' }],
      content_blocks: [
        { type: 'text', text: 'Calculate:' },
        { type: 'equation', source: 'omml', latex: '\\frac{1}{2}', omml: '<m:oMath/>', displayMode: true, fidelity: 0.98 },
        { type: 'image', assetUrl: '/uploads/images/diagram.png', fidelity: 1 },
        { type: 'table', rows: [[{ text: 'x', contentBlocks: [{ type: 'text', text: 'x' }] }, { text: 'y' }], [{ text: '1' }, { text: '2' }]] },
      ],
    };
    const paper = {
      title: 'Structured Integration Paper', class: 10, status: 'published', paper_set: 'A',
      total_questions: 1, total_marks: 3, duration_minutes: 30,
      sections: [{ name: 'A', questionCount: 1, marksPerQuestion: 3, negativeMarksPerQuestion: 1 }],
      questions: [{ section: 'A', question_order: 0, custom_marks: 3, custom_negative_marks: 1, question }],
    };

    const html = buildPaperExportHtml(paper, { exportTypeFormat: 'paper_with_answers', embedImages: true, includeInstituteLogo: false });
    assert.match(html, /Calculate:/);
    assert.match(html, /katex/);
    assert.match(html, /data:image\/png;base64,/);
    assert.match(html, /publication-table/);
    assert.match(html, /−1/);
    assert.match(html, /B/);
    const pdfBuffer = await generatePdfFromHtml(html, { showPageNumber: false });
    assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF');
    assert.ok(pdfBuffer.length > 1000);

    const docxBuffer = await buildPaperExportDocx(paper, { exportTypeFormat: 'paper_with_answers', showInstitutionLogo: false });
    const outputZip = await JSZip.loadAsync(docxBuffer);
    const documentXml = await outputZip.file('word/document.xml').async('string');
    assert.match(documentXml, /Calculate:/);
    assert.match(documentXml, /<m:oMath/);
    assert.match(documentXml, /<w:tbl/);
    assert.match(documentXml, /<w:drawing/);
    assert.match(documentXml, /two/);
    assert.ok(Object.keys(outputZip.files).some((name) => /^word\/media\//.test(name)));
  } finally {
    env.uploadDir = originalUploadDir;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
