import { extractDocxQuestions } from '../src/extraction/extractDocxQuestions.js';
import { detectSectionHeader } from '../src/extraction/sectionParser.js';
import path from 'path';

const docxPath = path.resolve('../Physics_cleaned_dataset.docx');

async function main() {
  const ext = await extractDocxQuestions(docxPath, { returnRawBlocks: true });
  const blocks = ext.blocks;

  let activeSectionContext = null;
  console.log('--- MERGE TRACE ---');
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const text = (block.lines || []).join('\n').trim();
    const firstLine = (text.split('\n')[0] || '').trim();

    const sectionHeader = detectSectionHeader(firstLine);
    const isMultiCorrectSection = /(?:one\s+or\s+more|multiple|more\s+than\s+one)\s+correct/i.test(firstLine) ||
                                  (sectionHeader && sectionHeader.examPart === 'mcq_multiple');
    
    const isHeaderBlock = sectionHeader ||
        /^part\s+[a-z]/i.test(firstLine) ||
        /^topic\s+\d/i.test(firstLine) ||
        /^section\s+[a-z0-9]/i.test(firstLine) ||
        /^\d+\)s*(?:multiple choice|numeric)/i.test(firstLine) ||
        /^\d+\s+MCQs?\b/i.test(firstLine) ||
        /MCQswith/i.test(firstLine);

    if (isHeaderBlock) {
      if (isMultiCorrectSection) {
        activeSectionContext = { questionType: 'MCQ_MULTIPLE' };
      } else {
        activeSectionContext = null;
      }
      console.log(`[HEADER] Line: "${firstLine}" -> isMultiCorrect=${isMultiCorrectSection} activeSectionContext=${JSON.stringify(activeSectionContext)}`);
    } else {
      const qNum = block.questionNumber;
      if (qNum) {
        console.log(`[QUESTION] Q${qNum}: text="${firstLine.slice(0, 50)}" -> activeSectionContext=${JSON.stringify(activeSectionContext)}`);
      }
    }
  }
}

main().catch(console.error);
