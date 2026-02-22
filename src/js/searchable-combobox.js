/**
 * SearchableCombobox — WAI-ARIA combobox widget with keyboard navigation.
 *
 * Pattern: W3C APG "List Autocomplete with Manual Selection"
 * https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/
 *
 * Keyboard navigation delegated to @github/combobox-nav (MIT).
 * Fires `combobox-commit` on the list element when a user confirms a selection;
 * this module re-emits a `change` CustomEvent on the container.
 *
 * @license GPL-3.0-or-later
 */

import Combobox from '@github/combobox-nav';

/**
 * @typedef {Object} ComboboxOption
 * @property {string} id - Stable unique identifier (used in aria IDs and data-value)
 * @property {string} label - Display text
 * @property {boolean} [italic] - Render label in italic (e.g. "design default values")
 */

/**
 * @typedef {Object} ComboboxAPI
 * @property {function(ComboboxOption[], string|null): void} update - Replace options and set selected ID
 * @property {function(): string|null} getValue - Get the currently selected ID
 * @property {function(string|null): void} setValue - Set selected ID programmatically (no change event)
 * @property {function(boolean): void} setDisabled - Enable or disable the widget
 * @property {function(): void} destroy - Remove all listeners and empty the container
 */

/**
 * Initialize a searchable combobox inside the given container element.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.container - Host element (will be emptied and populated)
 * @param {ComboboxOption[]} [opts.options] - Initial option list
 * @param {string} [opts.placeholder] - Input placeholder text
 * @param {string} [opts.inputId] - id attribute for the input (for <label> association)
 * @param {boolean} [opts.disabled] - Start in disabled state
 * @returns {ComboboxAPI}
 */
