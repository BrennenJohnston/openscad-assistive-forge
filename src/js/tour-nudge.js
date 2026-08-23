/**
 * Welcome tour nudge (U-27, UF-22) — the app asks, once per load, whether
 * the user would like the Main Page Tour, and shows them where the tour
 * starts from.
 *
 * The report behind it: the welcome card's tip "is still not highlighted well
 * enough". MEASURED at P0 and that is exactly right — at 1400x1024 in Forge
 * the card's Start button sits at y=1026 inside a 1024px window, below the
 * fold, so the tip decorates something nobody has scrolled to. This module
 * brings the tutorial menu onto the screen first, lights it through a dimmed
 * page, outlines the Start button, and asks in a centred dialog.
 *
 * Q-52 (owner, 2026-08-15, with the mock on screen):
 *  (a) it shows while the welcome family is NOT completed and not suppressed.
 *      Started-but-unfinished still nudges, which is the owner's "until it
 *      registers as completed" read literally.
 *  (b) once per app load, not once per arrival at the welcome page.
 *  (c) the modal is the attention device while it is armed, so the card wears
 *      no tip underneath it; the tip takes over the moment the modal is
 *      dismissed. Pressing "Dismiss tip" on the card counts as a no and stops
 *      the modal for good. Completion still hands the tip to Beginners Start
 *      Here (the Q-44a chain, untouched). THIS SUPERSEDES Q-44a's rule that
 *      the welcome card wears the tip first.
 *  (d) the copy below, approved verbatim.
 *
 * Sequencing: like the spotlight, this waits on the first-visit gate. Inside
 * the inert, aria-hidden #app the dialog would be unreachable and its focus
 * trap would fight the gate's own modal.
 *
 * @license GPL-3.0-or-later
 */

import { getTutorialFamilyState } from './tutorial-sandbox.js';
import { createFocusTrap } from './focus-trap.js';
import {
  STORAGE_KEY_TOUR_NUDGE_SUPPRESSED,
  safeGetItem,
  safeSetItem,
} from './storage-keys.js';

const WELCOME_FAMILY = 'welcome';
const SCROLL_MARGIN = 16;

// Everything that paints above a z:1000 dialog, or would be a second dialog.
// The first version of this release shipped without the wait and it showed:
// the WASM loading overlay (z:10000) sat on top of the nudge with "Loading
// OpenSCAD Engine" printed across its buttons. That is the same hazard the
// FIRST-VISIT GATE comment block in main.js documents. Both overlays are
// created and removed rather than toggled, and both are removed on the
// failure path too, so waiting for them cannot hang on a broken engine.
const COVERING_SELECTOR =
  '#wasmLoadingOverlay, #processingOverlay, .friendly-error-modal';

// D-35: every string owner-approved verbatim 2026-08-15 (Q-52d, pack A).
const COPY = {
  title: 'Take a quick tour of this page?',
  body: 'There is more on this page than it first looks. The Main Page Tour walks you through it in about two minutes, and you can leave it at any time.',
  never: 'Do not show this again',
  dismiss: 'Not now',
  start: 'Start the tour',
};

/**
 * Has the user ticked "Do not show this again"?
 * @returns {boolean}
 */
function isTourNudgeSuppressed() {
  return safeGetItem(STORAGE_KEY_TOUR_NUDGE_SUPPRESSED) === 'true';
}

function suppressTourNudge() {
  safeSetItem(STORAGE_KEY_TOUR_NUDGE_SUPPRESSED, 'true');
}

/**
 * Q-52a/c: the welcome tour is unfinished, no explicit no has been given, the
 * welcome surface is what is on screen, and no tour is already running.
 * `dismissed` is the registry field the card's own "Dismiss tip" writes.
 *
 * @returns {boolean}
 */
function shouldShowNudge() {
  if (document.body.dataset.appSurface === 'project') return false;
  if (!document.getElementById('startWelcomeTourBtn')) return false;
  if (document.querySelector('.tutorial-overlay')) return false;
  if (isTourNudgeSuppressed()) return false;
  const state = getTutorialFamilyState(WELCOME_FAMILY);
  return !state.completed && !state.dismissed;
}

const isRendered = (el) =>
  typeof el.checkVisibility === 'function'
    ? el.checkVisibility()
    : getComputedStyle(el).display !== 'none';

/**
 * Is a full-screen overlay or an error dialog on the page right now?
 * @returns {boolean}
 */
function screenIsCovered() {
  for (const el of document.querySelectorAll(COVERING_SELECTOR)) {
    if (isRendered(el)) return true;
  }
  return false;
}

/**
 * Resolve once nothing is covering the page. All three coverers are appended
 * to and `remove()`d from document.body directly, never toggled by class, so
 * body's own childList is the whole signal — and this can be armed through a
 * 15-30MB engine download without watching every mutation the boot makes.
 *
 * @returns {Promise<void>}
 */
function waitForClearScreen() {
  if (!screenIsCovered()) return Promise.resolve();
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (screenIsCovered()) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(document.body, { childList: true });
  });
}

/**
 * Bring the tutorial menu onto the screen. MEASURED at P0: without this the
 * Start button is below the fold at the most ordinary desktop size, so the
 * modal would point at something the user cannot see. The welcome screen is
 * its own scroll container, not the document.
 *
 * @param {HTMLElement} card - The Main Page Tour card
 */
