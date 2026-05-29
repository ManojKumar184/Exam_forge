import fs from 'fs';
import path from 'path';
import { runStagesReconstruction } from './backend/src/extraction/reconstructionPipeline.js';
import { extractDocxQuestions } from './backend/src/extraction/extractDocxQuestions.js';

const __dirname = path.resolve();

async function testClipboardIngestion() {
  console.log('=== TEST CLIPBOARD INGESTION ===');
  const filePath = path.join(__dirname, 'Pasted text(133).txt');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  let plainStart = -1;
  let htmlStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === 'text/plain') {
      plainStart = i + 2; // skip "text/plain" and "📋 Copy"
    } else if (line === 'text/html') {
      htmlStart = i + 2;  // skip "text/html" and "📋 Copy"
    }
  }

  // extract plain text
  const plainLines = [];
  for (let i = plainStart; i < lines.length; i++) {
    if (lines[i].trim() === 'text/html') break;
    plainLines.push(lines[i]);
  }
  const plainText = plainLines.join('\n').trim();

  // extract html text
  const htmlLines = [];
  for (let i = htmlStart; i < lines.length; i++) {
    if (lines[i].trim().startsWith('text/')) break; // safety check
    htmlLines.push(lines[i]);
  }
  const htmlText = htmlLines.join('\n').trim();

  console.log('Plain text length:', plainText.length);
  console.log('HTML text length:', htmlText.length);

  const result = await runStagesReconstruction(plainText, htmlText, null, null, htmlText);

  console.log('\n--- Ingestion Result ---');
  console.log('Reconstructed Stem:\n', result.stem);
  console.log('\nReconstructed Options:');
  result.options.forEach((opt, idx) => {
    console.log(`${String.fromCharCode(65 + idx)}. ${opt.text}`);
  });
}

async function testDocxUpload() {
  console.log('\n=== TEST DOCX UPLOAD ===');
  const filePath = path.join(__dirname, 'test_question_1.docx');
  const result = await extractDocxQuestions(filePath, {
    imageDir: path.join(__dirname, 'uploads', 'images')
  });

  console.log('Questions found:', result.questions.length);
  console.log('Warnings:', result.warnings);
  console.log('Images extracted:', result.images);

  if (result.questions.length > 0) {
    const q = result.questions[0];
    console.log('\n--- Reconstructed Question ---');
    console.log('Type:', q.questionType);
    console.log('Stem:\n', q.questionText);
    console.log('\nOptions:');
    q.options.forEach((opt, idx) => {
      console.log(`${String.fromCharCode(65 + idx)}. ${opt.text}`);
    });
  }
}

async function run() {
  try {
    await testClipboardIngestion();
    await testDocxUpload();
  } catch (err) {
    console.error('Test run failed:', err);
  }
}

run();
