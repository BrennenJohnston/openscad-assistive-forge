/**
 * The controls for deciding what counts as ink in a picture.
 *
 * One panel, used in both places a photograph can enter Forge: the standalone
 * drawing editor and a model's file parameter. Labels describe the OUTCOME
 * rather than the algorithm, because the person choosing is deciding what they
 * want printed, not which threshold to move.
 *
 * Everything it reports goes to a live region as sentences: how many shapes
 * survived, how much of the picture became ink, and what it could not do.
 *
 * @license GPL-3.0-or-later
 */

import { INK_DEFAULTS } from './ink-extraction.js';

/** What each mode is called and what it does, in the order they are offered. */
export const INK_MODE_CHOICES = [
  {
    value: 'lineart',
    label: 'Line art',
    description:
      'Keep the drawn lines, drop the color behind them. Best for symbols and drawings with colored backgrounds.',
  },
  {
    value: 'silhouette',
    label: 'Solid shape',
    description:
      'Keep the outline of the whole picture, filled in. Best for very small pieces, where detail could not be felt anyway.',
  },
  {
    value: 'standard',
    label: 'Light and dark',
    description:
      'Keep whatever is darker than the background. What Forge did before. Best for a plain pencil drawing on white paper.',
  },
  {
    value: 'colours',
    label: 'Colors',
    description:
      'Separate the picture into flat colors, one region per color, ready to paint a plate for each. Best for a photo or a colored drawing you want as a spray stencil.',
  },
];

/** Not bundled, not endorsed - signposts to sets that are free to use. */
export const OPEN_SYMBOL_SETS = [
  { name: 'ARASAAC', url: 'https://arasaac.org/' },
  { name: 'Mulberry Symbols', url: 'https://mulberrysymbols.org/' },
  { name: 'Blissymbolics', url: 'https://blissymbolics.org/' },
];

/**
 * What the color separation found, said in one sentence.
 *
 * STRINGS: owner review pending (DP-R2 text pack). Every color is named with
 * its share, because a person who wanted a color that is not in the list has
 * to be able to SEE that it is not there - and the answer is to ask for more.
 *
 * @param {Array<{name: string, hex: string, share: number,
 *   isBackground: boolean}>} colors
 * @param {{downscaledFrom?: number, factor?: number}} [notes]
 * @returns {string}
 */
export function colourSentence(colours, notes = {}) {
  const list = colours || [];
  if (list.length === 0) return 'No colors were found in this picture.';
  const parts = list.map(
    (c) =>
      `${c.name} ${Math.round(c.share * 100)}%${c.isBackground ? ' (the wall)' : ''}`
  );
  const painted = list.filter((c) => !c.isBackground).length;
  const head =
    painted === 1
      ? '1 color to paint, and the wall:'
      : `${painted} colors to paint, and the wall:`;
  const downscale = notes.factor
    ? ` The picture was ${notes.factor} times too big to trace, so it was made ${notes.factor} times smaller first.`
    : '';
  return `${head} ${parts.join(', ')}.${downscale}`;
}

/**
 * What was taken off the picture, when a credit line was found.
 *
 * Always plural: the rule that finds one needs at least eight shapes, so
 * "1 small shape" is a sentence this can never produce and writing the
 * grammar for it would be writing for a case that does not exist.
 *
 * @param {{removed: number}|null} creditLine
 * @returns {string} empty when nothing was removed
 */
export function creditLineSentence(creditLine) {
  const removed = creditLine && creditLine.removed;
  if (!removed) return '';
  return `Removed ${removed} small shapes from the bottom edge, most likely a credit line.`;
}

/**
 * A sentence describing what the extraction did, for the live region.
 * @param {Object|null} summary - From extractInk
 * @param {number} pathCount - Shapes the tracer produced
 * @returns {string}
 */