function scrollMenuIntoView(card) {
  const scroller = card.closest('#welcomeScreen');
  if (!scroller) return;
  const cardBox = card.getBoundingClientRect();
  const scrollerBox = scroller.getBoundingClientRect();
  const delta = cardBox.top - scrollerBox.top - SCROLL_MARGIN;
  if (delta > 0) {
    scroller.scrollTop += delta;
  }
}

/**
 * Build the dialog. Kept as real elements rather than an innerHTML blob so the
 * copy above cannot be broken by an unescaped character.
 *
 * @returns {{modal: HTMLElement, startBtn: HTMLElement, dismissBtn: HTMLElement, checkbox: HTMLInputElement}}
 */
function buildModal() {
  const modal = document.createElement('div');
  modal.className = 'tour-nudge-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'tourNudgeTitle');
  modal.setAttribute('aria-describedby', 'tourNudgeBody');
  modal.dataset.testid = 'tour-nudge-modal';

  const title = document.createElement('h2');
  title.id = 'tourNudgeTitle';
  title.className = 'tour-nudge-title';
  title.textContent = COPY.title;

  const body = document.createElement('p');
  body.id = 'tourNudgeBody';
  body.className = 'tour-nudge-body';
  body.textContent = COPY.body;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'tourNudgeNever';

  const neverLabel = document.createElement('label');
  neverLabel.className = 'tour-nudge-never';
  neverLabel.htmlFor = checkbox.id;
  neverLabel.append(checkbox, document.createTextNode(COPY.never));

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'btn btn-secondary tour-nudge-dismiss';
  dismissBtn.textContent = COPY.dismiss;

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'btn btn-primary tour-nudge-start';
  startBtn.textContent = COPY.start;

  const actions = document.createElement('div');
  actions.className = 'tour-nudge-actions';
  actions.append(dismissBtn, startBtn);

  modal.append(title, body, neverLabel, actions);
  return { modal, startBtn, dismissBtn, checkbox };
}

/**
 * Show the nudge once, and resolve when the user has answered it.
 *
 * @param {(id: string, options?: Object) => void} startTutorial
 * @returns {Promise<{startedTour: boolean}>} Resolves after the dialog is
 *   gone, so the welcome spotlight knows when it may decorate the card
 *   (Q-52c). The outcome is reported explicitly rather than read back from
 *   the registry, because startTutorial is async and can stop to ask its own
 *   questions before it records the tour as opened.
 */
function showNudge(startTutorial) {
  return new Promise((resolve) => {
    const tourBtn = document.getElementById('startWelcomeTourBtn');
    const card = tourBtn.closest('.role-path-card');
    const menu = tourBtn.closest('.role-paths-grid');
    if (card) scrollMenuIntoView(card);

    const backdrop = document.createElement('div');
    backdrop.className = 'tour-nudge-backdrop';

    // The lit region is decoration only: the dialog is aria-modal, so assistive
    // technology never reaches it, and pointer-events:none (in the stylesheet)
    // stops a mouse reaching it either. Nothing here is a second way in.
    menu?.classList.add('tour-nudge-lit');
    tourBtn.classList.add('tour-nudge-target');

    const { modal, startBtn, dismissBtn, checkbox } = buildModal();
    document.body.append(backdrop, modal);

    const trap = createFocusTrap(modal, { onEscape: () => close(false) });
    trap.activate({ initialFocus: startBtn });

    let closed = false;
    /**
     * @param {boolean} startRequested - True when the user asked for the tour
     */
    function close(startRequested) {
      if (closed) return;
      closed = true;
      if (checkbox.checked) suppressTourNudge();

      trap.deactivate();
      backdrop.removeEventListener('click', onBackdropClick);
      menu?.classList.remove('tour-nudge-lit');
      tourBtn.classList.remove('tour-nudge-target');
      backdrop.remove();
      modal.remove();

      // Focus lands on the button the outline was pointing at, whichever way
      // the dialog was answered — never on <body>.
      tourBtn.focus();

      if (startRequested) {
        startTutorial('welcome', { triggerEl: tourBtn });
      }
      resolve({ startedTour: startRequested });
    }

    const onBackdropClick = () => close(false);
    backdrop.addEventListener('click', onBackdropClick);
    dismissBtn.addEventListener('click', () => close(false));
    startBtn.addEventListener('click', () => close(true));
  });
}

/**
 * Ask about the welcome tour once per app load, after the first-visit gate.
 *
 * @param {Object} options
 * @param {() => Promise<void>} options.waitForFirstVisitAcceptance - The
 *   main.js gate; resolves immediately on ordinary boots.
 * @param {(id: string, options?: Object) => void} options.startTutorial
 * @returns {Promise<{startedTour: boolean}>} Resolves once the nudge has been
 *   answered, or immediately when it does not apply. The welcome spotlight
 *   awaits this.
 */
export async function initTourNudge({
  waitForFirstVisitAcceptance,
  startTutorial,
}) {
  if (isTourNudgeSuppressed()) return { startedTour: false };

  await waitForFirstVisitAcceptance();
  if (!shouldShowNudge()) return { startedTour: false };

  await waitForClearScreen();
  // Re-asked after the wait: the engine can take a minute on a first visit,
  // and the user may have started the tour from the card in the meantime.
  if (!shouldShowNudge()) return { startedTour: false };

  return showNudge(startTutorial);
}
