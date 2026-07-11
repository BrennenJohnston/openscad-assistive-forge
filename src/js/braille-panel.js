/**
 * Braille translation panel for the Braille Card Customizer.
 *
 * Manifest-driven (a `brailleTranslation` block in the example's
 * manifest.json): file-handler.js calls initBraillePanel() after the
 * parameter UI renders. The panel sits above the generated parameter
 * controls and turns plain text into Unicode braille Line_N parameter
 * values via the liblouis worker + the braille-wrap layout engine.
 *
 * The raw Line_N text inputs stay visible in the normal parameter panel,
 * so advanced users can still paste pre-translated braille manually.
 *
 * @license GPL-3.0-or-later
 */

import { stateManager } from './state.js';
import { setParameterValue } from './ui-generator.js';
import {
  translateText,
  getTables,
  disposeTranslator,
} from './braille-translator.js';
import { computeCapacity, layoutBrailleText, countCells } from './braille-wrap.js';

const DEBOUNCE_MS = 400;

const MARGIN_PRESETS = [
  { id: 'narrow', label: 'Narrow (6 mm)', value: 6 },
  { id: 'standard', label: 'Standard (12.7 mm / 0.5 in)', value: 12.7 },
  { id: 'wide', label: 'Wide (25.4 mm / 1 in)', value: 25.4 },
  { id: 'custom', label: 'Custom', value: null },
];

/** Geometry params that should trigger a re-wrap when edited directly. */
const CAPACITY_WATCH_KEYS = [
  'cardWidth',
  'cardHeight',
  'cellSpacing',
  'lineSpacing',
  'autoSize',
];

let panel = null;

/**
 * Create and mount the braille translation panel.
 * @param {Object} config - `brailleTranslation` block from manifest.json
 * @param {string[]} config.lineParams - SCAD Line_N parameter names, in order
 * @param {string} [config.tablesCatalog] - URL of tables.json
 * @param {string} [config.defaultTable] - Default liblouis table file
 * @param {Object} config.capacityParams - SCAD param names for capacity math
 */
export function initBraillePanel(config) {
  destroyBraillePanel();
  panel = new BraillePanel(config);
  panel.mount();
}

/** Remove the panel and release the liblouis worker. */
export function destroyBraillePanel() {
  if (panel) {
    panel.destroy();
    panel = null;
  }
}

/** @returns {boolean} Whether the panel is currently mounted (for tests) */
export function isBraillePanelActive() {
  return panel !== null;
}

class BraillePanel {
  constructor(config) {
    this.config = config;
    this.lineParams = config.lineParams || [];
    this.capacityParams = config.capacityParams || {};
    this.defaultTable = config.defaultTable || 'en-ueb-g1.ctb';
    this.tablesCatalog = config.tablesCatalog || '/liblouis/tables.json';

    this.el = null;
    this.refs = {};
    this.debounceTimer = null;
    this.layoutSeq = 0;
    this.cards = [[]];
    this.cellsPerLine = 0;
    this.currentCard = 0;
    this.isApplying = false;
    this.firstLayout = true;
    this.unsubscribe = null;
    this.lastWatchedValues = null;
  }

  // ------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------

  mount() {
    const parametersContainer = document.getElementById('parametersContainer');
    if (!parametersContainer?.parentNode) {
      console.warn('[BraillePanel] parametersContainer not found; not mounting');
      return;
    }

    this.el = this.build();
    parametersContainer.parentNode.insertBefore(this.el, parametersContainer);

    this.watchGeometryParams();
    // Populate the preview for the prefilled text once tables are known.
    // The first layout skips the parameter write when the SCAD defaults
    // already match, so loading the example does not queue a re-render.
    this.populateTables().then(() => this.scheduleLayout(0));
  }

