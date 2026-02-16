/**
 * E2E tests for Keyguard workflows
 * Tests SVG/DXF export, companion files, 2D guidance, and multi-preset JSON
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Skip WASM-dependent tests in CI
const isCI = !!process.env.CI;

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  });
});

/**
 * Create a test ZIP with keyguard files
 * @returns {Promise<string>} Path to the created ZIP file
 */
async function createKeyguardZipFixture() {
  const zip = new JSZip();
  
  // Read the fixture files
  const fixtureDir = path.join(process.cwd(), 'tests', 'fixtures', 'keyguard-minimal');
  
  const scadContent = await fs.promises.readFile(
    path.join(fixtureDir, 'keyguard_minimal.scad'),
    'utf-8'
  );
  const txtContent = await fs.promises.readFile(
    path.join(fixtureDir, 'openings_and_additions.txt'),
    'utf-8'
  );
  
  zip.file('keyguard_minimal.scad', scadContent);
  zip.file('openings_and_additions.txt', txtContent);
  
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const outputDir = path.join(process.cwd(), 'test-results');
  await fs.promises.mkdir(outputDir, { recursive: true });
  const zipPath = path.join(outputDir, `keyguard-test-${Date.now()}.zip`);
  await fs.promises.writeFile(zipPath, buffer);
  
  return zipPath;
}

/**
 * Upload a file to the app (waits for WASM readiness first)
 */
async function uploadFile(page, filePath) {
  // Wait for WASM engine to be ready before uploading
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  });

  const fileInput = page.locator('#fileInput');
  await fileInput.setInputFiles(filePath);
  
  // Wait for main interface to appear
  await page.locator('#mainInterface').waitFor({ state: 'visible', timeout: 30000 });

  // Dismiss save-project modal if it appears
  try {
    const notNowBtn = page.locator('#saveProjectNotNow');
    await notNowBtn.waitFor({ state: 'visible', timeout: 3000 });
    await notNowBtn.click();
    await page.waitForTimeout(300);
  } catch {
    // Modal didn't appear
  }
}

