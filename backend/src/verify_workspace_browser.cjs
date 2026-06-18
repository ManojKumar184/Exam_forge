// verify_workspace_browser.cjs
// End-to-end Workspace lifecycle test using Puppeteer.
// Run with: node verify_workspace_browser.cjs (requires dev server at http://localhost:5173 and api at http://localhost:5000)

const puppeteer = require('c:/Users/manoj555/Desktop/Exam_forge/node_modules/puppeteer');
const mongoose = require('c:/Users/manoj555/Desktop/Exam_forge/backend/node_modules/mongoose');
const path = require('path');
require('c:/Users/manoj555/Desktop/Exam_forge/backend/node_modules/dotenv').config({ path: path.join(__dirname, '..', '.env') });
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin-examforge:admin123@exam-forge.rv32zqk.mongodb.net/test';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(90000);
  
  page.on('console', msg => console.log('B_LOG:', msg.text()));
  page.on('pageerror', err => console.error('B_ERR:', err.toString()));

  const waitForText = async (selector, text, timeout = 35000) => {
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
  const email = `faculty_ws_e2e_${rand}@examforge.com`;
  const name = `WS Faculty ${rand}`;
  const password = `Faculty@123`;
  const questionText = `Verify private draft question in workspace Rand ${rand}`;
  const bankName = `Faculty Physics Bank ${rand}`;

  // ---------- 1. Register Faculty ----------
  console.log('🟢 Opening register page...');
  await page.goto('http://localhost:5173/register', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="John Doe"]');
  await page.type('input[placeholder="John Doe"]', name);
  await page.type('input[placeholder="you@example.com"]', email);
  await page.type('input[placeholder="Create a password"]', password);
  await page.type('input[placeholder="Confirm your password"]', password);
  await page.select('select', 'faculty');
  await page.click('input[type="checkbox"]');
  await page.click('button[type="submit"]');

  console.log('⏳ Waiting for registration to complete...');
  await new Promise(r => setTimeout(r, 4000));

  // ---------- 2. Login as Admin & Approve ----------
  console.log('🟢 Logging in as admin to approve the faculty account...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="you@example.com"]');
  await page.type('input[placeholder="you@example.com"]', 'admin@examforge.com');
  await page.type('input[type="password"]', 'Admin@123');
  await page.click('button[type="submit"]');

  await page.waitForFunction(() => window.location.pathname.includes('/dashboard'), { timeout: 30000 });
  console.log('✅ Admin logged in. Approving faculty...');
  
  await page.goto('http://localhost:5173/users', { waitUntil: 'domcontentloaded' });
  await waitForText('div', name, 15000);
  
  await page.evaluate((facName) => {
    const divs = Array.from(document.querySelectorAll('div'));
    const targetRow = divs.find(d => d.textContent.includes(facName) && d.textContent.includes('PENDING'));
    if (!targetRow) throw new Error(`Row for ${facName} not found`);
    const approveBtn = Array.from(targetRow.querySelectorAll('button')).find(b => b.textContent.trim().includes('Approve'));
    if (!approveBtn) throw new Error('Approve button not found');
    approveBtn.click();
  }, name);

  await new Promise(r => setTimeout(r, 3000));
  console.log('✅ Approved faculty user!');

  // Log out Admin
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // ---------- 3. Log in as Faculty ----------
  console.log('🟢 Logging in as approved Faculty...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="you@example.com"]');
  await page.type('input[placeholder="you@example.com"]', email);
  await page.type('input[type="password"]', password);
  await page.click('button[type="submit"]');

  await page.waitForFunction(() => window.location.pathname.includes('/dashboard'), { timeout: 30000 });
  console.log('✅ Faculty logged in!');

  // ---------- 4. Create a Faculty Question Bank ----------
  console.log('🟢 Navigating to Question Banks page to create a bank...');
  await page.goto('http://localhost:5173/question-banks', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Create Question Bank'));
    return btn !== undefined;
  }, { timeout: 20000 });
  
  // Click Create Question Bank button
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Create Question Bank'));
    if (btn) btn.click();
  });

  await page.waitForSelector('input[placeholder="e.g. Narayana Question Bank"]');
  await page.type('input[placeholder="e.g. Narayana Question Bank"]', bankName);
  await page.type('textarea[placeholder="Provide details about the scope of this bank..."]', 'Faculty private bank description');
  
  // Select type faculty
  await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select'));
    const typeSelect = selects[0]; // first select should be Type
    typeSelect.value = 'faculty';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Click submit in Create Modal
  await page.evaluate(() => {
    const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Create');
    if (createBtn) createBtn.click();
    else throw new Error('Create button not found');
  });

  await new Promise(r => setTimeout(r, 3000));
  console.log(`✅ Faculty Bank "${bankName}" created.`);

  // ---------- 5. Create a Private Draft Question ----------
  console.log('🟢 Creating private draft question...');
  await page.goto('http://localhost:5173/questions/new', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('div[contenteditable="true"]', { timeout: 20000 });
  
  await page.type('div[contenteditable="true"]', questionText);
  
  // Select catalog info
  await page.evaluate(() => {
    const subjectSelect = document.getElementById('subject');
    if (subjectSelect) {
      const opt = Array.from(subjectSelect.options).find(o => o.value !== '');
      if (opt) {
        subjectSelect.value = opt.value;
        subjectSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    const classSelect = document.getElementById('class');
    if (classSelect) {
      classSelect.value = "11";
      classSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const examSelect = document.getElementById('exam');
    if (examSelect) {
      const opt = Array.from(examSelect.options).find(o => o.value !== '');
      if (opt) {
        examSelect.value = opt.value;
        examSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });

  await page.type('textarea[placeholder="Option A text"]', '299,792,458 m/s');
  await page.type('textarea[placeholder="Option B text"]', '300,000 m/s');

  // Click Submit
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Create question'));
    if (btn) btn.click();
  });

  await new Promise(r => setTimeout(r, 4000));
  console.log('✅ Question created successfully.');

  // ---------- 6. Verify in Workspace ----------
  console.log('🟢 Checking workspace for the draft question...');
  await page.goto('http://localhost:5173/workspace', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="checkbox"]');
  await waitForText('span', 'Private Draft', 15000);
  await waitForText('div', questionText, 15000);
  console.log('✅ Question successfully found in private workspace!');

  // ---------- 7. Publish Question to Bank ----------
  console.log('🟢 Publishing question from workspace...');
  // Click "Publish" button inside the card containing our questionText
  await page.evaluate((qText) => {
    const cards = Array.from(document.querySelectorAll('.border'));
    const targetCard = cards.find(c => c.textContent.includes(qText));
    if (!targetCard) throw new Error('Draft question card not found');
    const pubBtn = Array.from(targetCard.querySelectorAll('button')).find(b => b.textContent.includes('Publish'));
    if (pubBtn) pubBtn.click();
  }, questionText);

  // Wait for Publish Modal
  await page.waitForSelector('select#target-question-bank', { timeout: 10000 });
  
  // Select our created bankName
  await page.evaluate((bName) => {
    const select = document.querySelector('select#target-question-bank');
    if (!select) throw new Error('Bank select in modal not found');
    const opt = Array.from(select.options).find(o => o.textContent.includes(bName));
    if (!opt) throw new Error(`Bank option for "${bName}" not found in select`);
    select.value = opt.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, bankName);

  // Click Confirm & Publish
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Confirm & Publish'));
    if (btn) btn.click();
  });

  await new Promise(r => setTimeout(r, 4000));
  console.log('✅ Published question to Faculty Bank.');

  // Verify workspace is now empty or question is gone
  const textContent = await page.evaluate(() => document.body.textContent || '');
  if (textContent.includes(questionText)) {
    throw new Error('❌ FAILURE: Question is still visible in Workspace after publishing!');
  } else {
    console.log('✅ SUCCESS: Question is no longer in Workspace (moved out!).');
  }

  // ---------- 8. Clean up Database ----------
  console.log('🧹 Cleaning up database...');
  await mongoose.connect(MONGODB_URI);
  await mongoose.connection.db.collection('users').deleteOne({ email });
  await mongoose.connection.db.collection('questions').deleteOne({ questionText });
  await mongoose.connection.db.collection('questionbanks').deleteOne({ name: bankName });
  await mongoose.disconnect();
  console.log('DB Cleaned up.');

  await browser.close();
  console.log('🎉 ALL BROWSER E2E TESTS PASSED SUCCESSFULLY! Workspace flow fully validated.');
})();
