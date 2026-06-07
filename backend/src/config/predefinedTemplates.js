import { ExamTemplate } from '../models/ExamTemplate.js';

export const predefinedTemplates = [
  {
    name: 'JEE Main Template',
    code: 'jee_main',
    subjectStructure: ['Physics', 'Chemistry', 'Mathematics'],
    sections: [
      {
        name: 'Section A - MCQ (Single Choice)',
        allowedQuestionTypes: ['mcq', 'MCQ_SINGLE'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 1,
        questionCount: 20
      },
      {
        name: 'Section B - Numerical Value Questions',
        allowedQuestionTypes: ['numerical', 'NUMERICAL', 'INTEGER'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 0,
        questionCount: 10
      }
    ],
    instructions: 'This test contains 90 questions (30 in each subject). Section A contains 20 MCQ questions with one option correct. Section B contains 10 Numerical Value questions (attempt any 5). For Section A, +4 is awarded for a correct answer and -1 for an incorrect answer. For Section B, +4 is awarded for a correct answer and 0 for incorrect.',
    layoutDefaults: {
      layout: 'single_column',
      margin: 'normal',
      fontFamily: 'arial',
      fontSize: 11,
      lineSpacing: 1.15
    },
    isSystem: true
  },
  {
    name: 'JEE Advanced Template',
    code: 'jee_advanced',
    subjectStructure: ['Physics', 'Chemistry', 'Mathematics'],
    sections: [
      {
        name: 'Section 1 - Single Correct MCQ',
        allowedQuestionTypes: ['mcq', 'MCQ_SINGLE'],
        marksPerQuestion: 3,
        negativeMarksPerQuestion: 1,
        questionCount: 6
      },
      {
        name: 'Section 2 - Multiple Correct MCQ',
        allowedQuestionTypes: ['MCQ_MULTI'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 2,
        questionCount: 6
      },
      {
        name: 'Section 3 - Integer / Numerical Type',
        allowedQuestionTypes: ['numerical', 'NUMERICAL', 'INTEGER'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 0,
        questionCount: 6
      }
    ],
    instructions: 'This question paper consists of three parts: Physics, Chemistry and Mathematics. Each part contains three sections. Section 1 contains 6 MCQ questions (+3, -1 marks). Section 2 contains 6 Multi-Option MCQs (+4, -2 marks). Section 3 contains 6 Numerical Value questions (+4, 0 marks).',
    layoutDefaults: {
      layout: 'single_column',
      margin: 'normal',
      fontFamily: 'times_new_roman',
      fontSize: 10.5,
      lineSpacing: 1.25
    },
    isSystem: true
  },
  {
    name: 'NEET Template',
    code: 'neet',
    subjectStructure: ['Physics', 'Chemistry', 'Biology'],
    sections: [
      {
        name: 'Section A - Physics MCQ (Mandatory)',
        allowedQuestionTypes: ['mcq', 'MCQ_SINGLE'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 1,
        questionCount: 35
      },
      {
        name: 'Section B - Physics MCQ (Optional)',
        allowedQuestionTypes: ['mcq', 'MCQ_SINGLE'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 1,
        questionCount: 15
      },
      {
        name: 'Section A - Chemistry MCQ (Mandatory)',
        allowedQuestionTypes: ['mcq', 'MCQ_SINGLE'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 1,
        questionCount: 35
      },
      {
        name: 'Section B - Chemistry MCQ (Optional)',
        allowedQuestionTypes: ['mcq', 'MCQ_SINGLE'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 1,
        questionCount: 15
      },
      {
        name: 'Section A - Biology MCQ (Mandatory)',
        allowedQuestionTypes: ['mcq', 'MCQ_SINGLE'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 1,
        questionCount: 70
      },
      {
        name: 'Section B - Biology MCQ (Optional)',
        allowedQuestionTypes: ['mcq', 'MCQ_SINGLE'],
        marksPerQuestion: 4,
        negativeMarksPerQuestion: 1,
        questionCount: 30
      }
    ],
    instructions: 'The test is of 3 hours and 20 minutes duration and consists of 200 multiple-choice questions (four options with a single correct answer) from Physics, Chemistry and Biology. Section A has 35 questions and Section B has 15 questions (attempt any 10). Each question carries 4 marks (+4 for correct, -1 for incorrect).',
    layoutDefaults: {
      layout: 'two_column',
      margin: 'narrow',
      fontFamily: 'arial',
      fontSize: 9.5,
      lineSpacing: 1.1
    },
    isSystem: true
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
    isSystem: true
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
    isSystem: true
  }
];

export async function seedPredefinedTemplates() {
  try {
    for (const t of predefinedTemplates) {
      const existing = await ExamTemplate.findOne({ code: t.code, isSystem: true });
      if (!existing) {
        await ExamTemplate.create(t);
        console.log(`Seeded system template: ${t.name}`);
      } else {
        // Optionally update it to keep system templates up-to-date
        Object.assign(existing, t);
        await existing.save();
      }
    }
  } catch (err) {
    console.error('Failed to seed predefined templates:', err);
  }
}
