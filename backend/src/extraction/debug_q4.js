import { extractDocxQuestions } from './extractDocxQuestions.js';
import path from 'path';

(async () => {
  try {
    const docxPath = path.resolve('Physics.docx');
    const result = await extractDocxQuestions(docxPath, { skipLlm: true });
    console.log('--- RAW TEXT START ---');
    console.log(result.rawText.slice(0, 3500));
    console.log('--- RAW TEXT END ---');
  } catch (err) {
    console.error(err);
  }
})();
