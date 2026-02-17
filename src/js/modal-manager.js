/**
 * Modal Manager - Consistent focus management for accessible modals
 * Implements WCAG 2.2 SC 2.4.11 (Focus Not Obscured) and focus trapping
 * @license GPL-3.0-or-later
 */

import { createFocusTrap, getFocusableElements } from './focus-trap.js';

/**
 * Modal state storage
 * @type {Map<HTMLElement, {trigger: HTMLElement|null, focusTrap: Object}>}
 */
const modalStates = new Map();
let bodyOverflowBefore = null;

/**
 * Open a modal with proper focus management
 * @param {HTMLElement} modal - Modal element to open
 * @param {Object} [options] - Options
 * @param {HTMLElement} [options.focusTarget] - Element to focus on open (defaults to first focusable)
 * @param {Function} [options.onClose] - Callback when modal is closed
 * @returns {void}
 */
export function openModal(modal, options = {}) {
  if (!modal) return;

  // Store trigger for focus restoration
  const trigger = document.activeElement;

  // Create focus trap using shared utility
  const focusTrap = createFocusTrap(modal);

  // Store state
  modalStates.set(modal, {
    trigger,
    focusTrap,
    onClose: options.onClose || null,
  });

  // Show modal
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  // Activate focus trap with initial focus
  focusTrap.activate({
    initialFocus: options.focusTarget || getFocusableElements(modal)[0],
  });

  // Prevent body scroll (optional)
  if (modalStates.size === 1) {
    bodyOverflowBefore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
}

/**
 * Close a modal with proper focus restoration
 * @param {HTMLElement} modal - Modal element to close
 * @returns {void}
 */
export function closeModal(modal) {
  if (!modal) return;

  const state = modalStates.get(modal);

  // Hide modal
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');

  if (state) {
    // Deactivate focus trap
    state.focusTrap.deactivate();

    // Restore focus to trigger
    if (state.trigger && typeof state.trigger.focus === 'function') {
      state.trigger.focus();
    }

    // Call onClose callback
    if (state.onClose) {
      state.onClose();
    }

    // Clean up state
    modalStates.delete(modal);
  }

  // Restore body scroll if no other modals are open
  if (modalStates.size === 0) {
    document.body.style.overflow = bodyOverflowBefore ?? '';
    bodyOverflowBefore = null;
  }
}

/**
 * Setup standard modal close behaviors
 * @param {HTMLElement} modal - Modal element
 * @param {Object} [selectors] - CSS selectors for close triggers
 * @param {string} [selectors.closeButton] - Selector for close button(s)
 * @param {string} [selectors.overlay] - Selector for overlay click area
 */
export function setupModalCloseHandlers(modal, selectors = {}) {
  const { closeButton = '.modal-close', overlay = '.modal-overlay' } =
    selectors;

  // Close button(s)
  modal.querySelectorAll(closeButton).forEach((btn) => {
    btn.addEventListener('click', () => closeModal(modal));
  });

  // Overlay click
  const overlayEl = modal.querySelector(overlay);
  if (overlayEl) {
    overlayEl.addEventListener('click', () => closeModal(modal));
  }

  // Escape key (additional handler at modal level)
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal(modal);
    }
  });
}

/**
 * Initialize all static modals in the document
 * Call this after DOM is ready for modals that exist in HTML
 */
export function initStaticModals() {
  // Render Queue Modal
  const queueModal = document.getElementById('renderQueueModal');
  if (queueModal) {
    setupModalCloseHandlers(queueModal, {
      closeButton: '#queueModalClose',
      overlay: '#queueModalOverlay',
    });
  }

  // Source Viewer Modal
  const sourceModal = document.getElementById('sourceViewerModal');
  if (sourceModal) {
    setupModalCloseHandlers(sourceModal, {
      closeButton: '#sourceViewerClose',
      overlay: '#sourceViewerOverlay',
    });
  }

  // Params JSON Modal
  const paramsModal = document.getElementById('paramsJsonModal');
  if (paramsModal) {
    setupModalCloseHandlers(paramsModal, {
      closeButton: '#paramsJsonClose',
      overlay: '#paramsJsonOverlay',
    });
  }

  // Features Guide Modal
  const featuresModal = document.getElementById('featuresGuideModal');
  if (featuresModal) {
    setupModalCloseHandlers(featuresModal, {
      closeButton: '#featuresGuideClose',
      overlay: '#featuresGuideOverlay',
    });
  }

  // Reset Confirmation Modal
  const resetModal = document.getElementById('resetConfirmModal');
  if (resetModal) {
    setupModalCloseHandlers(resetModal, {
      closeButton: '#resetConfirmClose',
      overlay: '#resetConfirmOverlay',
    });
  }

  // First-Visit Modal
  const firstVisitModal = document.getElementById('first-visit-modal');
  if (firstVisitModal) {
    // No default close handlers for first-visit modal.
    // It must be closed explicitly after user consent.
  }
}

