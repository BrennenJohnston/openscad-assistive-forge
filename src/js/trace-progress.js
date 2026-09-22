/**
 * Start, Crop first, and the quick look's sentence above them.
 *
 * Choosing a picture used to begin converting it immediately, with the words
 * "Converting to SVG..." as the only sign anything was happening and no way to
 * stop. On a slow device that was a page you could not use and could not get
 * back. Both other tools people know do it the other way round: Illustrator
 * waits for Image Trace and then Expand, Inkscape waits for Update or OK.
 *
 * So: the person starts it. The bar, the stage sentence and Cancel used to
 * live here too; since DP-52 they live in the conversion dialog
 * (conversion-dialog.js), which stands in front of the page for the whole
 * job - one place for the progress, never two. What stays here is the Start
 * button, the quick look's note, and the busy mark on the region while a
 * conversion runs.
 *
 * DP-80 adds Crop first beside Start: a photograph of a page is mostly the
 * page, and the part that matters is cropped out BEFORE anything is
 * converted. The button is offered as soon as the pixels are read; once the
 * picture has converted it reads Crop, and is the same crop the editor
 * offers. What a press does is the host's (the crop view on the picture).
 *
 * Accessibility, deliberately:
 *
 *   - The quick look's sentence is a plain paragraph: never a modal, never a
 *     warning the person cannot act on, and never something that has to be
 *     dismissed before they can get on.
 *   - The region carries aria-busy while a conversion runs, so a screen
 *     reader that lands inside is told the content is not settled.
 *   - Crop first has the visible words in its accessible name, so a person
 *     who says the words they see reaches it.
 *
 * @license GPL-3.0-or-later
 */

let panelSeq = 0;

/** STRINGS: owner review pending (DP-R6 text pack rows 12 and 13). */
export const CROP_FIRST_LABEL = 'Crop first';
export const CROP_FIRST_NAME = 'Crop first, before converting the picture';

/**
 * Build the Start panel for one file control.
 *
 * @param {object} handlers
 * @param {Function} handlers.onStart - Called when the person presses Start
 * @param {Function} [handlers.onCrop] - Called when the person presses Crop
 *   first (or Crop, once the picture has converted). Without it the button
 *   is never offered.
 * @returns {object} The panel and the calls that drive it
 */
export function createTraceProgress({ onStart, onCrop } = {}) {
  const id = `trace-progress-${++panelSeq}`;

  const root = document.createElement('div');
  root.className = 'trace-progress';

  // The quick look's sentence, above Start.
  const note = document.createElement('p');
  note.className = 'trace-progress-note';
  note.id = `${id}-note`;
  note.hidden = true;

  const buttons = document.createElement('div');
  buttons.className = 'trace-progress-buttons';

  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.className = 'btn btn-primary trace-progress-start';
  startButton.textContent = 'Start conversion';
  startButton.addEventListener('click', () => onStart && onStart());

  const cropButton = document.createElement('button');
  cropButton.type = 'button';
  cropButton.className = 'btn btn-secondary trace-progress-crop';
  cropButton.textContent = CROP_FIRST_LABEL;
  cropButton.setAttribute('aria-label', CROP_FIRST_NAME);
  cropButton.hidden = true;
  cropButton.addEventListener('click', () => onCrop && onCrop());

  buttons.append(startButton, cropButton);
  root.append(note, buttons);

  /** The element whose content is not settled while a trace runs. */
  let describedRegion = null;
  let running = false;
  /** Whether the host has offered the crop for this picture. */
  let cropOffered = false;

  function markBusy(busy) {
    if (!describedRegion) return;
    if (busy) describedRegion.setAttribute('aria-busy', 'true');
    else describedRegion.removeAttribute('aria-busy');
  }

  function showCrop(show) {
    cropButton.hidden = !(show && cropOffered && typeof onCrop === 'function');
    if (!cropButton.hidden) cropButton.disabled = false;
  }

  return {
    root,
    startButton,
    cropButton,

    /** The region to mark busy while a trace runs. */
    describeRegion(element) {
      describedRegion = element;
    },

    /**
     * Say what the picture looks like and roughly what it will cost. Empty
     * text takes the sentence away rather than leaving a blank line.
     */
    setNote(text) {
      note.textContent = text || '';
      note.hidden = !text;
    },

    /**
     * Offer the conversion. `label` lets a re-run say so rather than pretending
     * this is the first time. A crop already offered comes back with Start.
     */
    offer(text = 'Start conversion') {
      startButton.textContent = text;
      startButton.hidden = false;
      startButton.disabled = false;
      running = false;
      markBusy(false);
      showCrop(true);
    },

    /**
     * DP-80: offer the crop beside Start, with the words for where the
     * picture stands: "Crop first" before it has converted, "Crop" after.
     */
    offerCrop(label = CROP_FIRST_LABEL, name = CROP_FIRST_NAME) {
      if (typeof onCrop !== 'function') return;
      cropButton.textContent = label;
      cropButton.setAttribute('aria-label', name || label);
      cropOffered = true;
      showCrop(!running);
    },

    /**
     * A trace has begun: Start goes away, the region is busy. A conversion
     * that started by itself (DP-Q32) keeps the crop on offer: a press on it
     * ends that conversion and opens the crop, which is the person's answer
     * to work nobody asked for.
     */
    begin({ keepCrop = false } = {}) {
      startButton.hidden = true;
      running = true;
      markBusy(true);
      showCrop(keepCrop);
    },

    /** The trace is over, however it ended. */
    finish() {
      startButton.hidden = false;
      startButton.disabled = false;
      running = false;
      markBusy(false);
      showCrop(true);
    },

    /** Take the whole panel away (the file was cleared, or is not a picture). */
    hide() {
      root.hidden = true;
      note.textContent = '';
      note.hidden = true;
      running = false;
      cropOffered = false;
      cropButton.hidden = true;
      markBusy(false);
    },

    show() {
      root.hidden = false;
    },

    isRunning: () => running,
    isCropOffered: () => cropOffered,
  };
}
