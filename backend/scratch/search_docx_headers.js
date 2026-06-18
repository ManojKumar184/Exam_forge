import { extractDocxQuestions } from '../src/extraction/extractDocxQuestions.js';
import path from 'path';

async function main() {
  const projectRoot = 'c:\\Users\\manoj555\\Desktop\\Exam_forge';
  const docxPath = path.join(projectRoot, 'Physics_cleaned_dataset.docx');
  const imageDir = path.join(projectRoot, 'backend/uploads/images/scratch_inspect');

  const res = await extractDocxQuestions(docxPath, { imageDir, returnRawBlocks: true });
  const lines = res.rawText.split('\n');
  
  console.log('--- Non-question lines in DOCX ---');
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // Print lines that don't look like questions or options
    if (!/^(?:Q\d+|[A-E]\)|Answer:|Explanation:)/i.test(trimmed)) {
      console.log(`Line ${idx + 1}: "${trimmed}"`);
    }
  });
}

main().catch(console.error);
