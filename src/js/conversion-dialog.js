/**
 * The conversion dialog (DP-52 P2): a picture is being converted, here is the
 * stage it has reached, and here is Cancel.
 *
 * I asked for this after hitting "Page Unresponsive" while a logo converted:
 * a new person takes a page that has stopped answering for a program that has
 * frozen, and there was nothing on screen that said "this is under way, and
 * the rest of the page is unavailable until it is done". The dialog says
 * exactly that, in markup as well as words: the page behind it is `inert`
 * for the dialog's life, the dialog is `aria-modal`, and Cancel has focus.
 *
 * Accessibility, deliberately:
 *
 *   - Built on the shared focus trap, with the same overlay and content
 *     classes as the app's other dialogs, so it looks and behaves like one of
 *     them. Focus goes back to where it was when the dialog closes - ONCE,
 *     synchronously. The modal manager's own close re-asserts its trigger 50
 *     ms and a frame later (a WebKit repair), and MEASURED here that stole
 *     focus from the drawing editor, which opens the moment this closes and
 *     puts focus on its own title.
 *   - `inert` on the app root is what "the other features are unavailable"
 *     means to assistive technology, not only to a pointer. The tutorial
 *     already uses the attribute; the focus trap is the fallback where a
 *     browser lacks it.
 *   - The app's own live region lives INSIDE the app root, which is inert
 *     while this is open, so the one sentence spoken on open goes through a
 *     status region of the dialog's own. The stage sentence is visible and
 *     is not announced (DP-32: one action, one announcement); completion and
 *     cancel are spoken by the host after the dialog has closed and the page
 *     is live again.
 *   - A native <progress>, named by the heading through aria-labelledby (a
 *     <label for> pointing at a <progress> reaches the tree with no name in
 *     Chromium - the same repair trace-progress.js made). Indeterminate
 *     inside a stage, a value across the stages, where the count is known.
 *   - Cancel is the only button, at least 44 px, and is where focus lands.
 *   - Reduced motion: the bar shares the trace bar's classes, whose sweep is
 *     slowed and dimmed under the preference rather than removed.
 *
 * @license GPL-3.0-or-later
 */

import { createFocusTrap } from './focus-trap.js';

/** What each stage is called, for the person watching. */
export const CONVERSION_STAGE_TEXT = Object.freeze({
  reading: 'Reading the picture',
  ink: 'Finding the ink',
  tracing: 'Tracing the shapes',
  preparing: 'Preparing the drawing',
  updating: 'Updating the charm',
});

let dialogSeq = 0;

/**
 * @param {object} deps
 * @param {Function} deps.onCancel - The person pressed Cancel
 * @param {Object<string,string>} [deps.stageText] - Overrides for the stage
 *   sentences; the Edit Drawing door has no charm to update, so its last
 *   stage says what it does instead
 * @param {HTMLElement} [deps.inertRoot] - What to make inert while open;
 *   defaults to the app root, found at open time
 * @returns {{root: HTMLElement, open: Function, stage: Function, close: Function, isOpen: Function, destroy: Function}}
 */
