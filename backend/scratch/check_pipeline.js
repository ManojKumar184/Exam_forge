import { parseDocxXmlStructure } from '../src/extraction/docxAdvancedParser.js';
import { semanticDocumentFromDocxStructure } from '../src/extraction/documentIntelligence/semanticDocumentModel.js';
import { detectQuestionBoundaries, segmentToLegacyBlock } from '../src/extraction/documentIntelligence/boundaryDetector.js';
import { classifyQuestion } from '../src/extraction/documentIntelligence/questionTypeClassifier.js';
import { detectAnswer } from '../src/extraction/documentIntelligence/answerDetectionEngine.js';
import path from 'path';
import fs from 'fs';

const docxPath = path.resolve('../Physics_cleaned_dataset.docx');

async function main() {
  const buffer = fs.readFileSync(docxPath);
  const structure = await parseDocxXmlStructure(buffer);
  const semanticDocument = semanticDocumentFromDocxStructure(structure, { sourceFile: 'Physics_cleaned_dataset.docx' });
  const segments = detectQuestionBoundaries(semanticDocument);
  const blocks = segments.map(segmentToLegacyBlock);

  console.log('Total Segments:', segments.length);
  console.log('Total Blocks:', blocks.length);

  // Let's find Q30 (index 29, questionNumber = 29 or 30 or 2, after offset it should be 30)
  blocks.forEach((block, idx) => {
    const qNum = block.questionNumber;
    if (qNum === 30 || qNum === 2) {
      console.log(`\n--- BLOCK Q${qNum} (Index ${idx}) ---`);
      console.log('questionNumber:', block.questionNumber);
      console.log('section:', block.section);
      console.log('sectionContext:', block.sectionContext);
      console.log('tags:', block.tags);
      
      const segment = segments[idx];
      const answer = detectAnswer(segment, block.options || []);
      const classification = classifyQuestion(segment, block, answer);
      console.log('classification:', classification);
    }
  });
}

main().catch(console.error);