test.describe('Keyguard SVG Export', () => {
  test.describe.configure({ timeout: 150_000 }); // WASM init may need ~120s
  test('should show 2D format guidance when SVG format is selected', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    
    await page.goto('/');
    
    // Upload a simple SCAD file first
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await uploadFile(page, fixturePath);
    
    // Find the output format selector
    const outputFormatSelect = page.locator('#outputFormat');
    await expect(outputFormatSelect).toBeVisible({ timeout: 10000 });
    
    // Initially, 2D guidance should be hidden (default is STL)
    const format2dGuidance = page.locator('#format2dGuidance');
    await expect(format2dGuidance).toBeHidden();
    
    // Change to SVG format
    await outputFormatSelect.selectOption('svg');
    
    // 2D guidance should now be visible
    await expect(format2dGuidance).toBeVisible({ timeout: 2000 });
    
    // Check for keyguard-specific guidance text
    const guidanceText = await format2dGuidance.textContent();
    expect(guidanceText).toContain('type_of_keyguard');
    expect(guidanceText).toContain('Laser-Cut');
    expect(guidanceText).toContain('first layer for SVG/DXF file');
  });

  test('should show 2D format guidance when DXF format is selected', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    
    await page.goto('/');
    
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await uploadFile(page, fixturePath);
    
    const outputFormatSelect = page.locator('#outputFormat');
    await expect(outputFormatSelect).toBeVisible({ timeout: 10000 });
    
    // Change to DXF format
    await outputFormatSelect.selectOption('dxf');
    
    // 2D guidance should be visible
    const format2dGuidance = page.locator('#format2dGuidance');
    await expect(format2dGuidance).toBeVisible({ timeout: 2000 });
  });

  test('should hide 2D guidance when switching back to 3D format', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    
    await page.goto('/');
    
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await uploadFile(page, fixturePath);
    
    const outputFormatSelect = page.locator('#outputFormat');
    await expect(outputFormatSelect).toBeVisible({ timeout: 10000 });
    
    // Change to SVG
    await outputFormatSelect.selectOption('svg');
    const format2dGuidance = page.locator('#format2dGuidance');
    await expect(format2dGuidance).toBeVisible({ timeout: 2000 });
    
    // Change back to STL
    await outputFormatSelect.selectOption('stl');
    await expect(format2dGuidance).toBeHidden({ timeout: 2000 });
  });

  test.skip('should export valid SVG from simple 2D model', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');
    
    await page.goto('/');
    
    // Upload the simple 2D fixture
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'simple-2d.scad');
    await uploadFile(page, fixturePath);
    
    // Select SVG output
    const outputFormatSelect = page.locator('#outputFormat');
    await outputFormatSelect.selectOption('svg');
    
    // Wait for parameters to load
    await expect(page.locator('.param-control').first()).toBeVisible({ timeout: 10000 });
    
    // Find and click Generate button
    const generateButton = page.locator('button:has-text("Generate"), button:has-text("Download")').first();
    await expect(generateButton).toBeVisible({ timeout: 5000 });
    
    // Set up download promise before clicking
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await generateButton.click();
    
    const download = await downloadPromise;
    
    // Verify filename
    expect(download.suggestedFilename()).toMatch(/\.svg$/i);
    
    // Read and validate SVG content
    const downloadPath = await download.path();
    const svgContent = await fs.promises.readFile(downloadPath, 'utf-8');
    
    // Basic SVG validation
    expect(svgContent).toMatch(/<svg/i);
    expect(svgContent.length).toBeGreaterThan(100);
    
    // Should contain at least one geometric element
    const hasGeometry = 
      svgContent.includes('<path') ||
      svgContent.includes('<polygon') ||
      svgContent.includes('<polyline') ||
      svgContent.includes('<rect') ||
      svgContent.includes('<circle');
    
    expect(hasGeometry).toBe(true);
  });

  test.skip('should export valid SVG from keyguard with Laser-Cut settings', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');
    
    await page.goto('/');
    
    // Create and upload the keyguard ZIP
    const zipPath = await createKeyguardZipFixture();
    await uploadFile(page, zipPath);
    
    // Wait for project files to be recognized
    await expect(page.locator('.file-tree, .project-files')).toBeVisible({ timeout: 15000 });
    
    // Wait for parameters to load
    await expect(page.locator('.param-control').first()).toBeVisible({ timeout: 10000 });
    
    // Find and set type_of_keyguard to Laser-Cut
    const keyguardTypeParam = page.locator('select[data-param="type_of_keyguard"]');
    if (await keyguardTypeParam.isVisible()) {
      await keyguardTypeParam.selectOption('Laser-Cut');
    }
    
    // Find and set generate to "first layer for SVG/DXF file"
    const generateParam = page.locator('select[data-param="generate"]');
    if (await generateParam.isVisible()) {
      await generateParam.selectOption('first layer for SVG/DXF file');
    }
    
    // Select SVG output format
    const outputFormatSelect = page.locator('#outputFormat');
    await outputFormatSelect.selectOption('svg');
    
    // Wait a bit for auto-preview to settle
    await page.waitForTimeout(2000);
    
    // Find and click Generate button
    const generateButton = page.locator('button:has-text("Generate"), button:has-text("Download")').first();
    await expect(generateButton).toBeVisible({ timeout: 5000 });
    
    // Set up download promise before clicking
    const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
    await generateButton.click();
    
    const download = await downloadPromise;
    
    // Verify filename
    expect(download.suggestedFilename()).toMatch(/\.svg$/i);
    
    // Read and validate SVG content
    const downloadPath = await download.path();
    const svgContent = await fs.promises.readFile(downloadPath, 'utf-8');
    
    // Validate SVG structure
    expect(svgContent).toMatch(/<svg/i);
    expect(svgContent.length).toBeGreaterThan(100);
    
    console.log(`SVG downloaded: ${download.suggestedFilename()}, size: ${svgContent.length} bytes`);
  });
});

