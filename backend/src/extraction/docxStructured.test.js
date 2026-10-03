import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import { parseDocxXmlStructure } from './docxAdvancedParser.js';
import { extractDocxQuestions } from './extractDocxQuestions.js';
import { extractSeparateAnswerKey, mapSeparateAnswerKey } from './documentIntelligence/answerDetectionEngine.js';

const fixtures = path.resolve('src/extraction/fixtures');

test('actual DOCX fixture preserves OMML inside structured table cells and normalizes it', async () => {
  const structure = await parseDocxXmlStructure(await fs.readFile(path.join(fixtures, 'equation_table.docx')));
  const blocks = structure.tables.flatMap((table) => table.tableModel.rows.flatMap((row) => row.flatMap((cell) => cell?.contentBlocks || [])));
  const equations = blocks.filter((block) => block.type === 'equation');
  assert.ok(equations.length >= 2);
  assert.ok(equations.every((equation) => equation.source === 'omml' && equation.omml.includes('<m:oMath')));
  assert.ok(equations.every((equation) => equation.latex && equation.fidelity > 0.9));
});

test('explicit image in DOCX table remains an image block with its relationship id', async () => {
  const structure = await parseDocxXmlStructure(await fs.readFile(path.join(fixtures, 'image_table.docx')));
  const blocks = structure.tables.flatMap((table) => table.tableModel.rows.flatMap((row) => row.flatMap((cell) => cell?.contentBlocks || [])));
  const image = blocks.find((block) => block.type === 'image');
  assert.ok(image?.relationshipId);
  assert.equal(structure.relationshipAssets.get(image.relationshipId)?.type, 'image');
  assert.ok(structure.relationshipAssets.get(image.relationshipId)?.data.length > 0);
});

test('DOCX extraction materializes image assets and carries ordered content blocks into semantic IR', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'examforge-docx-'));
  try {
    const result = await extractDocxQuestions(path.join(fixtures, 'image_table.docx'), {
      returnRawBlocks: true,
      imageDir: path.join(tempDir, 'images'),
      equationDir: path.join(tempDir, 'equations'),
    });
    const blocks = result.semanticDocument.blocks.flatMap((block) => block.contentBlocks || []);
    const table = blocks.find((block) => block.type === 'table');
    const image = table?.rows?.flatMap((row) => row.flatMap((cell) => cell?.contentBlocks || [])).find((block) => block.type === 'image');
    assert.ok(image?.assetUrl?.startsWith('/uploads/images/'));
    assert.ok(result.images.some((url) => url === image.assetUrl));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('MathType OLE package object is detected and original binary retained (synthetic package fixture)', async () => {
  const zip = await JSZip.loadAsync(await fs.readFile(path.join(fixtures, 'plain_text_table.docx')));
  const document = await zip.file('word/document.xml').async('string');
  const withNamespaces = document.replace('<w:document ', '<w:document xmlns:o="urn:schemas-microsoft-com:office:office" ');
  zip.file('word/document.xml', withNamespaces.replace('</w:p>', '<w:r><w:object><o:OLEObject ProgID="MathType 7.0 Equation" r:id="rIdMathType"/></w:object></w:r></w:p>'));
  const rels = await zip.file('word/_rels/document.xml.rels').async('string');
  zip.file('word/_rels/document.xml.rels', rels.replace('</Relationships>', '<Relationship Id="rIdMathType" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="embeddings/oleObject1.bin"/></Relationships>'));
  const sourceObject = Buffer.from([0x01, 0x02, 0x4d, 0x54, 0x03, 0x04]);
  zip.file('word/embeddings/oleObject1.bin', sourceObject);
  const structure = await parseDocxXmlStructure(await zip.generateAsync({ type: 'nodebuffer' }));
  const equation = structure.paragraphs.flatMap((paragraph) => paragraph.contentBlocks || []).find((block) => block.type === 'equation' && block.source === 'mathtype');
  assert.ok(equation);
  assert.match(equation.original, /MathType 7\.0 Equation/);
  assert.equal(equation.latex, null);
  assert.deepEqual(structure.relationshipAssets.get(equation.originalAsset).data, sourceObject);
});

test('separate answer key maps by question number and reports invalid, duplicate, missing, and unknown entries', () => {
  const blocks = [
    { text: 'Question 10. Choose one.', roleHints: ['question_candidate'] },
    { text: 'A. one', roleHints: ['option'], raw: { label: 'A' } },
    { text: 'B. two', roleHints: ['option'], raw: { label: 'B' } },
    { text: 'Question 20. Choose one.', roleHints: ['question_candidate'] },
    { text: 'A. one', roleHints: ['option'], raw: { label: 'A' } },
    { text: 'B. two', roleHints: ['option'], raw: { label: 'B' } },
    { text: 'Answer Key' }, { text: '10. B' }, { text: '10. A' }, { text: '99. C' }, { text: '20. Z' },
  ];
  const key = extractSeparateAnswerKey(blocks);
  const segments = [
    { questionNumber: 10, optionBlocks: blocks.slice(1, 3) },
    { questionNumber: 20, optionBlocks: blocks.slice(4, 6) },
  ];
  const result = mapSeparateAnswerKey(key, segments);
  assert.equal(result.mapped.get(10).answer[0], 'B');
  assert.equal(segments[0].answerMapping.method, 'separate_answer_key');
  assert.ok(result.issues.some((issue) => issue.type === 'duplicate_answer'));
  assert.ok(result.issues.some((issue) => issue.type === 'unknown_question_number'));
  assert.ok(result.issues.some((issue) => issue.type === 'invalid_option_label'));
  assert.ok(result.issues.some((issue) => issue.type === 'missing_answer') === false);
});
