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
      'Keep the drawn lines, drop the colour behind them. Best for symbols and drawings with coloured backgrounds.',
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
];

/** Not bundled, not endorsed - signposts to sets that are free to use. */
export const OPEN_SYMBOL_SETS = [
  { name: 'ARASAAC', url: 'https://arasaac.org/' },
  { name: 'Mulberry Symbols', url: 'https://mulberrysymbols.org/' },
  { name: 'Blissymbolics', url: 'https://blissymbolics.org/' },
];

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
    return code;
  });
}

/**
 * The colour-to-filament suggestion, when there is an honest one to make.
 *
 * Only fires when the rejected fills agree with each other: a symbol with one
 * blue field averages to that blue, while a card of four different fills
 * averages to a colour that is in none of them.
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
  return `The colour behind the lines was about ${hex}. Printing this plate in a filament near that colour keeps the symbol recognisable.`;
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
    'How colourful is still a line',
    INK_DEFAULTS.chromaRange,
    INK_DEFAULTS.chromaMax,
    'Lower rejects coloured fills more firmly. Raise it if a coloured line is being dropped.'
  );
  sliders.append(lightness.wrap, chroma.wrap);

  const summaryEl = document.createElement('p');
  summaryEl.className = 'ink-controls-summary';
  summaryEl.id = id('summary');
  summaryEl.setAttribute('role', 'status');
  summaryEl.setAttribute('aria-live', 'polite');

  const warningsEl = document.createElement('ul');
  warningsEl.className = 'ink-controls-warnings';
  warningsEl.setAttribute('aria-label', 'Things to know about this picture');
  warningsEl.hidden = true;

  const notice = document.createElement('p');
  notice.className = 'ink-controls-notice';
  notice.textContent =
    'Your picture is processed entirely in your browser and never uploaded. You are responsible for having the right to use any image you bring here.';

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
      '. Check each set’s own licence before you share what you make.'
    )
  );

  root.append(fieldset, sliders, summaryEl, warningsEl, notice, signpost);

  const say = (message) => {
    if (typeof announce === 'function' && message) announce(message);
  };

  const emit = () => {
    // Only line art uses the colourfulness gate; leaving it live in the other
    // modes would offer a control that changes nothing.
    const usesChroma = settings.mode === 'lineart';
    chroma.range.disabled = !usesChroma;
    chroma.number.disabled = !usesChroma;
    const usesThresholds = settings.mode !== 'standard';
    lightness.range.disabled = !usesThresholds;
    lightness.number.disabled = !usesThresholds;
    onChange({ ...settings });
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

  return {
    element: root,
    getSettings: () => ({ ...settings }),
    setBusy(busy) {
      // Only ever WRITES the waiting line. Clearing on the way out would erase
      // the summary that setSummary has already put there: the re-trace
      // finishes inside the same turn, so the two would race and the summary
      // would lose.
      if (busy) summaryEl.textContent = 'Re-reading the picture…';
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
    },
    /**
     * Report what the extraction did.
     * @param {Object|null} summary
     * @param {number} pathCount
     */
    setSummary(summary, pathCount) {
      const sentence = summarySentence(summary, pathCount);
      const filament = filamentSentence(summary);
      summaryEl.textContent = filament ? `${sentence} ${filament}` : sentence;

      const warnings = warningSentences(summary);
      warningsEl.replaceChildren();
      warningsEl.hidden = warnings.length === 0;
      for (const text of warnings) {
        const item = document.createElement('li');
        item.textContent = text;
        warningsEl.appendChild(item);
      }
      say([sentence, ...warnings].join(' '));
    },
  };
}
