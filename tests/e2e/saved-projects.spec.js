/**
 * E2E tests for saved projects workflow
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to get test fixture path
const getFixturePath = (filename) => {
  return path.join(__dirname, '../fixtures', filename);
};

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  });
});

test.describe('Saved Projects', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('/');
    
    // Wait for app to be ready
    await page.waitForSelector('#welcomeScreen', { state: 'visible' });
    
    // Clear any existing saved projects via console
    await page.evaluate(() => {
      return window.indexedDB.deleteDatabase('openscad-forge-saved-projects');
    });
    
    // Also clear localStorage (but preserve first-visit-seen flag)
    await page.evaluate(() => {
      localStorage.removeItem('openscad-saved-projects');
    });
  });

  test('should show empty state when no projects are saved', async ({ page }) => {
    const emptyMessage = page.locator('#savedProjectsEmpty');
    await expect(emptyMessage).toBeVisible();
    await expect(emptyMessage).toContainText('No saved projects yet');
  });

  test('should save a project after uploading a file', async ({ page }) => {
    // Upload a file
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(getFixturePath('sample.scad'));
    
    // Wait for file to load and save prompt to appear
    await page.waitForSelector('.save-project-modal', { state: 'visible', timeout: 10000 });
    
    // Check that project name defaults to file name
    const nameInput = page.locator('#saveProjectName');
    await expect(nameInput).toHaveValue('sample.scad');
    
    // Check the "Save this file" checkbox
    const checkbox = page.locator('#saveProjectCheckbox');
    await checkbox.check();
    
    // Add notes
    const notesTextarea = page.locator('#saveProjectNotes');
    await notesTextarea.fill('Test project notes with https://example.com');
    
    // Click Save button
    const saveBtn = page.locator('#saveProjectSave');
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    
    // Modal should close
    await expect(page.locator('.save-project-modal')).not.toBeVisible();
    
    // Go back to welcome screen
    const clearBtn = page.locator('#clearFileBtn');
    await clearBtn.click();
    
    // Confirm clear
    await page.waitForSelector('.confirm-modal', { state: 'visible' });
    const confirmBtn = page.locator('.confirm-modal button:has-text("Confirm")');
    await confirmBtn.click();
    
    // Should see saved project on welcome screen
    await page.waitForSelector('.saved-project-card', { state: 'visible' });
    const projectCard = page.locator('.saved-project-card').first();
    await expect(projectCard).toBeVisible();
    await expect(projectCard).toContainText('sample.scad');
    await expect(projectCard).toContainText('Test project notes');
    
    // Should see the link in notes
    const notesLink = projectCard.locator('a[href="https://example.com"]');
    await expect(notesLink).toBeVisible();
  });

  test('should load a saved project from welcome screen', async ({ page }) => {
    // First save a project
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(getFixturePath('sample.scad'));
    
    await page.waitForSelector('.save-project-modal', { state: 'visible', timeout: 10000 });
    await page.locator('#saveProjectCheckbox').check();
    await page.locator('#saveProjectSave').click();
    await expect(page.locator('.save-project-modal')).not.toBeVisible();
    
    // Clear the file
    await page.locator('#clearFileBtn').click();
    await page.waitForSelector('.confirm-modal', { state: 'visible' });
    await page.locator('.confirm-modal button:has-text("Confirm")').click();
    
    // Now load it from saved projects
    await page.waitForSelector('.saved-project-card', { state: 'visible' });
    const loadBtn = page.locator('.btn-load-project').first();
    await loadBtn.click();
    
    // Should show main interface
    await expect(page.locator('#mainInterface')).toBeVisible();
    await expect(page.locator('#welcomeScreen')).not.toBeVisible();
    
    // Check that parameters are loaded
    await expect(page.locator('#parametersForm')).toBeVisible();
  });

  test('should edit project name and notes', async ({ page }) => {
    // Save a project first
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(getFixturePath('sample.scad'));
    
    await page.waitForSelector('.save-project-modal', { state: 'visible', timeout: 10000 });
    await page.locator('#saveProjectCheckbox').check();
    await page.locator('#saveProjectNotes').fill('Original notes');
    await page.locator('#saveProjectSave').click();
    await expect(page.locator('.save-project-modal')).not.toBeVisible();
    
    // Clear the file
    await page.locator('#clearFileBtn').click();
    await page.waitForSelector('.confirm-modal', { state: 'visible' });
    await page.locator('.confirm-modal button:has-text("Confirm")').click();
    
    // Click Edit button
    await page.waitForSelector('.saved-project-card', { state: 'visible' });
    const editBtn = page.locator('.btn-edit-project').first();
    await editBtn.click();
    
    // Edit modal should appear
    await expect(page.locator('.edit-project-modal')).toBeVisible();
    
    // Change name and notes
    const nameInput = page.locator('#editProjectName');
    await nameInput.fill('Updated Project Name');
    
    const notesTextarea = page.locator('#editProjectNotes');
    await notesTextarea.fill('Updated notes with https://newlink.com');
    
    // Save changes
    const saveBtn = page.locator('#editProjectSave');
    await saveBtn.click();
    
    // Modal should close
    await expect(page.locator('.edit-project-modal')).not.toBeVisible();
    
    // Verify changes
    const projectCard = page.locator('.saved-project-card').first();
    await expect(projectCard).toContainText('Updated Project Name');
    await expect(projectCard).toContainText('Updated notes');
    
    // Should see the new link
    const notesLink = projectCard.locator('a[href="https://newlink.com"]');
    await expect(notesLink).toBeVisible();
  });

  test('should delete a saved project', async ({ page }) => {
    // Save a project first
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(getFixturePath('sample.scad'));
    
    await page.waitForSelector('.save-project-modal', { state: 'visible', timeout: 10000 });
    await page.locator('#saveProjectCheckbox').check();
    await page.locator('#saveProjectSave').click();
    await expect(page.locator('.save-project-modal')).not.toBeVisible();
    
    // Clear the file
    await page.locator('#clearFileBtn').click();
    await page.waitForSelector('.confirm-modal', { state: 'visible' });
    await page.locator('.confirm-modal button:has-text("Confirm")').click();
    
    // Click Delete button
    await page.waitForSelector('.saved-project-card', { state: 'visible' });
    const deleteBtn = page.locator('.btn-delete-project').first();
    await deleteBtn.click();
    
    // Confirm deletion
    await page.waitForSelector('.confirm-modal', { state: 'visible' });
    const confirmBtn = page.locator('.confirm-modal button:has-text("Delete")');
    await confirmBtn.click();
    
    // Project should be gone
    await expect(page.locator('.saved-project-card')).not.toBeVisible();
    await expect(page.locator('#savedProjectsEmpty')).toBeVisible();
  });

  test('should show confirmation when loading over existing file', async ({ page }) => {
    // Save a project
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(getFixturePath('sample.scad'));
    
    await page.waitForSelector('.save-project-modal', { state: 'visible', timeout: 10000 });
    await page.locator('#saveProjectCheckbox').check();
    await page.locator('#saveProjectSave').click();
    await expect(page.locator('.save-project-modal')).not.toBeVisible();
    
    // Load another file (don't save)
    await fileInput.setInputFiles(getFixturePath('sample-advanced.scad'));
    
    // Close save prompt without saving
    await page.waitForSelector('.save-project-modal', { state: 'visible', timeout: 10000 });
    await page.locator('#saveProjectNotNow').click();
    
    // Try to load saved project
    await page.locator('#clearFileBtn').click();
    await page.waitForSelector('.confirm-modal', { state: 'visible' });
    await page.locator('.confirm-modal button:has-text("Confirm")').click();
    
    await page.waitForSelector('.saved-project-card', { state: 'visible' });
    const loadBtn = page.locator('.btn-load-project').first();
    await loadBtn.click();
    
    // Should show main interface (loaded successfully)
    await expect(page.locator('#mainInterface')).toBeVisible();
  });

  test('should update "last opened" time after loading', async ({ page }) => {
    // Save a project
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(getFixturePath('sample.scad'));
    
    await page.waitForSelector('.save-project-modal', { state: 'visible', timeout: 10000 });
    await page.locator('#saveProjectCheckbox').check();
    await page.locator('#saveProjectSave').click();
    await expect(page.locator('.save-project-modal')).not.toBeVisible();
    
    // Clear the file
    await page.locator('#clearFileBtn').click();
    await page.waitForSelector('.confirm-modal', { state: 'visible' });
    await page.locator('.confirm-modal button:has-text("Confirm")').click();
    
    // Check initial state (no "Opened" time yet)
    await page.waitForSelector('.saved-project-card', { state: 'visible' });
    let projectCard = page.locator('.saved-project-card').first();
    const initialText = await projectCard.textContent();
    
    // Load the project
    await page.locator('.btn-load-project').first().click();
    await expect(page.locator('#mainInterface')).toBeVisible();
    
    // Go back to welcome
    await page.locator('#clearFileBtn').click();
    await page.waitForSelector('.confirm-modal', { state: 'visible' });
    await page.locator('.confirm-modal button:has-text("Confirm")').click();
    
    // Check that "Opened" time is now shown
    await page.waitForSelector('.saved-project-card', { state: 'visible' });
    projectCard = page.locator('.saved-project-card').first();
    await expect(projectCard).toContainText('Opened');
  });

  test('should not show save prompt for example loads', async ({ page }) => {
    // Click on "Start Tutorial" button to load an example
    const tutorialBtn = page.locator('button[data-example="simple-box"]').first();
    await tutorialBtn.click();
    
    // Wait for main interface to appear
    await expect(page.locator('#mainInterface')).toBeVisible();
    
    // Save prompt should NOT appear
    await expect(page.locator('.save-project-modal')).not.toBeVisible();
  });

  test('should skip save prompt when clicking "Not now"', async ({ page }) => {
    // Upload a file
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(getFixturePath('sample.scad'));
    
    // Wait for save prompt
    await page.waitForSelector('.save-project-modal', { state: 'visible', timeout: 10000 });
    
    // Click "Not now"
    const notNowBtn = page.locator('#saveProjectNotNow');
    await notNowBtn.click();
    
    // Modal should close
    await expect(page.locator('.save-project-modal')).not.toBeVisible();
    
    // Go back to welcome screen
    await page.locator('#clearFileBtn').click();
    await page.waitForSelector('.confirm-modal', { state: 'visible' });
    await page.locator('.confirm-modal button:has-text("Confirm")').click();
    
    // No saved projects should exist
    await expect(page.locator('#savedProjectsEmpty')).toBeVisible();
    await expect(page.locator('.saved-project-card')).not.toBeVisible();
  });

  test('should allow custom project name on save', async ({ page }) => {
    // Upload a file
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(getFixturePath('sample.scad'));
    
    // Wait for save prompt
    await page.waitForSelector('.save-project-modal', { state: 'visible', timeout: 10000 });
    
    // Change project name
    const nameInput = page.locator('#saveProjectName');
    await nameInput.fill('My Custom Project Name');
    
    // Check the "Save this file" checkbox
    const checkbox = page.locator('#saveProjectCheckbox');
    await checkbox.check();
    
    // Save
    const saveBtn = page.locator('#saveProjectSave');
    await saveBtn.click();
    
    // Go back to welcome screen
    await page.locator('#clearFileBtn').click();
    await page.waitForSelector('.confirm-modal', { state: 'visible' });
    await page.locator('.confirm-modal button:has-text("Confirm")').click();
    
    // Should see custom project name
    await page.waitForSelector('.saved-project-card', { state: 'visible' });
    const projectCard = page.locator('.saved-project-card').first();
    await expect(projectCard).toContainText('My Custom Project Name');
  });

  test('should warn about clear cache affecting saved projects', async ({ page }) => {
    // Save a project first
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(getFixturePath('sample.scad'));
    
    await page.waitForSelector('.save-project-modal', { state: 'visible', timeout: 10000 });
    await page.locator('#saveProjectCheckbox').check();
    await page.locator('#saveProjectSave').click();
    await expect(page.locator('.save-project-modal')).not.toBeVisible();
    
    // Clear the file to go back to welcome
    await page.locator('#clearFileBtn').click();
    await page.waitForSelector('.confirm-modal', { state: 'visible' });
    await page.locator('.confirm-modal button:has-text("Confirm")').click();
    
    // Try to clear cache
    const clearCacheBtn = page.locator('#clearStorageBtn');
    await clearCacheBtn.click();
    
    // Should show confirmation with saved projects warning
    await page.waitForSelector('.confirm-modal', { state: 'visible' });
    const confirmText = await page.locator('.confirm-modal').textContent();
    expect(confirmText).toContain('saved project');
    expect(confirmText).toContain('permanently delete');
  });

  test('should validate notes character limit', async ({ page }) => {
    // Upload a file
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(getFixturePath('sample.scad'));
    
    await page.waitForSelector('.save-project-modal', { state: 'visible', timeout: 10000 });
    await page.locator('#saveProjectCheckbox').check();
    
    // Try to enter notes exceeding limit
    const notesTextarea = page.locator('#saveProjectNotes');
    const longNotes = 'x'.repeat(5001);
    await notesTextarea.fill(longNotes);
    
    // Character counter should show error
    const counter = page.locator('.save-project-notes-counter');
    await expect(counter).toHaveClass(/error/);
    
    // Save button should be disabled
    const saveBtn = page.locator('#saveProjectSave');
    await expect(saveBtn).toBeDisabled();
  });

  test.describe('Mobile viewport', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('should display saved projects in mobile layout', async ({ page }) => {
      // Save a project
      const fileInput = page.locator('#fileInput');
      await fileInput.setInputFiles(getFixturePath('sample.scad'));
      
      await page.waitForSelector('.save-project-modal', { state: 'visible', timeout: 10000 });
      await page.locator('#saveProjectCheckbox').check();
      await page.locator('#saveProjectSave').click();
      await expect(page.locator('.save-project-modal')).not.toBeVisible();
      
      // Clear file
      await page.locator('#clearFileBtn').click();
      await page.waitForSelector('.confirm-modal', { state: 'visible' });
      await page.locator('.confirm-modal button:has-text("Confirm")').click();
      
      // Check that saved projects are displayed
      await page.waitForSelector('.saved-project-card', { state: 'visible' });
      const projectCard = page.locator('.saved-project-card').first();
      await expect(projectCard).toBeVisible();
      
      // Check that buttons are touch-friendly (at least 44px)
      const loadBtn = page.locator('.btn-load-project').first();
      const box = await loadBtn.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    });
  });

  test.describe('Keyboard navigation', () => {
    test('should focus saved projects with Ctrl+Shift+P', async ({ page }) => {
      // Save a project
      const fileInput = page.locator('#fileInput');
      await fileInput.setInputFiles(getFixturePath('sample.scad'));
      
      await page.waitForSelector('.save-project-modal', { state: 'visible', timeout: 10000 });
      await page.locator('#saveProjectCheckbox').check();
      await page.locator('#saveProjectSave').click();
      await expect(page.locator('.save-project-modal')).not.toBeVisible();
      
      // Clear file
      await page.locator('#clearFileBtn').click();
      await page.waitForSelector('.confirm-modal', { state: 'visible' });
      await page.locator('.confirm-modal button:has-text("Confirm")').click();
      
      // Wait for saved projects to be visible
      await page.waitForSelector('.saved-project-card', { state: 'visible' });
      
      // Press Ctrl+Shift+P
      await page.keyboard.press('Control+Shift+KeyP');
      
      // First project card should be focused
      const firstCard = page.locator('.saved-project-card').first();
      await expect(firstCard).toBeFocused();
    });
  });
});
