// verify_roles_e2e.js
// Automated role-separation verification using Puppeteer.
// Run with: node verify_roles_e2e.js (requires dev server at http://localhost:5173)

const puppeteer = require('c:/Users/manoj555/Desktop/Exam_forge/node_modules/puppeteer');
const mongoose = require('c:/Users/manoj555/Desktop/Exam_forge/backend/node_modules/mongoose');
const path = require('path');
require('c:/Users/manoj555/Desktop/Exam_forge/backend/node_modules/dotenv').config({ path: path.join(__dirname, '.env') });
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin-examforge:admin123@exam-forge.rv32zqk.mongodb.net/test';

(async () => {
  console.log('🟢 Connecting to MongoDB to retrieve target question ID...');
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  // Find a question not owned by the faculty (faculty user won't exist yet, so any existing question is fine)
  let dummyQuestion = await db.collection('questions').findOne({});
  if (!dummyQuestion) {
    console.log('No questions found in database. Creating a dummy question owned by admin...');
    const adminUser = await db.collection('users').findOne({ role: 'super_admin' });
    const adminId = adminUser ? adminUser._id : new mongoose.Types.ObjectId();
    const insertResult = await db.collection('questions').insertOne({
      questionText: 'What is the speed of light in vacuum?',
      questionType: 'mcq',
      options: [{ text: '299,792,458 m/s' }, { text: '300,000 m/s' }],
      correctOption: 0,
      ownerId: adminId,
      createdBy: adminId,
      status: 'approved',
      isPrivate: false,
      visibility: 'public',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    dummyQuestion = { _id: insertResult.insertedId };
  }
  const targetQuestionId = dummyQuestion._id.toString();
  console.log(`Using target question ID for API security checks: ${targetQuestionId}`);
  await mongoose.disconnect();

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // page console logs
  page.on('console', msg => console.log('B_LOG:', msg.text()));
  page.on('pageerror', err => console.error('B_ERR:', err.toString()));

  // Network request logging
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      console.log(`📤 [${req.method()}] ${req.url()}`);
    }
  });
  page.on('response', res => {
    if (res.url().includes('/api/')) {
      console.log(`📥 [${res.status()}] ${res.url()}`);
    }
  });

  // ---------- Helpers ----------
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

  const rand = Math.floor(Math.random() * 100000);
  const email = `faculty_e2e_${rand}@examforge.com`;
  const name = `E2E Faculty ${rand}`;
  const password = `Faculty@123`;

  // ---------- 1. Register Faculty ----------
  console.log('🟢 Opening register page');
  await page.goto('http://localhost:5173/register', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="John Doe"]');
  await page.type('input[placeholder="John Doe"]', name);
  await page.type('input[placeholder="you@example.com"]', email);
  await page.type('input[placeholder="Create a password"]', password);
  await page.type('input[placeholder="Confirm your password"]', password);
  
  // Select role faculty (the only select element on the page)
  await page.select('select', 'faculty');

  // Accept terms and conditions checkbox
  await page.click('input[type="checkbox"]');

  // Submit the registration
  await page.click('button[type="submit"]');

  console.log('⏳ Waiting for registration redirection to login page');
  await new Promise(r => setTimeout(r, 4000));
  
  // ---------- 2. Login as Admin & Approve ----------
  console.log('🟢 Logging in as admin to approve the faculty account');
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="you@example.com"]');
  await page.type('input[placeholder="you@example.com"]', 'admin@examforge.com');
  await page.type('input[type="password"]', 'Admin@123');
  await page.click('button[type="submit"]');

  await page.waitForFunction(() => window.location.pathname.includes('/dashboard'), { timeout: 30000 });
  console.log('✅ Admin logged in. Going to /users page.');
  
  await page.goto('http://localhost:5173/users', { waitUntil: 'domcontentloaded' });
  await waitForText('div', name, 15000);
  
  console.log('⏳ Finding and approving the registered faculty...');
  // Click "Approve" button next to our faculty name
  await page.evaluate((facultyName) => {
    const rows = Array.from(document.querySelectorAll('div'));
    const targetRow = rows.find(r => r.textContent.includes(facultyName) && r.textContent.includes('PENDING'));
    if (!targetRow) throw new Error(`Could not find row with faculty name: ${facultyName}`);
    const approveBtn = Array.from(targetRow.querySelectorAll('button')).find(b => b.textContent.trim().includes('Approve'));
    if (!approveBtn) throw new Error('Approve button not found in row');
    approveBtn.click();
  }, name);
  
  await new Promise(r => setTimeout(r, 3000));
  console.log('✅ Approved faculty user!');

  // Log out by clearing localStorage
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  
  // ---------- 3. Log in as Faculty ----------
  console.log('🟢 Logging in as the new approved faculty user');
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="you@example.com"]');
  await page.type('input[placeholder="you@example.com"]', email);
  await page.type('input[type="password"]', password);
  await page.click('button[type="submit"]');

  await page.waitForFunction(() => window.location.pathname.includes('/dashboard'), { timeout: 30000 });
  console.log('✅ Faculty logged in successfully!');

  // ---------- 4. Verify Route and UI Restrictions ----------
  // Verify sidebar doesn't have "Question Bank"
  const linksText = await page.evaluate(() => {
    const navLinks = Array.from(document.querySelectorAll('nav a'));
    return navLinks.map(l => l.textContent.trim());
  });
  console.log('Navbar links found:', linksText);
  if (linksText.includes('Question Bank')) {
    throw new Error('❌ FAILURE: Question Bank link is visible to faculty!');
  } else {
    console.log('✅ SUCCESS: Question Bank link is hidden from faculty.');
  }

  // Try to access /questions directly
  console.log('🟢 Accessing /questions directly...');
  await page.goto('http://localhost:5173/questions', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 3000));
  const currentPath = await page.evaluate(() => window.location.pathname);
  console.log('Path after directly accessing /questions:', currentPath);
  if (currentPath === '/questions') {
    const html = await page.content();
    console.log('Page HTML on failure:', html);
    throw new Error('❌ FAILURE: Faculty was able to load /questions page directly!');
  } else {
    console.log('✅ SUCCESS: Faculty was blocked/redirected from /questions page.');
  }

  // Try to access /questions/some-id/edit directly
  console.log('🟢 Accessing /questions/some-id/edit directly...');
  await page.goto('http://localhost:5173/questions/6a12f30887a25be5e7970a8f/edit', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 5000));
  const currentEditPath = await page.evaluate(() => window.location.pathname);
  console.log('Path after directly accessing edit page:', currentEditPath);
  if (currentEditPath.includes('/edit')) {
    const html = await page.content();
    console.log('Page HTML on failure:', html);
    throw new Error('❌ FAILURE: Faculty was able to load edit page directly!');
  } else {
    console.log('✅ SUCCESS: Faculty was blocked/redirected from edit page.');
  }

  // ---------- 5. Create Question Flow ----------
  console.log('🟢 Testing Create Question flow...');
  await page.goto('http://localhost:5173/questions/new', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('div[contenteditable="true"]', { timeout: 15000 });
  
  // Fill in question editor form fields
  await page.type('div[contenteditable="true"]', 'What is the speed of light in vacuum?');
  
  // Wait for Exam Pattern options to load
  console.log('⏳ Waiting for Exam Pattern options to load...');
  await page.waitForFunction(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    return selects[0] && selects[0].options.length > 1;
  }, { timeout: 15000 });

  // Select subject, class, and exam type sequentially with delays to allow React state updates
  console.log('Selecting Exam Pattern...');
  await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    if (selects[0]) {
      selects[0].selectedIndex = 1;
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  
  console.log('⏳ Waiting for Class options to load...');
  await page.waitForFunction(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    return selects[1] && selects[1].options.length > 1;
  }, { timeout: 15000 });

  console.log('Selecting Class...');
  await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    if (selects[1]) {
      selects[1].selectedIndex = 1;
      selects[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  console.log('⏳ Waiting for Subject options to load...');
  await page.waitForFunction(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    return selects[2] && selects[2].options.length > 1;
  }, { timeout: 15000 });

  console.log('Selecting Subject...');
  await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    if (selects[2]) {
      selects[2].selectedIndex = 1;
      selects[2].dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1000));
  
  // Add correct option and options
  await page.type('[placeholder="Option A text"]', '299,792,458 m/s');
  await page.type('[placeholder="Option B text"]', '300,000 m/s');
  
  // Submit the form
  const submitBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => b.textContent.includes('Create question'));
  });
  if (submitBtn) {
    await submitBtn.click();
    console.log('🖱️ Clicked Create question button');
  } else {
    throw new Error('Create question submit button not found');
  }

  // Verify redirects to dashboard
  await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 15000 });
  console.log('✅ SUCCESS: Question created successfully and redirected to dashboard!');

  // ---------- 6. Test API Security ----------
  console.log('🟢 Checking backend API permissions for faculty...');
  const patchStatus = await page.evaluate(async (qId) => {
    const response = await fetch(`http://localhost:5000/api/questions/${qId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('examforge_access_token')}`
      },
      body: JSON.stringify({ question_text: 'Hacked question' })
    });
    return response.status;
  }, targetQuestionId);
  console.log('PATCH response status:', patchStatus);
  if (patchStatus === 403 || patchStatus === 401) {
    console.log('✅ SUCCESS: PATCH request rejected with status', patchStatus);
  } else {
    throw new Error(`❌ FAILURE: PATCH request succeeded or returned unexpected status: ${patchStatus}`);
  }

  const deleteStatus = await page.evaluate(async (qId) => {
    const response = await fetch(`http://localhost:5000/api/questions/${qId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('examforge_access_token')}`
      }
    });
    return response.status;
  }, targetQuestionId);
  console.log('DELETE response status:', deleteStatus);
  if (deleteStatus === 403 || deleteStatus === 401) {
    console.log('✅ SUCCESS: DELETE request rejected with status', deleteStatus);
  } else {
    throw new Error(`❌ FAILURE: DELETE request succeeded or returned unexpected status: ${deleteStatus}`);
  }

  // ---------- 7. Clean up ----------
  console.log('🧹 Cleaning up database...');
  await mongoose.connect(MONGODB_URI);
  const result = await mongoose.connection.db.collection('users').deleteOne({ email });
  console.log(`Deleted user count: ${result.deletedCount}`);
  await mongoose.disconnect();

  await browser.close();
  console.log('🎉 ALL END-TO-END TESTS PASSED SUCCESSFULLY! Separated roles validated.');
})();
