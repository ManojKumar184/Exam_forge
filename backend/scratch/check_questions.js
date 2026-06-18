import { documentIntelligencePipeline } from '../src/extraction/documentIntelligence/ingestionPipeline.js';
import { normalizeQuestions } from '../src/extraction/normalizeQuestions.js';
import path from 'path';

const docxPath = path.resolve('../Physics_cleaned_dataset.docx');

async function main() {
  const ext = await documentIntelligencePipeline.process({ filePath: docxPath }, { returnRawBlocks: true });
  console.log('Blocks count:', ext.blocks.length);

  // Inspect blocks 29, 30, 31, 32
  for (const num of [29, 30, 31, 32]) {
    const block = ext.blocks.find(b => b.questionNumber === num);
    if (block) {
      console.log(`\n--- BLOCK ${num} BEFORE MERGE/NORMALIZE ---`);
      console.log('questionNumber:', block.questionNumber);
      console.log('section:', block.section);
      console.log('sectionContext:', block.sectionContext);
      console.log('tags:', block.tags);
      console.log('text snippet:', block.lines.join('\n'));
    }
  }

  const questions = await normalizeQuestions(ext.blocks, { returnRawBlocks: false });
  const { classifyQuestion } = await import('../src/extraction/documentIntelligence/questionTypeClassifier.js');
  const { detectAnswer } = await import('../src/extraction/documentIntelligence/answerDetectionEngine.js');
  
  for (const num of [29, 30, 31, 32]) {
    const q = questions.find(q => q.renderingMetadata?.questionNumber === num);
    if (q) {
      console.log(`\n--- QUESTION ${num} AFTER NORMALIZATION ---`);
      console.log('questionType:', q.questionType);
      console.log('tags:', q.tags);
      if (num === 31) {
        console.log('questionText:', q.questionText);
        ext.blocks.forEach((b, i) => {
          console.log(`Block ${i}: qNum=${b.questionNumber} line0="${b.lines[0]?.slice(0, 80)}"`);
        });
        const segment = ext.blocks.find(b => (b.lines || []).join('\n').includes('Four charges'));
        if (!segment) {
          console.error('Could not find segment for Q31');
        } else {
          const textForClassify = [
            ...(segment.passageBlocks || []).map((block) => block.text),
            ...(segment.stemBlocks || []).map((block) => block.text),
            ...(segment.optionBlocks || []).map((block) => block.text),
          ].join('\n');
          console.log('textForClassify length:', textForClassify.length);
          console.log('textForClassify contents:', textForClassify);
          const regex = /match\s+(?:the\s+)?following|list-?\s*i\b|list-?\s*ii\b|column\s+i/i;
          console.log('regex test on textForClassify:', regex.test(textForClassify));
          const cl = classifyQuestion(segment, segment, detectAnswer(segment, q.options));
          console.log('classifyQuestion result:', cl);
        }
      }
    }
  }
}

main().catch(console.error);
