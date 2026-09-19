/**
 * Unit tests for the SearchableCombobox component.
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSearchableCombobox } from '../../src/js/searchable-combobox.js';

// @github/combobox-nav requires a real DOM; jsdom provides it via Vitest.

/** @param {HTMLElement} container */
function getInput(container) {
  return container.querySelector('.preset-combobox-input');
}
/** @param {HTMLElement} container */
function getList(container) {
  return container.querySelector('.preset-combobox-list');
}
/** @param {HTMLElement} container */
function getOptions(container) {
  return Array.from(
    container.querySelectorAll('.preset-combobox-option:not(.preset-combobox-empty)')
  );
}

const SAMPLE_OPTIONS = [
  { id: '__design_defaults__', label: 'design default values', italic: true },
  { id: 'preset-1', label: 'Wide Box' },
  { id: 'preset-2', label: 'Narrow Box' },
  { id: 'preset-3', label: 'Tall Cylinder' },
];

describe('initSearchableCombobox', () => {
  let container;
  let api;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    api = initSearchableCombobox({
      container,
      options: SAMPLE_OPTIONS,
      inputId: 'test-combobox-input',
    });
  });

  afterEach(() => {
    api.destroy();
    container.remove();
  });

  // ── Structure tests ──────────────────────────────────────────────────────

  it('renders an input inside the container', () => {
    expect(getInput(container)).toBeTruthy();
  });

  it('renders a hidden listbox', () => {
    const list = getList(container);
    expect(list).toBeTruthy();
    expect(list.getAttribute('role')).toBe('listbox');
    expect(list.hidden).toBe(true);
  });

  it('sets role="combobox" on the input (via @github/combobox-nav)', () => {
    expect(getInput(container).getAttribute('role')).toBe('combobox');
  });

  it('links input to listbox via aria-controls', () => {
    const input = getInput(container);
    const list = getList(container);
    expect(input.getAttribute('aria-controls')).toBe(list.id);
  });

  it('assigns inputId to the input when provided', () => {
    expect(getInput(container).id).toBe('test-combobox-input');
  });

  // ── Open / close ─────────────────────────────────────────────────────────

  it('opens the list when input receives focus', () => {
    getInput(container).dispatchEvent(new Event('focus'));
    expect(getList(container).hidden).toBe(false);
  });

  it('sets aria-expanded="true" when list is open', () => {
    getInput(container).dispatchEvent(new Event('focus'));
    expect(getInput(container).getAttribute('aria-expanded')).toBe('true');
  });

  it('closes the list and sets aria-expanded="false" on Escape', () => {
    const input = getInput(container);
    input.dispatchEvent(new Event('focus'));
    expect(getList(container).hidden).toBe(false);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(getList(container).hidden).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  // ── Filtering ────────────────────────────────────────────────────────────

  it('shows all options when no filter is applied', () => {
    getInput(container).dispatchEvent(new Event('focus'));
    expect(getOptions(container).length).toBe(SAMPLE_OPTIONS.length);
  });

  it('filters options by case-insensitive substring', () => {
    const input = getInput(container);
    input.dispatchEvent(new Event('focus'));
    input.value = 'box';
    input.dispatchEvent(new Event('input'));

    const visible = getOptions(container);
    expect(visible.length).toBe(2);
    expect(visible.every((o) => o.textContent.toLowerCase().includes('box'))).toBe(true);
  });

  it('shows "No presets match" when filter yields no results', () => {
    const input = getInput(container);
    input.dispatchEvent(new Event('focus'));
    input.value = 'xyzzy_no_match';
    input.dispatchEvent(new Event('input'));

    const empty = container.querySelector('.preset-combobox-empty');
    expect(empty).toBeTruthy();
    expect(getOptions(container).length).toBe(0);
  });

  // ── "design default values" always first ─────────────────────────────────

  it('"design default values" option is always rendered first', () => {
    getInput(container).dispatchEvent(new Event('focus'));
    const opts = getOptions(container);
    expect(opts[0].dataset.value).toBe('__design_defaults__');
  });

  it('"design default values" renders in italic', () => {
    getInput(container).dispatchEvent(new Event('focus'));
    const first = getOptions(container)[0];
    expect(first.classList.contains('is-italic')).toBe(true);
    expect(first.querySelector('em')).toBeTruthy();
  });

  // ── Selection and change event ────────────────────────────────────────────

  it('fires a "change" CustomEvent when an option is committed', () => {
    const input = getInput(container);
    input.dispatchEvent(new Event('focus'));

    const changeHandler = vi.fn();
    container.addEventListener('change', changeHandler);

    const opts = getOptions(container);
    opts[1].dispatchEvent(
      new CustomEvent('combobox-commit', { bubbles: true, detail: {} })
    );

    expect(changeHandler).toHaveBeenCalledOnce();
    const detail = changeHandler.mock.calls[0][0].detail;
    expect(detail.value).toBe('preset-1');
    expect(detail.label).toBe('Wide Box');
  });

  it('closes the list after a commit', () => {
    const input = getInput(container);
    input.dispatchEvent(new Event('focus'));

    const opts = getOptions(container);
    opts[1].dispatchEvent(
      new CustomEvent('combobox-commit', { bubbles: true, detail: {} })
    );

    expect(getList(container).hidden).toBe(true);
  });

  it('updates input value to the committed option label', () => {
    const input = getInput(container);
    input.dispatchEvent(new Event('focus'));

    const opts = getOptions(container);
    opts[1].dispatchEvent(
      new CustomEvent('combobox-commit', { bubbles: true, detail: {} })
    );

    expect(input.value).toBe('Wide Box');
  });

  // ── getValue / setValue ───────────────────────────────────────────────────

  it('getValue() returns null before any selection', () => {
    expect(api.getValue()).toBeNull();
  });

  it('getValue() returns the selected ID after setValue()', () => {
    api.setValue('preset-2');
    expect(api.getValue()).toBe('preset-2');
  });

  it('setValue() updates the input text', () => {
    api.setValue('preset-3');
    expect(getInput(container).value).toBe('Tall Cylinder');
  });

  it('setValue(null) clears selection and input', () => {
    api.setValue('preset-1');
    api.setValue(null);
    expect(api.getValue()).toBeNull();
    expect(getInput(container).value).toBe('');
  });

  // ── update() ─────────────────────────────────────────────────────────────

  it('update() replaces the option list', () => {
    api.update([{ id: 'new-1', label: 'Alpha' }, { id: 'new-2', label: 'Beta' }], null);
    getInput(container).dispatchEvent(new Event('focus'));
    const opts = getOptions(container);
    expect(opts.length).toBe(2);
    expect(opts[0].textContent).toBe('Alpha');
  });

  it('update() restores the selected label in the input', () => {
    api.update(SAMPLE_OPTIONS, 'preset-2');
    expect(getInput(container).value).toBe('Narrow Box');
    expect(api.getValue()).toBe('preset-2');
  });

  // ── setDisabled() ─────────────────────────────────────────────────────────

  it('setDisabled(true) disables the input', () => {
    api.setDisabled(true);
    expect(getInput(container).disabled).toBe(true);
  });

  it('setDisabled(true) adds is-disabled class to container', () => {
    api.setDisabled(true);
    expect(container.classList.contains('is-disabled')).toBe(true);
  });

  it('setDisabled(false) re-enables the input', () => {
    api.setDisabled(true);
    api.setDisabled(false);
    expect(getInput(container).disabled).toBe(false);
  });

  // ── ARIA attributes ───────────────────────────────────────────────────────

  it('each option has a stable id matching preset-opt-{id}', () => {
    getInput(container).dispatchEvent(new Event('focus'));
    const opts = getOptions(container);
    for (const opt of opts) {
      expect(opt.id).toBe(`preset-opt-${opt.dataset.value}`);
    }
  });

  it('selected option has aria-selected="true"', () => {
    api.setValue('preset-1');
    getInput(container).dispatchEvent(new Event('focus'));
    const opts = getOptions(container);
    const selected = opts.find((o) => o.dataset.value === 'preset-1');
    expect(selected?.getAttribute('aria-selected')).toBe('true');
  });

  it('non-selected options have aria-selected="false"', () => {
    api.setValue('preset-1');
    getInput(container).dispatchEvent(new Event('focus'));
    const opts = getOptions(container);
    const others = opts.filter((o) => o.dataset.value !== 'preset-1');
    expect(others.every((o) => o.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  // ── destroy() ────────────────────────────────────────────────────────────

  it('destroy() empties the container', () => {
    api.destroy();
    expect(container.innerHTML).toBe('');
  });
});
