/**
 * SVG Preparer Dialog — Unit tests
 *
 * Phase 4: Tests for showSvgPreparerDialog DOM structure, element listing,
 * role overrides, keyboard/screen-reader attributes, apply/cancel flow.
 *
 * openModal/closeModal are mocked because the focus-trap requires layout
 * dimensions that jsdom does not provide.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

vi.mock('../../src/js/modal-manager.js', () => ({
  openModal: vi.fn((modal) => {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }),
  closeModal: vi.fn((modal) => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }),
}));

import { showSvgPreparerDialog } from '../../src/js/svg-preparer-dialog.js';
import { needsPreparation } from '../../src/js/svg-preparer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SVG_DIR = join(
  __dirname,
  '../../public/examples/nasif-charm-maker/svg-library'
);

const SMILEY_SVG = readFileSync(join(SVG_DIR, 'smiley.svg'), 'utf-8');
const HEART_SVG = readFileSync(join(SVG_DIR, 'heart.svg'), 'utf-8');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDialog() {
  return document.querySelector('[role="dialog"]');
}

function getListItems() {
  return Array.from(document.querySelectorAll('[role="listitem"]'));
}

function clickAction(action) {
  const btn = document.querySelector(`[data-action="${action}"]`);
  if (btn) btn.click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('showSvgPreparerDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // -- Dialog structure --

  it('creates a dialog with correct ARIA attributes', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const dialog = getDialog();
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('svgPreparerTitle');

    const title = dialog.querySelector('#svgPreparerTitle');
    expect(title).not.toBeNull();
    expect(title.textContent).toContain('Prepare SVG');

    clickAction('cancel');
    expect(await promise).toBeNull();
  });

  it('renders an SVG preview pane with aria-label', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const preview = document.querySelector('.svg-preparer-preview');
    expect(preview).not.toBeNull();
    expect(preview.getAttribute('aria-label')).toContain('4 elements');

    const inlineSvg = preview.querySelector('svg');
    expect(inlineSvg).not.toBeNull();

    clickAction('cancel');
    await promise;
  });

  it('includes a live region for screen reader announcements', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live.getAttribute('aria-atomic')).toBe('true');

    clickAction('cancel');
    await promise;
  });

  // -- Element listing --

  it('lists all 4 smiley elements as list items', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const items = getListItems();
    expect(items).toHaveLength(4);

    clickAction('cancel');
    await promise;
  });

  it('auto-classifies smiley elements correctly', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const items = getListItems();
    const ariaLabels = items.map((el) => el.getAttribute('aria-label'));

    expect(ariaLabels[0]).toContain('foreground');
    expect(ariaLabels[1]).toContain('hole');
    expect(ariaLabels[2]).toContain('hole');
    expect(ariaLabels[3]).toContain('ignore');

    clickAction('cancel');
    await promise;
  });

  it('each element has a color swatch', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const swatches = document.querySelectorAll('.svg-preparer-swatch');
    expect(swatches.length).toBe(4);
    swatches.forEach((s) => {
      expect(s.getAttribute('aria-hidden')).toBe('true');
    });

    clickAction('cancel');
    await promise;
  });

  it('each element has a radio group with foreground/hole/ignore options', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const fieldsets = document.querySelectorAll('.svg-preparer-role-group');
    expect(fieldsets.length).toBe(4);

    fieldsets.forEach((fs, i) => {
      const radios = fs.querySelectorAll('input[type="radio"]');
      expect(radios.length).toBe(3);

      const values = Array.from(radios).map((r) => r.value);
      expect(values).toEqual(['foreground', 'hole', 'ignore']);

      const legend = fs.querySelector('legend');
      expect(legend).not.toBeNull();
    });

    clickAction('cancel');
    await promise;
  });

  it('list items are focusable (tabindex=0)', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const items = getListItems();
    items.forEach((item) => {
      expect(item.tabIndex).toBe(0);
    });

    clickAction('cancel');
    await promise;
  });

  // -- Role overrides --

  it('changing a role updates the aria-label on the list item', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const items = getListItems();
    const firstRadioGroup = items[0].querySelectorAll('input[type="radio"]');
    const holeRadio = Array.from(firstRadioGroup).find(
      (r) => r.value === 'hole'
    );
    holeRadio.checked = true;
    holeRadio.dispatchEvent(new Event('change', { bubbles: true }));

    expect(items[0].getAttribute('aria-label')).toContain('hole');

    clickAction('cancel');
    await promise;
  });

  it('changing a role announces via the live region', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const items = getListItems();
    const secondRadioGroup = items[1].querySelectorAll('input[type="radio"]');
    const fgRadio = Array.from(secondRadioGroup).find(
      (r) => r.value === 'foreground'
    );
    fgRadio.checked = true;
    fgRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const live = document.querySelector('[aria-live="polite"]');
    expect(live.textContent).toContain('Foreground');

    clickAction('cancel');
    await promise;
  });

  // -- Apply / Cancel --

  it('cancel returns null and removes the dialog from DOM', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    expect(getDialog()).not.toBeNull();
    clickAction('cancel');

    const result = await promise;
    expect(result).toBeNull();
    expect(getDialog()).toBeNull();
  });

  it('apply returns a prepared SVG string with compound path', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    clickAction('apply');
    const result = await promise;

    expect(result).not.toBeNull();
    expect(result).toContain('<svg');
    expect(result).toContain('<path');
    expect(result).toContain('fill="black"');

    const pathMatches = result.match(/<path[\s/]/g) || [];
    expect(pathMatches).toHaveLength(1);
  });

  it('apply with default roles produces same result as auto-prepare', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    clickAction('apply');
    const result = await promise;

    expect(needsPreparation(result)).toBe(false);
  });

  it('apply with overridden roles changes the output', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const items = getListItems();
    const eye1Radios = items[1].querySelectorAll('input[type="radio"]');
    const ignoreRadio = Array.from(eye1Radios).find(
      (r) => r.value === 'ignore'
    );
    ignoreRadio.checked = true;
    ignoreRadio.dispatchEvent(new Event('change', { bubbles: true }));

    clickAction('apply');
    const result = await promise;

    expect(result).toContain('<svg');
    const dMatch = result.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();
    const mCount = (dMatch[1].match(/M/g) || []).length;
    expect(mCount).toBe(2);
  });

  it('close button (×) returns null', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const closeBtn = document.querySelector('.preset-modal-close');
    expect(closeBtn).not.toBeNull();
    closeBtn.click();

    expect(await promise).toBeNull();
  });

  it('backdrop click returns null', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const modal = getDialog();
    modal.click();

    expect(await promise).toBeNull();
  });

  it('Escape key returns null', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const modal = getDialog();
    modal.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );

    expect(await promise).toBeNull();
  });

  // -- Single-element SVG --

  it('lists 1 element for heart.svg (single path)', async () => {
    const promise = showSvgPreparerDialog(HEART_SVG);

    const items = getListItems();
    expect(items).toHaveLength(1);
    expect(items[0].getAttribute('aria-label')).toContain('foreground');

    clickAction('cancel');
    await promise;
  });

  // -- SVG preview highlighting attributes --

  it('SVG preview has data-preparer-idx attributes on shapes', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const preview = document.querySelector('.svg-preparer-preview');
    const tagged = preview.querySelectorAll('[data-preparer-idx]');
    expect(tagged.length).toBe(4);

    clickAction('cancel');
    await promise;
  });

  // -- Instructions --

  it('displays instructions mentioning element count', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    const instructions = document.querySelector('#svgPreparerInstructions');
    expect(instructions).not.toBeNull();
    expect(instructions.textContent).toContain('4 shape elements');

    clickAction('cancel');
    await promise;
  });

  // -- Cleanup --

  it('removes dialog from DOM after apply', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    expect(document.querySelector('.svg-preparer-modal')).not.toBeNull();
    clickAction('apply');
    await promise;
    expect(document.querySelector('.svg-preparer-modal')).toBeNull();
  });

  it('removes dialog from DOM after cancel', async () => {
    const promise = showSvgPreparerDialog(SMILEY_SVG);

    expect(document.querySelector('.svg-preparer-modal')).not.toBeNull();
    clickAction('cancel');
    await promise;
    expect(document.querySelector('.svg-preparer-modal')).toBeNull();
  });
});
