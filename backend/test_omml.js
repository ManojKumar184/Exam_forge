import * as docx from 'docx';
import katex from 'katex';
import { mml2omml } from 'mathml2omml';
import fs from 'fs';

console.log("Starting test document generation...");
try {
  const mathml = katex.renderToString('a^2 + b^2 = c^2', { output: 'mathml' });
  const cleanMathml = mathml.match(/<math[\s\S]*?<\/math>/)[0];
  const omml = mml2omml(cleanMathml);

  const comp = docx.ImportedXmlComponent.fromXmlString(omml);

  const doc = new docx.Document({
    sections: [
      {
        properties: {},
        children: [
          new docx.Paragraph({
            children: [
              new docx.TextRun("Here is a native math equation: "),
              comp,
              new docx.TextRun(" in the middle of a sentence.")
            ]
          })
        ]
      }
    ]
  });

  const buffer = await docx.Packer.toBuffer(doc);
  fs.writeFileSync('test_output.docx', buffer);
  console.log("Document generated successfully!");
} catch (err) {
  console.error("Error during test:", err);
}
