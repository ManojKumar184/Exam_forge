import * as docx from 'docx';
import katex from 'katex';
import { mml2omml } from 'mathml2omml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = __dirname;

console.log(`Fixtures directory: ${fixturesDir}`);

// Helper to create OMML Math Component
function createOmmlComponent(latex) {
  try {
    const mathml = katex.renderToString(latex, { output: 'mathml' });
    const match = mathml.match(/<math[\s\S]*?<\/math>/);
    if (!match) {
      return new docx.TextRun(latex);
    }
    const cleanMathml = match[0];
    const omml = mml2omml(cleanMathml);
    return docx.ImportedXmlComponent.fromXmlString(omml);
  } catch (err) {
    console.error(`Failed to compile LaTeX to OMML: ${latex}`, err);
    return new docx.TextRun(latex);
  }
}

// 1. Plain Text Table
async function generatePlainTextTable() {
  const doc = new docx.Document({
    sections: [{
      children: [
        new docx.Paragraph({
          children: [new docx.TextRun({ text: "Question 1. The following table represents observation data for three experimental groups. Find the mean value.", bold: true })]
        }),
        new docx.Paragraph({ text: "" }),
        new docx.Table({
          rows: [
            new docx.TableRow({
              children: [
                new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Group", bold: true })] })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Observation A", bold: true })] })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Observation B", bold: true })] })] })
              ]
            }),
            new docx.TableRow({
              children: [
                new docx.TableCell({ children: [new docx.Paragraph({ text: "Group 1" })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ text: "10" })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ text: "12" })] })
              ]
            }),
            new docx.TableRow({
              children: [
                new docx.TableCell({ children: [new docx.Paragraph({ text: "Group 2" })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ text: "20" })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ text: "22" })] })
              ]
            }),
            new docx.TableRow({
              children: [
                new docx.TableCell({ children: [new docx.Paragraph({ text: "Group 3" })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ text: "30" })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ text: "32" })] })
              ]
            })
          ]
        }),
        new docx.Paragraph({ text: "" }),
        new docx.Paragraph({
          children: [
            new docx.TextRun("(A) 21.0"),
            new docx.TextRun("\t(B) 22.0\t"),
            new docx.TextRun("(C) 20.0"),
            new docx.TextRun("\t(D) 23.0")
          ]
        })
      ]
    }]
  });

  const buffer = await docx.Packer.toBuffer(doc);
  fs.writeFileSync(path.join(fixturesDir, 'plain_text_table.docx'), buffer);
}

// 2. Equation Table
async function generateEquationTable() {
  const doc = new docx.Document({
    sections: [{
      children: [
        new docx.Paragraph({
          children: [new docx.TextRun({ text: "Question 2. Solve the mathematical integral expressions presented in the table below.", bold: true })]
        }),
        new docx.Paragraph({ text: "" }),
        new docx.Table({
          rows: [
            new docx.TableRow({
              children: [
                new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "ID", bold: true })] })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Mathematical Expression", bold: true })] })] })
              ]
            }),
            new docx.TableRow({
              children: [
                new docx.TableCell({ children: [new docx.Paragraph({ text: "1" })] }),
                new docx.TableCell({
                  children: [
                    new docx.Paragraph({
                      children: [
                        new docx.TextRun("Evaluate the integral: "),
                        createOmmlComponent("I = \\int_0^{\\pi} \\sin(x) \\, dx")
                      ]
                    })
                  ]
                })
              ]
            }),
            new docx.TableRow({
              children: [
                new docx.TableCell({ children: [new docx.Paragraph({ text: "2" })] }),
                new docx.TableCell({
                  children: [
                    new docx.Paragraph({
                      children: [
                        new docx.TextRun("Evaluate the limit: "),
                        createOmmlComponent("\\lim_{x \\to \\infty} \\frac{1}{x} = 0")
                      ]
                    })
                  ]
                })
              ]
            })
          ]
        }),
        new docx.Paragraph({ text: "" }),
        new docx.Paragraph({
          children: [
            new docx.TextRun("(A) 2 and 0"),
            new docx.TextRun("\t(B) 1 and 1\t"),
            new docx.TextRun("(C) 0 and 2"),
            new docx.TextRun("\t(D) -1 and 0")
          ]
        })
      ]
    }]
  });

  const buffer = await docx.Packer.toBuffer(doc);
  fs.writeFileSync(path.join(fixturesDir, 'equation_table.docx'), buffer);
}

