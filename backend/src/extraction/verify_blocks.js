import { extractStructuredBlocks, blocksToPlainText } from './clipboardIngestion.js';
import { runStagesReconstruction } from './reconstructionPipeline.js';

const testCases = [
  {
    name: 'Word Paste with MathML & MCQ options',
    html: `
      <p class="MsoNormal">If <span><math><mo>P</mo><mo>(</mo><mo>A</mo><mo>∪</mo><mo>B</mo><mo>)</mo><mo>=</mo><mn>0.8</mn></math></span> and <span><math><mo>P</mo><mo>(</mo><mo>A</mo><mo>)</mo><mo>=</mo><mn>0.3</mn></math></span>, find <span><math><mo>P</mo><mo>(</mo><mo>B</mo><mo>)</mo></math></span> when A and B are mutually exclusive.</p>
      <p class="MsoNormal">(A) 0.5</p>
      <p class="MsoNormal">(B) 0.4</p>
      <p class="MsoNormal">(C) 0.3</p>
      <p class="MsoNormal">(D) 0.2</p>
    `,
    plain: `If P(AUB) = 0.8 and P(A) = 0.3, find P(B) when A and B are mutually exclusive.\n(A) 0.5\n(B) 0.4\n(C) 0.3\n(D) 0.2`
  },
  {
    name: 'Word HTML with structured table',
    html: `
      <p class="MsoNormal">Consider the following experimental data:</p>
      <table class="MsoNormalTable" border="1">
        <tr>
          <td><b>Trial</b></td>
          <td><b>Value x</b></td>
          <td><b>Result y</b></td>
        </tr>
        <tr>
          <td>1</td>
          <td>0.5</td>
          <td>1.2</td>
        </tr>
        <tr>
          <td>2</td>
          <td>1.0</td>
          <td>2.4</td>
        </tr>
      </table>
      <p class="MsoNormal">Determine the linear relationship between x and y.</p>
    `,
    plain: `Consider the following experimental data:\nTrial\tValue x\tResult y\n1\t0.5\t1.2\n2\t1.0\t2.4\nDetermine the linear relationship between x and y.`
  },
  {
    name: 'Word HTML with list elements',
    html: `
      <p>Which of the following are properties of a covalent compound?</p>
      <ul>
        <li>High melting point</li>
        <li>Poor electrical conductivity</li>
        <li>Directional bonding</li>
      </ul>
      <p>(A) 1 and 2</p>
      <p>(B) 2 and 3</p>
      <p>(C) 1 and 3</p>
      <p>(D) All of the above</p>
    `,
    plain: `Which of the following are properties of a covalent compound?\n* High melting point\n* Poor electrical conductivity\n* Directional bonding\n(A) 1 and 2\n(B) 2 and 3\n(C) 1 and 3\n(D) All of the above`
  },
  {
    name: 'Math Normalization Shorthand Repairs',
    html: `
      <p class="MsoNormal">If x2 + y2 = z2, find the value of ½ of sqrtx and ¾ of sqrt(y) when frac14 of z is given.</p>
    `,
    plain: `If x2 + y2 = z2, find the value of ½ of sqrtx and ¾ of sqrt(y) when frac14 of z is given.`
  },
  {
    name: 'Math Normalization Edge Cases (plain text exponents should not convert)',
    html: `
      <p class="MsoNormal">Review Question 2: In Chapter 3, page 4, version2 of option 3 did not match version4.</p>
    `,
    plain: `Review Question 2: In Chapter 3, page 4, version2 of option 3 did not match version4.`
  }
];

console.log('--- RUNNING STRUCTURED BLOCKS PARSING TESTS ---');

for (let idx = 0; idx < testCases.length; idx++) {
  const tc = testCases[idx];
  console.log(`\nTest Case ${idx + 1}: ${tc.name}`);
  console.log('---------------------------------------------');
  
  // 1. Ingestion / Block parsing
  const blocks = extractStructuredBlocks(tc.html, tc.plain);
  console.log('Parsed Blocks:');
  blocks.forEach((b, i) => {
    console.log(`  Block ${i + 1} [Type: ${b.type}, Label: ${b.label || 'none'}]:`);
    console.log(`    Content: "${b.content.replace(/\s+/g, ' ').trim()}"`);
  });

  // 2. Text conversion
  const plainFromBlocks = blocksToPlainText(blocks);
  console.log('\nGenerated Plain Text:');
  console.log(plainFromBlocks);

  // 3. Pipeline Reconstruction
  const result = await runStagesReconstruction(plainFromBlocks, tc.html, null, blocks);
  console.log('\nReconstructed Stem:');
  console.log(result.stem);
  console.log('Reconstructed Type:', result.questionType);
  console.log('Reconstructed Subtype:', result.subtype);
  if (result.options.length > 0) {
    console.log('Reconstructed Options:');
    result.options.forEach((o, i) => {
      console.log(`  Option ${i + 1}: "${o.text}"`);
    });
  }

  if (result.debugInfo) {
    console.log('\nPipeline Debug Info:');
    console.log('  Raw Clipboard HTML:', result.debugInfo.rawClipboardHtml ? 'Present' : 'None');
    console.log('  Extracted Semantic Blocks:', result.debugInfo.extractedSemanticBlocks);
    console.log('  Shielded Math Placeholders:', result.debugInfo.shieldedMathPlaceholders);
    console.log('  Pre-normalized Math:', result.debugInfo.preNormalizedMath);
    console.log('  Post-normalized Math:', result.debugInfo.postNormalizedMath);
    console.log('  Final Reconstructed Output:', result.debugInfo.finalReconstructedOutput);
  }
  console.log('=============================================');
}
