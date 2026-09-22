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

/**
 * The words that differ between the two hosts (D-156). One panel serves a
 * charm's file control and the stencil tile, and it used to speak only the
 * stencil's language: "a plate for each" color, "the surface behind the
 * stencil", on a charm where no stencil is possible. Relief is the default
 * because it is the purpose of every host but the tile.
 */
const PURPOSE_WORDS = {
  relief: {
    coloursDescription:
      'Separate the picture into flat colors, one shape per color, with the color behind the picture as the wall, which is left out. Best for a colored drawing or a logo whose colors are the point.',
    countHelp:
      'One group of shapes per color. Ask for more than you think you need: leaving a color out later is easy, and a color that was never found is not there to keep.',
    wallHelp:
      'The color of the surface behind the picture. It is left out; every other color is the artwork.',
    colourHead: (painted) =>
      painted === 1
        ? '1 color in the artwork, and the wall:'
        : `${painted} colors in the artwork, and the wall:`,
  },
  stencil: {
    coloursDescription:
      'Separate the picture into flat colors, one region per color, ready to paint a plate for each. Best for a photo or a colored drawing you want as a spray stencil.',
    countHelp:
      'One plate per color. Ask for more than you think you need: taking a color out later is easy, and a color that was never found is not there to take.',
    wallHelp:
      'The color that is the surface behind the stencil, not paint on it. It gets no plate.',
    colourHead: (painted) =>
      painted === 1
        ? '1 color to paint, and the wall:'
        : `${painted} colors to paint, and the wall:`,
  },
};

const wordsFor = (purpose) => PURPOSE_WORDS[purpose] || PURPOSE_WORDS.relief;

/**
 * What a change ends with when the run waits for a press (D-157): the
 * button's own name, so a person who has not converted yet hears Start and
 * one who has hears Convert again.
 */
export const waitingSentence = (label) => `Press ${label} when you are ready.`;

/** What each mode is called and what it does, in the order they are offered. */
export const INK_MODE_CHOICES = [
  {
    value: 'lineart',
    label: 'Line art',
    // STRINGS: DP-R6 text pack row 10 (REVISED at DP-79).
    description:
      'Keep the drawn lines, drop the color behind them. Best for symbols, line drawings and photos of a printed symbol.',
  },
  {
    value: 'silhouette',
    label: 'Solid shape',
    // STRINGS: DP-R6 text pack row 11 (REVISED at DP-79).
    description:
      'Keep the outline of the whole picture, filled in. Best for small charms, and for a photo where the shapes matter more than the lines.',
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
    description: PURPOSE_WORDS.relief.coloursDescription,
  },
];

/**
 * The mode choices with the one description that depends on the host.
 * @param {'relief'|'stencil'} [purpose]
 */
export function inkModeChoices(purpose = 'relief') {
  const words = wordsFor(purpose);
  return INK_MODE_CHOICES.map((choice) =>
    choice.value === 'colours'
      ? { ...choice, description: words.coloursDescription }
      : choice
  );
}

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
 * @param {'relief'|'stencil'} [purpose] - Whose words: a charm counts colors
 *   in the artwork, a stencil counts colors to paint
 * @returns {string}
 */
export function colourSentence(colours, notes = {}, purpose = 'relief') {
  const list = colours || [];
  if (list.length === 0) return 'No colors were found in this picture.';
  const parts = list.map(
    (c) =>
      `${c.name} ${Math.round(c.share * 100)}%${c.isBackground ? ' (the wall)' : ''}`
  );
  const painted = list.filter((c) => !c.isBackground).length;
  const head = wordsFor(purpose).colourHead(painted);
  // DP-79: a camera picture says the size it was worked at (row 9) in place
  // of the cap's clause; a file that was only capped keeps the cap's.
  const worked = workedSentence(notes.working);
  const downscale =
    !worked && notes.factor
      ? ` The picture was ${notes.factor} times too big to trace, so it was made ${notes.factor} times smaller first.`
      : '';
  const specks = specksSentence({
    specksDropped: notes.specks,
    printedWidthMm: notes.printedWidthMm,
  });
  return `${head} ${parts.join(', ')}.${downscale}${worked ? ` ${worked}` : ''}${specks ? ` ${specks}` : ''}`;
}

