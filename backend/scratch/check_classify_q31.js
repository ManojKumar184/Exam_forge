import { parseDocxXmlStructure } from '../src/extraction/docxAdvancedParser.js';
import { semanticDocumentFromDocxStructure } from '../src/extraction/documentIntelligence/semanticDocumentModel.js';
import { detectQuestionBoundaries, segmentToLegacyBlock } from '../src/extraction/documentIntelligence/boundaryDetector.js';
import { classifyQuestion } from '../src/extraction/documentIntelligence/questionTypeClassifier.js';
import { detectAnswer } from '../src/extraction/documentIntelligence/answerDetectionEngine.js';
import fs from 'fs';
import path from 'path';

const docxPath = path.resolve('../Physics_cleaned_dataset.docx');

async function main() {
  const buffer = fs.readFileSync(docxPath);
  const structure = await parseDocxXmlStructure(buffer);
  const semDoc = semanticDocumentFromDocxStructure(structure, { sourceFile: 'Physics_cleaned_dataset.docx' });
  const segments = detectQuestionBoundaries(semDoc);
  
  // Find raw segment for Q3 (which is overall Q31)
  const segment = segments.find(s => {
    const text = [
      ...(s.passageBlocks || []).map(b => b.text),
      ...(s.stemBlocks || []).map(b => b.text),
    ].join('\n');
    return text.includes('Four charges');
  });

  if (!segment) {
    console.error('Could not find raw segment containing "Four charges"');
    return;
  }

  const block = segmentToLegacyBlock(segment);
  const text = [
    ...(segment.passageBlocks || []).map((b) => b.text),
    ...(segment.stemBlocks || []).map((b) => b.text),
    ...(segment.optionBlocks || []).map((b) => b.text),
  ].join('\n');

  console.log('--- RAW SEGMENT TEXT ---');
  console.log(text);
  console.log('\n--- REGEX TESTS ---');
  
  const regex = /match\s+(?:the\s+)?following|list-?\s*i\b|list-?\s*ii\b|column\s+i/i;
  console.log('regex.test(text):', regex.test(text));
  console.log('regex.exec(text):', regex.exec(text));

  const cl = classifyQuestion(segment, block, detectAnswer(segment, block.options));
  console.log('\n--- CLASSIFICATION RESULT ---');
  console.log(cl);
}

main().catch(console.error);