export function createConversionDialog({
  onCancel,
  stageText = {},
  inertRoot = null,
} = {}) {
  const id = `conversion-dialog-${++dialogSeq}`;
  const text = { ...CONVERSION_STAGE_TEXT, ...stageText };

  const root = document.createElement('div');
  root.className = 'modal conversion-dialog hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', `${id}-title`);
  root.setAttribute('aria-hidden', 'true');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  // Decoration only: a click outside does not cancel a conversion, because
  // a stray click must not throw away a wait somebody chose to sit through.
  overlay.setAttribute('aria-hidden', 'true');

  const content = document.createElement('div');
  content.className = 'modal-content modal-small conversion-dialog-content';

  const title = document.createElement('h2');
  title.id = `${id}-title`;
  title.className = 'conversion-dialog-title';
  title.textContent = 'Converting your picture';

  const bar = document.createElement('progress');
  bar.className = 'trace-progress-bar conversion-dialog-bar';
  bar.id = `${id}-bar`;
  bar.setAttribute('aria-labelledby', title.id);

  const stage = document.createElement('p');
  stage.className = 'trace-progress-stage conversion-dialog-stage';
  stage.id = `${id}-stage`;

  const status = document.createElement('p');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn btn-secondary conversion-dialog-cancel';
  cancelButton.textContent = 'Cancel';
  cancelButton.setAttribute('aria-label', 'Cancel the conversion');
  cancelButton.addEventListener('click', () => {
    if (typeof onCancel === 'function') onCancel();
  });

  content.append(title, bar, stage, status, cancelButton);
  root.append(overlay, content);

  let isOpen = false;
  let inertTarget = null;
  let trap = null;
  let restoreTo = null;

  const findInertRoot = () =>
    inertRoot ||
    document.getElementById('app') ||
    document.querySelector('main') ||
    null;

  // The attribute as well as the property: the attribute is what a browser
  // reads, and the property alone is an expando where `inert` is unknown.
  function setInert(on) {
    if (on) {
      inertTarget = findInertRoot();
      if (inertTarget && !inertTarget.contains(root)) {
        inertTarget.inert = true;
        inertTarget.setAttribute('inert', '');
      } else {
        inertTarget = null;
      }
    } else if (inertTarget) {
      inertTarget.inert = false;
      inertTarget.removeAttribute('inert');
      inertTarget = null;
    }
  }

  return {
    root,
    cancelButton,
    bar,

    /**
     * Show the dialog for a conversion of `fileName`, and say so once.
     * @param {string} fileName
     * @param {{returnTo?: HTMLElement}} [options] - Where focus goes back to
     *   on close. Defaults to the element focused now; a host that has
     *   already hidden the button that was pressed (Start goes away the
     *   moment a conversion begins) passes what had focus before it did.
     */
    open(fileName, { returnTo = null } = {}) {
      if (isOpen) return;
      isOpen = true;
      if (!root.isConnected) document.body.appendChild(root);
      const name = fileName || 'your picture';
      title.textContent = `Converting ${name}`;
      bar.removeAttribute('value');
      stage.textContent = text.reading;
      // Written after the dialog is on screen, so the live region is live
      // when the words arrive rather than born with them.
      status.textContent = '';
      // Escape does not cancel: leaving a dialog and stopping a job are two
      // different acts, and the second has a button.
      restoreTo = returnTo || document.activeElement;
      root.classList.remove('hidden');
      root.setAttribute('aria-hidden', 'false');
      trap = createFocusTrap(root);
      trap.activate({ initialFocus: cancelButton });
      setInert(true);
      status.textContent = `Converting ${name}. You can cancel at any time.`;
    },

    /** One stage reached. `index` counts from zero across `total`. */
    stage({ stage: name, index, total }) {
      stage.textContent = text[name] || text.reading;
      if (Number.isFinite(index) && Number.isFinite(total) && total > 0) {
        bar.max = total;
        bar.value = index;
      } else {
        bar.removeAttribute('value');
      }
    },

    /** The conversion is over, however it ended. The page is live again. */
    close() {
      if (!isOpen) return;
      isOpen = false;
      // Inert off BEFORE focus goes back, or the element it returns to is
      // still unfocusable.
      setInert(false);
      if (trap) {
        trap.deactivate();
        trap = null;
      }
      root.classList.add('hidden');
      root.setAttribute('aria-hidden', 'true');
      const target = restoreTo;
      restoreTo = null;
      if (
        target &&
        target !== document.body &&
        typeof target.focus === 'function' &&
        target.isConnected
      ) {
        target.focus();
      }
      stage.textContent = '';
      status.textContent = '';
      bar.removeAttribute('value');
    },

    isOpen: () => isOpen,

    destroy() {
      if (isOpen) this.close();
      root.remove();
    },
  };
}
