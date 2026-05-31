// backend/src/test_populate.js
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { OnlineTest } from './models/OnlineTest.js';
import { Paper } from './models/Paper.js';
import { Question } from './models/Question.js';

async function run() {
  await connectDatabase();
  console.log('Connected to MongoDB in backend context');

  const test = await OnlineTest.findOne({ testCode: /^E2E_TEST_/ }).sort({ _id: -1 });
  if (!test) {
    console.log('No E2E test found.');
    await disconnectDatabase();
    return;
  }

  console.log('Found Test:', test._id, 'paperId:', test.paperId);

  const populatedTest = await OnlineTest.findById(test._id).populate('paperId');
  console.log('Populated test.paperId:', populatedTest.paperId);

  if (populatedTest.paperId) {
    console.log('Paper questions count:', populatedTest.paperId.questions.length);
    console.log('Paper question details:', populatedTest.paperId.questions);
  } else {
    // Let's try directly finding the Paper
    const directPaper = await Paper.findById(test.paperId);
    console.log('Direct Paper.findById returned:', directPaper);
  }

  await disconnectDatabase();
}

run().catch(console.error);
