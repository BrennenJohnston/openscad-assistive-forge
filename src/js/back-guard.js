/**
 * The browser Back button, made answerable.
 *
 * Without a history entry of its own, the app's first Back press is a
 * navigation away from the document: no popstate, no chance to ask, no way
 * back in except retyping the address. On a phone mid-tutorial, that closes
 * the app entirely.
 *
 * The answer is one sentinel entry. When a project opens, this module pushes a
 * single history entry with the same URL. The next Back press consumes that
 * entry instead of the document, which turns a departure into a popstate the
 * app can answer with a dialog. "Stay in the app" steps back onto the sentinel,
 * so the guard is not a one-shot; "Leave" goes back past it and really leaves
 * (warn only, no in-app routing).
 *
 * It is scoped to the project surface. The guard arms on
 * the flip to 'project' and retracts its own entry on the flip back to
 * 'welcome', so the Main Page keeps the browser's own one-press behavior and
 * no stale entry is left behind.
 *
 * Why not beforeunload: it cannot carry custom text, needs sticky
 * activation and does not fire at all when a phone app-switches away; the
 * existing dirty-buffer beforeunload guard stays where it is, as the
 * unload-time backstop. The Navigation API would express this more
 * directly but only became Baseline in 2026, so it is not the primary
 * path. If a browser ever refuses to hand back the sentinel, Back behaves
 * exactly as it would without this module.
 *
 * @license GPL-3.0-or-later
 */

import { showConfirmDialog } from './dialogs.js';
import { onAppSurfaceChange } from './app-surface.js';

/** The leave dialog's wording, which is accessibility-critical text. */
const LEAVE_TITLE = 'Leave the app?';
const LEAVE_BODY =
  "The browser's Back button closes this app. It does not go back to the " +
  'Main Page or the previous menu. Your saved projects stay in this browser.';
const LEAVE_LABEL = 'Leave';
const STAY_LABEL = 'Stay in the app';

/**
 * Informational only. Do not build logic on reading this back: the deep-link
 * doors call `replaceState(null, ...)` on whatever entry is current, which is
 * the sentinel while a project is open, so the marker is gone by the time
 * anyone would want it.
 */
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
/** The address bar to put back once a retraction has actually landed. */
let restoreHref = null;
/** A walk out of the document is under way; further pops are its own. */
let walking = false;

/** Enough to clear the entries a few reload cycles can leave behind. */
const MAX_WALK_STEPS = 5;

/**
 * Did the app itself answer the Back press currently being dispatched?
 *
 * Read by the tutorial engine's own popstate listener, so a tour survives
 * "Stay in the app" instead of closing on every Back press.
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
 * Pushing a fresh entry here loses the address bar. The deep-link
 * doors (?example=, ?manifest=) clean their URLs with replaceState after the
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
  // Going back consumes our own entry, and the URL of the entry underneath
  // comes back with it: the deep-link doors clean their URLs with
  // replaceState after the surface flips, which edits the sentinel rather than
  // the entry below it. Record the address bar here and restore it in the
  // popstate, which is the moment it has actually changed. Doing it
  // on a timer instead is a race that Chromium happens to win and Firefox
  // loses, and losing it puts a stale ?example= back on the Main Page.
  restoreHref = window.location.href;
  window.history.back();
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

  // The user's own choice, honored without argument: the guard does not
  // re-arm behind it.
  leaving = true;
  walkOut();
}

/**
 * Leave the document, stepping past any entries of our own on the way.
 *
 * One `history.back()` is not enough. A reload leaves the tab standing on a
 * sentinel; the app boots to the Main Page and knows nothing about it, and
 * opening a project pushes a second one. One step back would then land on
 * the app's own earlier entry, so the app would still be there and the URL
 * would jump back to `?example=simple-box`. Reading the entry's state to
 * recognize it does not work either: the deep-link cleanup calls
 * `replaceState(null, ...)` and wipes the marker.
 *
 * So this asks the simpler question. Leaving means leaving the document,
 * and nothing in this app pushes history except this module, so every
 * entry that keeps us alive is one of ours to step past. Each step that
 * reaches a real earlier document ends the walk by ending the document; if
 * the app is the first entry in the tab there is nothing to reach, the
 * walk runs out, and Back behaves as it would without this module.
 */
function walkOut() {
  if (walking) return;
  walking = true;
  let steps = 0;
  const step = () => {
    if (steps >= MAX_WALK_STEPS) {
      walking = false;
      return;
    }
    steps += 1;
    window.history.back();
    // Still running means the step landed on another entry of ours.
    window.setTimeout(step, 150);
  };
  step();
}

/**
 * Say, for the length of this dispatch, that the document is staying put.
 *
 * The bookkeeping branches need this too, or the tour would close on "Stay
 * in the app" rather than on the Back press: retracting and re-advancing
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
  if (walking) return;
  if (retracting) {
    retracting = false;
    markAnswered();
    if (restoreHref && window.location.href !== restoreHref) {
      window.history.replaceState(null, '', restoreHref);
    }
    restoreHref = null;
    return;
  }
  if (readvancing) {
    readvancing = false;
    armed = true;
    markAnswered();
    return;
  }
  if (!armed) {
    // Nothing of ours was armed, yet the document is still here, so the entry
    // just consumed was a leftover of ours from before a reload. The
    // Main Page keeps the browser's own behavior, and the browser's own
    // behavior is to leave, so carry on out rather than swallowing the press.
    walkOut();
    return;
  }

  // Our sentinel is what the browser just consumed, so the document stays.
  armed = false;
  markAnswered();

  if (asking) return;
  void ask();
}

/** Guard the browser's Back button while a project is open. */
export function installBackGuard() {
  if (installed) return;
  installed = true;

  onAppSurfaceChange((surface) => {
    if (surface === 'project') arm();
    else standDown();
  });

  window.addEventListener('popstate', handlePopState);

  if (document.body?.dataset?.appSurface === 'project') arm();
}
