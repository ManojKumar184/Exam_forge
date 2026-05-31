import mongoose from 'mongoose';
import './src/models/index.js';
import { TestAttempt } from './src/models/TestAttempt.js';
import { Question } from './src/models/Question.js';

const MONGODB_URI = 'mongodb+srv://admin-examforge:admin123@exam-forge.rv32zqk.mongodb.net/examforge?retryWrites=true&w=majority&appName=exam-forge';

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const testId = '6a1ba724d2222a1c8ee19e33';
  const attempts = await TestAttempt.find({ testId }).populate('answers.questionId');
  if (attempts.length === 0) {
    console.log('No attempts found for this test');
    process.exit(0);
  }

  console.log(`Found ${attempts.length} attempts:`);
  for (const attempt of attempts) {
    console.log(`\n================ ATTEMPT: ${attempt._id} ================`);
    console.log('Attempt Status:', attempt.status);
    console.log('Attempt Score:', attempt.score);
    console.log('Answers count:', attempt.answers.length);

    for (let i = 0; i < attempt.answers.length; i++) {
      const ans = attempt.answers[i];
      const q = ans.questionId;
      console.log(`  - Q${i+1} [Type: ${q ? q.questionType : 'N/A'}] | selectedOption: ${ans.selectedOption} | numericalAnswer: ${ans.numericalAnswer} | textAnswer: ${ans.textAnswer}`);
    }
  }

  await mongoose.disconnect();
  console.log('Disconnected');
}

run().catch(console.error);