/**
 * The size a camera picture was worked at (DP-79; DP-R6 text pack row 9,
 * A11Y: it rides in the summary the panel announces).
 *
 * @param {{width: number, printedWidthMm: number}|null|undefined} working
 * @returns {string} Empty when the picture was left at its own pixels
 */
export function workedSentence(working) {
  if (!working || !(working.width > 0) || !(working.printedWidthMm > 0)) {
    return '';
  }
  const mm = Number(working.printedWidthMm.toFixed(1));
  return `Worked at ${working.width} px wide, the size a ${mm} mm design can use.`;
}

/**
 * How many specks the floor left out (DP-79; DP-R6 text pack rows 7 and 8,
 * A11Y: announced with the summary).
 *
 * @param {{specksDropped?: number, printedWidthMm?: number}|null} summary
 * @returns {string} Empty when nothing was left out
 */
export function specksSentence(summary) {
  const n = summary && summary.specksDropped;
  if (!(n > 0)) return '';
  const at =
    summary.printedWidthMm > 0
      ? ` at ${Number(summary.printedWidthMm.toFixed(1))} mm wide`
      : '';
  return n === 1
    ? `1 speck smaller than 0.1 mm²${at} was left out.`
    : `${n} specks smaller than 0.1 mm²${at} were left out.`;
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
 * The hint names the color the lines sat on, because for a symbol that
 * color can carry meaning (an AAC symbol's background is part of what it
 * says), and printing in a filament near it keeps the symbol recognizable.
 * A stencil says "this plate"; a charm or a pendant is one piece and says
 * so (D-156).
 *
 * @param {Object|null} summary
 * @param {number} [minCoherence]
 * @param {number} [minShare]
 * @param {'relief'|'stencil'} [purpose]
 * @returns {string|null}
 */
export function filamentSentence(
  summary,
  minCoherence = 0.6,
  minShare = 0.05,
  purpose = 'relief'
) {
  const color = summary?.rejectedColor;
  if (!color) return null;
  if (color.coherence < minCoherence || color.share < minShare) return null;
  const hex = `#${[color.r, color.g, color.b]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
  const thing = purpose === 'stencil' ? 'this plate' : 'the piece';
  return `The color behind the lines was about ${hex}. Printing ${thing} in a filament near that color keeps the symbol recognizable.`;
}

/**
 * Build the panel.
 *
 * @param {Object} deps
 * @param {string} deps.idPrefix - Unique per host, so two panels can coexist
 * @param {Function} deps.onChange - Called with the settings on every change
 * @param {Function} [deps.announce] - Speak a sentence
 * @param {'relief'|'stencil'} [deps.purpose] - Whose words the panel speaks
 *   (D-156): a charm's, or the stencil tile's
 * @param {Function} [deps.runsBySelf] - Asked at every change: will the host
 *   re-run the conversion by itself? When not, the change's own sentence
 *   ends by naming the press that will (D-157), so the change and what it
 *   waits for are ONE announcement
 * @param {Function} [deps.startLabel] - The name of that press: Start
 *   conversion before anything has run, Convert again after
 * @returns {{element: HTMLElement, getSettings: Function, setSummary: Function, setBusy: Function}}
 */
export function createInkControls({
  idPrefix,
  onChange,
  announce,
  purpose = 'relief',
  runsBySelf = () => true,
  startLabel = () => 'Convert again',
}) {
  const id = (suffix) => `${idPrefix}-${suffix}`;
  const words = wordsFor(purpose);
  const choices = inkModeChoices(purpose);
  const settings = {
    mode: 'lineart',
    lightnessMax: INK_DEFAULTS.lightnessMax,
    chromaMax: INK_DEFAULTS.chromaMax,
    colourCount: INK_DEFAULTS.colourCount,
    wallColour: 'auto',
    // DP-79: the photo defaults. Off until the host says the picture is a
    // camera's (setPictureClass), then on; a person can turn either off.
    smooth: false,
    speckFloor: false,
  };

  const root = document.createElement('div');
  root.className = 'ink-controls';

  const fieldset = document.createElement('fieldset');
  fieldset.className = 'ink-controls-modes';
  const legend = document.createElement('legend');
  legend.textContent = 'What to keep from the picture';
  fieldset.appendChild(legend);

  for (const choice of choices) {
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
    words.countHelp
  );
  sliders.append(lightness.wrap, chroma.wrap, colourCount.wrap);

  // Which color is the wall behind the picture, rather than the artwork.
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
  wallHelp.textContent = words.wallHelp;
  wallWrap.append(wallLabel, wallSelect, wallHelp);
  sliders.appendChild(wallWrap);

  // DP-79: the two photo defaults a person can turn off (or on). Switches,
  // because each is a yes or no with a visible name, and the help sentence
  // says which pictures start with it on. The label wraps the control and
  // its words, so the whole line is the target.
  // STRINGS: DP-R6 text pack rows 3 to 6 (A11Y).
  const makeSwitch = (key, labelText, help) => {
    const wrap = document.createElement('div');
    wrap.className = 'ink-slider-row ink-switch-row';
    const label = document.createElement('label');
    label.className = 'toggle-switch ink-switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id(key);
    input.setAttribute('aria-describedby', id(`${key}-help`));
    const text = document.createElement('span');
    text.className = 'toggle-label';
    text.textContent = labelText;
    label.append(input, text);
    const helpText = document.createElement('span');
    helpText.className = 'ink-slider-help';
    helpText.id = id(`${key}-help`);
    helpText.textContent = help;
    wrap.append(label, helpText);
    return { wrap, input, labelText };
  };
  const smooth = makeSwitch(
    'smooth',
    'Smooth the picture first',
    'A photo has grain a print cannot show. On for a picture from a camera, off for an icon file.'
  );
  const speck = makeSwitch(
    'specks',
    'Leave out specks under 0.1 mm²',
    'Pieces smaller than a tenth of a square millimeter at the printed size cannot print. Turn this off if the small pieces are letters.'
  );
  sliders.append(smooth.wrap, speck.wrap);

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

  /**
   * A change the person made, said with what happens next. When the host
   * will not re-run by itself, the sentence ends with the press that will.
   * STRINGS: owner review pending (A11Y, DP-57 text pack).
   */
  const sayChange = (message) => {
    let waits = false;
    try {
      waits = !runsBySelf();
    } catch {
      waits = false;
    }
    if (!waits) return say(message);
    const base = /[.!?]$/.test(message) ? message : `${message}.`;
    let label = 'Convert again';
    try {
      label = startLabel() || label;
    } catch {
      label = 'Convert again';
    }
    say(`${base} ${waitingSentence(label)}`);
  };

  /** The controls a mode uses are the ones a person can move. */
  const syncEnabled = () => {
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
    // DP-79: Light and dark builds no ink mask, so there is nothing for the
    // speck floor to floor there; a switch that changes nothing is disabled.
    speck.input.disabled = settings.mode === 'standard';
  };
  const emit = () => {
    syncEnabled();
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
    const choice = choices.find((c) => c.value === settings.mode);
    sayChange(`${choice.label}. ${choice.description}`);
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
        sayChange(`${pair.range.previousSibling.textContent}: ${value}`);
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
    sayChange(`Wall color: ${label}`);
    emit();
  });

  // STRINGS: DP-R6 text pack rows 27 and 28 (A11Y): the change, then the
  // press that runs it, the way every other control on this panel says it.
  smooth.input.addEventListener('change', () => {
    settings.smooth = smooth.input.checked;
    sayChange(`${smooth.labelText}: ${settings.smooth ? 'on' : 'off'}`);
    emit();
  });
  speck.input.addEventListener('change', () => {
    settings.speckFloor = speck.input.checked;
    sayChange(`${speck.labelText}: ${settings.speckFloor ? 'on' : 'off'}`);
    emit();
  });

  return {
    element: root,
    getSettings: () => ({ ...settings }),
    /**
     * DP-79: what the picture is, from the host's quick look. A camera
     * picture starts with both photo defaults on, a file with both off. Said
     * by the help sentences rather than announced: the person has not acted
     * yet, and nothing re-runs.
     * @param {{camera?: boolean}} [look]
     */
    setPictureClass({ camera = false } = {}) {
      settings.smooth = !!camera;
      settings.speckFloor = !!camera;
      smooth.input.checked = settings.smooth;
      speck.input.checked = settings.speckFloor;
    },
    /**
     * DP-81 (D-175 b): the settings a drawing was traced with, put back on a
     * rebuilt control. Nothing is announced and nothing re-runs: the drawing
     * on the charm IS this trace, and the panel only has to agree with it.
     * Unknown keys and values are left alone.
     * @param {object} next
     */
    setSettings(next = {}) {
      if (
        typeof next.mode === 'string' &&
        choices.some((c) => c.value === next.mode)
      ) {
        settings.mode = next.mode;
        const radio = fieldset.querySelector(
          `input[type="radio"][value="${next.mode}"]`
        );
        if (radio) radio.checked = true;
      }
      const put = (key, pair) => {
        if (!Number.isFinite(Number(next[key]))) return;
        settings[key] = Number(next[key]);
        pair.range.value = String(Math.round(settings[key]));
        pair.number.value = pair.range.value;
      };
      put('lightnessMax', lightness);
      put('chromaMax', chroma);
      put('colourCount', colourCount);
      if (typeof next.wallColour === 'string') {
        settings.wallColour = next.wallColour;
        wallSelect.value = [...wallSelect.options].some(
          (o) => o.value === next.wallColour
        )
          ? next.wallColour
          : 'auto';
      }
      if (typeof next.smooth === 'boolean') {
        settings.smooth = next.smooth;
        smooth.input.checked = next.smooth;
      }
      if (typeof next.speckFloor === 'boolean') {
        settings.speckFloor = next.speckFloor;
        speck.input.checked = next.speckFloor;
      }
      syncEnabled();
    },
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
      summaryEl.textContent = colourSentence(colours, notes, purpose);
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
     * @param {{creditLine?: object|null, quiet?: boolean}} [extras] -
     *   `quiet` writes the sentence without announcing it: a refusal (DP-78)
     *   is one action whose one announcement the host makes, and the panel
     *   still shows what the worker found
     */
    setSummary(summary, pathCount, extras = {}) {
      const sentence = summarySentence(summary, pathCount);
      const filament = filamentSentence(summary, undefined, undefined, purpose);
      // DP-32's law: one action, one announcement. Choosing a picture and
      // converting it is one action, so what was traced and what was taken off
      // it are one sentence - not a second announcement arriving behind the
      // first and interrupting it.
      const credit = creditLineSentence(extras.creditLine);
      // DP-79: the size a camera picture was worked at, and the specks the
      // floor left out, in the same sentence (rows 7 to 9).
      const worked = workedSentence(summary && summary.working);
      const specks = specksSentence(summary);
      summaryEl.textContent = [sentence, filament, credit, worked, specks]
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
      if (extras.quiet) return;
      say(
        [sentence, credit, worked, specks, ...warnings]
          .filter(Boolean)
          .join(' ')
      );
    },
  };
}
