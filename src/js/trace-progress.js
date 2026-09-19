/**
 * Start, and the quick look's sentence above it.
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
 * Accessibility, deliberately:
 *
 *   - The quick look's sentence is a plain paragraph: never a modal, never a
 *     warning the person cannot act on, and never something that has to be
 *     dismissed before they can get on.
 *   - The region carries aria-busy while a conversion runs, so a screen
 *     reader that lands inside is told the content is not settled.
 *
 * @license GPL-3.0-or-later
 */

let panelSeq = 0;

/**
 * Build the Start panel for one file control.
 *
 * @param {object} handlers
 * @param {Function} handlers.onStart - Called when the person presses Start
 * @returns {object} The panel and the calls that drive it
 */
export function createTraceProgress({ onStart }) {
  const id = `trace-progress-${++panelSeq}`;

  const root = document.createElement('div');
  root.className = 'trace-progress';

  // The quick look's sentence, above Start.
  const note = document.createElement('p');
  note.className = 'trace-progress-note';
  note.id = `${id}-note`;
  note.hidden = true;

  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.className = 'btn btn-primary trace-progress-start';
  startButton.textContent = 'Start conversion';
  startButton.addEventListener('click', () => onStart && onStart());

  root.append(note, startButton);

  /** The element whose content is not settled while a trace runs. */
  let describedRegion = null;
  let running = false;

  function markBusy(busy) {
    if (!describedRegion) return;
    if (busy) describedRegion.setAttribute('aria-busy', 'true');
    else describedRegion.removeAttribute('aria-busy');
  }

  return {
    root,
    startButton,

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
     * this is the first time.
     */
    offer(text = 'Start conversion') {
      startButton.textContent = text;
      startButton.hidden = false;
      startButton.disabled = false;
      running = false;
      markBusy(false);
    },

    /** A trace has begun: Start goes away, the region is busy. */
    begin() {
      startButton.hidden = true;
      running = true;
      markBusy(true);
    },

    /** The trace is over, however it ended. */
    finish() {
      startButton.hidden = false;
      startButton.disabled = false;
      running = false;
      markBusy(false);
    },

    /** Take the whole panel away (the file was cleared, or is not a picture). */
    hide() {
      root.hidden = true;
      note.textContent = '';
      note.hidden = true;
      running = false;
      markBusy(false);
    },

    show() {
      root.hidden = false;
    },

    isRunning: () => running,
  };
}
