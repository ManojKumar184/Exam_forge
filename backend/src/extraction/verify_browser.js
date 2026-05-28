import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

async function run() {
  console.log('==================================================');
  console.log('       EXAMFORGE BROWSER & UI VERIFICATION        ');
  console.log('==================================================');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Capture browser console logs
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[BROWSER ERROR] ${msg.text()}`);
    } else {
      console.log(`[BROWSER LOG] ${msg.text()}`);
    }
  });

  // Handle page errors
  page.on('pageerror', err => {
    consoleErrors.push(`[PAGE ERROR] ${err.toString()}`);
  });

  try {
    console.log('Navigating to landing page...');
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    console.log(`Landing page loaded. Current URL: ${page.url()}`);

    console.log('Navigating to login page...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
    console.log(`Login page loaded. Current URL: ${page.url()}`);

    // Wait for the login form and enter credentials
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', 'admin@examforge.com');
    await page.type('input[type="password"]', 'Admin@123');

    console.log('Submitting login form...');
    // Click the submit button and let client-side router transition
    await page.click('button[type="submit"]');

    // Sleep to let auth state initialize and sync
    await new Promise(resolve => setTimeout(resolve, 4000));
    console.log(`Post-login URL: ${page.url()}`);

    if (page.url().includes('/dashboard')) {
      console.log('✅ Login successful! Reached Dashboard.');
    } else {
      console.warn(`⚠️ Post-login URL is ${page.url()}. Directing to dashboard...`);
      await page.goto('http://localhost:5173/dashboard', { waitUntil: 'domcontentloaded' });
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log(`Dashboard URL: ${page.url()}`);
    }

    console.log('Navigating to Moderation Queue Page...');
    await page.goto('http://localhost:5173/questions/moderation', { waitUntil: 'domcontentloaded' });
    await new Promise(resolve => setTimeout(resolve, 15000)); // wait for data store to fetch questions
    console.log(`Moderation Queue URL: ${page.url()}`);

    // Check if the page contains the moderation elements
    const pageTitle = await page.evaluate(() => document.title);
    console.log(`Page title: ${pageTitle}`);

    const bodyText = await page.evaluate(() => document.body.innerText);
    const html = await page.evaluate(() => document.body.innerHTML);
    
    if (bodyText.includes('Moderation') || bodyText.includes('Queue') || html.includes('moderation')) {
      console.log('✅ Moderation page loaded successfully and content is present.');
    } else {
      console.error('--- PAGE BODY TEXT ---');
      console.error(bodyText);
      console.error('----------------------');
      throw new Error(`Moderation page failed to render expected content. Current URL: ${page.url()}`);
    }

    // Verify if there are any console errors
    if (consoleErrors.length > 0) {
      console.error('\n❌ Browser validation completed with errors:');
      consoleErrors.forEach(err => console.error(err));
      process.exit(1);
    } else {
      console.log('\n✅ UI Verification Complete: No white-screen crashes or console errors detected!');
    }

  } catch (err) {
    console.error('❌ Browser verification failed:', err);
    if (consoleErrors.length > 0) {
      console.error('\n❌ Gathered browser errors/logs before failure:');
      consoleErrors.forEach(e => console.error(e));
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
