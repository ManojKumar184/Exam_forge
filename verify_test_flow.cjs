// verify_test_flow.cjs
// E2E Puppeteer verification of test flow, autosave, rich content rendering, and paper preview.

const puppeteer = require('c:/Users/manoj555/Desktop/Exam_forge/node_modules/puppeteer');
const mongoose = require('c:/Users/manoj555/Desktop/Exam_forge/backend/node_modules/mongoose');
const bcrypt = require('c:/Users/manoj555/Desktop/Exam_forge/backend/node_modules/bcryptjs');

const MONGODB_URI = 'mongodb+srv://admin-examforge:admin123@exam-forge.rv32zqk.mongodb.net/examforge?retryWrites=true&w=majority&appName=exam-forge';

const studentEmail = 'student_e2e@examforge.com';
const studentPassword = 'Student@123';


// Define schemas with explicit ObjectId typing to ensure correct Mongoose casting
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  email: String,
  passwordHash: String,
  fullName: String,
  role: String,
  isActive: Boolean,
  approvalStatus: String
}, { timestamps: true }), 'users');

const Subject = mongoose.models.Subject || mongoose.model('Subject', new mongoose.Schema({
  name: String,
  code: String,
  color: String,
  icon: String
}), 'subjects');

const ExamType = mongoose.models.ExamType || mongoose.model('ExamType', new mongoose.Schema({
  name: String,
  code: String,
  description: String
}), 'examtypes');

const Question = mongoose.models.Question || mongoose.model('Question', new mongoose.Schema({
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  examTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamType' },
  questionText: String,
  questionType: String,
  options: [{ text: String, image: String }],
  correctOption: Number,
  numericalAnswer: Number,
  numericalTolerance: Number,
  answerText: String,
  difficulty: String,
  marks: Number,
  class: Number,
  explanation: String,
  status: String,
  tags: [String],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true }), 'questions');

const Paper = mongoose.models.Paper || mongoose.model('Paper', new mongoose.Schema({
  title: String,
  paperCode: String,
  examTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamType' },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  class: Number,
  totalMarks: Number,
  totalQuestions: Number,
  durationMinutes: Number,
  sections: [{ name: String, questionCount: Number, marksPerQuestion: Number }],
  questions: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
    section: String,
    questionOrder: Number,
    customMarks: Number
  }],
  status: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true }), 'paper');

const OnlineTest = mongoose.models.OnlineTest || mongoose.model('OnlineTest', new mongoose.Schema({
  paperId: { type: mongoose.Schema.Types.ObjectId, ref: 'Paper' },
  testCode: String,
  durationMinutes: Number,
  accessCode: String,
  status: String,
  allowReview: Boolean,
  showAnswers: Boolean,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true }), 'onlinetests');

const TestAttempt = mongoose.models.TestAttempt || mongoose.model('TestAttempt', new mongoose.Schema({}, { strict: false }), 'testattempts');
const Leaderboard = mongoose.models.Leaderboard || mongoose.model('Leaderboard', new mongoose.Schema({}, { strict: false }), 'leaderboards');