export function initSearchableCombobox({
  container,
  options: initialOptions = [],
  placeholder = 'Search or select…',
  inputId = '',
  disabled = false,
}) {
  // ── DOM skeleton ────────────────────────────────────────────────────────────

  container.classList.add('preset-combobox');

  const inputWrap = document.createElement('div');
  inputWrap.className = 'preset-combobox-input-wrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'preset-combobox-input';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (inputId) input.id = inputId;

  const chevronBtn = document.createElement('button');
  chevronBtn.type = 'button';
  chevronBtn.className = 'preset-combobox-chevron';
  chevronBtn.setAttribute('aria-label', 'Open preset list');
  chevronBtn.setAttribute('tabindex', '-1');
  chevronBtn.setAttribute('aria-hidden', 'true');
  chevronBtn.innerHTML =
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<polyline points="2,4 6,8 10,4"></polyline></svg>';

  inputWrap.appendChild(input);
  inputWrap.appendChild(chevronBtn);

  // Listbox — needs a stable, non-empty id for aria-controls
  const list = document.createElement('ul');
  list.className = 'preset-combobox-list';
  list.setAttribute('role', 'listbox');
  list.id = inputId
    ? `${inputId}-list`
    : `preset-combobox-list-${Math.random().toString(36).slice(2, 8)}`;
  list.hidden = true;

  // Screen-reader live region for filter status
  const srStatus = document.createElement('div');
  srStatus.className = 'sr-only';
  srStatus.setAttribute('role', 'status');
  srStatus.setAttribute('aria-live', 'polite');
  srStatus.setAttribute('aria-atomic', 'true');

  container.appendChild(inputWrap);
  container.appendChild(list);
  container.appendChild(srStatus);

  // ── State ────────────────────────────────────────────────────────────────────

  /** @type {ComboboxOption[]} */
  let allOptions = [];
  let selectedId = null;
  let isOpen = false;

  // ── @github/combobox-nav integration ────────────────────────────────────────

  const comboNav = new Combobox(input, list, {
    tabInsertsSuggestions: true,
    firstOptionSelectionMode: 'none',
  });

  // combobox-nav sets role="combobox" on the input; add aria-controls manually
  // (combobox-nav already sets aria-controls in its constructor via list.id)
  input.setAttribute('aria-controls', list.id);

  // ── Render helpers ───────────────────────────────────────────────────────────

  function renderOptions(filterTerm) {
    list.innerHTML = '';
    const term = (filterTerm || '').trim().toLowerCase();
    const visible = term
      ? allOptions.filter((o) => o.label.toLowerCase().includes(term))
      : allOptions;

    if (visible.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'preset-combobox-empty';
      empty.setAttribute('role', 'option');
      empty.setAttribute('aria-disabled', 'true');
      empty.textContent = term ? 'No presets match' : 'No presets available';
      list.appendChild(empty);
      srStatus.textContent = term
        ? `No presets match "${filterTerm}"`
        : 'No presets available';
      return;
    }

    for (const opt of visible) {
      const li = document.createElement('li');
      li.className = 'preset-combobox-option';
      if (opt.italic) li.classList.add('is-italic');
      li.setAttribute('role', 'option');
      li.id = `preset-opt-${opt.id}`;
      li.dataset.value = opt.id;
      const isSel = opt.id === selectedId;
      li.setAttribute('aria-selected', isSel ? 'true' : 'false');
      if (isSel) li.classList.add('is-selected');

      if (opt.italic) {
        const em = document.createElement('em');
        em.textContent = opt.label;
        li.appendChild(em);
      } else {
        li.textContent = opt.label;
      }

      list.appendChild(li);
    }

    if (term) {
      srStatus.textContent = `${visible.length} of ${allOptions.length} presets match`;
    } else {
      srStatus.textContent = '';
    }
  }

  function getLabelForId(id) {
    const found = allOptions.find((o) => o.id === id);
    return found ? found.label : '';
  }

  // ── Open / close ─────────────────────────────────────────────────────────────

  function openList() {
    if (isOpen || input.disabled) return;
    isOpen = true;
    list.hidden = false;
    chevronBtn.classList.add('is-open');
    container.classList.add('is-open');
    comboNav.start();
    renderOptions(input.value);
  }

  function closeList(keepFilter = false) {
    if (!isOpen) return;
    isOpen = false;
    list.hidden = true;
    chevronBtn.classList.remove('is-open');
    container.classList.remove('is-open');
    comboNav.stop();
    if (!keepFilter) {
      // Restore the selected label; blank if nothing is selected
      input.value = getLabelForId(selectedId);
    }
    srStatus.textContent = '';
  }

  // ── Selection ────────────────────────────────────────────────────────────────

  function selectOption(id) {
    const found = allOptions.find((o) => o.id === id);
    if (!found) return;
    selectedId = id;
    input.value = found.label;
    closeList(false);
    container.dispatchEvent(
      new CustomEvent('change', {
        bubbles: true,
        detail: { value: id, label: found.label },
      })
    );
  }

  // ── Event wiring ─────────────────────────────────────────────────────────────

  input.addEventListener('focus', () => {
    if (!isOpen) openList();
  });

  input.addEventListener('click', () => {
    if (!isOpen) openList();
  });

  chevronBtn.addEventListener('mousedown', (e) => {
    // Prevent input blur before click fires
    e.preventDefault();
  });
  chevronBtn.addEventListener('click', () => {
    if (isOpen) {
      closeList();
    } else {
      openList();
    }
    input.focus();
  });

  input.addEventListener('input', () => {
    if (!isOpen) openList();
    renderOptions(input.value);
    comboNav.resetSelection();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isOpen) {
        closeList();
        e.stopPropagation();
      }
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !isOpen) {
      openList();
    }
  });

  // combobox-nav fires 'combobox-commit' on the list item when Enter/click selects
  list.addEventListener('combobox-commit', (e) => {
    const target =
      e.target instanceof Element ? e.target.closest('[role="option"]') : null;
    if (target && target.dataset.value) {
      selectOption(target.dataset.value);
    }
  });

  // Reset filter text to current selection label if focus leaves without commit
  input.addEventListener('blur', (e) => {
    // Delay to allow click events on list items to fire first
    setTimeout(() => {
      if (!container.contains(document.activeElement)) {
        closeList();
      }
    }, 150);
  });

  function handleOutsideClick(e) {
    if (!container.contains(e.target)) {
      closeList();
    }
  }
  document.addEventListener('click', handleOutsideClick, true);

  // Close when parent <details> closes (details toggle event bubbles up)
  function handleDetailsToggle(e) {
    const details = e.target;
    if (details.tagName === 'DETAILS' && !details.open && isOpen) {
      closeList();
    }
  }
  container.closest('details')?.addEventListener('toggle', handleDetailsToggle);

  // ── Public API ───────────────────────────────────────────────────────────────

  function update(newOptions, newSelectedId) {
    allOptions = Array.isArray(newOptions) ? newOptions : [];
    selectedId = newSelectedId ?? null;
    input.value = getLabelForId(selectedId);
    if (isOpen) renderOptions(input.value);
  }

  function getValue() {
    return selectedId;
  }

  function setValue(id) {
    const found = id != null ? allOptions.find((o) => o.id === id) : null;
    selectedId = found ? id : null;
    input.value = getLabelForId(selectedId);
    if (isOpen) renderOptions(input.value);
  }

  function setDisabled(dis) {
    input.disabled = !!dis;
    chevronBtn.disabled = !!dis;
    container.classList.toggle('is-disabled', !!dis);
    if (dis && isOpen) closeList();
  }

  function destroy() {
    document.removeEventListener('click', handleOutsideClick, true);
    comboNav.destroy();
    container.innerHTML = '';
    container.classList.remove('preset-combobox', 'is-open', 'is-disabled');
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  update(initialOptions, null);
  setDisabled(disabled);

  return { update, getValue, setValue, setDisabled, destroy };
}