  build() {
    const section = document.createElement('section');
    section.className = 'braille-panel';
    section.id = 'braillePanel';
    section.setAttribute('aria-labelledby', 'braillePanelHeading');

    const heading = document.createElement('h3');
    heading.id = 'braillePanelHeading';
    heading.className = 'braille-panel-heading';
    heading.textContent = 'Braille translation';
    section.appendChild(heading);

    // --- Text input -------------------------------------------------
    const textLabel = document.createElement('label');
    textLabel.setAttribute('for', 'brailleTextInput');
    textLabel.className = 'braille-panel-label';
    textLabel.textContent = 'Text to translate';
    section.appendChild(textLabel);

    const textHelp = document.createElement('p');
    textHelp.id = 'brailleTextHelp';
    textHelp.className = 'braille-panel-help';
    textHelp.textContent =
      'Translation runs on your device. Each new line starts a new braille line; long lines wrap automatically.';
    section.appendChild(textHelp);

    const textarea = document.createElement('textarea');
    textarea.id = 'brailleTextInput';
    textarea.className = 'braille-text-input';
    textarea.rows = 3;
    textarea.value = 'hello\nworld';
    textarea.setAttribute('aria-describedby', 'brailleTextHelp');
    textarea.addEventListener('input', () => this.scheduleLayout());
    section.appendChild(textarea);
    this.refs.textarea = textarea;

    // --- Table select -----------------------------------------------
    const tableLabel = document.createElement('label');
    tableLabel.setAttribute('for', 'brailleTableSelect');
    tableLabel.className = 'braille-panel-label';
    tableLabel.textContent = 'Language and grade';
    section.appendChild(tableLabel);

    const tableSelect = document.createElement('select');
    tableSelect.id = 'brailleTableSelect';
    tableSelect.className = 'braille-panel-select';
    tableSelect.setAttribute('aria-describedby', 'brailleTableHelp');
    tableSelect.addEventListener('change', () => this.scheduleLayout(0));
    section.appendChild(tableSelect);
    this.refs.tableSelect = tableSelect;

    const tableHelp = document.createElement('p');
    tableHelp.id = 'brailleTableHelp';
    tableHelp.className = 'braille-panel-help';
    tableHelp.textContent =
      'Uncontracted (Grade 1) is recommended for names, emails, and short contact details. Use contracted (Grade 2) only when space is limited.';
    section.appendChild(tableHelp);

    // --- Preserve caps toggle ----------------------------------------
    const capsRow = document.createElement('div');
    capsRow.className = 'braille-panel-toggle-row';

    const capsInput = document.createElement('input');
    capsInput.type = 'checkbox';
    capsInput.id = 'brailleCapsToggle';
    capsInput.checked = false;
    capsInput.setAttribute('aria-describedby', 'brailleCapsHelp');
    capsInput.addEventListener('change', () => this.scheduleLayout(0));
    capsRow.appendChild(capsInput);
    this.refs.capsInput = capsInput;

    const capsLabel = document.createElement('label');
    capsLabel.setAttribute('for', 'brailleCapsToggle');
    capsLabel.textContent = 'Preserve capital letters';
    capsRow.appendChild(capsLabel);
    section.appendChild(capsRow);

    const capsHelp = document.createElement('p');
    capsHelp.id = 'brailleCapsHelp';
    capsHelp.className = 'braille-panel-help';
    capsHelp.textContent =
      'Each capital letter adds an indicator cell. Leaving this off converts text to lowercase and saves about one cell per capital — standard practice for space-limited cards and labels.';
    section.appendChild(capsHelp);

    // --- Layout controls ---------------------------------------------
    const layoutDetails = document.createElement('details');
    layoutDetails.className = 'braille-panel-layout forge-disclosure';
    layoutDetails.open = false;

    const layoutSummary = document.createElement('summary');
    layoutSummary.textContent = 'Layout options';
    layoutDetails.appendChild(layoutSummary);

    // Margin preset + custom value
    const marginRow = document.createElement('div');
    marginRow.className = 'braille-panel-field-row';

    const marginPresetLabel = document.createElement('label');
    marginPresetLabel.setAttribute('for', 'brailleMarginPreset');
    marginPresetLabel.textContent = 'Margin';
    marginRow.appendChild(marginPresetLabel);

    const marginPreset = document.createElement('select');
    marginPreset.id = 'brailleMarginPreset';
    marginPreset.className = 'braille-panel-select';
    for (const preset of MARGIN_PRESETS) {
      const opt = document.createElement('option');
      opt.value = preset.id;
      opt.textContent = preset.label;
      marginPreset.appendChild(opt);
    }
    marginPreset.value = 'narrow';
    marginPreset.addEventListener('change', () => {
      const preset = MARGIN_PRESETS.find((p) => p.id === marginPreset.value);
      if (preset?.value !== null && preset?.value !== undefined) {
        marginInput.value = String(preset.value);
      }
      this.scheduleLayout(0);
    });
    marginRow.appendChild(marginPreset);
    this.refs.marginPreset = marginPreset;

    const marginInputLabel = document.createElement('label');
    marginInputLabel.setAttribute('for', 'brailleMarginInput');
    marginInputLabel.className = 'sr-only';
    marginInputLabel.textContent = 'Margin in millimetres';
    marginRow.appendChild(marginInputLabel);

    const marginInput = document.createElement('input');
    marginInput.type = 'number';
    marginInput.id = 'brailleMarginInput';
    marginInput.className = 'braille-panel-number';
    marginInput.min = '2';
    marginInput.max = '30';
    marginInput.step = '0.5';
    marginInput.value = '6';
    marginInput.addEventListener('change', () => {
      const val = Number(marginInput.value);
      const match = MARGIN_PRESETS.find((p) => p.value === val);
      marginPreset.value = match ? match.id : 'custom';
      this.scheduleLayout(0);
    });
    marginRow.appendChild(marginInput);
    this.refs.marginInput = marginInput;

    const marginUnit = document.createElement('span');
    marginUnit.className = 'braille-panel-unit';
    marginUnit.setAttribute('aria-hidden', 'true');
    marginUnit.textContent = 'mm';
    marginRow.appendChild(marginUnit);

    layoutDetails.appendChild(marginRow);

    // Auto-wrap toggle
    const wrapRow = document.createElement('div');
    wrapRow.className = 'braille-panel-toggle-row';
    const wrapInput = document.createElement('input');
    wrapInput.type = 'checkbox';
    wrapInput.id = 'brailleAutoWrap';
    wrapInput.checked = true;
    wrapInput.addEventListener('change', () => this.scheduleLayout(0));
    wrapRow.appendChild(wrapInput);
    const wrapLabel = document.createElement('label');
    wrapLabel.setAttribute('for', 'brailleAutoWrap');
    wrapLabel.textContent = 'Auto-wrap long lines at word boundaries';
    wrapRow.appendChild(wrapLabel);
    layoutDetails.appendChild(wrapRow);
    this.refs.wrapInput = wrapInput;

    // Split overflow toggle
    const splitRow = document.createElement('div');
    splitRow.className = 'braille-panel-toggle-row';
    const splitInput = document.createElement('input');
    splitInput.type = 'checkbox';
    splitInput.id = 'brailleSplitCards';
    splitInput.checked = true;
    splitInput.addEventListener('change', () => this.scheduleLayout(0));
    splitRow.appendChild(splitInput);
    const splitLabel = document.createElement('label');
    splitLabel.setAttribute('for', 'brailleSplitCards');
    splitLabel.textContent = 'Split overflow into additional cards';
    splitRow.appendChild(splitLabel);
    layoutDetails.appendChild(splitRow);
    this.refs.splitInput = splitInput;

    // Max rows per card
    const rowsRow = document.createElement('div');
    rowsRow.className = 'braille-panel-field-row';
    const rowsLabel = document.createElement('label');
    rowsLabel.setAttribute('for', 'brailleMaxRows');
    rowsLabel.textContent = 'Max rows per card';
    rowsRow.appendChild(rowsLabel);
    const rowsInput = document.createElement('input');
    rowsInput.type = 'number';
    rowsInput.id = 'brailleMaxRows';
    rowsInput.className = 'braille-panel-number';
    rowsInput.min = '1';
    rowsInput.max = String(this.lineParams.length || 20);
    rowsInput.step = '1';
    rowsInput.value = '5';
    rowsInput.addEventListener('change', () => this.scheduleLayout(0));
    rowsRow.appendChild(rowsInput);
    layoutDetails.appendChild(rowsRow);
    this.refs.rowsInput = rowsInput;

    section.appendChild(layoutDetails);

    // --- Preview ------------------------------------------------------
    const previewHeading = document.createElement('h4');
    previewHeading.className = 'braille-panel-subheading';
    previewHeading.id = 'braillePreviewHeading';
    previewHeading.textContent = 'Braille preview';
    section.appendChild(previewHeading);

    const preview = document.createElement('div');
    preview.className = 'braille-preview';
    preview.id = 'braillePreview';
    preview.setAttribute('role', 'group');
    preview.setAttribute('aria-labelledby', 'braillePreviewHeading');
    preview.setAttribute('aria-live', 'polite');
    section.appendChild(preview);
    this.refs.preview = preview;

    // --- Warnings -----------------------------------------------------
    const warningsBox = document.createElement('div');
    warningsBox.className = 'braille-warnings';
    warningsBox.id = 'brailleWarnings';
    warningsBox.setAttribute('role', 'alert');
    warningsBox.hidden = true;
    section.appendChild(warningsBox);
    this.refs.warnings = warningsBox;

    // --- Card pager ----------------------------------------------------
    const pager = document.createElement('div');
    pager.className = 'braille-card-pager';
    pager.id = 'brailleCardPager';
    pager.hidden = true;

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'btn btn-secondary braille-pager-btn';
    prevBtn.id = 'braillePrevCard';
    prevBtn.textContent = 'Previous card';
    prevBtn.addEventListener('click', () => this.showCard(this.currentCard - 1));
    pager.appendChild(prevBtn);
    this.refs.prevBtn = prevBtn;

    const pagerStatus = document.createElement('span');
    pagerStatus.className = 'braille-pager-status';
    pagerStatus.id = 'braillePagerStatus';
    pagerStatus.setAttribute('aria-live', 'polite');
    pager.appendChild(pagerStatus);
    this.refs.pagerStatus = pagerStatus;

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn btn-secondary braille-pager-btn';
    nextBtn.id = 'brailleNextCard';
    nextBtn.textContent = 'Next card';
    nextBtn.addEventListener('click', () => this.showCard(this.currentCard + 1));
    pager.appendChild(nextBtn);
    this.refs.nextBtn = nextBtn;

    const pagerHint = document.createElement('p');
    pagerHint.className = 'braille-panel-help braille-pager-hint';
    pagerHint.id = 'braillePagerHint';
    pager.appendChild(pagerHint);
    this.refs.pagerHint = pagerHint;

    section.appendChild(pager);
    this.refs.pager = pager;

    return section;
  }