async function seedData() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB for seeding');

  // Ensure student account exists
  const studentHash = await bcrypt.hash(studentPassword, 12);
  
  await User.updateOne(
    { email: studentEmail },
    {
      $set: {
        passwordHash: studentHash,
        fullName: 'Manoj Kumar',
        role: 'student',
        isActive: true,
        approvalStatus: 'approved'
      }
    },
    { upsert: true }
  );
  console.log('Upserted student user in database');

  // Ensure admin is approved
  await User.updateOne(
    { email: 'admin@examforge.com' },
    {
      $set: {
        approvalStatus: 'approved',
        role: 'super_admin'
      }
    }
  );

  // Ensure subject and exam type
  let subject = await Subject.findOne({ code: 'PHY' });
  if (!subject) {
    subject = await Subject.create({ name: 'Physics', code: 'PHY', color: '#3B82F6', icon: 'atom' });
  }
  let examType = await ExamType.findOne({ code: 'JEE_MAIN' });
  if (!examType) {
    examType = await ExamType.create({ name: 'JEE Main', code: 'JEE_MAIN', description: 'Joint Entrance Examination Main' });
  }

  // Clear existing E2E testing data
  await Question.deleteMany({ tags: 'e2e-test' });
  await Paper.deleteMany({ paperCode: /^E2E_PAPER_/ });
  
  // Create 3 questions with rich content, math equations inside tables, lists, and options
  const q1Text = `
    <h3>Rich Content rendering verification</h3>
    <p>This is a list containing math:</p>
    <ul>
      <li>Inline math: $x^2 + y^2 = z^2$</li>
      <li>Display math block: $$\\Delta E = h\\nu$$</li>
    </ul>
    <p>Now verify equations inside tables:</p>
    <table border="1" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr>
          <th>Equation Cell</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>$\\int_a^b f(x) dx = F(b) - F(a)$</td>
          <td>Calculus Theorem</td>
        </tr>
      </tbody>
    </table>
    <p>Please select the correct formula below.</p>
  `;
  const q1 = await Question.create({
    subjectId: subject._id,
    examTypeId: examType._id,
    class: 11,
    questionType: 'mcq',
    questionText: q1Text,
    options: [
      { text: 'Correct formula: $e^{i\\pi} + 1 = 0$', image: null },
      { text: 'Incorrect formula: $e^{i\\pi} = 1$', image: null },
      { text: 'Incorrect formula: $e^{i\\pi} = 0$', image: null },
      { text: 'Incorrect formula: $e^{i\\pi} = 2$', image: null }
    ],
    correctOption: 0,
    difficulty: 'medium',
    marks: 4,
    explanation: 'Euler\'s identity is derived from Euler\'s formula $e^{ix} = \\cos x + i\\sin x$ where $x = \\pi$.',
    status: 'approved',
    tags: ['e2e-test']
  });

  const q2 = await Question.create({
    subjectId: subject._id,
    examTypeId: examType._id,
    class: 11,
    questionType: 'descriptive',
    questionText: '<p>Describe Newton\'s second law of motion.</p>',
    answerText: 'F = ma, which states that force equals mass times acceleration.',
    difficulty: 'hard',
    marks: 4,
    explanation: 'Newton\'s second law relates force, mass, and acceleration.',
    status: 'approved',
    tags: ['e2e-test']
  });

  const q3 = await Question.create({
    subjectId: subject._id,
    examTypeId: examType._id,
    class: 11,
    questionType: 'numerical',
    questionText: '<p>Calculate the sum: $12 + 15$</p>',
    numericalAnswer: 27,
    numericalTolerance: 0.1,
    difficulty: 'easy',
    marks: 4,
    explanation: 'Simple addition: 12 + 15 = 27.',
    status: 'approved',
    tags: ['e2e-test']
  });

  // Seed Paper
  const paperTimestamp = Date.now();
  const paperCode = `E2E_PAPER_${paperTimestamp}`;
  const paper = await Paper.create({
    title: 'E2E Validation Paper',
    paperCode: paperCode,
    examTypeId: examType._id,
    subjectId: subject._id,
    class: 11,
    totalMarks: 12,
    totalQuestions: 3,
    durationMinutes: 30,
    sections: [{ name: 'A', questionCount: 3, marksPerQuestion: 4 }],
    questions: [
      { questionId: q1._id, section: 'A', questionOrder: 1, customMarks: 4 },
      { questionId: q2._id, section: 'A', questionOrder: 2, customMarks: 4 },
      { questionId: q3._id, section: 'A', questionOrder: 3, customMarks: 4 }
    ],
    status: 'published',
    createdBy: q1.createdBy || null
  });

  // Find user to associate online test creation
  const creatorUser = await User.findOne({ email: 'admin@examforge.com' });
  const creatorId = creatorUser ? creatorUser._id : paper.createdBy;

  // Update paper createdBy to admin so admin can export PDF and manage it without 403
  await Paper.updateOne({ _id: paper._id }, { $set: { createdBy: creatorId } });

  // Create OnlineTest
  const testCode = `E2E_TEST_${paperTimestamp}`;
  const test = await OnlineTest.create({
    paperId: paper._id,
    testCode: testCode,
    durationMinutes: 30,
    accessCode: 'SECURE123',
    status: 'active',
    allowReview: true,
    showAnswers: true,
    createdBy: creatorId
  });

  // Remove any previous attempts for this test
  await TestAttempt.deleteMany({ testId: test._id });
  await Leaderboard.deleteMany({ testId: test._id });

  await mongoose.disconnect();
  console.log('Seeding complete. Test ID:', test._id.toString());
  return {
    testId: test._id.toString(),
    testCode,
    paperId: paper._id.toString()
  };
}

