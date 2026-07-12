/**
 * Braille translation panel for the braille toolset (Braille Card
 * Customizer, Braille Charm, Braille Sign).
 *
 * Manifest-driven (a `brailleTranslation` block in the example's
 * manifest.json): file-handler.js calls initBraillePanel() after the
 * parameter UI renders. The panel sits above the generated parameter
 * controls and turns plain text into Unicode braille parameter values
 * via the liblouis worker + the braille-wrap layout engine.
 *
 * Modes (manifest `brailleTranslation.mode`):
 * - "card"  (default): multi-line text -> wrapped Line_N params, card
 *   size presets, multi-card splitting, render-all-cards support.
 * - "charm": one short text -> a single braille param (1-2 cells).
 * - "sign":  up to N lines -> paired raised-text + braille Line params.
 *
 * The raw braille text inputs stay visible in the normal parameter panel,
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

/** Card size at/above which we warn about common print-bed limits (mm). */
const BED_WARN_MM = 250;

const MARGIN_PRESETS = [
  { id: 'narrow', label: 'Narrow (6 mm)', value: 6 },
  { id: 'standard', label: 'Standard (12.7 mm / 0.5 in)', value: 12.7 },
  { id: 'wide', label: 'Wide (25.4 mm / 1 in)', value: 25.4 },
  { id: 'custom', label: 'Custom', value: null },
];

/**
 * Card size presets (landscape, mm). All within the SCAD slider ranges
 * (width 40-300, height 25-250). Selecting one writes the manual
 * width/height params and forces auto-size Off; manual edits to the
 * width/height sliders flip the select back to Custom.
 */
const SIZE_PRESETS = [
  { id: 'default', label: 'Default card (200 × 100 mm)', width: 200, height: 100 },
  { id: 'business', label: 'Business card (89 × 51 mm)', width: 89, height: 51 },
  { id: 'postcard', label: 'Postcard (152 × 102 mm)', width: 152, height: 102 },
  { id: 'greeting', label: 'Greeting card (178 × 127 mm / 5 × 7 in)', width: 178, height: 127 },
  { id: 'a5', label: 'A5 (210 × 148 mm)', width: 210, height: 148 },
  { id: 'a4', label: 'A4 (297 × 210 mm)', width: 297, height: 210 },
  { id: 'letter', label: 'US Letter (279 × 216 mm)', width: 279, height: 216 },
  { id: 'custom', label: 'Custom (use the width/height parameters)', width: null, height: null },
];

/**
 * Warning types that mean "content will not fit / was truncated" — these
 * render in the error tier (role="alert"). Everything else is
 * informational and renders in the warning tier (role="status").
 */
const ERROR_TYPES = new Set([
  'line-overflow',
  'rows-overflow',
  'word-too-long',
  'too-many-lines',
  'capacity-overflow',
  'charm-overflow',
  'engine-error',
]);

/** Geometry params that should trigger a re-wrap when edited directly. */
const CAPACITY_WATCH_KEYS = [
  'cardWidth',
  'cardHeight',
  'cellSpacing',
  'lineSpacing',
  'autoSize',
  'charHeight',
  'letterSpacing',
];

let panel = null;