export function summarySentence(summary, pathCount) {
  const shapes = `${pathCount} ${pathCount === 1 ? 'shape' : 'shapes'}`;
  if (!summary || !summary.applied) {
    return `${shapes} traced.`;
  }
  const coverage = Math.round(summary.inkCoverage * 100);
  const parts = [`${shapes} traced`, `${coverage}% of the picture is ink`];
  if (summary.inverted) {
    parts.push('the picture was light on dark, so it was turned around');
  }
  if (summary.usedAlpha) {
    parts.push('the see-through parts decided the shape');
  }
  return `${parts.join(', ')}.`;
}

/**
 * Plain-language warnings. The extractor reports codes; a person needs a
 * sentence that says what to do next.
 * @param {Object|null} summary
 * @returns {string[]}
 */
export function warningSentences(summary) {
  if (!summary || !summary.warnings) return [];
  return summary.warnings.map((code) => {
    if (code === 'near-empty') {
      return 'Almost nothing was kept. Try moving "How dark counts as a line" to the right, or choose Light and dark.';
    }
    if (code === 'near-full') {
      return 'Almost everything was kept, so the result may print as one solid block. Try moving "How dark counts as a line" to the left.';
    }
    if (code === 'composited-onto-white') {
      return 'See-through parts were treated as white.';
    }
    return code;
  });
}

/**
 * The colour-to-filament suggestion, when there is an honest one to make.
 *
 * Only fires when the rejected fills agree with each other: a symbol with one
 * blue field averages to that blue, while a card of four different fills
 * averages to a color that is in none of them.
 *
 * @param {Object|null} summary
 * @param {number} [minCoherence]
 * @param {number} [minShare]
 * @returns {string|null}
 */
