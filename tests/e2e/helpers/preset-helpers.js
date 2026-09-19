/**
 * Shared E2E helpers for preset interactions.
 *
 * Auto-detects whether the searchable combobox widget or the native
 * <select> is visible and delegates accordingly.
 *
 * Combobox selectors (from src/js/searchable-combobox.js):
 *   Container : #presetComboboxContainer
 *   Input     : .preset-combobox-input
 *   Options   : .preset-combobox-option[data-value]
 *   Chevron   : .preset-combobox-chevron
 *
 * @license GPL-3.0-or-later
 */

/**
 * Detect which preset widget is active.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<'combobox'|'native'|null>}
 */
export async function detectPresetWidget(page) {
  const comboboxInput = page.locator('#presetComboboxContainer .preset-combobox-input');
  if (await comboboxInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    return 'combobox';
  }
  const nativeSelect = page.locator('select#presetSelect');
  if (await nativeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    return 'native';
  }
  return null;
}

/**
 * Select a preset by name, regardless of which widget is active.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} presetName  — visible label text of the preset
 * @returns {Promise<boolean>} true if selection succeeded
 */
export async function selectPreset(page, presetName) {
  const widget = await detectPresetWidget(page);

  if (widget === 'combobox') {
    const input = page.locator('#presetComboboxContainer .preset-combobox-input');
    await input.click();

    const listbox = page.locator('#presetComboboxContainer .preset-combobox-list');
    await listbox.waitFor({ state: 'visible', timeout: 3000 });

    const option = listbox.locator(
      '.preset-combobox-option:not(.preset-combobox-empty)',
      { hasText: presetName },
    );
    if ((await option.count()) === 0) return false;
    await option.first().click();
    return true;
  }

  if (widget === 'native') {
    const sel = page.locator('select#presetSelect');
    const option = sel.locator(`option`, { hasText: presetName });
    if ((await option.count()) === 0) return false;
    await sel.selectOption({ label: presetName });
    return true;
  }

  return false;
}

/**
 * Select a preset by its option value (ID), regardless of widget.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} value  — option value / data-value attribute
 * @returns {Promise<boolean>}
 */
export async function selectPresetByValue(page, value) {
  const widget = await detectPresetWidget(page);

  if (widget === 'combobox') {
    const input = page.locator('#presetComboboxContainer .preset-combobox-input');
    await input.click();

    const listbox = page.locator('#presetComboboxContainer .preset-combobox-list');
    await listbox.waitFor({ state: 'visible', timeout: 3000 });

    const option = listbox.locator(`.preset-combobox-option[data-value="${value}"]`);
    if ((await option.count()) === 0) return false;
    await option.click();
    return true;
  }

  if (widget === 'native') {
    const sel = page.locator('select#presetSelect');
    await sel.selectOption({ value });
    return true;
  }

  return false;
}

/**
 * Expand the Presets <details> panel so preset controls become visible.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function expandPresetControls(page) {
  await page.evaluate(() => {
    const details = document.getElementById('presetControls');
    if (details && !details.open) details.open = true;
  });
  await page.waitForTimeout(300);
}

/**
 * Return the currently selected preset label text from whichever widget is active.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string|null>}
 */
export async function getSelectedPresetLabel(page) {
  const widget = await detectPresetWidget(page);

  if (widget === 'combobox') {
    const input = page.locator('#presetComboboxContainer .preset-combobox-input');
    return input.inputValue();
  }

  if (widget === 'native') {
    const sel = page.locator('select#presetSelect');
    const checked = sel.locator('option:checked');
    if ((await checked.count()) === 0) return null;
    return checked.textContent();
  }

  return null;
}

/**
 * Get all visible preset option labels from whichever widget is active.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
export async function getPresetOptions(page) {
  // Always read from the native <select> which stays in sync with the combobox.
  // This avoids click failures when a modal overlays the combobox.
  const sel = page.locator('select#presetSelect');
  if (await sel.count() > 0) {
    return sel.locator('option').allTextContents();
  }
  return [];
}

/**
 * Get the currently selected preset value (ID) from whichever widget is active.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string|null>}
 */
export async function getSelectedPresetValue(page) {
  const widget = await detectPresetWidget(page);

  if (widget === 'combobox') {
    return page.evaluate(() => {
      const container = document.getElementById('presetComboboxContainer');
      if (!container) return null;
      const selected = container.querySelector('.preset-combobox-option.is-selected');
      return selected ? selected.dataset.value : null;
    });
  }

  if (widget === 'native') {
    return page.locator('select#presetSelect').inputValue();
  }

  return null;
}
