import { parseDocxXmlStructure } from '../src/extraction/docxAdvancedParser.js';
import { semanticDocumentFromDocxStructure } from '../src/extraction/documentIntelligence/semanticDocumentModel.js';
import { detectQuestionBoundaries } from '../src/extraction/documentIntelligence/boundaryDetector.js';
import path from 'path';
import fs from 'fs';

const docxPath = path.resolve('../Physics_cleaned_dataset.docx');

async function main() {
  const buffer = fs.readFileSync(docxPath);
  const structure = await parseDocxXmlStructure(buffer);
  
  console.log('--- XML PARAGRAPHS WITH MCQswith ---');
  structure.paragraphs.forEach((p, i) => {
    if (p.text.includes('MCQswith')) {
      console.log(`Para ${i}: text="${p.text}" isSection=${p.isSection} section="${p.section}"`);
    }
  });

  const semDoc = semanticDocumentFromDocxStructure(structure, { sourceFile: 'Physics_cleaned_dataset.docx' });
  console.log('\n--- SEMANTIC BLOCKS WITH MCQswith ---');
  semDoc.blocks.forEach((b, i) => {
    if (b.text.includes('MCQswith')) {
      console.log(`Block ${i}: text="${b.text}" roleHints=${JSON.stringify(b.roleHints)} section="${b.section}"`);
    }
  });

  const segments = detectQuestionBoundaries(semDoc);
  console.log('\n--- SEGMENTS WITH MCQswith ---');
  segments.forEach((seg, i) => {
    const texts = [
      ...(seg.passageBlocks || []),
      ...(seg.stemBlocks || []),
      ...(seg.optionBlocks || []),
      ...(seg.answerBlocks || []),
      ...(seg.explanationBlocks || [])
    ].map(b => b.text);
    
    if (texts.some(t => t.includes('MCQswith'))) {
      console.log(`Segment ${i+1} (Q${seg.questionNumber}):`);
      seg.stemBlocks.forEach(b => console.log(`  Stem block: "${b.text}"`));
    }
  });
}

main().catch(console.error);