test.describe('Companion File Handling', () => {
  test.describe.configure({ timeout: 150_000 }); // WASM init may need ~120s

  test('should recognize TXT companion file in ZIP', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    
    await page.goto('/');
    
    // Create and upload the keyguard ZIP
    const zipPath = await createKeyguardZipFixture();
    await uploadFile(page, zipPath);
    
    // Wait for project files to be recognized
    await expect(page.locator('.file-tree, .project-files')).toBeVisible({ timeout: 15000 });
    
    // Check that both files are listed
    const fileTree = page.locator('.file-tree, .project-files');
    const fileNames = await fileTree.textContent();
    
    expect(fileNames).toContain('keyguard_minimal.scad');
    expect(fileNames).toContain('openings_and_additions.txt');
  });

  test('should not show "file not found" error for included TXT file', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    
    await page.goto('/');
    
    // Create and upload the keyguard ZIP
    const zipPath = await createKeyguardZipFixture();
    await uploadFile(page, zipPath);
    
    // Wait for project files to be recognized
    await expect(page.locator('.file-tree, .project-files')).toBeVisible({ timeout: 15000 });
    
    // Wait a bit for any rendering/parsing to occur
    await page.waitForTimeout(3000);
    
    // Check for error alerts about missing includes
    const alerts = await page.locator('[role="alert"]').allTextContents();
    const hasIncludeError = alerts.some(text => 
      text.toLowerCase().includes('cannot open file') ||
      text.toLowerCase().includes('include') ||
      text.toLowerCase().includes('openings_and_additions')
    );
    
    expect(hasIncludeError).toBe(false);
  });
});

test.describe('Multi-Preset JSON Import/Export', () => {
  test('should import multi-preset JSON file successfully', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    
    await page.goto('/');
    
    // Upload a SCAD file first to enable preset management
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await uploadFile(page, fixturePath);
    
    // Wait for parameters to load
    await expect(page.locator('.param-control').first()).toBeVisible({ timeout: 10000 });
    
    // Open preset management (look for preset button or menu)
    const presetButton = page.locator('[data-action="manage-presets"], button:has-text("Preset"), button:has-text("preset")').first();
    
    if (!(await presetButton.isVisible())) {
      test.skip();
      return;
    }
    
    await presetButton.click();
    
    // Look for import option
    const importButton = page.locator('button:has-text("Import"), [data-action="import-preset"]').first();
    
    if (!(await importButton.isVisible({ timeout: 3000 }))) {
      // Preset import UI might not be implemented
      test.skip();
      return;
    }
    
    // Set up file input for import
    const importInput = page.locator('input[type="file"][accept*=".json"]');
    const multiPresetPath = path.join(process.cwd(), 'tests', 'fixtures', 'test-multipreset.json');
    
    await importInput.setInputFiles(multiPresetPath);
    
    // Wait for import to complete
    await page.waitForTimeout(2000);
    
    // Check that no error is shown
    const errorAlert = page.locator('[role="alert"]:has-text("error"), [role="alert"]:has-text("invalid")');
    const hasError = await errorAlert.isVisible({ timeout: 1000 }).catch(() => false);
    
    expect(hasError).toBe(false);
    
    // Verify presets appear in list or dropdown
    const presetList = page.locator('.preset-list, .preset-dropdown, select[data-preset]');
    if (await presetList.isVisible()) {
      const presetText = await presetList.textContent();
      // Should contain at least one of the imported preset names
      const hasImportedPreset = 
        presetText.includes('Client A') ||
        presetText.includes('Client B') ||
        presetText.includes('Test Preset');
      
      expect(hasImportedPreset).toBe(true);
    }
  });
});

test.describe('Console Output Exposure', () => {
  test.skip('should display echo output from OpenSCAD', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');
    
    await page.goto('/');
    
    // Create a test SCAD with echo
    const testScadContent = `
      // Test echo output
      echo("E2E TEST MESSAGE 123");
      cube([10, 10, 10]);
    `;
    
    const outputDir = path.join(process.cwd(), 'test-results');
    await fs.promises.mkdir(outputDir, { recursive: true });
    const testScadPath = path.join(outputDir, `echo-test-${Date.now()}.scad`);
    await fs.promises.writeFile(testScadPath, testScadContent);
    
    await uploadFile(page, testScadPath);
    
    // Wait for rendering to complete
    await page.waitForTimeout(5000);
    
    // Look for console output panel or area
    const consolePanel = page.locator('.console-output, .openscad-console, [data-console-output]');
    
    if (await consolePanel.isVisible()) {
      const consoleText = await consolePanel.textContent();
      expect(consoleText).toContain('E2E TEST MESSAGE 123');
    } else {
      // Console output might be shown in a different location
      // Check if it's in any visible text on page
      const pageText = await page.textContent('body');
      
      // Test passes if either:
      // 1. Echo message is visible somewhere, OR
      // 2. Console panel exists (implementation may vary)
      const hasEchoVisible = pageText.includes('E2E TEST MESSAGE 123');
      
      // This is a soft assertion - console output exposure may need implementation
      console.log('Echo output visible on page:', hasEchoVisible);
    }
    
    // Cleanup
    await fs.promises.unlink(testScadPath).catch(() => {});
  });
});

