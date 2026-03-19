/**
 * Shared Dialog Utilities
 * Accessible confirmation and missing-dependencies dialogs used across modules.
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
 * @returns {Promise<boolean>} True if confirmed, false if cancelled
 */
export function showConfirmDialog(
  message,
  title = 'Confirm Action',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  { destructive = false } = {}
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
          <h3 id="confirmDialogTitle" class="preset-modal-title">${title}</h3>
        </div>
        <div class="confirm-modal-body">
          <p id="confirmDialogMessage">${message}</p>
        </div>
        <div class="preset-form-actions">
          <button type="button" class="btn btn-secondary" data-action="cancel">${cancelLabel}</button>
          <button type="button" class="${confirmBtnClass}" data-action="confirm">${confirmLabel}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const cleanup = (result) => {
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
      focusTarget: modal.querySelector('[data-action="cancel"]'),
    });
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