  async populateTables() {
    try {
      const catalog = await getTables(this.tablesCatalog);
      const select = this.refs.tableSelect;
      select.innerHTML = '';
      for (const table of catalog.tables || []) {
        const opt = document.createElement('option');
        opt.value = table.file;
        opt.textContent = table.label;
        select.appendChild(opt);
      }
      const preferred = this.defaultTable || catalog.defaultTable;
      if (preferred) select.value = preferred;
    } catch (error) {
      console.warn('[BraillePanel] Failed to load table catalog:', error);
      // Fall back to the manifest default so translation still works.
      const select = this.refs.tableSelect;
      select.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = this.defaultTable;
      opt.textContent = 'English (UEB) Grade 1 — uncontracted';
      select.appendChild(opt);
    }
  }

  // ------------------------------------------------------------------
  // Geometry
  // ------------------------------------------------------------------

  /** Read a numeric SCAD parameter from state, with fallback. */
  readNumericParam(key, fallback) {
    const paramName = this.capacityParams[key];
    if (!paramName) return fallback;
    const raw = stateManager.getState().parameters?.[paramName];
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : fallback;
  }

  getGeometry() {
    return {
      cardWidthMm: this.readNumericParam('cardWidth', 85),
      cardHeightMm: this.readNumericParam('cardHeight', 55),
      cellSpacingMm: this.readNumericParam('cellSpacing', 7),
      lineSpacingMm: this.readNumericParam('lineSpacing', 10),
      marginMm: Number(this.refs.marginInput.value) || 6,
      maxRowsPerCard: Number(this.refs.rowsInput.value) || 5,
    };
  }

