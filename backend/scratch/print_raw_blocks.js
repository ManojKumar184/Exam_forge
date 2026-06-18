import { extractDocxQuestions } from '../src/extraction/extractDocxQuestions.js';
import path from 'path';

async function main() {
  const projectRoot = 'c:\\Users\\manoj555\\Desktop\\Exam_forge';
  const docxPath = path.join(projectRoot, 'Physics_cleaned_dataset.docx');
  const imageDir = path.join(projectRoot, 'backend/uploads/images/scratch_inspect');

  console.log('Extracting docx questions...');
  const res = await extractDocxQuestions(docxPath, { imageDir, returnRawBlocks: true });
  console.log('Total blocks:', res.blocks.length);

  res.blocks.forEach((block, idx) => {
    console.log(`Block ${idx + 1}:`);
    console.log('  Lines:', block.lines);
    console.log('  Section Context:', block.sectionContext);
    console.log('  Tags:', block.tags);
    console.log('  Question Number:', block.questionNumber);
    console.log('-'.repeat(50));
  });
}

main().catch(console.error);