(async () => {
  let seededData;
  try {
    seededData = await seedData();
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Redirect console logs from browser
  page.on('console', msg => console.log('B_LOG:', msg.text()));
  page.on('pageerror', err => console.error('B_ERR:', err.toString()));

  const waitForText = async (selector, text, timeout = 30000) => {
    console.log(`⏳ Waiting for "${selector}" to contain text "${text}"`);
    await page.waitForFunction(
      (sel, txt) => {
        const els = Array.from(document.querySelectorAll(sel));
        return els.some(el => el.textContent.includes(txt));
      },
      { timeout },
      selector,
      text
    );
  };

  const clickButtonByText = async (text) => {
    console.log(`🖱️ Clicking button with text "${text}"`);
    await page.evaluate((txt) => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const btn = btns.find(b => b.textContent.trim().includes(txt));
      if (!btn) throw new Error(`Button/link with text "${txt}" not found`);
      btn.click();
    }, text);
  };

  try {
    // ----------------------------------------
    // Step 1: Login as Student
    // ----------------------------------------
    console.log('🟢 Navigating to Login Page');
    await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="email"]', { visible: true });
    await page.type('input[name="email"]', studentEmail);
    await page.type('input[name="password"]', studentPassword);
    await page.click('button[type="submit"]');

    await page.waitForFunction(() => window.location.pathname.includes('/dashboard'), { timeout: 30000 });
    console.log('✅ Logged in successfully as student');

    // ----------------------------------------
    // Step 2: Go to Tests List Page
    // ----------------------------------------
    console.log('🟢 Navigating to Available Tests page');
    await page.goto('http://localhost:5173/tests', { waitUntil: 'domcontentloaded' });
    await waitForText('h1', 'Available Tests');
    console.log('✅ Available Tests page loaded');

    // Look for our seeded test in the grid and click "Start Test"
    console.log(`⏳ Finding test card for test code ${seededData.testCode}`);
    await page.waitForFunction((code) => {
      return document.body.innerText.includes(code);
    }, { timeout: 15000 }, seededData.testCode);

    console.log('🖱️ Clicking Start Test button...');
    await page.evaluate((code) => {
      const cards = Array.from(document.querySelectorAll('.border'));
      const card = cards.find(c => c.textContent.includes(code));
      if (!card) throw new Error(`Test card not found for code: ${code}`);
      const btn = card.querySelector('button');
      if (!btn) throw new Error('Start Test button not found inside card');
      btn.click();
    }, seededData.testCode);

    // Wait for the access code prompt page/modal to load
    await page.waitForFunction(() => window.location.pathname.includes('/test/'), { timeout: 15000 });
    await page.waitForSelector('input[type="password"]', { visible: true });
    console.log('✅ Access Code prompt page loaded successfully');

    // ----------------------------------------
    // Step 3: Access Code Verification (Correct, Wrong, No code)
    // ----------------------------------------
    // 1. Try with no code (clicking Submit without typing anything)
    console.log('🟢 Testing No/Empty Access Code validation');
    await clickButtonByText('Submit');
    await new Promise(r => setTimeout(r, 1000));
    // Verify that we are still on the access code page
    let currentPath = await page.evaluate(() => window.location.pathname);
    if (!currentPath.includes('/test/') || currentPath.includes('/review')) {
      throw new Error('❌ FAILURE: Empty access code was accepted!');
    }
    console.log('✅ SUCCESS: Empty access code blocked by html required attribute or validation');

    // 2. Try with wrong code
    console.log('🟢 Testing Wrong Access Code');
    await page.type('input[type="password"]', 'WRONGCODE');
    await clickButtonByText('Submit');
    console.log('⏳ Waiting for error message...');
    await page.waitForSelector('p.text-red-500, .text-xs.text-red-500, .bg-red-50', { visible: true, timeout: 10000 });
    const errorText = await page.evaluate(() => {
      const errEl = document.querySelector('p.text-red-500, .text-xs.text-red-500, .bg-red-50');
      return errEl ? errEl.textContent.trim() : null;
    });
    console.log('Detected error message on wrong code:', errorText);
    if (!errorText || !errorText.toLowerCase().includes('invalid')) {
      throw new Error('❌ FAILURE: Wrong access code did not display invalid code error!');
    }
    console.log('✅ SUCCESS: Wrong access code displays expected error message');

    // Clear password input properly via keyboard actions to update React state
    console.log('🧹 Clearing access code input');
    await page.click('input[type="password"]');
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');

    // 3. Submit with correct access code
    console.log('🟢 Testing Correct Access Code');
    await page.type('input[type="password"]', 'SECURE123');
    await clickButtonByText('Submit');
    
    // Wait for test to load (clock/timer and question palette)
    await page.waitForSelector('span.text-lg.font-mono', { timeout: 15000 });
    console.log('✅ SUCCESS: Correct access code unlocked the test successfully');

    // ----------------------------------------
    // Step 4: Rich Content Rendering Validation
    // ----------------------------------------
    console.log('🟢 Validating Rich Content (LaTeX inside table, lists, option text)');
    
    // Debug: Print HTML of all .rich-content elements
    const richContentsDebug = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('.rich-content'));
      return els.map((el, i) => `[RichContent #${i}]: ${el.innerHTML}`);
    });
    console.log('Rich contents HTML debug:', richContentsDebug);

    // Check if the math elements are being rendered (e.g. KaTeX class names .katex or MathJax containers)
    await page.waitForSelector('.katex, mjx-container, .MathJax, script[type*="math"]', { timeout: 15000 });
    console.log('✅ Math symbols rendering detected on screen!');

    // Bounded sleep to ensure MathJax finishes typesetting all elements (like options) on page
    console.log('⏳ Sleeping 3 seconds for MathJax typesetting completion...');
    await new Promise(r => setTimeout(r, 3000));

    // Check table rendering
    const hasTable = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      return tables.length > 0;
    });
    if (!hasTable) {
      throw new Error('❌ FAILURE: HTML Table failed to render inside question!');
    }
    console.log('✅ HTML Table rendering verified');

    // Check list rendering
    const hasList = await page.evaluate(() => {
      const listItems = document.querySelectorAll('ul li');
      return listItems.length >= 2;
    });
    if (!hasList) {
      throw new Error('❌ FAILURE: HTML Lists failed to render inside question!');
    }
    console.log('✅ HTML List rendering verified');

    // Check equation inside option text
    const optionDebugInfo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.map(b => ({
        text: b.textContent,
        html: b.innerHTML,
        hasMathElement: !!b.querySelector('.katex, mjx-container, .MathJax, script[type*="math"]')
      }));
    });
    console.log('Option buttons debug info:', JSON.stringify(optionDebugInfo, null, 2));

    const hasOptionMath = optionDebugInfo.some(info => info.hasMathElement);
    if (!hasOptionMath) {
      throw new Error('❌ FAILURE: Math/Equations inside options text failed to render!');
    }
    console.log('✅ Equations inside Option Text verified successfully');

    // ----------------------------------------
    // Step 5: Autosave Stress Verification
    // ----------------------------------------
    // Test flow:
    // - Answer question (click MCQ Option A, which corresponds to index 0)
    // - Immediately switch questions (click Next)
    // - Answer descriptive question in Q2
    // - Immediately submit
    // - Verify answers are saved and never marked as skipped.
    console.log('🟢 Initiating Autosave Stress Test');

    console.log('🖱️ Clicking MCQ Option A');
    await page.evaluate(() => {
      const optionButtons = Array.from(document.querySelectorAll('button[type="button"]')).filter(b => b.textContent.includes('Correct formula'));
      if (optionButtons.length === 0) throw new Error('MCQ Option A button not found');
      optionButtons[0].click();
    });

    console.log('🖱️ SWITCHING QUESTIONS IMMEDIATELY (clicking Next)...');
    await clickButtonByText('Next');
    await new Promise(r => setTimeout(r, 100)); // micro delay to test extreme race condition

    // Now on Q2 (Descriptive)
    console.log('✍️ Answering Descriptive Question immediately');
    await page.waitForSelector('textarea', { visible: true });
    await page.focus('textarea');
    await page.keyboard.type('Newton\'s second law is force equals mass times acceleration (F = ma).');

    // Go to Q3 (Numerical)
    console.log('🖱️ Switching to Question 3 (Numerical)...');
    await clickButtonByText('Next');
    await new Promise(r => setTimeout(r, 100)); // micro delay

    console.log('✍️ Verifying Real-time validation on Numerical question');
    await page.waitForSelector('input[type="text"]', { visible: true });
    await page.focus('input[type="text"]');
    
    // Type invalid characters
    await page.keyboard.type('abc');
    await new Promise(r => setTimeout(r, 200));
    const hasNumError = await page.evaluate(() => {
      return document.body.innerText.includes('Please enter a valid number.');
    });
    if (!hasNumError) {
      throw new Error('❌ FAILURE: Real-time validation did not display "Please enter a valid number." on invalid input!');
    }
    console.log('✅ SUCCESS: Real-time validation correctly flagged invalid format');

    // Clear input and type valid format
    console.log('🧹 Clearing invalid input and typing "27"');
    await page.click('input[type="text"]');
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('27');
    await new Promise(r => setTimeout(r, 200));

    const isNumFormatValid = await page.evaluate(() => {
      return document.body.innerText.includes('Format is valid');
    });
    if (!isNumFormatValid) {
      throw new Error('❌ FAILURE: Real-time validation failed to display green valid format text for "27"!');
    }
    console.log('✅ SUCCESS: Real-time validation displays green valid format helper');

    console.log('🖱️ SUBMITTING TEST IMMEDIATELY...');
    await clickButtonByText('Submit Test');
    // Click submit in confirmation modal
    console.log('🖱️ Clicking Submit Test in confirmation modal');
    await page.waitForSelector('.fixed.inset-0.z-50 button', { visible: true, timeout: 10000 });
    await page.evaluate(() => {
      const modal = document.querySelector('.fixed.inset-0.z-50');
      if (!modal) throw new Error('Confirmation modal not found');
      const submitBtn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent.includes('Submit'));
      if (!submitBtn) throw new Error('Confirm submit button not found');
      submitBtn.setAttribute('data-testid', 'confirm-submit-btn');
    });
    await page.click('button[data-testid="confirm-submit-btn"]');

    // Wait for submission response (should show result modal)
    console.log('⏳ Waiting for Result Modal (Trophy icon)...');
    await page.waitForSelector('.text-amber-500', { visible: true, timeout: 30000 });
    console.log('✅ Result Modal displayed successfully!');

    // ----------------------------------------
    // Step 6: Verify answers were NOT marked as skipped
    // ----------------------------------------
    // Q1 was correct, so it should have given us 4 marks.
    // Let's check the score on the modal.
    const resultStats = await page.evaluate(() => {
      const modal = document.querySelector('.fixed.inset-0.z-50');
      if (!modal) return { score: null, correct: null };
      const cards = Array.from(modal.querySelectorAll('.bg-white, .rounded-lg, .border'));
      // Find cards containing text like "Score", "Percentage", "Correct"
      const scoreCard = cards.find(c => c.textContent.includes('Score'));
      const correctCard = cards.find(c => c.textContent.includes('Correct'));
      
      return {
        score: scoreCard ? scoreCard.querySelector('p').textContent.trim() : null,
        correct: correctCard ? correctCard.querySelector('p').textContent.trim() : null
      };
    });
    console.log('Submission Stats on Screen:', resultStats);
    
    if (resultStats.score === '0' || resultStats.correct === '0') {
      throw new Error('❌ FAILURE: MCQ answer was skipped! Score was 0 or correct count was 0.');
    }
    console.log('✅ SUCCESS: Score and correct count confirmed (Answers not marked as skipped!)');

    // ----------------------------------------
    // Step 7: Review Test Verification
    // ----------------------------------------
    console.log('🟢 Going to Review page');
    await clickButtonByText('Review Answers');
    await page.waitForFunction(() => window.location.pathname.includes('/review'), { timeout: 15000 });
    console.log('✅ Review page loaded successfully');

    // Verify correct answers and explanations are rendered
    await page.waitForSelector('.bg-indigo-50, .text-indigo-900', { visible: true });
    const explanationText = await page.evaluate(() => {
      const explDiv = document.querySelector('.bg-indigo-50, .text-indigo-950');
      return explDiv ? explDiv.textContent : '';
    });
    console.log('Explanation text found:', explanationText);
    if (!explanationText.includes('Euler\'s identity')) {
      throw new Error('❌ FAILURE: Review page does not render explanation correctly!');
    }
    console.log('✅ SUCCESS: Review page correctly displays explanation');

    // Check model answer in Q2 review
    console.log('🖱️ Navigating to Question 2 review');
    await clickButtonByText('Next');
    await new Promise(r => setTimeout(r, 1000));
    const modelAnswerText = await page.evaluate(() => {
      const divs = Array.from(document.querySelectorAll('.bg-slate-50, .bg-slate-800'));
      const modelDiv = divs.find(d => d.textContent.includes('Model Answer / Reference Key'));
      return modelDiv ? modelDiv.textContent : '';
    });
    console.log('Model answer text found:', modelAnswerText);
    if (!modelAnswerText.includes('F = ma')) {
      throw new Error('❌ FAILURE: Review page does not show Model Answer / Reference Key for descriptive question!');
    }
    console.log('✅ SUCCESS: Descriptive Model Answer / Reference Key verified successfully');

    // Check numerical answer in Q3 review
    console.log('🖱️ Navigating to Question 3 review');
    await clickButtonByText('Next');
    await new Promise(r => setTimeout(r, 1000));
    const q3ReviewText = await page.evaluate(() => {
      return document.body.innerText;
    });
    console.log('Q3 Review Text:', q3ReviewText);
    if (!q3ReviewText.includes('[Numerical Question]') && !q3ReviewText.includes('Numerical')) {
      throw new Error('❌ FAILURE: Review page does not render Numerical Question type badge!');
    }
    if (!q3ReviewText.includes('Your answer: 27')) {
      throw new Error('❌ FAILURE: Review page does not display Your answer: 27 correctly!');
    }
    console.log('✅ SUCCESS: Numerical review verified successfully');

    // ----------------------------------------
    // Step 8: Leaderboard Verification
    // ----------------------------------------
    console.log('🟢 Checking Leaderboard page');
    await page.evaluate(() => {
      // Find the link to leaderboard or navigate directly
      window.location.href = '/leaderboard';
    });
    await page.waitForFunction(() => window.location.pathname === '/leaderboard', { timeout: 15000 });
    await page.waitForSelector('select', { visible: true });
    console.log('✅ Leaderboard page loaded');

    // Check if student email and rank are displayed
    await page.waitForFunction((email) => {
      return document.body.innerText.includes(email);
    }, { timeout: 15000 }, studentEmail);
    console.log('✅ SUCCESS: Leaderboard correctly displays student email and rankings');

    // ----------------------------------------
    // Step 9: Paper Generator Verification
    // ----------------------------------------
    console.log('🟢 Logging out and logging in as Admin to verify Paper Generator Cards');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await page.type('input[name="email"]', 'admin@examforge.com');
    await page.type('input[name="password"]', 'Admin@123');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname.includes('/dashboard'), { timeout: 30000 });
    console.log('✅ Admin logged in successfully');

    // Navigate to papers list
    console.log('🟢 Navigating to papers list');
    await page.goto('http://localhost:5173/papers', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { visible: true });
    
    // Check if seeded paper is displayed
    await page.waitForFunction(() => {
      return document.body.innerText.includes('E2E Validation Paper');
    }, { timeout: 15000 });
    console.log('✅ Seeded paper found in list');

    // Navigate to paper builder/editor page to verify question card previews
    const paperEditUrl = `http://localhost:5173/papers/${seededData.paperId}/edit`;
    console.log(`🟢 Navigating to Paper Generator Page: ${paperEditUrl}`);
    await page.goto(paperEditUrl, { waitUntil: 'domcontentloaded' });
    
    // Wait for the question cards to render
    await page.waitForSelector('.rich-content', { timeout: 15000 });
    console.log('⏳ Sleeping 2 seconds for full card rendering...');
    await new Promise(r => setTimeout(r, 2000));
    console.log('✅ Paper builder cards rendered');

    // Verify details on cards: correct answer and explanation
    const cardContent = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      return {
        hasCorrect: bodyText.includes('Correct Answer') || bodyText.includes('correct_option') || bodyText.includes('Option A') || bodyText.includes('Formula'),
        hasExplanation: bodyText.includes('Explanation') || bodyText.includes('Euler')
      };
    });
    console.log('Paper Card Preview info:', cardContent);
    if (!cardContent.hasCorrect || !cardContent.hasExplanation) {
      throw new Error('❌ FAILURE: Paper generator preview cards are missing correct answers or explanations!');
    }
    console.log('✅ SUCCESS: Paper generator question preview cards verified successfully');

    // ----------------------------------------
    // Step 10: PDF Export Regression Verification
    // ----------------------------------------
    console.log('🟢 Testing PDF Export API directly to verify authorization and file output');
    const token = await page.evaluate(() => localStorage.getItem('examforge_access_token'));
    
    const fetch = require('c:/Users/manoj555/Desktop/Exam_forge/backend/node_modules/node-fetch'); // or run it inside browser
    const pdfResponse = await page.evaluate(async (paperId) => {
      const res = await window.fetch(`http://localhost:5000/api/papers/${paperId}/export/pdf?allow_draft=true`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('examforge_access_token')}`
        }
      });
      return {
        status: res.status,
        contentType: res.headers.get('Content-Type')
      };
    }, seededData.paperId);

    console.log('PDF Export Response:', pdfResponse);
    if (pdfResponse.status !== 200 || !pdfResponse.contentType.includes('application/pdf')) {
      throw new Error('❌ FAILURE: PDF export failed or returned non-PDF format!');
    }
    console.log('✅ SUCCESS: PDF Export functionality verified successfully (no regression)');

  } catch (err) {
    console.error('❌ E2E FLOW RUN FAILED:', err);
    await page.screenshot({ path: 'c:/Users/manoj555/Desktop/Exam_forge/screenshot_error.png' });
    console.log('📸 Error screenshot saved to: c:/Users/manoj555/Desktop/Exam_forge/screenshot_error.png');
    await browser.close();
    // await cleanupSeededData(seededData);
    process.exit(1);
  }

  await browser.close();
  // await cleanupSeededData(seededData);
  console.log('🎉🎉🎉 ALL E2E BROWSER-LEVEL VERIFICATIONS COMPLETED SUCCESSFULLY!');
  process.exit(0);
})();

async function cleanupSeededData(seededData) {
  if (!seededData) return;
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB for cleanup');
    const Question = mongoose.models.Question || mongoose.model('Question', new mongoose.Schema({}, { strict: false }), 'questions');
    const Paper = mongoose.models.Paper || mongoose.model('Paper', new mongoose.Schema({}, { strict: false }), 'paper');
    const OnlineTest = mongoose.models.OnlineTest || mongoose.model('OnlineTest', new mongoose.Schema({}, { strict: false }), 'onlinetests');
    const TestAttempt = mongoose.models.TestAttempt || mongoose.model('TestAttempt', new mongoose.Schema({}, { strict: false }), 'testattempts');
    const Leaderboard = mongoose.models.Leaderboard || mongoose.model('Leaderboard', new mongoose.Schema({}, { strict: false }), 'leaderboards');

    await OnlineTest.deleteOne({ _id: seededData.testId });
    await Paper.deleteOne({ _id: seededData.paperId });
    await Question.deleteMany({ tags: 'e2e-test' });
    await TestAttempt.deleteMany({ testId: seededData.testId });
    await Leaderboard.deleteMany({ testId: seededData.testId });
    
    await mongoose.disconnect();
    console.log('Cleanup complete');
  } catch (err) {
    console.error('Cleanup failed:', err);
  }
}
