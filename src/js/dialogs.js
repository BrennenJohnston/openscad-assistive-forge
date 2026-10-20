/**
 * Shared Dialog Utilities
 * The app's own question dialogs, used across modules in place of the
 * browser's confirm(), prompt() and alert(): those block the page, ignore the
 * theme and high contrast, and return focus wherever the browser chooses.
 * @license GPL-3.0-or-later
 */

import { openModal, closeModal } from './modal-manager.js';
import { escapeHtml } from './html-utils.js';

/**
 * Show an accessible confirmation dialog (WCAG COGA compliant)
 * Prevents accidental destructive actions by requiring explicit confirmation
 * @param {string} message - Confirmation message
 * @param {string} [title='Confirm Action'] - Dialog title
 * @param {string} [confirmLabel='Confirm'] - Label for confirm button
 * @param {string} [cancelLabel='Cancel'] - Label for cancel button
 * @param {Object} [options]
 * @param {boolean} [options.destructive=false] - Show the confirm button as a
 *   danger action
 * @param {boolean} [options.focusConfirm=false] - Open on the confirm button
 *   instead of Cancel, for a question whose cancel is the answer that throws
 *   work away
 * @param {(confirmed: boolean) => HTMLElement|null} [options.returnFocus] -
 *   Where focus goes on closing, by the answer, for a question whose yes
 *   removes the control that asked it (else focus goes back to that control)
 * @returns {Promise<boolean>} True if confirmed, false if canceled
 */
export function showConfirmDialog(
  message,
  title = 'Confirm Action',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  { destructive = false, focusConfirm = false, returnFocus = null } = {}
) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'preset-modal confirm-modal';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-labelledby', 'confirmDialogTitle');
    modal.setAttribute('aria-describedby', 'confirmDialogMessage');
    modal.setAttribute('aria-modal', 'true');

    const confirmBtnClass = destructive ? 'btn btn-danger' : 'btn btn-primary';

    modal.innerHTML = `
      <div class="preset-modal-content confirm-modal-content">
        <div class="preset-modal-header">
          <h3 id="confirmDialogTitle" class="preset-modal-title">${escapeHtml(title)}</h3>
        </div>
        <div class="confirm-modal-body">
          <p id="confirmDialogMessage">${escapeHtml(message)}</p>
        </div>
        <div class="preset-form-actions">
          <button type="button" class="btn btn-secondary" data-action="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="${confirmBtnClass}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    let answer = false;
    const cleanup = (result) => {
      answer = result;
      closeModal(modal);
      document.body.removeChild(modal);
      resolve(result);
    };

    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      if (btn.dataset.action === 'confirm') {
        cleanup(true);
      } else if (btn.dataset.action === 'cancel') {
        cleanup(false);
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup(false);
      }
    });

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(false);
      }
    });

    openModal(modal, {
      focusTarget: modal.querySelector(
        focusConfirm ? '[data-action="confirm"]' : '[data-action="cancel"]'
      ),
      ...(returnFocus ? { returnFocus: () => returnFocus(answer) } : {}),
    });
  });
}

/**
 * Ask for one line of text, the app's answer to prompt(). The field has a
 * visible label and opens with its starting text selected, so typing
 * replaces it; Enter sends the form, Escape cancels.
 * @param {string} message - What the question is about
 * @param {Object} [options]
 * @param {string} [options.title='Enter a name'] - Dialog title
 * @param {string} [options.label='Name'] - The field's visible label
 * @param {string} [options.defaultValue=''] - The field's starting text
 * @param {string} [options.confirmLabel='OK'] - Label for the confirm button
 * @param {string} [options.cancelLabel='Cancel'] - Label for the cancel button
 * @returns {Promise<string|null>} The trimmed text, or null if canceled
 */
export function showPromptDialog(
  message,
  {
    title = 'Enter a name',
    label = 'Name',
    defaultValue = '',
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
  } = {}
) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'preset-modal confirm-modal prompt-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'promptDialogTitle');
    if (message) {
      modal.setAttribute('aria-describedby', 'promptDialogMessage');
    }
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="preset-modal-content confirm-modal-content">
        <div class="preset-modal-header">
          <h3 id="promptDialogTitle" class="preset-modal-title">${escapeHtml(title)}</h3>
        </div>
        <form class="prompt-modal-form" novalidate>
          <div class="confirm-modal-body">
            ${message ? `<p id="promptDialogMessage">${escapeHtml(message)}</p>` : ''}
            <div class="preset-form-group">
              <label for="promptDialogInput" class="preset-form-label">${escapeHtml(label)}</label>
              <input type="text" id="promptDialogInput" class="preset-form-input" autocomplete="off" />
            </div>
          </div>
          <div class="preset-form-actions">
            <button type="button" class="btn btn-secondary" data-action="cancel">${escapeHtml(cancelLabel)}</button>
            <button type="submit" class="btn btn-primary" data-action="confirm">${escapeHtml(confirmLabel)}</button>
          </div>
        </form>
      </div>
    `;

    const field = modal.querySelector('#promptDialogInput');
    field.value = defaultValue;
    document.body.appendChild(modal);

    let closed = false;
    const cleanup = (result) => {
      if (closed) return;
      closed = true;
      closeModal(modal);
      modal.remove();
      resolve(result);
    };

    modal.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      cleanup(field.value.trim());
    });

    modal.addEventListener('click', (e) => {
      if (
        e.target.closest('button[data-action="cancel"]') ||
        e.target === modal
      ) {
        cleanup(null);
      }
    });

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(null);
      }
    });

    openModal(modal, { focusTarget: field });
    field.select();
  });
}

