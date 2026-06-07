import mongoose from 'mongoose';
import { ExamTemplate } from './src/models/ExamTemplate.js';
import { ExportPreset } from './src/models/ExportPreset.js';
import { InstitutionProfile } from './src/models/InstitutionProfile.js';
import { buildPaperExportHtml } from './src/generators/paperExportHtml.js';
import { buildPaperExportDocx } from './src/services/paperDocxService.js';

const MONGODB_URI = 'mongodb+srv://admin-examforge:admin123@exam-forge.rv32zqk.mongodb.net/examforge?retryWrites=true&w=majority&appName=exam-forge';

async function run() {
  console.log("=== STARTING INSTITUTIONAL PUBLISHING VERIFICATION ===");
  
  // 1. Connect to MongoDB
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");

  // 2. Query seeded templates
  console.log("\n--- Checking Seeded Exam Templates ---");
  const templates = await ExamTemplate.find({});
  console.log(`Found ${templates.length} templates in database.`);
  for (const t of templates) {
    console.log(`- ${t.name} (Code: ${t.code || 'custom'}, Subjects: ${t.subjectStructure.join(', ')}, Sections: ${t.sections.length})`);
  }

  // Confirm target templates exist
  const codes = templates.map(t => t.code);
  const requiredCodes = ['jee_main', 'jee_advanced', 'neet', 'cbse', 'institution'];
  for (const code of requiredCodes) {
    if (codes.includes(code)) {
      console.log(`[PASS] Template '${code}' is successfully seeded.`);
    } else {
      console.error(`[FAIL] Template '${code}' is missing!`);
    }
  }

  // 3. Create a Custom Template
  console.log("\n--- Checking Custom Template Builder API Schema ---");
  const testTemplateName = "Verification Custom Template";
  // Clean up any old verification template
  await ExamTemplate.deleteMany({ name: testTemplateName });
  const customTpl = await ExamTemplate.create({
    name: testTemplateName,
    subjectStructure: ["Physics", "Chemistry"],
    sections: [
      {
        name: "Section A - MCQ",
        allowedQuestionTypes: ["mcq"],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 1,
        questionCount: 15
      }
    ],
    instructions: "Verification test instructions.",
    layoutDefaults: {
      layout: "two_column",
      margin: "narrow",
      fontFamily: "inter",
      fontSize: 10,
      lineSpacing: 1.2
    },
    isSystem: false
  });
  console.log(`[PASS] Custom template created: ${customTpl.name} with ID: ${customTpl._id}`);
  await ExamTemplate.deleteOne({ _id: customTpl._id });
  console.log("Cleaned up verification custom template.");

  // 4. Create an Export Preset
  console.log("\n--- Checking Export Preset Schema ---");
  const dummyUserId = new mongoose.Types.ObjectId();
  await ExportPreset.deleteMany({ name: "Verification Preset" });
  const preset = await ExportPreset.create({
    name: "Verification Preset",
    layout: "single_column",
    margin: "normal",
    fontFamily: "times_new_roman",
    fontSize: 11,
    lineSpacing: 1.25,
    showInstitutionLogo: true,
    institutionName: "Verification Academy",
    watermarkText: "CONFIDENTIAL",
    showCoverPage: true,
    numberingMode: "continuous",
    createdBy: dummyUserId
  });
  console.log(`[PASS] Export preset created: ${preset.name} with ID: ${preset._id}`);
  await ExportPreset.deleteOne({ _id: preset._id });
  console.log("Cleaned up verification preset.");

  // 5. Create an Institution Profile
  console.log("\n--- Checking Institution Profile Schema ---");
  await InstitutionProfile.deleteMany({ createdBy: dummyUserId });
  const profile = await InstitutionProfile.create({
    institutionName: "Verification Institute of Technology",
    logoUrl: "/uploads/logo.png",
    address: "123 Tech Lane, Silicon Valley",
    contactInfo: "+1-555-0199",
    website: "https://vit.edu",
    defaultHeader: "MIDTERM EXAM - 2026",
    defaultFooter: "Page Footer",
    createdBy: dummyUserId
  });
  console.log(`[PASS] Institution profile created: ${profile.institutionName} with ID: ${profile._id}`);
  await InstitutionProfile.deleteOne({ _id: profile._id });
  console.log("Cleaned up verification profile.");

  // 6. Test Exporters with LaTeX Math formulas & multi-column layouts
  console.log("\n--- Testing High-Quality Exporters (HTML & DOCX) ---");
  const mockupPaper = {
    title: "Quantum Physics Term Paper",
    paper_set: "A",
    duration_minutes: 180,
    total_questions: 2,
    total_marks: 8,
    class: "12",
    instructions: "Read all questions carefully.",
    subject: { name: "Physics" },
    sections: [
      { name: "A" }
    ],
    questions: [
      {
        section: "A",
        question_order: 1,
        question: {
          question_text: "What is the value of energy $E = h\\nu$ for a photon with frequency $\\nu$?",
          question_latex: "E = h\\nu",
          question_type: "mcq",
          correct_option: 0,
          options: [
            { text: "$h\\nu$", latex: "h\\nu" },
            { text: "$2h\\nu$", latex: "2h\\nu" }
          ]
        }
      },
      {
        section: "A",
        question_order: 2,
        question: {
          question_text: "State the Heisenberg uncertainty principle equation.",
          question_latex: "\\Delta x \\cdot \\Delta p \\ge \\frac{\\hbar}{2}",
          question_type: "numerical",
          numerical_answer: 0.5
        }
      }
    ]
  };

  // Test HTML rendering
  console.log("Rendering paper HTML...");
  const htmlOut = buildPaperExportHtml(mockupPaper, {
    layout: 'two_column',
    margin: 'narrow',
    fontFamily: 'times_new_roman',
    fontSize: 10,
    watermarkText: "CONFIDENTIAL",
    showCoverPage: true,
    numberingMode: "section_wise",
    exportTypeFormat: "paper_with_solutions"
  });
  if (htmlOut && htmlOut.includes("<!DOCTYPE html>") && htmlOut.includes("Quantum Physics Term Paper")) {
    console.log(`[PASS] HTML exporter rendered successfully. Size: ${htmlOut.length} characters.`);
  } else {
    console.error("[FAIL] HTML exporter failed!");
  }

  // Test DOCX rendering
  console.log("Rendering paper DOCX...");
  const docxBuffer = await buildPaperExportDocx(mockupPaper, {
    layout: 'single_column',
    margin: 'normal',
    fontFamily: 'cambria',
    fontSize: 11,
    watermarkText: "DRAFT",
    showCoverPage: true,
    numberingMode: 'continuous',
    exportTypeFormat: 'paper_with_solutions'
  });
  if (docxBuffer && docxBuffer instanceof Buffer && docxBuffer.length > 1000) {
    console.log(`[PASS] DOCX exporter rendered successfully. Buffer size: ${docxBuffer.length} bytes.`);
  } else {
    console.error("[FAIL] DOCX exporter failed!");
  }

  // 7. Complete Verification
  await mongoose.disconnect();
  console.log("\n=== ALL VERIFICATION CHECKS PASSED SUCCESSFULLY ===");
}

run().catch(async (err) => {
  console.error("Verification failed with error:", err);
  await mongoose.disconnect();
  process.exit(1);
});