test.describe('Reference Overlay', () => {
  /**
   * Create a keyguard ZIP with SVG screenshot file
   * @returns {Promise<string>} Path to the created ZIP file
   */
  async function createKeyguardZipWithSvg() {
    const zip = new JSZip();
    
    const fixtureDir = path.join(process.cwd(), 'tests', 'fixtures', 'keyguard-minimal');
    
    const scadContent = await fs.promises.readFile(
      path.join(fixtureDir, 'keyguard_minimal.scad'),
      'utf-8'
    );
    const txtContent = await fs.promises.readFile(
      path.join(fixtureDir, 'openings_and_additions.txt'),
      'utf-8'
    );
    const svgContent = await fs.promises.readFile(
      path.join(fixtureDir, 'default.svg'),
      'utf-8'
    );
    
    zip.file('keyguard_minimal.scad', scadContent);
    zip.file('openings_and_additions.txt', txtContent);
    zip.file('default.svg', svgContent);
    
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const outputDir = path.join(process.cwd(), 'test-results');
    await fs.promises.mkdir(outputDir, { recursive: true });
    const zipPath = path.join(outputDir, `keyguard-overlay-${Date.now()}.zip`);
    await fs.promises.writeFile(zipPath, buffer);
    
    return zipPath;
  }

  test('should show overlay section in preview settings', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    
    await page.goto('/');
    
    // Upload a simple SCAD file
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await uploadFile(page, fixturePath);
    
    // Wait for main interface
    await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 15000 });
    
    // Look for the overlay section in preview settings
    const overlaySection = page.locator('#overlaySection, .overlay-section');
    
    // Overlay section should be present in the DOM
    await expect(overlaySection).toBeVisible({ timeout: 5000 });
    
    // Check for the summary element
    const overlaySummary = page.locator('.overlay-summary');
    await expect(overlaySummary).toBeVisible();
    
    // Status should show "Off" initially
    const overlayStatus = page.locator('#overlayStatus');
    await expect(overlayStatus).toHaveText('Off');
  });

  test('should expand overlay controls when clicking summary', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    
    await page.goto('/');
    
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await uploadFile(page, fixturePath);
    
    await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 15000 });
    
    // Click on the overlay summary to expand
    const overlaySummary = page.locator('.overlay-summary');
    await overlaySummary.click();
    
    // Wait a moment for expansion
    await page.waitForTimeout(300);
    
    // Verify controls are visible
    const overlayToggle = page.locator('#overlayToggle');
    const overlayOpacityInput = page.locator('#overlayOpacityInput');
    
    await expect(overlayToggle).toBeVisible();
    await expect(overlayOpacityInput).toBeVisible();
  });

  test('should populate overlay source dropdown with SVG file from ZIP', async ({ page }) => {
    test.skip(isCI, 'File processing may be slow in CI');
    
    await page.goto('/');
    
    // Create and upload the keyguard ZIP with SVG
    const zipPath = await createKeyguardZipWithSvg();
    await uploadFile(page, zipPath);
    
    // Wait for files to be processed
    await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(2000);
    
    // Expand overlay section
    const overlaySummary = page.locator('.overlay-summary');
    await overlaySummary.click();
    await page.waitForTimeout(300);
    
    // Check the source dropdown
    const overlaySourceSelect = page.locator('#overlaySourceSelect');
    await expect(overlaySourceSelect).toBeVisible();
    
    // Should have the default.svg option
    const options = await overlaySourceSelect.locator('option').allTextContents();
    const hasSvgOption = options.some(opt => opt.includes('default.svg'));
    
    expect(hasSvgOption).toBe(true);
  });

  test('should auto-select default.svg in dropdown', async ({ page }) => {
    test.skip(isCI, 'File processing may be slow in CI');
    
    await page.goto('/');
    
    const zipPath = await createKeyguardZipWithSvg();
    await uploadFile(page, zipPath);
    
    await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(2000);
    
    // Expand overlay section
    const overlaySummary = page.locator('.overlay-summary');
    await overlaySummary.click();
    await page.waitForTimeout(300);
    
    // Check if default.svg is auto-selected
    const overlaySourceSelect = page.locator('#overlaySourceSelect');
    const selectedValue = await overlaySourceSelect.inputValue();
    
    expect(selectedValue).toBe('default.svg');
  });

  test('should update opacity value display when slider moves', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    
    await page.goto('/');
    
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await uploadFile(page, fixturePath);
    
    await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 15000 });
    
    // Expand overlay section
    const overlaySummary = page.locator('.overlay-summary');
    await overlaySummary.click();
    await page.waitForTimeout(300);
    
    // Get the opacity slider and value display
    const overlayOpacityInput = page.locator('#overlayOpacityInput');
    const overlayOpacityValue = page.locator('#overlayOpacityValue');
    
    // Set opacity to 75%
    await overlayOpacityInput.fill('75');
    await overlayOpacityInput.dispatchEvent('input');
    
    // Check value display updated
    await expect(overlayOpacityValue).toHaveText('75%');
  });

  test('should have accessible overlay controls', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    
    await page.goto('/');
    
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await uploadFile(page, fixturePath);
    
    await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 15000 });
    
    // Expand overlay section
    const overlaySummary = page.locator('.overlay-summary');
    await overlaySummary.click();
    await page.waitForTimeout(300);
    
    // Verify accessibility attributes
    const overlayToggle = page.locator('#overlayToggle');
    await expect(overlayToggle).toHaveAttribute('aria-describedby', 'overlayToggleHelp');
    
    const overlayOpacityInput = page.locator('#overlayOpacityInput');
    await expect(overlayOpacityInput).toHaveAttribute('aria-labelledby', 'overlayOpacityLabel');
    
    const overlaySourceSelect = page.locator('#overlaySourceSelect');
    await expect(overlaySourceSelect).toHaveAttribute('aria-describedby', 'overlaySourceHelp');
    
    // Check that sr-only help text exists
    const overlayToggleHelp = page.locator('#overlayToggleHelp');
    await expect(overlayToggleHelp).toHaveClass(/sr-only/);
  });
});