/**
 * Hand over text the browser would not copy: a read-only field holding it,
 * selected whenever it takes focus, and a Copy button that asks the
 * clipboard once more. Stands in for prompt(label, text), the old way to put
 * a copyable string in front of someone.
 * @param {string} text - The text to copy
 * @param {Object} [options]
 * @param {string} [options.title='Copy by hand'] - Dialog title
 * @param {string} [options.message] - The sentence above the field
 * @returns {Promise<boolean>} True if the Copy button reached the clipboard,
 *   false if the dialog was closed
 */
export function showTextToCopyDialog(
  text,
  {
    title = 'Copy by hand',
    message = 'The browser did not allow copying. Select the text below and copy it.',
  } = {}
) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'preset-modal confirm-modal copy-text-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'copyTextDialogTitle');
    modal.setAttribute('aria-describedby', 'copyTextDialogMessage');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="preset-modal-content confirm-modal-content">
        <div class="preset-modal-header">
          <h3 id="copyTextDialogTitle" class="preset-modal-title">${escapeHtml(title)}</h3>
        </div>
        <div class="confirm-modal-body">
          <p id="copyTextDialogMessage">${escapeHtml(message)}</p>
          <div class="preset-form-group">
            <label for="copyTextDialogField" class="preset-form-label">Text to copy</label>
            <textarea id="copyTextDialogField" class="preset-form-textarea" readonly></textarea>
          </div>
          <p class="copy-text-modal-status" role="status"></p>
        </div>
        <div class="preset-form-actions">
          <button type="button" class="btn btn-secondary" data-action="close">Close</button>
          <button type="button" class="btn btn-primary" data-action="copy">Copy</button>
        </div>
      </div>
    `;

    const field = modal.querySelector('#copyTextDialogField');
    const status = modal.querySelector('[role="status"]');
    field.value = text;
    field.addEventListener('focus', () => field.select());
    document.body.appendChild(modal);

    let closed = false;
    const cleanup = (result) => {
      if (closed) return;
      closed = true;
      closeModal(modal);
      modal.remove();
      resolve(result);
    };

    const copyAgain = async () => {
      try {
        await navigator.clipboard.writeText(text);
        cleanup(true);
      } catch (_err) {
        status.textContent =
          'Still not allowed. The text is selected: copy it with Ctrl+C, or Command+C on a Mac.';
        field.focus();
        field.select();
      }
    };

    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (btn?.dataset.action === 'copy') {
        copyAgain();
      } else if (btn?.dataset.action === 'close' || e.target === modal) {
        cleanup(false);
      }
    });

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(false);
      }
    });

    openModal(modal, { focusTarget: field });
    field.select();
  });
}

/**
 * Show missing dependencies dialog with options to cancel, continue, or add files.
 * @param {{ includes: string[], uses: string[], imports: string[] }} missing
 * @param {string} packageName
 * @returns {Promise<{ action: 'cancel'|'continue'|'add-files', addedFiles?: Map<string,string> }>}
 */
export function showMissingDependenciesDialog(missing, packageName) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'preset-modal missing-deps-modal';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-labelledby', 'missingDepsTitle');
    modal.setAttribute('aria-describedby', 'missingDepsList');
    modal.setAttribute('aria-modal', 'true');

    const allMissing = [
      ...missing.includes.map((f) => ({ file: f, type: 'include' })),
      ...missing.uses.map((f) => ({ file: f, type: 'use' })),
      ...missing.imports.map((f) => ({ file: f, type: 'import' })),
    ];

    const fileListHtml = allMissing
      .map(
        ({ file, type }) =>
          `<li class="missing-dep-item" data-file="${escapeHtml(file)}">
            <span class="missing-dep-file">${escapeHtml(file)}</span>
            <span class="missing-dep-type">(${type})</span>
          </li>`
      )
      .join('');

    modal.innerHTML = `
      <div class="preset-modal-content missing-deps-content">
        <div class="preset-modal-header">
          <h3 id="missingDepsTitle" class="preset-modal-title">
            \u26A0\uFE0F Missing Files Detected
          </h3>
        </div>
        <div class="missing-deps-body">
          <p>
            The design package <strong>"${escapeHtml(packageName)}"</strong>
            references files that weren't included:
          </p>
          <ul id="missingDepsList" class="missing-deps-list" aria-label="Missing files">
            ${fileListHtml}
          </ul>
          <p class="missing-deps-hint">
            You can add the missing files now, continue without them, or cancel.
          </p>
          <input type="file" class="missing-deps-file-input" multiple
                 accept=".scad,.txt,.csv,.dat,.json,.dxf,.svg,.stl,.png,.jpg"
                 aria-label="Select missing dependency files" hidden />
          <div class="missing-deps-added hidden" aria-live="polite">
            <span class="missing-deps-added-count"></span>
          </div>
        </div>
        <div class="preset-form-actions missing-deps-actions">
          <button type="button" class="btn btn-secondary" data-action="cancel">
            Cancel Upload
          </button>
          <button type="button" class="btn btn-secondary" data-action="continue">
            Continue Anyway
          </button>
          <button type="button" class="btn btn-primary" data-action="add-files">
            Add Missing Files\u2026
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const fileInput = modal.querySelector('.missing-deps-file-input');
    const addedDisplay = modal.querySelector('.missing-deps-added');
    const addedCount = modal.querySelector('.missing-deps-added-count');
    const addedFiles = new Map();

    const cleanup = (result) => {
      closeModal(modal);
      document.body.removeChild(modal);
      resolve(result);
    };

    const addFilesBtn = modal.querySelector('[data-action="add-files"]');
    const continueBtn = modal.querySelector('[data-action="continue"]');
    const titleEl = modal.querySelector('#missingDepsTitle');
    const hintEl = modal.querySelector('.missing-deps-hint');

    const updateAddedDisplay = () => {
      if (addedFiles.size === 0) return;

      addedDisplay.classList.remove('hidden');
      addedCount.textContent = `${addedFiles.size} file${addedFiles.size > 1 ? 's' : ''} added: ${Array.from(addedFiles.keys()).join(', ')}`;

      const items = modal.querySelectorAll('.missing-dep-item');
      let resolvedCount = 0;
      items.forEach((item) => {
        const fileName = item.dataset.file;
        const baseName = fileName.split('/').pop();
        const resolved = addedFiles.has(fileName) || addedFiles.has(baseName);
        item.classList.toggle('missing-dep-resolved', resolved);
        if (resolved) resolvedCount++;
      });

      const allResolved = resolvedCount === allMissing.length;

      if (allResolved) {
        titleEl.textContent = '\u2705 All Files Added';
        hintEl.textContent =
          'All missing files have been provided. You can now load the project.';
        hintEl.style.borderLeftColor = 'var(--color-success, #38a169)';
        hintEl.style.background =
          'color-mix(in srgb, var(--color-success, #38a169) 12%, transparent)';

        continueBtn.textContent = 'Load Project';
        continueBtn.className = 'btn btn-success';
        addFilesBtn.className = 'btn btn-secondary';
        addFilesBtn.textContent = 'Add More Files\u2026';
        continueBtn.focus();
      } else {
        const remaining = allMissing.length - resolvedCount;
        hintEl.textContent = `${resolvedCount} of ${allMissing.length} resolved. ${remaining} file${remaining > 1 ? 's' : ''} still missing.`;

        continueBtn.textContent = 'Continue Anyway';
        continueBtn.className = 'btn btn-secondary';
        addFilesBtn.className = 'btn btn-primary';
        addFilesBtn.textContent = 'Add Missing Files\u2026';
      }
    };

    fileInput.addEventListener('change', async () => {
      const selectedFiles = fileInput.files;
      if (!selectedFiles || selectedFiles.length === 0) return;

      for (const f of selectedFiles) {
        try {
          const text = await f.text();
          addedFiles.set(f.name, text);
        } catch (_e) {
          console.warn(`[MissingDeps] Could not read file: ${f.name}`);
        }
      }
      updateAddedDisplay();
      fileInput.value = '';
    });

    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      if (btn.dataset.action === 'add-files') {
        fileInput.click();
      } else if (btn.dataset.action === 'continue') {
        if (addedFiles.size > 0) {
          cleanup({ action: 'add-files', addedFiles });
        } else {
          cleanup({ action: 'continue' });
        }
      } else if (btn.dataset.action === 'cancel') {
        cleanup({ action: 'cancel' });
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup({ action: 'cancel' });
      }
    });

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup({ action: 'cancel' });
      }
    });

    openModal(modal, {
      focusTarget: modal.querySelector('[data-action="add-files"]'),
    });
  });
}
