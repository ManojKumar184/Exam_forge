import { extractDocxQuestions } from './extractDocxQuestions.js';
import path from 'path';

async function test() {
  try {
    const docxPath = 'c:/Users/manoj555/Desktop/Exam_forge/Physics_cleaned_dataset.docx';
    console.log('Resolving docx path:', docxPath);
    const result = await extractDocxQuestions(docxPath);
    console.log('Successfully loaded DOCX!');
    console.log('Number of questions extracted:', result.questions?.length);
    console.log('Warnings:', result.warnings);
    
    if (result.questions) {
      console.log('--- QUESTIONS PREVIEW ---');
      result.questions.slice(0, 5).forEach((q, idx) => {
        console.log(`\nQuestion ${idx + 1}:`);
        console.log(`  Stem: "${q.questionText.slice(0, 150)}..."`);
        console.log(`  Type: ${q.questionType} (${q.renderingMetadata?.subtype})`);
        console.log(`  Options Count: ${q.options?.length}`);
        if (q.options?.length) {
          q.options.forEach((o, i) => console.log(`    Option ${i + 1}: "${o.text}"`));
        }
        console.log(`  Explanation: "${q.explanation}"`);
      });
    }
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
