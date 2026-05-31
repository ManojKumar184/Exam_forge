// test_start_api.cjs
const axios = require('c:/Users/manoj555/Desktop/Exam_forge/node_modules/axios');
const mongoose = require('c:/Users/manoj555/Desktop/Exam_forge/backend/node_modules/mongoose');

const MONGODB_URI = 'mongodb+srv://admin-examforge:admin123@exam-forge.rv32zqk.mongodb.net/examforge?retryWrites=true&w=majority&appName=exam-forge';

async function run() {
  await mongoose.connect(MONGODB_URI);
  const OnlineTest = mongoose.model('OnlineTest', new mongoose.Schema({}, { strict: false }), 'onlinetests');
  const test = await OnlineTest.findOne({ testCode: /^E2E_TEST_/ }).sort({ _id: -1 });
  if (!test) {
    console.log('No seeded test found.');
    await mongoose.disconnect();
    return;
  }
  const testId = test._id.toString();
  await mongoose.disconnect();

  console.log('Using Test ID:', testId, 'with paper ID:', test.paperId);

  console.log('Logging in as student...');
  const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
    email: 'student_e2e@examforge.com',
    password: 'Student@123'
  });
  const token = loginRes.data.data.accessToken;

  console.log('Calling start test API...');
  const startRes = await axios.post(`http://localhost:5000/api/tests/${testId}/start`, 
    { accessCode: 'SECURE123' },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  console.log('Start test response data structure:');
  console.log('test object:', JSON.stringify(startRes.data.data.test, null, 2));
}

run().catch(console.error);