/**
 * Create and mount the braille translation panel.
 * @param {Object} config - `brailleTranslation` block from manifest.json
 * @param {string} [config.mode='card'] - Panel mode: card | charm | sign
 * @param {string[]} [config.lineParams] - SCAD Line_N parameter names, in order
 * @param {string} [config.charParam] - Single braille param (charm mode)
 * @param {number} [config.maxCells=2] - Cell budget (charm mode)
 * @param {string[]} [config.textParams] - Raised-text params (sign mode),
 *   paired index-by-index with lineParams
 * @param {string} [config.tablesCatalog] - URL of tables.json
 * @param {string} [config.defaultTable] - Default liblouis table file
 * @param {Object} [config.capacityParams] - SCAD param names for capacity math
 * @param {Object} [config.multiCardParams] - SCAD param names for the
 *   All-cards layout mode (cardLayout, rowsPerCard)
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
    this.mode = config.mode || 'card';
    this.lineParams = config.lineParams || [];
    this.charParam = config.charParam || null;
    this.maxCells = Number(config.maxCells) || 2;
    this.textParams = config.textParams || [];
    this.capacityParams = config.capacityParams || {};
    this.multiCardParams = config.multiCardParams || {};
    this.defaultTable = config.defaultTable || 'en-ueb-g1.ctb';
    this.tablesCatalog = config.tablesCatalog || '/liblouis/tables.json';

    this.el = null;
    this.refs = {};
    this.debounceTimer = null;
    this.layoutSeq = 0;
    this.cards = [[]];
    this.allLines = [];
    this.cellsPerLine = 0;
    this.currentCard = 0;
    this.renderAll = false;
    this.isApplying = false;
    this.firstLayout = true;
    this.unsubscribe = null;
    this.lastWatchedValues = null;
    this.lastAnnouncedCards = 1;
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
    this.syncSizePresetFromParams();
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

    this.buildTextInput(section);
    this.buildTableSelect(section);
    this.buildCapsToggle(section);

    if (this.mode === 'card') {
      this.buildSizePreset(section);
      this.buildLayoutOptions(section);
    }

    this.buildPreview(section);
    this.buildMessageBoxes(section);

    if (this.mode === 'card') {
      this.buildMultiCardNotice(section);
      this.buildPager(section);
    }

    return section;
  }

  buildTextInput(section) {
    const textLabel = document.createElement('label');
    textLabel.setAttribute('for', 'brailleTextInput');
    textLabel.className = 'braille-panel-label';
    textLabel.textContent =
      this.mode === 'charm'
        ? 'Characters to translate'
        : 'Text to translate';
    section.appendChild(textLabel);

    const textHelp = document.createElement('p');
    textHelp.id = 'brailleTextHelp';
    textHelp.className = 'braille-panel-help';
    if (this.mode === 'charm') {
      textHelp.textContent =
        `Translation runs on your device. A charm fits ${this.maxCells} ` +
        `braille cells — usually one or two letters or one short ` +
        `contraction. Each capital letter adds an indicator cell that ` +
        `counts against the limit.`;
    } else if (this.mode === 'sign') {
      textHelp.textContent =
        `Translation runs on your device. Each line becomes a row of ` +
        `raised letters paired with its braille translation; long lines ` +
        `wrap onto new rows automatically — up to ` +
        `${this.lineParams.length} rows, and the sign grows to fit.`;
    } else {
      textHelp.textContent =
        'Translation runs on your device. Each new line starts a new braille line; long lines wrap automatically.';
    }
    section.appendChild(textHelp);

    let textInput;
    if (this.mode === 'charm') {
      textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.value = 'A';
    } else {
      textInput = document.createElement('textarea');
      textInput.rows = 3;
      textInput.value = this.mode === 'sign' ? 'Room 101' : 'hello\nworld';
    }
    textInput.id = 'brailleTextInput';
    textInput.className = 'braille-text-input';
    textInput.setAttribute('aria-describedby', 'brailleTextHelp');
    textInput.addEventListener('input', () => this.scheduleLayout());
    section.appendChild(textInput);
    this.refs.textarea = textInput;
  }

  buildTableSelect(section) {
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
      this.mode === 'sign'
        ? 'Contracted (Grade 2) is the ADA-recommended default for signage. Uncontracted (Grade 1) spells everything out letter by letter.'
        : 'Uncontracted (Grade 1) is recommended for names, emails, and short contact details. Use contracted (Grade 2) only when space is limited.';
    section.appendChild(tableHelp);
  }

  buildCapsToggle(section) {
    const capsRow = document.createElement('div');
    capsRow.className = 'braille-panel-toggle-row';

    const capsInput = document.createElement('input');
    capsInput.type = 'checkbox';
    capsInput.id = 'brailleCapsToggle';
    capsInput.checked = true;
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
      'On by default so the braille matches your text exactly. Each capital letter adds an indicator cell; turn this off to convert text to lowercase and save about one cell per capital (common for space-limited cards and labels).';
    section.appendChild(capsHelp);
  }

  buildSizePreset(section) {
    const sizeRow = document.createElement('div');
    sizeRow.className = 'braille-panel-field-row';

    const sizeLabel = document.createElement('label');
    sizeLabel.setAttribute('for', 'brailleSizePreset');
    sizeLabel.textContent = 'Card size';
    sizeRow.appendChild(sizeLabel);

    const sizeSelect = document.createElement('select');
    sizeSelect.id = 'brailleSizePreset';
    sizeSelect.className = 'braille-panel-select';
    sizeSelect.setAttribute('aria-describedby', 'brailleSizeHelp');
    for (const preset of SIZE_PRESETS) {
      const opt = document.createElement('option');
      opt.value = preset.id;
      opt.textContent = preset.label;
      sizeSelect.appendChild(opt);
    }
    sizeSelect.value = 'default';
    sizeSelect.addEventListener('change', () => this.applySizePreset());
    sizeRow.appendChild(sizeSelect);
    this.refs.sizeSelect = sizeSelect;

    section.appendChild(sizeRow);

    const sizeHelp = document.createElement('p');
    sizeHelp.id = 'brailleSizeHelp';
    sizeHelp.className = 'braille-panel-help';
    sizeHelp.textContent =
      'Sets the card width and height parameters and turns auto-sizing off. Editing the width or height parameters directly switches this to Custom.';
    section.appendChild(sizeHelp);
  }

  buildLayoutOptions(section) {
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
    rowsInput.value = '8';
    rowsInput.addEventListener('change', () => this.scheduleLayout(0));
    rowsRow.appendChild(rowsInput);
    layoutDetails.appendChild(rowsRow);
    this.refs.rowsInput = rowsInput;

    section.appendChild(layoutDetails);
  }

  buildPreview(section) {
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
  }

  buildMessageBoxes(section) {
    // Error tier: content will not fit / was truncated. role=alert so
    // screen readers announce immediately.
    const errorsBox = document.createElement('div');
    errorsBox.className = 'braille-messages braille-errors';
    errorsBox.id = 'brailleErrors';
    errorsBox.setAttribute('role', 'alert');
    errorsBox.hidden = true;
    section.appendChild(errorsBox);
    this.refs.errors = errorsBox;

    // Warning tier: informational. role=status so screen readers are not
    // interrupted needlessly.
    const warningsBox = document.createElement('div');
    warningsBox.className = 'braille-messages braille-warnings';
    warningsBox.id = 'brailleWarnings';
    warningsBox.setAttribute('role', 'status');
    warningsBox.hidden = true;
    section.appendChild(warningsBox);
    this.refs.warnings = warningsBox;
  }

  buildMultiCardNotice(section) {
    const notice = document.createElement('div');
    notice.className = 'braille-multi-card-notice';
    notice.id = 'brailleMultiCardNotice';
    notice.setAttribute('role', 'status');
    notice.hidden = true;

    const noticeBody = document.createElement('div');
    noticeBody.className = 'braille-multi-card-notice-body';

    const icon = buildIcon('info');
    icon.classList.add('braille-notice-icon');
    noticeBody.appendChild(icon);

    const noticeText = document.createElement('p');
    noticeText.className = 'braille-multi-card-notice-text';
    noticeText.id = 'brailleMultiCardNoticeText';
    noticeBody.appendChild(noticeText);
    this.refs.noticeText = noticeText;

    notice.appendChild(noticeBody);

    // Render-all toggle lives with the notice.
    const renderAllRow = document.createElement('div');
    renderAllRow.className = 'braille-panel-toggle-row';
    const renderAllInput = document.createElement('input');
    renderAllInput.type = 'checkbox';
    renderAllInput.id = 'brailleRenderAll';
    renderAllInput.checked = false;
    renderAllInput.setAttribute('aria-describedby', 'brailleRenderAllHelp');
    renderAllInput.addEventListener('change', () => {
      this.renderAll = renderAllInput.checked;
      this.showCard(this.currentCard, { announce: false });
      stateManager.announceChange(
        this.renderAll
          ? 'Render all cards in one file turned on'
          : 'Render all cards in one file turned off'
      );
    });
    renderAllRow.appendChild(renderAllInput);
    this.refs.renderAllInput = renderAllInput;

    const renderAllLabel = document.createElement('label');
    renderAllLabel.setAttribute('for', 'brailleRenderAll');
    renderAllLabel.textContent = 'Render all cards in one file';
    renderAllRow.appendChild(renderAllLabel);
    notice.appendChild(renderAllRow);

    const renderAllHelp = document.createElement('p');
    renderAllHelp.id = 'brailleRenderAllHelp';
    renderAllHelp.className = 'braille-panel-help';
    renderAllHelp.textContent =
      'Lays every card out on the bed in a single model, separated by the card_gap_mm parameter. Large sets may exceed your print bed — check the total depth before printing.';
    notice.appendChild(renderAllHelp);

    section.appendChild(notice);
    this.refs.notice = notice;
  }

  buildPager(section) {
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
      cardWidthMm: this.readNumericParam('cardWidth', 200),
      cardHeightMm: this.readNumericParam('cardHeight', 100),
      cellSpacingMm: this.readNumericParam('cellSpacing', 7),
      lineSpacingMm: this.readNumericParam('lineSpacing', 10),
      marginMm: Number(this.refs.marginInput?.value) || 6,
      maxRowsPerCard:
        Number(this.refs.rowsInput?.value) || this.lineParams.length || 8,
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
        this.syncSizePresetFromParams();
        this.scheduleLayout();
      }
    });
  }

  /** Match the size-preset select to the current width/height params. */
  syncSizePresetFromParams() {
    const select = this.refs.sizeSelect;
    if (!select) return;
    const width = this.readNumericParam('cardWidth', NaN);
    const height = this.readNumericParam('cardHeight', NaN);
    const match = SIZE_PRESETS.find(
      (p) => p.width === width && p.height === height
    );
    select.value = match ? match.id : 'custom';
  }

  /** Write the selected size preset into the SCAD parameters. */
  applySizePreset() {
    const select = this.refs.sizeSelect;
    const preset = SIZE_PRESETS.find((p) => p.id === select.value);
    if (!preset || preset.width === null) return;

    const updates = {};
    if (this.capacityParams.cardWidth) {
      updates[this.capacityParams.cardWidth] = String(preset.width);
    }
    if (this.capacityParams.cardHeight) {
      updates[this.capacityParams.cardHeight] = String(preset.height);
    }
    // Presets drive the manual size, so auto-size must be off.
    if (this.capacityParams.autoSize) {
      updates[this.capacityParams.autoSize] = 'Off';
    }
    this.writeParams(updates);
    this.scheduleLayout(0);
  }

  // ------------------------------------------------------------------
  // Layout pipeline
  // ------------------------------------------------------------------

  scheduleLayout(delay = DEBOUNCE_MS) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.runLayout().catch((error) => {
        console.error('[BraillePanel] Layout failed:', error);
        this.renderMessages([
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
    if (this.mode === 'charm') return this.runCharmLayout();
    if (this.mode === 'sign') return this.runSignLayout();
    return this.runCardLayout();
  }

  /** Shared translate wrapper that records untranslatable inputs. */
  makeTranslator(table, preserveCaps, untranslatable) {
    return async (t) => {
      const result = await translateText(t, table, { preserveCaps });
      if (result.hadUntranslatable) untranslatable.add(t);
      return result.braille;
    };
  }

  collectCommonWarnings(warnings, { untranslatable, preserveCaps, text }) {
    if (untranslatable.size > 0) {
      const sample = [...untranslatable].slice(0, 3).join('", "');
      warnings.push({
        type: 'untranslatable',
        message:
          `Some characters could not be translated to braille ` +
          `(in: "${sample}"). They may appear as blank or literal cells ` +
          `on the model.`,
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
  }

  async runCardLayout() {
    const seq = ++this.layoutSeq;
    const text = this.refs.textarea.value;
    const table = this.refs.tableSelect.value || this.defaultTable;
    const preserveCaps = this.refs.capsInput.checked;
    const geometry = this.getGeometry();

    const { cellsPerLine, rowsPerCard } = computeCapacity(geometry);

    const untranslatable = new Set();
    const translate = this.makeTranslator(table, preserveCaps, untranslatable);

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
    this.collectCommonWarnings(warnings, { untranslatable, preserveCaps, text });

    // Explicit capacity-overflow error: the laid-out text exceeds the
    // current card's space. Rows-overflow (splitting off) and
    // too-many-lines (hard ceiling) from the wrap engine are upgraded to
    // a message that states how much fits and what to do about it.
    const rowsOverflow = warnings.find((w) => w.type === 'rows-overflow');
    if (rowsOverflow) {
      const fits = Math.min(rowsPerCard, layout.allLines.length);
      rowsOverflow.message =
        `Only ${fits} of ${layout.allLines.length} braille lines fit on ` +
        `this card. Turn on "Split overflow into additional cards", raise ` +
        `"Max rows per card", or pick a larger card size preset.`;
    }
    const tooManyLines = warnings.find((w) => w.type === 'too-many-lines');
    if (tooManyLines) {
      tooManyLines.message +=
        ' Shorten the text or pick a larger card size preset.';
    }

    if (
      geometry.cardWidthMm > BED_WARN_MM ||
      geometry.cardHeightMm > BED_WARN_MM
    ) {
      warnings.push({
        type: 'oversized-bed',
        message:
          `The current card size (${geometry.cardWidthMm} × ` +
          `${geometry.cardHeightMm} mm) is larger than many printer beds ` +
          `(about 220–250 mm). Check your printer's build area before printing.`,
      });
    }

    this.cards = layout.cards;
    this.allLines = layout.allLines;
    this.cellsPerLine = layout.cellsPerLine;
    this.currentCard = Math.min(this.currentCard, this.cards.length - 1);

    this.renderMessages(warnings);
    this.showCard(this.currentCard, { announce: false });
    this.firstLayout = false;
  }

  async runCharmLayout() {
    const seq = ++this.layoutSeq;
    const text = this.refs.textarea.value.trim();
    const table = this.refs.tableSelect.value || this.defaultTable;
    const preserveCaps = this.refs.capsInput.checked;

    const untranslatable = new Set();
    const translate = this.makeTranslator(table, preserveCaps, untranslatable);
    const braille = text === '' ? '' : await translate(text);

    if (seq !== this.layoutSeq) return;

    const warnings = [];
    this.collectCommonWarnings(warnings, { untranslatable, preserveCaps, text });

    const cells = countCells(braille);
    if (cells > this.maxCells) {
      warnings.push({
        type: 'charm-overflow',
        message:
          `"${text}" translates to ${cells} braille cells but the charm ` +
          `fits ${this.maxCells}. Use fewer characters` +
          (preserveCaps && /\p{Lu}/u.test(text)
            ? ', or turn off "Preserve capital letters" (each capital adds an indicator cell).'
            : '.'),
      });
    }

    this.cards = [[{ braille, source: text }]];
    this.allLines = this.cards[0];
    this.cellsPerLine = this.maxCells;

    this.renderMessages(warnings);
    this.renderPreview(this.cards[0]);
    this.applyCharmToParams(braille);
    this.firstLayout = false;
  }

  async runSignLayout() {
    const seq = ++this.layoutSeq;
    const text = this.refs.textarea.value;
    const table = this.refs.tableSelect.value || this.defaultTable;
    const preserveCaps = this.refs.capsInput.checked;
    const maxLines = this.lineParams.length;

    const untranslatable = new Set();
    const translate = this.makeTranslator(table, preserveCaps, untranslatable);

    const geometry = this.getGeometry();
    const { cellsPerLine } = computeCapacity({
      ...geometry,
      maxRowsPerCard: maxLines,
    });

    // Each wrapped line is also a row of raised Latin letters, so the
    // wrap engine gets a second capacity: how many print characters fit
    // across the plate. Liberation Sans uppercase advances average
    // ~0.94 x size per character (measured with textmetrics; the SCAD's
    // CHAR_ADVANCE_FACTOR matches). The sign auto-fits its size to the
    // rows, so an unbreakable word wider than the set width is not an
    // error — the wrap capacity stretches to the longest word and the
    // sign widens with it.
    const charHeightMm = this.readNumericParam('charHeight', 16);
    const letterSpacing = this.readNumericParam('letterSpacing', 1.1);
    const advanceMm = charHeightMm * 0.94 * letterSpacing;
    const usableWidthMm = geometry.cardWidthMm - 2 * geometry.marginMm;
    const fitChars = Math.max(1, Math.floor(usableWidthMm / advanceMm));
    let longestWord = '';
    for (const word of text.split(/\s+/)) {
      if ([...word].length > [...longestWord].length) longestWord = word;
    }
    const longestWordChars = [...longestWord].length;
    const maxSourceChars = Math.max(fitChars, longestWordChars);

    const layout = await layoutBrailleText({
      text,
      translate,
      cellsPerLine,
      rowsPerCard: maxLines,
      autoWrap: true,
      splitCards: false,
      maxSourceChars,
      maxTotalLines: maxLines,
    });

    if (seq !== this.layoutSeq) return;

    const warnings = [...layout.warnings];
    if (longestWordChars > fitChars) {
      warnings.push({
        type: 'sign-widened',
        message:
          `"${longestWord}" needs about ` +
          `${Math.ceil(longestWordChars * advanceMm)} mm of raised ` +
          `letters, more than the set sign width fits. With auto-fit on ` +
          `(the default) the sign widens to match; otherwise widen ` +
          `sign_width_mm or use a smaller character height.`,
      });
    }
    const tooManyLines = warnings.find((w) => w.type === 'too-many-lines');
    if (tooManyLines) {
      tooManyLines.message =
        `The sign holds ${maxLines} lines but the text needs ` +
        `${tooManyLines.needed ?? 'more'}. The extra lines were dropped — ` +
        `shorten the text or split it across multiple signs.`;
    }
    this.collectCommonWarnings(warnings, { untranslatable, preserveCaps, text });

    const lines = layout.allLines;
    this.cards = [lines];
    this.allLines = lines;
    this.cellsPerLine = layout.cellsPerLine;

    this.renderMessages(warnings);
    this.renderPreview(lines);
    this.applySignToParams(lines);
    this.firstLayout = false;
  }

  // ------------------------------------------------------------------
  // Rendering + parameter writes
  // ------------------------------------------------------------------

  showCard(index, { announce = true } = {}) {
    this.currentCard = Math.max(0, Math.min(index, this.cards.length - 1));
    const card = this.cards[this.currentCard] || [];

    // Settle the multi-card state (may exit render-all mode when the
    // text shrinks back to one card) before previewing/applying.
    this.renderMultiCardUI();
    this.renderPreview(this.renderAll ? this.allLines : card);
    if (this.renderAll) {
      this.applyAllCardsToParams();
    } else {
      this.applyCardToParams(card);
    }

    if (announce) {
      stateManager.announceChange(
        `Card ${this.currentCard + 1} of ${this.cards.length}`
      );
    }
  }

  renderPreview(lines) {
    const preview = this.refs.preview;
    preview.innerHTML = '';

    if (
      lines.length === 0 ||
      lines.every((line) => (line.braille ?? '') === '')
    ) {
      const empty = document.createElement('p');
      empty.className = 'braille-panel-help';
      empty.textContent = 'Type text above to see the braille translation.';
      preview.appendChild(empty);
      return;
    }

    const list = document.createElement('ol');
    list.className = 'braille-preview-list';
    lines.forEach((line, i) => {
      const braille = line.braille ?? '';
      const source = line.source ?? '';
      const item = document.createElement('li');
      item.className = 'braille-preview-line';

      const cells = countCells(braille);
      const overflow = cells > this.cellsPerLine;

      const brailleSpan = document.createElement('span');
      brailleSpan.className = 'braille-preview-braille';
      brailleSpan.lang = 'und';
      brailleSpan.textContent = braille || '(blank line)';
      item.appendChild(brailleSpan);

      const countSpan = document.createElement('span');
      countSpan.className =
        'braille-preview-count' + (overflow ? ' braille-preview-overflow' : '');
      countSpan.textContent =
        this.mode === 'charm'
          ? ` — ${cells} / ${this.cellsPerLine} cells`
          : ` — line ${i + 1}: ${cells} / ${this.cellsPerLine} cells`;
      item.appendChild(countSpan);

      if (source !== '') {
        const sourceSpan = document.createElement('span');
        sourceSpan.className = 'braille-preview-source';
        sourceSpan.textContent = source;
        item.appendChild(sourceSpan);
      }

      list.appendChild(item);
    });
    preview.appendChild(list);
  }

  /**
   * Render translation problems split into an error tier (blocking:
   * content will not fit) and a warning tier (informational).
   * @param {Array<{ type: string, message: string }>} messages
   */
  renderMessages(messages) {
    const errors = (messages || []).filter((m) => ERROR_TYPES.has(m.type));
    const warnings = (messages || []).filter((m) => !ERROR_TYPES.has(m.type));
    renderMessageTier(this.refs.errors, errors, 'error');
    renderMessageTier(this.refs.warnings, warnings, 'warning');
  }

  /** Legacy single-box entry point (kept for engine errors). */
  renderWarnings(warnings) {
    this.renderMessages(warnings);
  }

  renderMultiCardUI() {
    if (this.mode !== 'card') return;
    const multi = this.cards.length > 1;

    // Prominent notice + render-all toggle
    this.refs.notice.hidden = !multi;
    if (multi) {
      this.refs.noticeText.textContent =
        `Your text spans ${this.cards.length} cards. Each card must be ` +
        `rendered and downloaded separately to complete the full text — ` +
        `or render all ${this.cards.length} cards at once with the toggle below.`;
      if (this.cards.length !== this.lastAnnouncedCards) {
        stateManager.announceChange(
          `Your text now spans ${this.cards.length} cards.`
        );
      }
    } else if (this.renderAll) {
      // Dropped back to a single card: leave render-all mode (the caller
      // applies the single card right after this).
      this.renderAll = false;
      this.refs.renderAllInput.checked = false;
    }
    this.lastAnnouncedCards = this.cards.length;

    // Pager (hidden in render-all mode; the whole set is one model)
    const showPager = multi && !this.renderAll;
    this.refs.pager.hidden = !showPager;
    if (showPager) {
      this.refs.pagerStatus.textContent = `Card ${this.currentCard + 1} of ${this.cards.length}`;
      this.refs.prevBtn.disabled = this.currentCard === 0;
      this.refs.nextBtn.disabled = this.currentCard === this.cards.length - 1;
      this.refs.pagerHint.textContent =
        `Each card exports separately. Suggested file name: ` +
        `braille-card-${this.currentCard + 1}-of-${this.cards.length}.stl`;
    } else if (multi && this.renderAll) {
      this.refs.noticeText.textContent =
        `Rendering all ${this.cards.length} cards in one file, laid out ` +
        `on the bed with a gap between cards. Suggested file name: ` +
        `braille-cards-all.stl`;
    }
  }

  /**
   * Write parameter updates through the standard parameter-change path
   * as a single undo step. Skips writes when nothing changed.
   * @param {Object<string, string>} updates - Param name -> value
   * @param {Object} [opts]
   * @param {boolean} [opts.skipIfFirstLayout=false] - Suppress the write
   *   on the very first layout when only capacity/meta values differ
   * @returns {boolean} Whether anything was written
   */
  writeParams(updates, { skipIfFirstLayout = false } = {}) {
    const currentParams = stateManager.getState().parameters || {};
    const changed = Object.entries(updates).filter(
      ([name, value]) => String(currentParams[name] ?? '') !== String(value)
    );
    if (changed.length === 0) return false;
    if (skipIfFirstLayout) return false;

    this.isApplying = true;
    // One undo entry for the whole apply; the per-control change events
    // below would otherwise each record history.
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
      // Keep the geometry watcher in sync with our own writes.
      const params = stateManager.getState().parameters || {};
      this.lastWatchedValues = CAPACITY_WATCH_KEYS.map(
        (key) => params[this.capacityParams[key]]
      ).join('\u0000');
    }
    return true;
  }

  /**
   * Write the current card's braille lines into the SCAD Line_N params
   * (plus grid capacity + margin) as a single undo step.
   * @param {Array<{ braille: string, source: string }>} card
   */
  applyCardToParams(card) {
    const geometry = this.getGeometry();
    const { cellsPerLine, rowsPerCard } = computeCapacity(geometry);

    const updates = {};
    this.lineParams.forEach((paramName, i) => {
      updates[paramName] = card[i]?.braille ?? '';
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
    if (this.multiCardParams.cardLayout) {
      updates[this.multiCardParams.cardLayout] = 'Single';
    }

    // On the very first layout (prefilled text mirroring the SCAD
    // defaults) leave the model untouched unless the braille lines
    // themselves differ — avoids re-rendering the just-loaded example
    // merely to sync grid capacity values.
    const currentParams = stateManager.getState().parameters || {};
    const linesDiffer = this.lineParams.some(
      (name, i) => String(currentParams[name] ?? '') !== (card[i]?.braille ?? '')
    );
    this.writeParams(updates, {
      skipIfFirstLayout: this.firstLayout && !linesDiffer,
    });
  }

  /**
   * Write ALL wrapped lines plus the All-cards layout params, so the
   * SCAD renders every card in one model.
   */
  applyAllCardsToParams() {
    const geometry = this.getGeometry();
    const { cellsPerLine, rowsPerCard } = computeCapacity(geometry);

    const updates = {};
    this.lineParams.forEach((paramName, i) => {
      updates[paramName] = this.allLines[i]?.braille ?? '';
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
    if (this.multiCardParams.cardLayout) {
      updates[this.multiCardParams.cardLayout] = 'All cards';
    }
    if (this.multiCardParams.rowsPerCard) {
      updates[this.multiCardParams.rowsPerCard] = String(rowsPerCard);
    }
    this.writeParams(updates);
  }

  /** Write the charm's braille characters param. */
  applyCharmToParams(braille) {
    if (!this.charParam) return;
    const currentParams = stateManager.getState().parameters || {};
    const differs = String(currentParams[this.charParam] ?? '') !== braille;
    this.writeParams(
      { [this.charParam]: braille },
      { skipIfFirstLayout: this.firstLayout && !differs }
    );
  }

  /**
   * Write paired raised-text + braille params for the sign.
   * @param {Array<{ braille: string, source: string }>} lines
   */
  applySignToParams(lines) {
    const updates = {};
    this.lineParams.forEach((paramName, i) => {
      updates[paramName] = lines[i]?.braille ?? '';
    });
    this.textParams.forEach((paramName, i) => {
      updates[paramName] = lines[i]?.source ?? '';
    });

    const currentParams = stateManager.getState().parameters || {};
    const differs =
      this.lineParams.some(
        (name, i) =>
          String(currentParams[name] ?? '') !== (lines[i]?.braille ?? '')
      ) ||
      this.textParams.some(
        (name, i) =>
          String(currentParams[name] ?? '') !== (lines[i]?.source ?? '')
      );
    this.writeParams(updates, {
      skipIfFirstLayout: this.firstLayout && !differs,
    });
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

// ---------------------------------------------------------------------------
// Message tier rendering (module-level helpers)
// ---------------------------------------------------------------------------

/**
 * Render one severity tier into its container box.
 * Severity is conveyed by a text prefix AND an icon (never color alone).
 * @param {HTMLElement} box - Tier container
 * @param {Array<{ type: string, message: string }>} items
 * @param {'error'|'warning'} severity
 */
function renderMessageTier(box, items, severity) {
  if (!box) return;
  box.innerHTML = '';
  if (!items || items.length === 0) {
    box.hidden = true;
    return;
  }
  const list = document.createElement('ul');
  list.className = 'braille-messages-list';
  for (const item of items) {
    const li = document.createElement('li');
    li.className = `braille-message braille-message-${severity}`;

    li.appendChild(buildIcon(severity));

    const text = document.createElement('span');
    text.className = 'braille-message-text';
    const prefix = document.createElement('strong');
    prefix.textContent = severity === 'error' ? 'Error: ' : 'Warning: ';
    text.appendChild(prefix);
    text.appendChild(document.createTextNode(item.message));
    li.appendChild(text);

    list.appendChild(li);
  }
  box.appendChild(list);
  box.hidden = false;
}

/**
 * Build a small decorative SVG icon (aria-hidden; the text prefix carries
 * the meaning for assistive tech).
 * @param {'error'|'warning'|'info'} kind
 * @returns {SVGElement}
 */
function buildIcon(kind) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('braille-message-icon');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'currentColor');
  if (kind === 'error') {
    // Octagon with X
    path.setAttribute(
      'd',
      'M5.1 1h5.8L15 5.1v5.8L10.9 15H5.1L1 10.9V5.1L5.1 1zm.6 4.3-.4.4L7.3 8l-2 2.3.4.4L8 8.7l2.3 2 .4-.4L8.7 8l2-2.3-.4-.4L8 7.3l-2.3-2z'
    );
  } else if (kind === 'warning') {
    // Triangle with exclamation mark
    path.setAttribute(
      'd',
      'M8 1.5 15.5 14H.5L8 1.5zM7.4 6v4h1.2V6H7.4zm0 5.2v1.3h1.2v-1.3H7.4z'
    );
  } else {
    // Circle with i
    path.setAttribute(
      'd',
      'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm-.6 5.5v5h1.2v-5H7.4zm0-2.5v1.3h1.2V4H7.4z'
    );
  }
  svg.appendChild(path);
  return svg;
}
