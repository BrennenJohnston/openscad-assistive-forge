/**
 * Script to capture console logs from the OpenSCAD web app
 * Usage: node capture-console-logs.js
 */

import { chromium } from 'playwright';

const scadContent = `// Color and Debug Modifier Parity Test Fixture
/* [Model] */
box_size = 20; // [5:50]

/* [Colors] */
model_color = "red"; // [red, green, blue, yellow, white]
accent_color = "#00ff00";

color(model_color)
    cube([box_size, box_size, box_size]);

color(accent_color)
    translate([box_size + 5, 0, 0])
        sphere(r = box_size / 2);
`;

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Array to capture console logs
  const capturedLogs = [];

  // Listen to console messages
  page.on('console', msg => {
    const text = msg.text();
    capturedLogs.push(text);
    console.log(`[BROWSER CONSOLE] ${text}`);
  });

  // Navigate to the app
  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');

  // Wait for the page to load
  console.log('Waiting for page to load...');
  await page.waitForTimeout(3000);

  // Take initial screenshot
  const screenshotPath1 = 'C:\\Users\\WATAP\\Documents\\github\\openscad-assistive-forge\\screenshot-1-initial.png';
  await page.screenshot({ path: screenshotPath1 });
  console.log(`Screenshot saved: ${screenshotPath1}`);

  // Look for and click the WASM consent button
  console.log('Looking for WASM consent dialog...');
  try {
    // Wait for the consent dialog to appear
    await page.waitForSelector('button:has-text("Download & Continue")', { timeout: 5000 });
    console.log('Found consent button, clicking...');
    await page.click('button:has-text("Download & Continue")');
    console.log('Consent accepted, waiting for WASM to download...');
    await page.waitForTimeout(5000);
  } catch (e) {
    console.log('No consent dialog found or already accepted');
  }

  // Upload the SCAD content programmatically
  console.log('Uploading SCAD file...');
  await page.evaluate((content) => {
    const file = new File([content], 'color-debug-test.scad', { type: 'text/plain' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      console.error('fileInput not found!');
    }
  }, scadContent);

  // Wait for render to complete
  console.log('Waiting for render to complete (20 seconds)...');
  await page.waitForTimeout(20000);

  // Take screenshot after render
  const screenshotPath2 = 'C:\\Users\\WATAP\\Documents\\github\\openscad-assistive-forge\\screenshot-2-rendered.png';
  await page.screenshot({ path: screenshotPath2 });
  console.log(`Screenshot saved: ${screenshotPath2}`);

  // Filter and display the logs
  console.log('\n=== PREVIEW LOGS ===');
  const previewLogs = capturedLogs.filter(l => 
    l.includes('[Preview]') || l.includes('[Preview Performance]')
  );
  previewLogs.forEach(log => console.log(log));

  console.log('\n=== ERROR LOGS ===');
  const errorLogs = capturedLogs.filter(l => 
    l.includes('Error') || l.includes('error') || l.includes('WASM')
  ).slice(0, 10);
  errorLogs.forEach(log => console.log(log));

  console.log('\n=== COFF CHECK ===');
  const hasCOFF = capturedLogs.some(l => l.includes('COFF'));
  console.log(`COFF found in logs: ${hasCOFF}`);

  if (hasCOFF) {
    console.log('\nLogs containing "COFF":');
    capturedLogs.filter(l => l.includes('COFF')).forEach(log => console.log(log));
  }

  console.log('\n=== ALL CAPTURED LOGS ===');
  console.log(JSON.stringify(capturedLogs, null, 2));

  // Keep browser open for inspection
  console.log('\nBrowser will remain open for 30 seconds for inspection...');
  await page.waitForTimeout(30000);

  await browser.close();
})();
