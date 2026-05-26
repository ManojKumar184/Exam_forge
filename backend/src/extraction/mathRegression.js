/**
 * Mathematical Ingestion Regression Suite
 * Run with: node backend/src/extraction/mathRegression.js
 */
import { convertHtmlMathToLatex, parseXml, translateOmmlNode, translateMathmlNode } from './mathConverter.js';

const testCases = [
  {
    name: "1. OMML Matrix Conversion",
    input: `
      <m:oMath>
        <m:m>
          <m:mr>
            <m:e><m:r><m:t>1</m:t></m:r></m:e>
            <m:e><m:r><m:t>2</m:t></m:r></m:e>
          </m:mr>
          <m:mr>
            <m:e><m:r><m:t>3</m:t></m:r></m:e>
            <m:e><m:r><m:t>4</m:t></m:r></m:e>
          </m:mr>
        </m:m>
      </m:oMath>
    `,
    expected: "$\\begin{matrix}1 & 2 \\\\ 3 & 4\\end{matrix}$"
  },
  {
    name: "2. MathML Matrix/Table Conversion",
    input: `
      <math>
        <mtable>
          <mtr>
            <mtd><mn>5</mn></mtd>
            <mtd><mn>6</mn></mtd>
          </mtr>
          <mtr>
            <mtd><mn>7</mn></mtd>
            <mtd><mn>8</mn></mtd>
          </mtr>
        </mtable>
      </math>
    `,
    expected: "$\\begin{matrix}5 & 6 \\\\ 7 & 8\\end{matrix}$"
  },
  {
    name: "3. OMML Determinant Delimiter",
    input: `
      <m:oMath>
        <m:d>
          <m:dPr>
            <m:begChr m:val="|"/>
            <m:endChr m:val="|"/>
          </m:dPr>
          <m:e>
            <m:m>
              <m:mr>
                <m:e><m:r><m:t>a</m:t></m:r></m:e>
                <m:e><m:r><m:t>b</m:t></m:r></m:e>
              </m:mr>
              <m:mr>
                <m:e><m:r><m:t>c</m:t></m:r></m:e>
                <m:e><m:r><m:t>d</m:t></m:r></m:e>
              </m:mr>
            </m:m>
          </m:e>
        </m:d>
      </m:oMath>
    `,
    expected: "$\\left| \\begin{matrix}a & b \\\\ c & d\\end{matrix} \\right|$"
  },
  {
    name: "4. OMML Calculus Integral Notation",
    input: `
      <m:oMath>
        <m:nary>
          <m:naryPr>
            <m:chr m:val="∫"/>
          </m:naryPr>
          <m:sub>
            <m:r><m:t>a</m:t></m:r>
          </m:sub>
          <m:sup>
            <m:r><m:t>b</m:t></m:r>
          </m:sup>
          <m:e>
            <m:r><m:t>f(x)dx</m:t></m:r>
          </m:e>
        </m:nary>
      </m:oMath>
    `,
    expected: "$\\int_{a}^{b} f(x)dx$"
  },
  {
    name: "5. OMML Sigma/Summation Notation",
    input: `
      <m:oMath>
        <m:nary>
          <m:naryPr>
            <m:chr m:val="∑"/>
          </m:naryPr>
          <m:sub>
            <m:r><m:t>i=1</m:t></m:r>
          </m:sub>
          <m:sup>
            <m:r><m:t>n</m:t></m:r>
          </m:sup>
          <m:e>
            <m:r><m:t>i</m:t></m:r>
          </m:e>
        </m:nary>
      </m:oMath>
    `,
    expected: "$\\sum_{i=1}^{n} i$"
  },
  {
    name: "6. OMML Accents & Vector Arrows",
    input: `
      <m:oMath>
        <m:acc>
          <m:accPr>
            <m:chr m:val="→"/>
          </m:accPr>
          <m:e>
            <m:r><m:t>F</m:t></m:r>
          </m:e>
        </m:acc>
      </m:oMath>
    `,
    expected: "$\\vec{F}$"
  },
  {
    name: "7. MathML Mover Accent Vector",
    input: `
      <math>
        <mover>
          <mi>A</mi>
          <mo>→</mo>
        </mover>
      </math>
    `,
    expected: "$\\vec{A}$"
  },
  {
    name: "8. OMML Aligned Equations",
    input: `
      <m:oMath>
        <m:eqarr>
          <m:e><m:r><m:t>x + y = 5</m:t></m:r></m:e>
          <m:e><m:r><m:t>2x - y = 4</m:t></m:r></m:e>
        </m:eqarr>
      </m:oMath>
    `,
    expected: "$\\begin{aligned}x + y = 5 \\\\ 2x - y = 4\\end{aligned}$"
  },
  {
    name: "9. MathML Set Intersections/Unions",
    input: `
      <math>
        <mi>P</mi>
        <mo>(</mo>
        <mi>A</mi>
        <mo>⋂</mo>
        <mi>B</mi>
        <mo>)</mo>
      </math>
    `,
    expected: "$P ( A \\cap B )$"
  }
];

function runRegressionSuite() {
  console.log("=================================================");
  console.log("RUNNING MATHEMATICAL INGESTION REGRESSION TESTS");
  console.log("=================================================");
  
  let passed = 0;
  let failed = 0;
  
  for (const tc of testCases) {
    const output = convertHtmlMathToLatex(tc.input).trim();
    if (output === tc.expected) {
      console.log(`[PASS] ${tc.name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${tc.name}`);
      console.error(`  Expected: ${tc.expected}`);
      console.error(`  Got:      ${output}`);
      failed++;
    }
  }
  
  console.log("=================================================");
  console.log(`Regression Run Complete: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");
  
  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionSuite();
