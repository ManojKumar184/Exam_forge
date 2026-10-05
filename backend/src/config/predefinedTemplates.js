import { ExamTemplate } from '../models/ExamTemplate.js';

export const predefinedTemplates = [
  {
    name: 'JEE Main Template',
    code: 'jee_main',
    subjectStructure: ['Physics', 'Chemistry', 'Mathematics'],
    sections: [
      {
        name: 'Section A - MCQ (Single Choice)',
        allowedQuestionTypes: ['MCQ_SINGLE'],
        responseTypes: ['MCQ'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 1,
        questionCount: 20
      },
      {
        name: 'Section B - Numerical Value Questions',
        allowedQuestionTypes: ['NUMERICAL'],
        responseTypes: ['NUMERICAL'],
        subtypes: ['INTEGER_RESPONSE'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 1,
        questionCount: 5
      }
    ],
    paperCount: 1,
    instructions: 'Each subject section contains 20 single-correct MCQs and 5 numerical-response questions. The blueprint expands those sections across Physics, Chemistry, and Mathematics. Each question carries 4 marks; incorrect answers carry a 1-mark deduction.',
    layoutDefaults: {
      layout: 'single_column',
      margin: 'normal',
      fontFamily: 'arial',
      fontSize: 11,
      lineSpacing: 1.15
    },
    isSystem: true,
    version: 1,
    isCurrent: true,
    isPublished: true
  },
  {
    name: 'JEE Advanced Template',
    code: 'jee_advanced',
    subjectStructure: ['Physics', 'Chemistry', 'Mathematics'],
    sections: [
      {
        name: 'Section 1 - Single Correct MCQ',
        allowedQuestionTypes: ['MCQ_SINGLE'],
        responseTypes: ['MCQ'],
        marksPerQuestion: 3,
        negativeMarksPerQuestion: 1,
        questionCount: 6
      },
      {
        name: 'Section 2 - Multiple Correct MCQ',
        allowedQuestionTypes: ['MCQ_MULTIPLE'],
        responseTypes: ['MSQ'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 2,
        questionCount: 6
      },
      {
        name: 'Section 3 - Integer / Numerical Type',
        allowedQuestionTypes: ['NUMERICAL'],
        responseTypes: ['NUMERICAL'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 0,
        questionCount: 6
      }
    ],
    paperCount: 2,
    instructions: 'JEE Advanced blueprint: each paper has Physics, Chemistry, and Mathematics sections. Single-correct MCQ, multi-correct MSQ, and numerical-response counts and scoring are configurable by the institution for the chosen year.',
    layoutDefaults: {
      layout: 'single_column',
      margin: 'normal',
      fontFamily: 'times_new_roman',
      fontSize: 10.5,
      lineSpacing: 1.25
    },
    isSystem: true,
    version: 1,
    isCurrent: true,
    isPublished: true
  },
  {
    name: 'NEET Template',
    code: 'neet',
    subjectStructure: ['Physics', 'Chemistry', 'Biology'],
    sections: [
      {
        name: 'Section A - Physics MCQ (Mandatory)',
        allowedQuestionTypes: ['MCQ_SINGLE'],
        responseTypes: ['MCQ'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 1,
        questionCount: 45,
        subjectName: 'Physics'
      },
      {
        name: 'Chemistry MCQ',
        allowedQuestionTypes: ['MCQ_SINGLE'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 1,
        responseTypes: ['MCQ'],
        questionCount: 45,
        subjectName: 'Chemistry'
      },
      {
        name: 'Biology MCQ',
        allowedQuestionTypes: ['MCQ_SINGLE'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 1,
        responseTypes: ['MCQ'],
        questionCount: 90,
        subjectName: 'Biology'
      }
    ],
    paperCount: 1,
    instructions: 'NEET blueprint has 45 single-correct MCQs in Physics, 45 in Chemistry, and 90 in Biology. Each question carries 4 marks; an incorrect answer carries a 1-mark deduction.',
    layoutDefaults: {
      layout: 'two_column',
      margin: 'narrow',
      fontFamily: 'arial',
      fontSize: 9.5,
      lineSpacing: 1.1
    },
    isSystem: true,
    version: 1,
    isCurrent: true,
    isPublished: true
  },
  {
    name: 'CBSE Board Template',
    code: 'cbse',
    subjectStructure: ['General'],
    sections: [
      {
        name: 'Section A - MCQ (1 Mark)',
        allowedQuestionTypes: ['mcq', 'MCQ_SINGLE', 'TRUE_FALSE', 'ASSERTION_REASON'],
        marksPerQuestion: 1,
        negativeMarksPerQuestion: 0,
        questionCount: 20
      },
      {
        name: 'Section B - Very Short Answer (2 Marks)',
        allowedQuestionTypes: ['descriptive', 'DESCRIPTIVE'],
        marksPerQuestion: 2,
        negativeMarksPerQuestion: 0,
        questionCount: 5
      },
      {
        name: 'Section C - Short Answer (3 Marks)',
        allowedQuestionTypes: ['descriptive', 'DESCRIPTIVE', 'numerical', 'NUMERICAL'],
        marksPerQuestion: 3,
        negativeMarksPerQuestion: 0,
        questionCount: 6
      },
      {
        name: 'Section D - Long Answer (5 Marks)',
        allowedQuestionTypes: ['descriptive', 'DESCRIPTIVE'],
        marksPerQuestion: 5,
        negativeMarksPerQuestion: 0,
        questionCount: 4
      },
      {
        name: 'Section E - Case Study Based (4 Marks)',
        allowedQuestionTypes: ['descriptive', 'DESCRIPTIVE', 'COMPREHENSION', 'CASE_STUDY'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 0,
        questionCount: 3
      }
    ],
    instructions: 'General Instructions: 1. This question paper contains 38 questions. All questions are compulsory. 2. The paper is divided into 5 Sections - A, B, C, D and E. 3. Section A comprises 20 MCQs of 1 mark each. 4. Section B comprises 5 Very Short Answer questions of 2 marks each. 5. Section C comprises 6 Short Answer questions of 3 marks each. 6. Section D comprises 4 Long Answer questions of 5 marks each. 7. Section E comprises 3 Case Study questions of 4 marks each. 8. There is no negative marking.',
    layoutDefaults: {
      layout: 'single_column',
      margin: 'normal',
      fontFamily: 'times_new_roman',
      fontSize: 11.5,
      lineSpacing: 1.4
    },
    isSystem: true,
    version: 1,
    isCurrent: true,
    isPublished: true
  },
  {
    name: 'Institution Template',
    code: 'institution',
    subjectStructure: ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'General'],
    sections: [
      {
        name: 'Section A - Multiple Choice Questions',
        allowedQuestionTypes: ['mcq', 'MCQ_SINGLE'],
        marksPerQuestion: 1,
        negativeMarksPerQuestion: 0,
        questionCount: 10
      },
      {
        name: 'Section B - Descriptive Questions',
        allowedQuestionTypes: ['descriptive', 'DESCRIPTIVE'],
        marksPerQuestion: 5,
        negativeMarksPerQuestion: 0,
        questionCount: 5
      }
    ],
    instructions: 'General Instructions: 1. Attempt all questions. 2. Section A contains 10 MCQs of 1 mark each. 3. Section B contains 5 descriptive questions of 5 marks each.',
    layoutDefaults: {
      layout: 'single_column',
      margin: 'normal',
      fontFamily: 'inter',
      fontSize: 11,
      lineSpacing: 1.25
    },
    isSystem: true,
    version: 1,
    isCurrent: true,
    isPublished: true
  }
];

export async function seedPredefinedTemplates() {
  for (const t of predefinedTemplates) {
    const existing = await ExamTemplate.findOne({ code: t.code, isSystem: true, isCurrent: { $ne: false } }).sort({ version: -1 });
    if (!existing) {
      await ExamTemplate.create(t);
      console.log(`Seeded system template: ${t.name}`);
    } else {
      const existingData = existing.toObject();
      const stableKeys = ['name', 'subjectStructure', 'sections', 'instructions', 'layoutDefaults', 'paperCount'];
      const hasChanges = stableKeys.some((key) => JSON.stringify(existingData[key] ?? null) !== JSON.stringify(t[key] ?? null));
      if (hasChanges) {
        existing.isCurrent = false;
        await existing.save();
        await ExamTemplate.create({
          ...t,
          version: Number(existing.version || 1) + 1,
          versionOf: existing.versionOf || existing._id,
          isCurrent: true,
          isPublished: true,
        });
        console.log(`Published ${t.name} blueprint v${Number(existing.version || 1) + 1}`);
      }
    }
  }
}
