// inspect_db.cjs
const mongoose = require('c:/Users/manoj555/Desktop/Exam_forge/backend/node_modules/mongoose');

const MONGODB_URI = 'mongodb+srv://admin-examforge:admin123@exam-forge.rv32zqk.mongodb.net/examforge?retryWrites=true&w=majority&appName=exam-forge';

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB');

  const Paper = mongoose.model('Paper', new mongoose.Schema({}, { strict: false }), 'papers');
  const OnlineTest = mongoose.model('OnlineTest', new mongoose.Schema({}, { strict: false }), 'onlinetests');
  const Question = mongoose.model('Question', new mongoose.Schema({}, { strict: false }), 'questions');

  const tests = await OnlineTest.find({ testCode: /^E2E_TEST_/ });
  console.log('Online Tests found:', JSON.stringify(tests, null, 2));

  for (const test of tests) {
    const paper = await Paper.findById(test.paperId);
    console.log(`Paper ${test.paperId} for Test ${test.testCode}:`, JSON.stringify(paper, null, 2));
    if (paper && paper.questions) {
      for (const pq of paper.questions) {
        const q = await Question.findById(pq.questionId);
        console.log(`  Question ${pq.questionId}:`, q ? q.questionText : 'NOT FOUND');
      }
    }
  }

  await mongoose.disconnect();
}

run().catch(console.error);