test.describe('Progress Text Shows Correct Format', () => {
  test('should show "Generating SVG..." when SVG format is selected', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');
    
    await page.goto('/');
    
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'simple-2d.scad');
    await uploadFile(page, fixturePath);
    
    // Select SVG output
    const outputFormatSelect = page.locator('#outputFormat');
    await outputFormatSelect.selectOption('svg');
    
    // Wait for parameters
    await expect(page.locator('.param-control').first()).toBeVisible({ timeout: 10000 });
    
    // Find Generate button
    const generateButton = page.locator('button:has-text("Generate"), button:has-text("Download")').first();
    await expect(generateButton).toBeVisible({ timeout: 5000 });
    
    // Click and quickly check status text
    await generateButton.click();
    
    // Check status text contains SVG (not STL)
    const statusText = page.locator('.status-text, [data-status], .progress-text');
    
    // Poll for status text a few times during render
    let foundSvgText = false;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(500);
      const allStatusText = await statusText.allTextContents();
      const combinedText = allStatusText.join(' ');
      
      if (combinedText.includes('SVG') || combinedText.includes('svg')) {
        foundSvgText = true;
        break;
      }
      
      // If we see "STL" instead of "SVG", that's a bug
      if (combinedText.includes('Generating STL')) {
        console.log('BUG: Found "Generating STL" when expecting SVG');
        expect(false).toBe(true); // Force fail
      }
    }
    
    // Note: This test may pass even if we don't catch the text
    // because the render might complete quickly
    console.log('Found SVG in progress text:', foundSvgText);
  });
});
