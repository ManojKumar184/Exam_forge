import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import { documentIntelligencePipeline } from './ingestionPipeline.js';

const fixture = path.resolve('src/extraction/fixtures/plain_text_table.docx');
const run = (text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

test('DOCX to review questions maps separate answers by question number and keeps OMML blocks', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'examforge-docx-flow-'));
  try {
    const zip = await JSZip.loadAsync(await fs.readFile(fixture));
    let document = await zip.file('word/document.xml').async('string');
    const body = [
      run('Question 10. Which color is blue?'), run('A. Red'), run('B. Blue'),
      run('Question 20. Calculate 1 plus 1.'),
      '<w:p><w:r><w:t>Evaluate </w:t></w:r><m:oMath><m:r><m:t>1+1</m:t></m:r></m:oMath></w:p>',
      run('Question 30. Is this statement true or false?'),
      run('Answer Key'), run('10. B'), run('20. 2'), run('30. True'),
    ].join('');
    document = document.replace(/(<w:body[^>]*>)[\s\S]*?(<w:sectPr[\s\S]*?<\/w:sectPr>\s*<\/w:body>)/, `$1${body}$2`);
    zip.file('word/document.xml', document);
    const docxPath = path.join(tempDir, 'core-v1-fixture.docx');
    await fs.writeFile(docxPath, await zip.generateAsync({ type: 'nodebuffer' }));

    const result = await documentIntelligencePipeline.process(
      { filePath: docxPath, filename: 'core-v1-fixture.docx' },
      { imageDir: path.join(tempDir, 'images'), equationDir: path.join(tempDir, 'equations') }
    );
    assert.equal(result.questions.length, 3, JSON.stringify(result.questions.map((question) => ({ number: question.renderingMetadata?.questionNumber, type: question.questionType, text: question.questionText }))));
    const byNumber = new Map(result.questions.map((question) => [question.renderingMetadata?.questionNumber, question]));
    assert.equal(byNumber.get(10)?.correctOption, 1);
    assert.equal(byNumber.get(10)?.renderingMetadata?.answerDetection?.method, 'separate_answer_key');
    assert.ok(byNumber.get(20)?.contentBlocks?.some((block) => block.type === 'equation' && block.source === 'omml'));
    assert.equal(byNumber.get(20)?.numericalAnswer, 2);
    assert.equal(byNumber.get(20)?.renderingMetadata?.answerDetection?.method, 'separate_answer_key');
    assert.equal(byNumber.get(30)?.correctOption, 0);
    assert.equal(byNumber.get(30)?.questionType, 'TRUE_FALSE');
    assert.deepEqual(byNumber.get(30)?.options.map((option) => option.text), ['True', 'False']);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