// 3. Image Table
async function generateImageTable() {
  const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const imageBuffer = Buffer.from(base64Png, 'base64');

  const doc = new docx.Document({
    sections: [{
      children: [
        new docx.Paragraph({
          children: [new docx.TextRun({ text: "Question 3. Identify the electrical schematic component displayed inside the table below.", bold: true })]
        }),
        new docx.Paragraph({ text: "" }),
        new docx.Table({
          rows: [
            new docx.TableRow({
              children: [
                new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Component Name", bold: true })] })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Schematic Symbol", bold: true })] })] })
              ]
            }),
            new docx.TableRow({
              children: [
                new docx.TableCell({ children: [new docx.Paragraph({ text: "Solid State Resistor" })] }),
                new docx.TableCell({
                  children: [
                    new docx.Paragraph({
                      children: [
                        new docx.ImageRun({
                          data: imageBuffer,
                          transformation: { width: 50, height: 50 }
                        })
                      ]
                    })
                  ]
                })
              ]
            })
          ]
        }),
        new docx.Paragraph({ text: "" }),
        new docx.Paragraph({
          children: [
            new docx.TextRun("(A) Resistor"),
            new docx.TextRun("\t(B) Capacitor\t"),
            new docx.TextRun("(C) Inductor"),
            new docx.TextRun("\t(D) Diode")
          ]
        })
      ]
    }]
  });

  const buffer = await docx.Packer.toBuffer(doc);
  fs.writeFileSync(path.join(fixturesDir, 'image_table.docx'), buffer);
}

// 4. Match-the-Following Table
async function generateMatchFollowingTable() {
  const doc = new docx.Document({
    sections: [{
      children: [
        new docx.Paragraph({
          children: [new docx.TextRun({ text: "Question 4. Match the chemical elements listed in Column A with their appropriate group classification in Column B.", bold: true })]
        }),
        new docx.Paragraph({ text: "" }),
        new docx.Table({
          rows: [
            new docx.TableRow({
              children: [
                new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Column A", bold: true })] })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Column B", bold: true })] })] })
              ]
            }),
            new docx.TableRow({
              children: [
                new docx.TableCell({ children: [new docx.Paragraph({ text: "I. Sodium" })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ text: "A. Noble Gas" })] })
              ]
            }),
            new docx.TableRow({
              children: [
                new docx.TableCell({ children: [new docx.Paragraph({ text: "II. Argon" })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ text: "B. Halogen" })] })
              ]
            }),
            new docx.TableRow({
              children: [
                new docx.TableCell({ children: [new docx.Paragraph({ text: "III. Chlorine" })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ text: "C. Alkali Metal" })] })
              ]
            })
          ]
        }),
        new docx.Paragraph({ text: "" }),
        new docx.Paragraph({
          children: [
            new docx.TextRun("(A) I-C, II-A, III-B"),
            new docx.TextRun("\t(B) I-A, II-B, III-C\t"),
            new docx.TextRun("(C) I-B, II-C, III-A"),
            new docx.TextRun("\t(D) I-C, II-B, III-A")
          ]
        })
      ]
    }]
  });

  const buffer = await docx.Packer.toBuffer(doc);
  fs.writeFileSync(path.join(fixturesDir, 'match_following_table.docx'), buffer);
}

// 5. Merged Cells Table
async function generateMergedCellsTable() {
  const doc = new docx.Document({
    sections: [{
      children: [
        new docx.Paragraph({
          children: [new docx.TextRun({ text: "Question 5. Analyze the data distribution matrix containing merged grid regions below.", bold: true })]
        }),
        new docx.Paragraph({ text: "" }),
        new docx.Table({
          rows: [
            new docx.TableRow({
              children: [
                new docx.TableCell({
                  columnSpan: 3,
                  children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Merged Main Header Span", bold: true })], alignment: docx.AlignmentType.CENTER })]
                })
              ]
            }),
            new docx.TableRow({
              children: [
                new docx.TableCell({
                  verticalMerge: docx.VerticalMergeType.RESTART,
                  children: [new docx.Paragraph({ text: "Vertical Spanned Key" })]
                }),
                new docx.TableCell({ children: [new docx.Paragraph({ text: "Metric Alpha" })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ text: "150" })] })
              ]
            }),
            new docx.TableRow({
              children: [
                new docx.TableCell({
                  verticalMerge: docx.VerticalMergeType.CONTINUE,
                  children: []
                }),
                new docx.TableCell({ children: [new docx.Paragraph({ text: "Metric Beta" })] }),
                new docx.TableCell({ children: [new docx.Paragraph({ text: "300" })] })
              ]
            })
          ]
        }),
        new docx.Paragraph({ text: "" }),
        new docx.Paragraph({
          children: [
            new docx.TextRun("(A) 150 and 300"),
            new docx.TextRun("\t(B) 300 and 150\t"),
            new docx.TextRun("(C) 150 and 150"),
            new docx.TextRun("\t(D) 300 and 300")
          ]
        })
      ]
    }]
  });

  const buffer = await docx.Packer.toBuffer(doc);
  fs.writeFileSync(path.join(fixturesDir, 'merged_cells_table.docx'), buffer);
}

async function main() {
  console.log("Generating 5-category DOCX table ingestion validation fixtures...");
  await generatePlainTextTable();
  await generateEquationTable();
  await generateImageTable();
  await generateMatchFollowingTable();
  await generateMergedCellsTable();
  console.log("All 5 fixtures successfully generated!");
}

main().catch(console.error);