/**
 * Check if any modal is currently open
 * @returns {boolean}
 */
export function isAnyModalOpen() {
  return modalStates.size > 0;
}

/**
 * Get the currently focused modal (if any)
 * @returns {HTMLElement|null}
 */
export function getActiveModal() {
  // Return the most recently opened modal
  const entries = Array.from(modalStates.entries());
  return entries.length > 0 ? entries[entries.length - 1][0] : null;
}

/**
 * Create a modal element with consistent structure and behavior
 * @param {Object} options - Modal configuration
 * @param {string} options.className - CSS class for the modal
 * @param {string} options.ariaLabel - ARIA label for the modal
 * @param {string} options.titleId - ID for the title element (for aria-labelledby)
 * @param {string} options.title - Title text
 * @param {string} options.content - HTML content for the modal body
 * @param {Array<{label: string, className: string, action: string, disabled?: boolean}>} [options.buttons] - Button configuration
 * @param {boolean} [options.showCloseButton=true] - Whether to show X close button
 * @param {boolean} [options.closeOnBackdrop=true] - Whether clicking backdrop closes modal
 * @param {boolean} [options.closeOnEscape=true] - Whether Escape key closes modal
 * @returns {{modal: HTMLElement, promise: Promise<string|null>, cleanup: Function}}
 */
export function createModal(options) {
  const {
    className = 'preset-modal',
    ariaLabel,
    titleId,
    title,
    content,
    buttons = [],
    showCloseButton = true,
    closeOnBackdrop = true,
    closeOnEscape = true,
  } = options;

  const modal = document.createElement('div');
  modal.className = className;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  if (ariaLabel) {
    modal.setAttribute('aria-label', ariaLabel);
  }
  if (titleId) {
    modal.setAttribute('aria-labelledby', titleId);
  }

  const closeButtonHtml = showCloseButton
    ? '<button class="preset-modal-close" aria-label="Close dialog">&times;</button>'
    : '';

  const buttonsHtml = buttons
    .map(
      (btn) =>
        `<button type="button" class="${btn.className}" data-action="${btn.action}" ${btn.disabled ? 'disabled' : ''}>${btn.label}</button>`
    )
    .join('');

  modal.innerHTML = `
    <div class="preset-modal-content ${options.contentClass || ''}">
      <div class="preset-modal-header">
        <h3 id="${titleId}" class="preset-modal-title">${title}</h3>
        ${closeButtonHtml}
      </div>
      <div class="modal-body">
        ${content}
      </div>
      ${buttons.length > 0 ? `<div class="preset-modal-footer">${buttonsHtml}</div>` : ''}
    </div>
  `;

  document.body.appendChild(modal);

  // Create promise that resolves when modal closes
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const cleanup = (result = null) => {
    closeModal(modal);
    document.body.removeChild(modal);
    resolvePromise(result);
  };

  // Handle button clicks
  if (buttons.length > 0) {
    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      cleanup(btn.dataset.action);
    });
  }

  // Handle close button
  if (showCloseButton) {
    const closeBtn = modal.querySelector('.preset-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => cleanup(null));
    }
  }

  // Handle backdrop click
  if (closeOnBackdrop) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup(null);
      }
    });
  }

  // Handle Escape key
  if (closeOnEscape) {
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(null);
      }
    });
  }

  return { modal, promise, cleanup };
}
