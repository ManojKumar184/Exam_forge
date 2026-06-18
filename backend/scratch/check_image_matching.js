import { parseDocxXmlStructure } from '../src/extraction/docxAdvancedParser.js';
import { semanticDocumentFromDocxStructure } from '../src/extraction/documentIntelligence/semanticDocumentModel.js';
import { splitHtmlIntoQuestionSegments } from '../src/extraction/htmlQuestionParser.js';
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';

const docxPath = path.resolve('../Physics_cleaned_dataset.docx');

async function main() {
  const buffer = fs.readFileSync(docxPath);
  const structure = await parseDocxXmlStructure(buffer);
  
  const mammothHtml = await mammoth.convertToHtml({ buffer });
  const htmlSegments = splitHtmlIntoQuestionSegments(mammothHtml.value || '');
  
  const semanticDocument = semanticDocumentFromDocxStructure(structure, {
    sourceFile: 'Physics_cleaned_dataset.docx',
  });

  const normalizeTextForMatching = (text) => {
    return (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  };

  console.log(`HTML Segments count: ${htmlSegments.length}`);
  console.log(`Semantic Document blocks count: ${semanticDocument.blocks.length}`);

  // Let's print details about HTML segments with images
  htmlSegments.forEach((s, idx) => {
    if (s.images && s.images.length > 0) {
      console.log(`\n--- HTML Segment ${idx} has ${s.images.length} image(s) ---`);
      console.log(`Text snippet: "${s.text.slice(0, 100)}"`);
      console.log(`Images: ${JSON.stringify(s.images.map(img => img.slice(0, 50) + '...'))}`);
      
      // Let's try to find a match among semantic blocks
      const sNorm = normalizeTextForMatching(s.text);
      let foundMatch = false;
      semanticDocument.blocks.forEach((sdBlock, sdIdx) => {
        if (!sdBlock.text) return;
        const sdNorm = normalizeTextForMatching(sdBlock.text).slice(0, 80);
        if (!sdNorm) return;
        
        const isMatch = sNorm && (sNorm.includes(sdNorm) || sdNorm.includes(sNorm.slice(0, 80)));
        if (isMatch) {
          foundMatch = true;
          console.log(`  => MATCHED with Semantic Block ${sdIdx}: "${sdBlock.text.slice(0, 100)}"`);
        }
      });
      if (!foundMatch) {
        console.log(`  => ❌ NO MATCH FOUND IN SEMANTIC BLOCKS`);
        // Let's print some close candidates
        console.log(`  Candidates:`);
        semanticDocument.blocks.forEach((sdBlock, sdIdx) => {
          if (sdBlock.text && (sdBlock.text.includes('charges') || sdBlock.text.includes('bob') || sdBlock.text.includes('magnitude') || sdBlock.text.includes('spheres'))) {
            console.log(`    [Block ${sdIdx}]: "${sdBlock.text.slice(0, 80)}"`);
          }
        });
      }
    }
  });
}

main().catch(console.error);