  /**
   * Re-wrap when the user edits card geometry directly in the parameter
   * panel (width, height, spacing). Guarded against the panel's own writes.
   */
  watchGeometryParams() {
    const readWatched = () => {
      const params = stateManager.getState().parameters || {};
      return CAPACITY_WATCH_KEYS.map(
        (key) => params[this.capacityParams[key]]
      ).join('\u0000');
    };
    this.lastWatchedValues = readWatched();

    this.unsubscribe = stateManager.subscribe(() => {
      if (this.isApplying) return;
      const next = readWatched();
      if (next !== this.lastWatchedValues) {
        this.lastWatchedValues = next;
        this.scheduleLayout();
      }
    });
  }

  // ------------------------------------------------------------------
  // Layout pipeline
  // ------------------------------------------------------------------

  scheduleLayout(delay = DEBOUNCE_MS) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.runLayout().catch((error) => {
        console.error('[BraillePanel] Layout failed:', error);
        this.renderWarnings([
          {
            type: 'engine-error',
            message:
              'Braille translation is unavailable: ' +
              error.message +
              ' — try reloading the page.',
          },
        ]);
      });
    }, delay);
  }

  async runLayout() {
    const seq = ++this.layoutSeq;
    const text = this.refs.textarea.value;
    const table = this.refs.tableSelect.value || this.defaultTable;
    const preserveCaps = this.refs.capsInput.checked;
    const geometry = this.getGeometry();

    const { cellsPerLine, rowsPerCard } = computeCapacity(geometry);

    const untranslatable = new Set();
    const translate = async (t) => {
      const result = await translateText(t, table, { preserveCaps });
      if (result.hadUntranslatable) untranslatable.add(t);
      return result.braille;
    };

    const layout = await layoutBrailleText({
      text,
      translate,
      cellsPerLine,
      rowsPerCard,
      autoWrap: this.refs.wrapInput.checked,
      splitCards: this.refs.splitInput.checked,
      maxTotalLines: this.lineParams.length,
    });

    if (seq !== this.layoutSeq) return; // superseded by newer input

    const warnings = [...layout.warnings];
    if (untranslatable.size > 0) {
      const sample = [...untranslatable].slice(0, 3).join('", "');
      warnings.push({
        type: 'untranslatable',
        message:
          `Some characters could not be translated to braille ` +
          `(in: "${sample}"). They may appear as blank or literal cells ` +
          `on the card.`,
      });
    }
    if (!preserveCaps && /\p{Lu}/u.test(text)) {
      warnings.push({
        type: 'caps-dropped',
        message:
          'Capital letters were converted to lowercase to save space. ' +
          'Turn on "Preserve capital letters" if you need capitals in braille.',
      });
    }

    this.cards = layout.cards;
    this.cellsPerLine = layout.cellsPerLine;
    this.currentCard = Math.min(this.currentCard, this.cards.length - 1);

    this.renderWarnings(warnings);
    this.showCard(this.currentCard, { announce: false });
    this.firstLayout = false;
  }

  // ------------------------------------------------------------------
  // Rendering + parameter writes
  // ------------------------------------------------------------------

  showCard(index, { announce = true } = {}) {
    this.currentCard = Math.max(0, Math.min(index, this.cards.length - 1));
    const card = this.cards[this.currentCard] || [];

    this.renderPreview(card);
    this.renderPager();
    this.applyCardToParams(card);

    if (announce) {
      stateManager.announceChange(
        `Card ${this.currentCard + 1} of ${this.cards.length}`
      );
    }
  }

  renderPreview(card) {
    const preview = this.refs.preview;
    preview.innerHTML = '';

    if (card.length === 0 || card.every((line) => line === '')) {
      const empty = document.createElement('p');
      empty.className = 'braille-panel-help';
      empty.textContent = 'Type text above to see the braille translation.';
      preview.appendChild(empty);
      return;
    }

    const list = document.createElement('ol');
    list.className = 'braille-preview-list';
    card.forEach((line, i) => {
      const item = document.createElement('li');
      item.className = 'braille-preview-line';

      const cells = countCells(line);
      const overflow = cells > this.cellsPerLine;

      const brailleSpan = document.createElement('span');
      brailleSpan.className = 'braille-preview-braille';
      brailleSpan.lang = 'und';
      brailleSpan.textContent = line || '(blank line)';
      item.appendChild(brailleSpan);

      const countSpan = document.createElement('span');
      countSpan.className =
        'braille-preview-count' + (overflow ? ' braille-preview-overflow' : '');
      countSpan.textContent = ` — line ${i + 1}: ${cells} / ${this.cellsPerLine} cells`;
      item.appendChild(countSpan);

      list.appendChild(item);
    });
    preview.appendChild(list);
  }

  renderWarnings(warnings) {
    const box = this.refs.warnings;
    box.innerHTML = '';
    if (!warnings || warnings.length === 0) {
      box.hidden = true;
      return;
    }
    const list = document.createElement('ul');
    list.className = 'braille-warnings-list';
    for (const warning of warnings) {
      const item = document.createElement('li');
      item.textContent = warning.message;
      list.appendChild(item);
    }
    box.appendChild(list);
    box.hidden = false;
  }

  renderPager() {
    const multi = this.cards.length > 1;
    this.refs.pager.hidden = !multi;
    if (!multi) return;

    this.refs.pagerStatus.textContent = `Card ${this.currentCard + 1} of ${this.cards.length}`;
    this.refs.prevBtn.disabled = this.currentCard === 0;
    this.refs.nextBtn.disabled = this.currentCard === this.cards.length - 1;
    this.refs.pagerHint.textContent =
      `Each card exports separately. Suggested file name: ` +
      `braille-card-${this.currentCard + 1}-of-${this.cards.length}.stl`;
  }

  /**
   * Write the current card's braille lines into the SCAD Line_N params
   * (plus grid capacity + margin) through the standard parameter-change
   * path, as a single undo step.
   */
  applyCardToParams(card) {
    const state = stateManager.getState();
    const currentParams = state.parameters || {};
    const geometry = this.getGeometry();
    const { cellsPerLine, rowsPerCard } = computeCapacity(geometry);

    const updates = {};
    this.lineParams.forEach((paramName, i) => {
      updates[paramName] = card[i] ?? '';
    });
    if (this.capacityParams.gridColumns) {
      updates[this.capacityParams.gridColumns] = String(cellsPerLine);
    }
    if (this.capacityParams.gridRows) {
      updates[this.capacityParams.gridRows] = String(rowsPerCard);
    }
    if (this.capacityParams.autoSizeMargin) {
      updates[this.capacityParams.autoSizeMargin] = String(geometry.marginMm);
    }

    const changed = Object.entries(updates).filter(
      ([name, value]) => String(currentParams[name] ?? '') !== String(value)
    );
    if (changed.length === 0) return;

    // On the very first layout (prefilled text mirroring the SCAD
    // defaults) leave the model untouched unless the braille lines
    // themselves differ — avoids re-rendering the just-loaded example
    // merely to sync grid capacity values.
    if (this.firstLayout) {
      const linesDiffer = this.lineParams.some(
        (name, i) => String(currentParams[name] ?? '') !== (card[i] ?? '')
      );
      if (!linesDiffer) return;
    }

    this.isApplying = true;
    // One undo entry for the whole translation apply; the per-control
    // change events below would otherwise each record history.
    stateManager.recordParameterState();
    stateManager.setHistoryEnabled(false);
    try {
      for (const [name, value] of changed) {
        const ok = setParameterValue(name, value);
        if (!ok) {
          console.warn(`[BraillePanel] No UI control for parameter: ${name}`);
        }
      }
    } finally {
      stateManager.setHistoryEnabled(true);
      this.isApplying = false;
    }
  }

  destroy() {
    clearTimeout(this.debounceTimer);
    this.layoutSeq++;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.el?.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
    disposeTranslator();
  }
}
