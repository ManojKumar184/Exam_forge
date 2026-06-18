import path from 'path';
import { documentIntelligencePipeline } from '../src/extraction/documentIntelligence/ingestionPipeline.js';

async function main() {
  const docxPath = path.resolve('..', 'Physics_cleaned_dataset.docx');
  console.log('Processing file:', docxPath);
  
  const result = await documentIntelligencePipeline.process({
    filePath: docxPath,
    filename: 'Physics_cleaned_dataset.docx'
  }, {
    skipLlm: true
  });

  console.log('Total questions extracted:', result.questions.length);
  result.questions.forEach((q, idx) => {
    console.log(`Q${idx + 1}: type=${q.questionType} subtype=${q.subtype} answerKey=${q.answerKey} correctAnswers=${JSON.stringify(q.correctAnswers)}`);
    console.log(`   Text: ${q.questionText.slice(0, 100)}...`);
  });
}

main().catch(console.error);
