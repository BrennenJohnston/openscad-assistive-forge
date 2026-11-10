/**
 * A panel can hold the page's Generate button while its own steps come
 * first (the Tactile Map Designer's five steps). The button reads as
 * unavailable through aria-disabled, not disabled, so it keeps its place in
 * the Tab order and a press can say why: the panel's note stands above the
 * button and is said once, and nothing is generated.
 *
 * @license GPL-3.0-or-later
 */
import { announce } from './announcer.js';

const BUTTON_ID = 'primaryActionBtn';
const NOTE_ID = 'primaryActionHoldNote';
const SOURCE = 'primary-action-hold';

let heldNote = null;
let placeNote = null;

/** The button as the hold wants it: unavailable while held, else as it was. */
function sync() {
  const button = document.getElementById(BUTTON_ID);
  if (!button) return;
  if (heldNote) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
}

/**
 * Hold Generate; a press shows and says `note` instead. A second hold
 * replaces the note.
 *
 * @param {string} note
 */
export function holdPrimaryAction(note) {
  heldNote = String(note);
  sync();
}

/** Let Generate go; its note leaves with the hold. */
export function releasePrimaryAction() {
  heldNote = null;
  hideHoldNote();
  sync();
}

/** @returns {boolean} whether a panel holds Generate */
export function primaryActionHeld() {
  return heldNote !== null;
}

/** The note's place: above the button, its right edge on the button's. */
function placeAbove(note, button) {
  const r = button.getBoundingClientRect();
  note.style.right = `${Math.max(0, window.innerWidth - r.right)}px`;
  note.style.bottom = `${Math.max(0, window.innerHeight - r.top) + 8}px`;
}

/**
 * A press on a held Generate: the note above the button and said once.
 *
 * @returns {boolean} true when the press was held (the caller generates
 *   nothing), false when Generate is free
 */
export function showHoldNote() {
  if (!heldNote) return false;
  sync();
  const button = document.getElementById(BUTTON_ID);
  let note = document.getElementById(NOTE_ID);
  if (!note) {
    note = document.createElement('p');
    note.id = NOTE_ID;
    note.className = 'primary-action-hold-note';
    document.body.appendChild(note);
  }
  note.textContent = heldNote;
  note.hidden = false;
  if (button) {
    placeAbove(note, button);
    if (!placeNote) {
      placeNote = () => {
        const shown = document.getElementById(NOTE_ID);
        const at = document.getElementById(BUTTON_ID);
        if (shown && at) placeAbove(shown, at);
      };
      window.addEventListener('resize', placeNote);
    }
  }
  // Said through the announcer, not a live note: a second press says it
  // again where a live region would stay quiet over the same words.
  announce(heldNote, { source: SOURCE });
  return true;
}

/** Take the note away (a step changed, or the hold was let go). */
export function hideHoldNote() {
  document.getElementById(NOTE_ID)?.remove();
  if (placeNote) {
    window.removeEventListener('resize', placeNote);
    placeNote = null;
  }
}
