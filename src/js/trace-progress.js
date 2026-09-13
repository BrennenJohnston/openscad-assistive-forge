/**
 * Start, a bar that moves, and Cancel.
 *
 * Choosing a picture used to begin converting it immediately, with the words
 * "Converting to SVG..." as the only sign anything was happening and no way to
 * stop. On a slow device that was a page you could not use and could not get
 * back. Both other tools people know do it the other way round: Illustrator
 * waits for Image Trace and then Expand, Inkscape waits for Update or OK.
 *
 * So: the person starts it, the bar says which stage it has reached, and
 * Cancel works at any moment.
 *
 * Accessibility, deliberately:
 *
 *   - A native <progress>, not a div wearing role="progressbar". It carries an
 *     accessible name of its own and the browser already knows what it is.
 *   - Indeterminate (no `value`) because imagetracerjs offers no progress hook;
 *     what moves is the STAGE, and that is reported honestly rather than as a
 *     fake percentage. The element gets `value` only across stages, where the
 *     count really is known.
 *   - The stage sentence is VISIBLE and is not announced. DP-32's law: one
 *     action, one announcement. Start, cancel and completion speak; the
 *     progress line does not, or a single conversion would say four things.
 *   - The region carries aria-busy while it works, and aria-describedby points
 *     at the bar, so a screen reader that lands inside is told why the content
 *     is not settled.
 *   - Under prefers-reduced-motion the bar is de-emphasised rather than
 *     removed: it still changes, because a person who asked for less motion
 *     did not ask to be left guessing.
 *
 * @license GPL-3.0-or-later
 */

/** What each worker stage is called, for the person watching. */
const STAGE_TEXT = {
  reading: 'Reading the picture',
  ink: 'Finding the ink',
  tracing: 'Tracing the shapes',
};

let panelSeq = 0;

/**
 * Build the Start / progress / Cancel panel for one file control.
 *
 * @param {object} handlers
 * @param {Function} handlers.onStart - Called when the person presses Start
 * @param {Function} handlers.onCancel - Called when the person presses Cancel
 * @returns {object} The panel and the calls that drive it
 */
export function createTraceProgress({ onStart, onCancel }) {
  const id = `trace-progress-${++panelSeq}`;

  const root = document.createElement('div');
  root.className = 'trace-progress';

  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.className = 'btn btn-primary trace-progress-start';
  startButton.textContent = 'Start conversion';
  startButton.addEventListener('click', () => onStart && onStart());

  const running = document.createElement('div');
  running.className = 'trace-progress-running';
  running.hidden = true;

  const label = document.createElement('label');
  label.className = 'trace-progress-label';
  label.id = `${id}-label`;
  label.setAttribute('for', `${id}-bar`);
  label.textContent = 'Converting your picture';

  const bar = document.createElement('progress');
  bar.className = 'trace-progress-bar';
  bar.id = `${id}-bar`;
  bar.max = 3;
  // The <label for> above is kept, because it is the right markup and it is
  // what a person sees. It is NOT what names the bar, though: MEASURED in
  // Chromium, a <label for> pointing at a <progress> renders as loose text
  // beside it and the progressbar reaches the accessibility tree with no name
  // at all. aria-labelledby is the repair, pointing at that same visible label
  // so the two can never say different things.
  bar.setAttribute('aria-labelledby', label.id);

  const stageText = document.createElement('p');
  stageText.className = 'trace-progress-stage';
  stageText.id = `${id}-stage`;

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn trace-progress-cancel';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => onCancel && onCancel());

  running.append(label, bar, stageText, cancelButton);
  root.append(startButton, running);

  /** The element whose content is not settled while a trace runs. */
  let describedRegion = null;

  function markBusy(busy) {
    if (!describedRegion) return;
    if (busy) {
      describedRegion.setAttribute('aria-busy', 'true');
      const described = describedRegion.getAttribute('aria-describedby');
      if (!described || !described.includes(bar.id)) {
        describedRegion.setAttribute(
          'aria-describedby',
          described ? `${described} ${bar.id}` : bar.id
        );
      }
    } else {
      describedRegion.removeAttribute('aria-busy');
      const described = describedRegion.getAttribute('aria-describedby');
      if (described) {
        const rest = described
          .split(/\s+/)
          .filter((token) => token && token !== bar.id)
          .join(' ');
        if (rest) describedRegion.setAttribute('aria-describedby', rest);
        else describedRegion.removeAttribute('aria-describedby');
      }
    }
  }

  return {
    root,
    startButton,
    cancelButton,
    bar,

    /** The region to mark busy while a trace runs. */
    describeRegion(element) {
      describedRegion = element;
    },

    /**
     * Offer the conversion. `label` lets a re-run say so rather than pretending
     * this is the first time.
     */
    offer(text = 'Start conversion') {
      startButton.textContent = text;
      startButton.hidden = false;
      startButton.disabled = false;
      running.hidden = true;
      stageText.textContent = '';
      markBusy(false);
    },

    /** A trace has begun. The bar starts indeterminate. */
    begin() {
      startButton.hidden = true;
      running.hidden = false;
      bar.removeAttribute('value');
      stageText.textContent = STAGE_TEXT.reading;
      markBusy(true);
    },

    /** One stage reached. `index` counts from zero. */
    stage({ stage, index, total }) {
      stageText.textContent = STAGE_TEXT[stage] || STAGE_TEXT.reading;
      // Determinate ACROSS stages, where the count is genuinely known, and
      // indeterminate within one, where it is not.
      if (Number.isFinite(index) && Number.isFinite(total) && total > 0) {
        bar.max = total;
        bar.value = index;
      }
    },

    /** The trace is over, however it ended. */
    finish() {
      running.hidden = true;
      startButton.hidden = false;
      startButton.disabled = false;
      stageText.textContent = '';
      bar.removeAttribute('value');
      markBusy(false);
    },

    /** Take the whole panel away (the file was cleared, or is not a picture). */
    hide() {
      root.hidden = true;
      markBusy(false);
    },

    show() {
      root.hidden = false;
    },

    isRunning: () => !running.hidden,
  };
}
