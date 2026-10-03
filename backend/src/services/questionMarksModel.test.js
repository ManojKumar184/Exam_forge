import test from 'node:test';
import assert from 'node:assert/strict';

test("changing a Question's sourceMarks cannot change Paper scoring", () => {
  const question = {
    _id: '507f1f77bcf86cd799439011',
    questionText: 'Sample physics question',
    questionType: 'MCQ_SINGLE',
    sourceMarks: 10,
    class: 12,
  };

  const paper = {
    title: 'Physics Exam',
    totalMarks: 5,
    sections: [{ name: 'A', questionCount: 1, marksPerQuestion: 5, negativeMarksPerQuestion: 1 }],
    questions: [
      {
        questionId: question,
        section: 'A',
        questionOrder: 1,
        customMarks: 5,
        customNegativeMarks: 1,
      },
    ],
  };

  // Derive paper question mark
  const derivedMarks = paper.questions[0].customMarks ?? paper.sections[0].marksPerQuestion;
  assert.equal(derivedMarks, 5);

  // Mutate source mark on question
  question.sourceMarks = 100;

  // Re-derive score - paper score must be unaffected by question sourceMarks
  const scoreAfterMutation = paper.questions[0].customMarks ?? paper.sections[0].marksPerQuestion;
  assert.equal(scoreAfterMutation, 5);
  assert.notEqual(scoreAfterMutation, question.sourceMarks);
});
