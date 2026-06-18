import { parseDocxXmlStructure } from '../src/extraction/docxAdvancedParser.js';
import { semanticDocumentFromDocxStructure } from '../src/extraction/documentIntelligence/semanticDocumentModel.js';
import { detectQuestionBoundaries, segmentToLegacyBlock } from '../src/extraction/documentIntelligence/boundaryDetector.js';
import fs from 'fs';
import path from 'path';

const docxPath = path.resolve('../Physics_cleaned_dataset.docx');

async function main() {
  const buffer = fs.readFileSync(docxPath);
  const structure = await parseDocxXmlStructure(buffer);
  const semDoc = semanticDocumentFromDocxStructure(structure, { sourceFile: 'Physics_cleaned_dataset.docx' });
  const segments = detectQuestionBoundaries(semDoc);
  const legacyBlocks = segments.map(segmentToLegacyBlock);

  console.log(`Total legacy blocks: ${legacyBlocks.length}`);
  legacyBlocks.forEach((b, idx) => {
    const qNum = b.questionNumber;
    console.log(`Index ${idx} (Q${qNum}):`);
    console.log(`  section: "${b.section}"`);
    console.log(`  sectionContext: ${JSON.stringify(b.sectionContext)}`);
    console.log(`  tags: ${JSON.stringify(b.tags)}`);
    console.log(`  text snippet: "${b.lines[0]?.slice(0, 80)}"`);
  });
}

main().catch(console.error);
