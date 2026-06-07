const puppeteer = require('c:/Users/manoj555/Desktop/Exam_forge/node_modules/puppeteer');

(async () => {
  console.log('--- Phase 2 Syllabus E2E Browser Verification ---');
  
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(60000);

  // page console logs
  page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));
  page.on('pageerror', err => console.error('BROWSER_ERR:', err.toString()));

  try {
    // 1. Login
    console.log('Opening login page...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder="you@example.com"]');
    
    console.log('Logging in as admin...');
    await page.type('input[placeholder="you@example.com"]', 'admin@examforge.com');
    await page.type('input[type="password"]', 'Admin@123');
    await page.click('button[type="submit"]');

    await page.waitForFunction(() => window.location.pathname.includes('/dashboard'), { timeout: 15000 });
    console.log('✓ Success: Logged in and redirected to dashboard.');

    // 2. Navigate to Syllabus Manager
    console.log('Navigating to Syllabus Manager page...');
    await page.goto('http://localhost:5173/syllabus', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main h1');

    const headingText = await page.evaluate(() => {
      const el = document.querySelector('main h1');
      return el ? el.textContent : '';
    });
    console.log(`Heading found: "${headingText}"`);
    if (!headingText || !headingText.includes('Syllabus Manager')) {
      throw new Error('Syllabus Manager page header not found!');
    }
    console.log('✓ Success: Syllabus Manager loaded.');

    // Wait for the tree to load and render JEE Main
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('span')).some(el => el.textContent.includes('JEE Main')),
      { timeout: 10000 }
    );
    console.log('✓ Success: Syllabus tree rendered JEE Main.');

    // Click on JEE Main node
    console.log('Selecting "JEE Main" node in the tree...');
    await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span'));
      const target = spans.find(el => el.textContent.trim() === 'JEE Main');
      if (target) target.click();
    });

    // Verify right panel displays details
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('p')).some(el => el.textContent.includes('JEE_MAIN')),
      { timeout: 5000 }
    );
    console.log('✓ Success: Selected node details displayed in details panel.');

    // 3. Go to Question Bank filters check
    console.log('Navigating to Question Bank page...');
    await page.goto('http://localhost:5173/questions', { waitUntil: 'domcontentloaded' });
    
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('span')).some(el => el.textContent.includes('Syllabus:')),
      { timeout: 10000 }
    );
    console.log('✓ Success: Question Bank page renders the new Syllabus filters row.');

    console.log('🎉 ALL BROWSER E2E TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (err) {
    console.error('✗ E2E Browser Test Failed:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
    process.exit(0);
  }
})();