export function filamentSentence(summary, minCoherence = 0.6, minShare = 0.05) {
  const color = summary?.rejectedColor;
  if (!color) return null;
  if (color.coherence < minCoherence || color.share < minShare) return null;
  const hex = `#${[color.r, color.g, color.b]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
  return `The color behind the lines was about ${hex}. Printing this plate in a filament near that color keeps the symbol recognizable.`;
}

/**
 * Build the panel.
 *
 * @param {Object} deps
 * @param {string} deps.idPrefix - Unique per host, so two panels can coexist
 * @param {Function} deps.onChange - Called with the settings on every change
 * @param {Function} [deps.announce] - Speak a sentence
 * @returns {{element: HTMLElement, getSettings: Function, setSummary: Function, setBusy: Function}}
 */
export function createInkControls({ idPrefix, onChange, announce }) {
  const id = (suffix) => `${idPrefix}-${suffix}`;
  const settings = {
    mode: 'lineart',
    lightnessMax: INK_DEFAULTS.lightnessMax,
    chromaMax: INK_DEFAULTS.chromaMax,
    colourCount: INK_DEFAULTS.colourCount,
    wallColour: 'auto',
  };

  const root = document.createElement('div');
  root.className = 'ink-controls';

  const fieldset = document.createElement('fieldset');
  fieldset.className = 'ink-controls-modes';
  const legend = document.createElement('legend');
  legend.textContent = 'What to keep from the picture';
  fieldset.appendChild(legend);

  for (const choice of INK_MODE_CHOICES) {
    const row = document.createElement('div');
    row.className = 'ink-mode-row';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = id('mode');
    input.id = id(`mode-${choice.value}`);
    input.value = choice.value;
    input.checked = choice.value === settings.mode;
    input.setAttribute('aria-describedby', id(`mode-${choice.value}-desc`));

    const label = document.createElement('label');
    label.className = 'ink-mode-label';
    label.setAttribute('for', input.id);
    label.textContent = choice.label;

    const description = document.createElement('span');
    description.className = 'ink-mode-description';
    description.id = id(`mode-${choice.value}-desc`);
    description.textContent = choice.description;

    row.append(input, label, description);
    fieldset.appendChild(row);
  }

  const sliders = document.createElement('div');
  sliders.className = 'ink-controls-sliders';

  const makeSlider = (key, labelText, [min, max], value, help) => {
    const wrap = document.createElement('div');
    wrap.className = 'ink-slider-row';

    const label = document.createElement('label');
    label.setAttribute('for', id(key));
    label.className = 'ink-slider-label';
    label.textContent = labelText;

    const range = document.createElement('input');
    range.type = 'range';
    range.id = id(key);
    range.className = 'ink-slider';
    range.min = String(min);
    range.max = String(max);
    range.step = '1';
    range.value = String(Math.round(value));
    range.setAttribute('aria-describedby', id(`${key}-help`));

    // Paired number input: a slider alone is hard to set exactly, and a value
    // you cannot type is a value you cannot share with someone else.
    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'ink-slider-number';
    number.min = String(min);
    number.max = String(max);
    number.step = '1';
    number.value = range.value;
    number.setAttribute('aria-label', `${labelText}, as a number`);

    const helpText = document.createElement('span');
    helpText.className = 'ink-slider-help';
    helpText.id = id(`${key}-help`);
    helpText.textContent = help;

    wrap.append(label, range, number, helpText);
    return { wrap, range, number };
  };

  const lightness = makeSlider(
    'lightness',
    'How dark counts as a line',
    INK_DEFAULTS.lightnessRange,
    INK_DEFAULTS.lightnessMax,
    'Higher keeps more of the picture. Lower keeps only the darkest strokes.'
  );
  const chroma = makeSlider(
    'chroma',
    'How colorful is still a line',
    INK_DEFAULTS.chromaRange,
    INK_DEFAULTS.chromaMax,
    'Lower rejects colored fills more firmly. Raise it if a colored line is being dropped.'
  );
  const colourCount = makeSlider(
    'colours',
    'How many colors',
    INK_DEFAULTS.colourCountRange,
    INK_DEFAULTS.colourCount,
    'One plate per color. Ask for more than you think you need: taking a color out later is easy, and a color that was never found is not there to take.'
  );
  sliders.append(lightness.wrap, chroma.wrap, colourCount.wrap);

  // Which color is the wall behind the stencil, rather than paint on it.
  // "Work it out" votes along the border of the picture, which is where a
  // wall shows; color alone cannot answer it, because a dark background is
  // still a background.
  const wallWrap = document.createElement('div');
  wallWrap.className = 'ink-slider-row ink-wall-row';
  const wallLabel = document.createElement('label');
  wallLabel.setAttribute('for', id('wall'));
  wallLabel.className = 'ink-slider-label';
  wallLabel.textContent = 'Wall color';
  const wallSelect = document.createElement('select');
  wallSelect.id = id('wall');
  wallSelect.className = 'ink-wall-select';
  wallSelect.setAttribute('aria-describedby', id('wall-help'));
  const autoOption = document.createElement('option');
  autoOption.value = 'auto';
  autoOption.textContent = 'Work it out';
  wallSelect.appendChild(autoOption);
  const wallHelp = document.createElement('span');
  wallHelp.className = 'ink-slider-help';
  wallHelp.id = id('wall-help');
  wallHelp.textContent =
    'The color that is the surface behind the stencil, not paint on it. It gets no plate.';
  wallWrap.append(wallLabel, wallSelect, wallHelp);
  sliders.appendChild(wallWrap);

  const summaryEl = document.createElement('p');
  summaryEl.className = 'ink-controls-summary';
  summaryEl.id = id('summary');
  summaryEl.setAttribute('role', 'status');
  summaryEl.setAttribute('aria-live', 'polite');

  const warningsEl = document.createElement('ul');
  warningsEl.className = 'ink-controls-warnings';
  warningsEl.setAttribute('aria-label', 'Things to know about this picture');
  warningsEl.hidden = true;

  // The Undo sits OUTSIDE the live region on purpose. A control inside a
  // role="status" element is re-announced every time the sentence changes, and
  // a button that keeps introducing itself is worse than one that waits. It
  // points at the sentence with aria-describedby instead, so "Undo" arrives
  // with the thing it would undo rather than on its own.
  const creditRow = document.createElement('p');
  creditRow.className = 'ink-controls-credit';
  creditRow.hidden = true;
  const creditUndo = document.createElement('button');
  creditUndo.type = 'button';
  creditUndo.className = 'btn btn-ghost ink-controls-credit-undo';
  creditUndo.textContent = 'Undo';
  creditUndo.setAttribute('aria-describedby', summaryEl.id);
  creditRow.appendChild(creditUndo);
  let onCreditUndo = null;
  creditUndo.addEventListener('click', () => {
    const act = onCreditUndo;
    // Cleared before the call: the handler re-runs the conversion, and a second
    // click while that is in flight would undo an undo.
    onCreditUndo = null;
    creditRow.hidden = true;
    if (act) act();
  });

  const notice = document.createElement('p');
  notice.className = 'ink-controls-notice';
  // The third sentence stands with the other two rather than appearing when a
  // credit line is removed: it is a statement about what this app does and does
  // not do, and somebody deciding whether to bring an icon here needs it before
  // they bring one, not after.
  notice.textContent =
    'Your picture is processed entirely in your browser and never uploaded. ' +
    'You are responsible for having the right to use any image you bring here. ' +
    "Removing a credit line from the picture does not remove any credit the icon's license asks of you.";

  const signpost = document.createElement('p');
  signpost.className = 'ink-controls-signpost';
  signpost.append(
    document.createTextNode('Openly licensed symbol sets to draw from: ')
  );
  OPEN_SYMBOL_SETS.forEach((set, index) => {
    const link = document.createElement('a');
    link.href = set.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = set.name;
    signpost.appendChild(link);
    if (index < OPEN_SYMBOL_SETS.length - 1) {
      signpost.appendChild(document.createTextNode(', '));
    }
  });
  signpost.append(
    document.createTextNode(
      '. Check each set’s own license before you share what you make.'
    )
  );

  root.append(
    fieldset,
    sliders,
    summaryEl,
    creditRow,
    warningsEl,
    notice,
    signpost
  );

  const say = (message) => {
    if (typeof announce === 'function' && message) announce(message);
  };

  const emit = () => {
    // Only line art uses the colourfulness gate; leaving it live in the other
    // modes would offer a control that changes nothing.
    const isColours = settings.mode === 'colours';
    const usesChroma = settings.mode === 'lineart';
    chroma.range.disabled = !usesChroma;
    chroma.number.disabled = !usesChroma;
    const usesThresholds = settings.mode !== 'standard' && !isColours;
    lightness.range.disabled = !usesThresholds;
    lightness.number.disabled = !usesThresholds;
    // The two color controls are the other way round: they are the only ones
    // this mode uses, and they mean nothing to the other three.
    colourCount.range.disabled = !isColours;
    colourCount.number.disabled = !isColours;
    wallSelect.disabled = !isColours;
    onChange({ ...settings });
  };

  /**
   * Offer the colors that were actually found as the wall, so the choice is
   * between things a person can see rather than between abstractions.
   *
   * @param {Array<{hex: string, name: string, isBackground: boolean}>} colors
   */
  const setColours = (colours) => {
    const chosen = wallSelect.value;
    while (wallSelect.options.length > 1) wallSelect.remove(1);
    for (const c of colours || []) {
      const option = document.createElement('option');
      option.value = c.hex;
      option.textContent = `${c.name} (${c.hex})`;
      wallSelect.appendChild(option);
    }
    wallSelect.value = [...wallSelect.options].some((o) => o.value === chosen)
      ? chosen
      : 'auto';
  };

  fieldset.addEventListener('change', (event) => {
    if (event.target.type !== 'radio') return;
    settings.mode = event.target.value;
    const choice = INK_MODE_CHOICES.find((c) => c.value === settings.mode);
    say(`${choice.label}. ${choice.description}`);
    emit();
  });

  const bindPair = (pair, key) => {
    const apply = (raw, fromSlider) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      settings[key] = value;
      pair.range.value = String(value);
      pair.number.value = String(value);
      if (fromSlider)
        say(`${pair.range.previousSibling.textContent}: ${value}`);
      emit();
    };
    pair.range.addEventListener('input', (e) => apply(e.target.value, false));
    pair.range.addEventListener('change', (e) => apply(e.target.value, true));
    pair.number.addEventListener('change', (e) => apply(e.target.value, true));
  };
  bindPair(lightness, 'lightnessMax');
  bindPair(chroma, 'chromaMax');
  bindPair(colourCount, 'colourCount');

  wallSelect.addEventListener('change', () => {
    settings.wallColour = wallSelect.value;
    const label =
      wallSelect.options[wallSelect.selectedIndex]?.textContent ||
      'Work it out';
    say(`Wall color: ${label}`);
    emit();
  });

  return {
    element: root,
    getSettings: () => ({ ...settings }),
    /**
     * Offer the colors a separation actually found as the wall choice, and
     * say what came out. Called only in the Colors mode.
     *
     * @param {Array<{hex: string, name: string, share: number,
     *   isBackground: boolean, shapes: number}>} colors
     * @param {{downscaledFrom?: number, factor?: number}} [notes]
     */
    setColourResult(colours, notes = {}) {
      setColours(colours);
      summaryEl.textContent = colourSentence(colours, notes);
      warningsEl.replaceChildren();
      warningsEl.hidden = true;
    },
    setBusy(busy) {
      // Only ever WRITES the waiting line; setSummary is what clears it.
      // Clearing on the way out would erase a summary that had already landed.
      //
      // This note used to add that the re-trace "finishes inside the same
      // turn". That was true when the trace ran on the main thread, and is not
      // any more: DP-34 moved it into a worker, so the waiting line is now
      // genuinely visible for as long as the trace takes, which is the point of
      // having it. Anything waiting on this element has to wait PAST the
      // waiting line rather than treat a change as an answer - a test that did
      // exactly that passed for years and only failed once the work stopped
      // blocking the page.
      if (busy) {
        summaryEl.textContent = 'Re-reading the picture…';
        // The run that is starting has not removed anything yet, and the one
        // before it is being replaced.
        onCreditUndo = null;
        creditRow.hidden = true;
      }
    },
    /**
     * Replace the waiting line when a trace did not finish.
     *
     * D-119: setBusy writes "Re-reading the picture…" and only setSummary
     * clears it, so a failed trace used to leave that sentence standing as if
     * work were still going on. Takes the caller's own already-shown failure
     * text rather than inventing a second wording for the same event.
     *
     * @param {string} text - The failure message already shown to the user
     */
    setFailed(text) {
      summaryEl.textContent = text;
      warningsEl.replaceChildren();
      warningsEl.hidden = true;
      // A run that did not finish has nothing to undo, and leaving the button
      // there would offer to undo the run before it.
      onCreditUndo = null;
      creditRow.hidden = true;
    },
    /**
     * Report what the extraction did.
     * @param {Object|null} summary
     * @param {number} pathCount
     */
    setSummary(summary, pathCount, extras = {}) {
      const sentence = summarySentence(summary, pathCount);
      const filament = filamentSentence(summary);
      // DP-32's law: one action, one announcement. Choosing a picture and
      // converting it is one action, so what was traced and what was taken off
      // it are one sentence - not a second announcement arriving behind the
      // first and interrupting it.
      const credit = creditLineSentence(extras.creditLine);
      summaryEl.textContent = [sentence, filament, credit]
        .filter(Boolean)
        .join(' ');

      const removed = (extras.creditLine && extras.creditLine.removed) || 0;
      onCreditUndo = removed > 0 ? extras.creditLine.onUndo || null : null;
      creditRow.hidden = removed === 0;

      const warnings = warningSentences(summary);
      warningsEl.replaceChildren();
      warningsEl.hidden = warnings.length === 0;
      for (const text of warnings) {
        const item = document.createElement('li');
        item.textContent = text;
        warningsEl.appendChild(item);
      }
      say([sentence, credit, ...warnings].filter(Boolean).join(' '));
    },
  };
}
