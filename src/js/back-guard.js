/**
 * The browser Back button, made answerable (U-41, UF-39).
 *
 * A person stuck mid-tutorial on a phone pressed Back and the app closed
 * entirely. Nothing in the app had ever put an entry on the history stack, so
 * the first Back press was always a navigation away from the document: no
 * popstate, no chance to ask, no way back in except retyping the address.
 *
 * The fix is one sentinel entry. When a project opens, this module pushes a
 * single history entry with the same URL. The next Back press consumes that
 * entry instead of the document, which turns a departure into a popstate the
 * app can answer with a dialog. "Stay in the app" steps back onto the sentinel,
 * so the guard is not a one-shot; "Leave" goes back past it and really leaves
 * (Q-72, owner, 2026-08-22: warn only, no in-app routing).
 *
 * Q-85 (owner, 2026-08-22) scopes it to the project surface. The guard arms on
 * the flip to 'project' and retracts its own entry on the flip back to
 * 'welcome', so the Main Page keeps the browser's own one-press behaviour and
 * no stale entry is left behind.
 *
 * WHAT THIS DOES NOT DO. beforeunload cannot carry custom text, needs sticky
 * activation and does not fire at all when a phone app-switches away, so it is
 * not the mechanism here; the existing dirty-buffer beforeunload guard stays
 * where it is, as the unload-time backstop. The Navigation API would express
 * this more directly but only became Baseline in 2026, so it is not the
 * primary path. If a browser ever refuses to hand back the sentinel, Back
 * behaves exactly as it did before this module existed.
 *
 * @license GPL-3.0-or-later
 */

import { showConfirmDialog } from './dialogs.js';
import { onAppSurfaceChange } from './app-surface.js';

/** Owner-approved 2026-08-22 (pack §7). Accessibility-critical: D-35 review. */
const LEAVE_TITLE = 'Leave the app?';
const LEAVE_BODY =
  "The browser's Back button closes this app. It does not go back to the " +
  'Main Page or the previous menu. Your saved projects stay in this browser.';
const LEAVE_LABEL = 'Leave';
const STAY_LABEL = 'Stay in the app';

const SENTINEL_STATE = { forgeBackGuard: true };

let installed = false;
/** A sentinel entry of ours is on the stack. */
let armed = false;
/** We called history.back() ourselves to retract the sentinel. */
let retracting = false;
/** We called history.forward() ourselves to step back onto the sentinel. */
let readvancing = false;
/** The app answered the Back press just dispatched; the page is staying. */
let answeredPop = false;
/** The user chose Leave. Their intent outlives this module's opinion. */
let leaving = false;
/** The warning is on screen; a second popstate must not stack a second copy. */
let asking = false;

let isComparisonMode = () => false;

/**
 * Did the app itself answer the Back press currently being dispatched?
 *
 * Read by the tutorial engine, whose own popstate listener predates this
 * module and closed the tour on any Back press because a Back press always
 * meant the document was leaving. It does not any more (Q-86, owner,
 * 2026-08-22: a tour survives "Stay in the app").
 *
 * @returns {boolean}
 */
export function backGuardAnsweredPop() {
  return answeredPop;
}

function arm() {
  if (armed || leaving) return;
  window.history.pushState(SENTINEL_STATE, '', window.location.href);
  armed = true;
}

/**
 * Put the sentinel back after the user chose to stay.
 *
 * MEASURED: pushing a fresh entry here loses the address bar. The deep-link
 * doors (?example=, ?manifest=) clean their URLs with replaceState AFTER the
 * project surface appears, so the cleaned URL belongs to the sentinel entry
 * and the entry underneath still carries the raw link. The pop just restored
 * that raw link, and pushing from there would keep it. The sentinel itself is
 * still one step forward, so stepping onto it restores position and URL
 * together.
 */
function rearm() {
  if (armed || leaving) return;
  readvancing = true;
  window.history.forward();
  window.setTimeout(() => {
    if (!readvancing) return;
    readvancing = false;
    arm();
  }, 250);
}

function standDown() {
  if (!armed) return;
  armed = false;
  retracting = true;
  // Going back consumes our own entry. The URL of the entry underneath is
  // restored with it, so put the address bar back the way the app left it:
  // the deep-link doors clean their URLs with replaceState AFTER the surface
  // flips, which edits the sentinel rather than the entry below it.
  const href = window.location.href;
  window.history.back();
  window.setTimeout(() => {
    if (window.location.href !== href) {
      window.history.replaceState(null, '', href);
    }
  }, 0);
}

async function ask() {
  asking = true;
  let leave = false;
  try {
    leave = await showConfirmDialog(
      LEAVE_BODY,
      LEAVE_TITLE,
      LEAVE_LABEL,
      STAY_LABEL,
      {
        destructive: true,
      }
    );
  } finally {
    asking = false;
  }

  if (!leave) {
    rearm();
    return;
  }

  // The user's own choice, honoured without argument: the guard does not
  // re-arm behind it. If the app is the first entry in a fresh tab there is
  // nothing to go back to, and this call does nothing; the next Back press
  // then does what it did before this module existed, which is close the tab.
  leaving = true;
  window.history.back();
}

/**
 * Say, for the length of this dispatch, that the document is staying put.
 *
 * MEASURED: without this on the bookkeeping branches too, the tour died on
 * "Stay in the app" rather than on the Back press. Retracting and re-advancing
 * the sentinel are history traversals like any other, and every popstate
 * listener in the app sees them.
 */
function markAnswered() {
  answeredPop = true;
  // Listeners of this same dispatch read the flag; a timeout clears it after
  // all of them have run (a microtask would drain between two listeners).
  window.setTimeout(() => {
    answeredPop = false;
  }, 0);
}

function handlePopState() {
  if (retracting) {
    retracting = false;
    markAnswered();
    return;
  }
  if (readvancing) {
    readvancing = false;
    armed = true;
    markAnswered();
    return;
  }
  if (!armed) return;

  // Our sentinel is what the browser just consumed, so the document stays.
  armed = false;
  markAnswered();

  // Comparison mode has its own popstate consumer, which exits the comparison
  // view. That is a real step back inside the app, so this press is spent:
  // re-arm and ask nothing. Two dialogs for one press would be the bug.
  if (isComparisonMode()) {
    rearm();
    return;
  }

  if (asking) return;
  void ask();
}

/**
 * @param {Object} [options]
 * @param {() => boolean} [options.isComparisonMode] Is the comparison view up?
 */
export function installBackGuard(options = {}) {
  if (installed) return;
  installed = true;

  if (typeof options.isComparisonMode === 'function') {
    isComparisonMode = options.isComparisonMode;
  }

  onAppSurfaceChange((surface) => {
    if (surface === 'project') arm();
    else standDown();
  });

  window.addEventListener('popstate', handlePopState);

  if (document.body?.dataset?.appSurface === 'project') arm();
}
