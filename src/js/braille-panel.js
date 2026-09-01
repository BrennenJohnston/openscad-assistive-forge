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
 * - "sign":  raised-text rows + braille rows, wrapped independently
 *   (braille packs denser; ADA 703.3.2 permits differing line breaks).
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
  backTranslateText,
  getTables,
  disposeTranslator,
} from './braille-translator.js';
import {
  computeCapacity,
  layoutBrailleText,
  layoutSignText,
  chunkIntoCards,
  countCells,
  BRAILLE_SPACE,
} from './braille-wrap.js';

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
 * width/height params and forces auto-size Off; the auto option turns
 * auto-size back On (the SCAD default); manual edits to the width/height
 * sliders flip the select back to Custom.
 */
const SIZE_PRESETS = [
  { id: 'auto', label: 'Auto-size to fit text', width: null, height: null },
  {
    id: 'default',
    label: 'Default card (200 × 100 mm)',
    width: 200,
    height: 100,
  },
  {
    id: 'business',
    label: 'Business card (89 × 51 mm)',
    width: 89,
    height: 51,
  },
  { id: 'postcard', label: 'Postcard (152 × 102 mm)', width: 152, height: 102 },
  {
    id: 'greeting',
    label: 'Greeting card (178 × 127 mm / 5 × 7 in)',
    width: 178,
    height: 127,
  },
  { id: 'a5', label: 'A5 (210 × 148 mm)', width: 210, height: 148 },
  { id: 'a4', label: 'A4 (297 × 210 mm)', width: 297, height: 210 },
  { id: 'letter', label: 'US Letter (279 × 216 mm)', width: 279, height: 216 },
  {
    id: 'custom',
    label: 'Custom (use the width/height parameters)',
    width: null,
    height: null,
  },
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
  'braille-field-invalid',
  'engine-error',
]);

/** Matches one character of the Unicode braille block. */
const BRAILLE_CHAR_RE = /^[\u2800-\u28FF]$/;

/** Geometry params that should trigger a re-wrap when edited directly. */
const CAPACITY_WATCH_KEYS = [
  'cardWidth',
  'cardHeight',
  'cellSpacing',
  'lineSpacing',
  'gridRows',
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
 * @param {string[]} [config.textParams] - Raised-text params (sign mode);
 *   filled from the letter rows while lineParams get the independently
 *   wrapped braille rows
 * @param {string} [config.tablesCatalog] - URL of tables.json
 * @param {string} [config.defaultTable] - Default liblouis table file
 * @param {Object} [config.capacityParams] - SCAD param names for capacity math
 * @param {Object} [config.multiCardParams] - SCAD param names for the
 *   All-cards layout mode (cardLayout, rowsPerCard)
 * @param {Object} [config.multiCharmParams] - SCAD param names for the
 *   All-charms layout mode (charmParams, charmLayout, charmGap)
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

/**
 * Friendly download base name for the current braille model, or null when
 * the panel is not mounted or there is nothing to name (callers then fall
 * back to the standard hashed filename).
 * @returns {string|null} e.g. "Braille Charm B", "Braille Card 1 of 2
 *   hello", "Braille Sign Exit"
 */
export function getBrailleDownloadName() {
  if (!panel) return null;
  if (panel.mode === 'charm') return panel.getCharmDownloadName();
  if (panel.mode === 'card') return panel.getCardDownloadName();
  if (panel.mode === 'sign') return panel.getSignDownloadName();
  return null;
}

/**
 * First word of a text usable in a file name: filesystem-unsafe
 * characters stripped, capped at 30 characters. Empty string when the
 * text has no usable word. (Adapted from the braille-cylinder project's
 * sanitizeFilenameWord/firstWordOf pair.)
 * @param {string} text - Multi-line plain text
 * @returns {string}
 */
function firstFilenameWord(text) {
  for (const line of (text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const word = trimmed
      .split(/\s+/)[0]
      .substring(0, 30)
      .replace(/[^\w-]/g, '')
      .replace(/^[-_]+|[-_]+$/g, '');
    if (word) return word;
  }
  return '';
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
    this.multiCharmParams = config.multiCharmParams || {};
    this.charmParams = this.multiCharmParams.charmParams || [];
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
    // Charm mode: one charm per character, generate-all ON by default
    this.charms = [];
    this.currentCharm = 0;
    this.generateAll = true;
    this.isApplying = false;
    this.firstLayout = true;
    this.unsubscribe = null;
    this.lastWatchedValues = null;
    this.lastGridRowsParam = null;
    this.lastAnnouncedCards = 1;
    this.lastRowClampAnnounced = null;
    // Braille editor (card mode): pristine mirrors a translation and is
    // cleared when the text changes; dirty means hand-edited (only the
    // "Translate to braille" button may overwrite it).
    this.fieldDirty = false;
    // Back-translated first word for download names when braille is the
    // only input (computed asynchronously, cached per first line).
    this.fieldDownloadWord = null;
    this.lastFieldWordSource = null;
  }

  // ------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------

  mount() {
    const parametersContainer = document.getElementById('parametersContainer');
    if (!parametersContainer?.parentNode) {
      console.warn(
        '[BraillePanel] parametersContainer not found; not mounting'
      );
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

    // The braille editor applies wherever the model carries braille rows
    // the user might want to hand-correct. Charm mode is one cell per
    // character with no rows to edit, so it stays out.
    if (this.mode === 'card' || this.mode === 'sign') {
      this.buildBrailleField(section);
    }
    if (this.mode === 'card') {
      this.buildSizePreset(section);
      this.buildLayoutOptions(section);
    }

    this.buildPreview(section);
    this.buildMessageBoxes(section);

    if (this.mode === 'card' || this.mode === 'charm') {
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
      this.mode === 'charm' ? 'Characters to translate' : 'Text to translate';
    section.appendChild(textLabel);

    const textHelp = document.createElement('p');
    textHelp.id = 'brailleTextHelp';
    textHelp.className = 'braille-panel-help';
    if (this.mode === 'charm') {
      textHelp.textContent =
        `Translation runs on your device. Each character becomes its own ` +
        `charm — type a word to get one charm per letter. A charm face ` +
        `fits ${this.maxCells} braille cells; a capital letter's ` +
        `indicator cell shares its charm.`;
    } else if (this.mode === 'sign') {
      textHelp.textContent =
        `Translation runs on your device. Long lines wrap onto new rows ` +
        `of raised letters automatically, and the braille below packs ` +
        `its own rows to fill the sign width (ADA places braille in one ` +
        `block below the text) — up to ${this.lineParams.length} rows ` +
        `each, and the sign grows to fit.`;
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
    textInput.addEventListener('input', () => {
      this.handleSourceTextEdited();
      this.scheduleLayout();
    });
    section.appendChild(textInput);
    this.refs.textarea = textInput;
  }

  /**
   * Build the braille editor (card and sign modes): an editable Unicode
   * braille textarea with a dirty-state lock. Whenever it has content
   * the model uses those cells exactly as written; "Translate to
   * braille" fills it from the text above, "Translate to text"
   * back-translates it so a braille reader can verify pasted braille.
   * (Ported from the braille-cylinder project's Braille (Unicode) field.)
   *
   * On a sign this drives the braille plate only — the raised letters
   * keep coming from the text box, since ADA 703 treats the two as
   * separate plates and a hand-corrected contraction should not silently
   * rewrite the printed word above it.
   */
  buildBrailleField(section) {
    const isSign = this.mode === 'sign';
    const details = document.createElement('details');
    details.className = 'braille-panel-field-editor forge-disclosure';
    details.id = 'brailleFieldEditor';
    details.open = false;

    const summary = document.createElement('summary');
    summary.textContent = 'Braille editor (Unicode)';
    details.appendChild(summary);

    const help = document.createElement('p');
    help.id = 'brailleFieldHelp';
    help.className = 'braille-panel-help';
    help.textContent = isSign
      ? 'Accepts braille characters only (U+2800–U+28FF), one line per ' +
        'braille row on the sign. Press "Translate to braille" to fill ' +
        'this editor from your text, then edit any cell you want to ' +
        'change — or paste braille straight in and press "Translate to ' +
        'text" to read it back. Whenever this editor has content the ' +
        'braille plate uses it exactly as written, while the raised ' +
        'letters still come from the text above; clear it to go back to ' +
        'translating.'
      : 'Accepts braille characters only (U+2800–U+28FF), one line per card ' +
        'row. Press "Translate to braille" to fill this editor from your ' +
        'text, then edit any cell you want to change — or paste braille ' +
        'straight in and press "Translate to text" to read it back. ' +
        'Whenever this editor has content the card uses it exactly as ' +
        'written; clear it to go back to translating the text above.';
    details.appendChild(help);

    const toBrailleRow = document.createElement('div');
    toBrailleRow.className = 'braille-translate-row';
    const toBrailleBtn = document.createElement('button');
    toBrailleBtn.type = 'button';
    toBrailleBtn.className = 'btn btn-secondary braille-translate-btn';
    toBrailleBtn.id = 'brailleFieldFromText';
    toBrailleBtn.textContent = 'Translate to braille';
    toBrailleBtn.setAttribute('aria-describedby', 'brailleFieldHelp');
    toBrailleBtn.addEventListener('click', () => {
      this.fillBrailleFieldFromText().catch((error) => {
        this.setFieldStatus(`Translation failed: ${error.message}`);
      });
    });
    toBrailleRow.appendChild(toBrailleBtn);
    details.appendChild(toBrailleRow);

    const fieldLabel = document.createElement('label');
    fieldLabel.setAttribute('for', 'brailleFieldInput');
    fieldLabel.className = 'braille-panel-label';
    fieldLabel.textContent = isSign
      ? 'Braille (Unicode) — one line per braille row'
      : 'Braille (Unicode) — one line per row';
    details.appendChild(fieldLabel);

    const field = document.createElement('textarea');
    field.id = 'brailleFieldInput';
    field.className = 'braille-text-input braille-field-input';
    field.rows = 3;
    field.setAttribute('lang', 'und-Brai');
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('spellcheck', 'false');
    field.setAttribute(
      'aria-describedby',
      'brailleFieldHelp brailleFieldStatus'
    );
    field.addEventListener('input', () => {
      this.fieldDirty = field.value !== '';
      this.setFieldStatus(
        field.value === ''
          ? 'Empty — the text above is translated instead.'
          : 'Edited by hand — this braille is used exactly as written.'
      );
      this.scheduleLayout();
    });
    details.appendChild(field);
    this.refs.fieldInput = field;

    const toTextRow = document.createElement('div');
    toTextRow.className = 'braille-translate-row';
    const toTextBtn = document.createElement('button');
    toTextBtn.type = 'button';
    toTextBtn.className = 'btn btn-secondary braille-translate-btn';
    toTextBtn.id = 'brailleFieldToText';
    toTextBtn.textContent = 'Translate to text';
    toTextBtn.setAttribute('aria-describedby', 'brailleFieldHelp');
    toTextBtn.addEventListener('click', () => {
      this.fillTextFromBrailleField().catch((error) => {
        this.setFieldStatus(`Back-translation failed: ${error.message}`);
      });
    });
    toTextRow.appendChild(toTextBtn);
    details.appendChild(toTextRow);

    // Visible status doubles as the live region, so screen readers hear
    // fills/clears without a separate hidden announcer.
    const status = document.createElement('p');
    status.id = 'brailleFieldStatus';
    status.className = 'braille-panel-help braille-field-status';
    status.setAttribute('role', 'status');
    details.appendChild(status);
    this.refs.fieldStatus = status;

    const numberNote = document.createElement('p');
    numberNote.id = 'brailleNumberSignHelp';
    numberNote.className = 'braille-panel-help';
    numberNote.textContent =
      'UEB number signs: a hyphen or parenthesis ends numeric mode, so ' +
      '206-543-4779 correctly needs three number signs — that is correct ' +
      'UEB output, not a bug. The BANA form 206.543.4779 keeps numeric ' +
      'mode through the periods and needs only one. To adjust individual ' +
      'cells by hand, use this editor.';
    details.appendChild(numberNote);

    section.appendChild(details);
    this.refs.fieldEditor = details;
  }

  /**
   * @returns {boolean} Whether the braille editor exists for this mode and
   *   holds content, in which case it overrides translation
   */
  isBrailleFieldActive() {
    return (
      (this.mode === 'card' || this.mode === 'sign') &&
      (this.refs.fieldInput?.value ?? '').trim() !== ''
    );
  }

  /** Update the braille editor's visible status line (a live region). */
  setFieldStatus(message) {
    if (this.refs.fieldStatus) this.refs.fieldStatus.textContent = message;
  }

  /**
   * Dirty-state lock: while the braille editor merely mirrors a
   * translation (pristine), editing the source text clears it so the
   * stale braille cannot silently win. Hand-edited braille stays the
   * authority until the user clears it themselves.
   */
  handleSourceTextEdited() {
    const field = this.refs.fieldInput;
    if (!field || field.value === '' || this.fieldDirty) return;
    field.value = '';
    this.setFieldStatus(
      'Braille editor cleared because the text changed — press ' +
        '"Translate to braille" to refresh it.'
    );
  }

  /**
   * Fill the braille editor from the current text via the normal
   * translate-and-wrap pipeline (one editor line per wrapped card row).
   * Overwriting hand-edited content is allowed here — this button is the
   * one deliberate way to do it — and announced via the status region.
   */
  async fillBrailleFieldFromText() {
    const field = this.refs.fieldInput;
    if (!field) return;

    const seq = ++this.layoutSeq;
    let rows;

    if (this.mode === 'sign') {
      // Clear first so the editor does not divert this pass down the
      // verbatim path and refill itself from its own contents.
      field.value = '';
      const { layout } = await this.buildSignLayout();
      if (seq !== this.layoutSeq) return;
      rows = layout.brailleRows;
    } else {
      const table = this.refs.tableSelect.value || this.defaultTable;
      const preserveCaps = this.refs.capsInput.checked;
      const geometry = this.getGeometry();
      const { cellsPerLine, rowsPerCard } = computeCapacity(geometry);

      const untranslatable = new Set();
      const translate = this.makeTranslator(
        table,
        preserveCaps,
        untranslatable
      );
      const layout = await layoutBrailleText({
        text: this.refs.textarea.value,
        translate,
        cellsPerLine,
        rowsPerCard,
        autoWrap: this.refs.wrapInput.checked,
        splitCards: this.refs.splitInput.checked,
        maxTotalLines: this.lineParams.length,
      });
      if (seq !== this.layoutSeq) return;
      rows = layout.allLines;
    }

    field.value = rows.map((line) => line.braille).join('\n');
    this.fieldDirty = false;
    const n = rows.length;
    this.setFieldStatus(
      `Filled from your text — ${n} braille line${n === 1 ? '' : 's'}. ` +
        'Edits here are used exactly as written.'
    );
    this.scheduleLayout(0);
  }

  /**
   * Back-translate the braille editor's lines into the text box so a
   * braille reader can verify pasted braille. The braille stays the
   * authority (the editor keeps its content and its dirty state).
   */
  async fillTextFromBrailleField() {
    const field = this.refs.fieldInput;
    if (!field) return;

    const table = this.refs.tableSelect.value || this.defaultTable;
    const lines = field.value.replace(/\r\n?/g, '\n').split('\n');
    const texts = [];
    for (const line of lines) {
      texts.push(
        line.trim() === '' ? '' : await backTranslateText(line, table)
      );
    }
    while (texts.length > 0 && texts[texts.length - 1] === '') texts.pop();

    this.refs.textarea.value = texts.join('\n');
    this.setFieldStatus(
      'Text above updated from this braille. The braille stays in charge ' +
        'until you clear this editor.'
    );
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
    sizeSelect.value = 'auto';
    sizeSelect.addEventListener('change', () => this.applySizePreset());
    sizeRow.appendChild(sizeSelect);
    this.refs.sizeSelect = sizeSelect;

    section.appendChild(sizeRow);

    const sizeHelp = document.createElement('p');
    sizeHelp.id = 'brailleSizeHelp';
    sizeHelp.className = 'braille-panel-help';
    sizeHelp.textContent =
      'Auto-size (the default) grows the card to fit the text plus margin. A size preset sets the card width and height parameters and turns auto-sizing off. Editing the width or height parameters directly switches this to Custom.';
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

    if (this.mode === 'sign') {
      // Letter rows and braille rows wrap independently in sign mode;
      // this line reports both counts so the preview (braille rows) is
      // not mistaken for the raised-letter layout.
      const rowSummary = document.createElement('p');
      rowSummary.className = 'braille-panel-help';
      rowSummary.id = 'brailleSignRowSummary';
      rowSummary.hidden = true;
      section.appendChild(rowSummary);
      this.refs.rowSummary = rowSummary;
    }
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

    // Render-all toggle lives with the notice. In charm mode it is the
    // "Generate all charms" toggle, ON by default.
    const isCharm = this.mode === 'charm';
    const renderAllRow = document.createElement('div');
    renderAllRow.className = 'braille-panel-toggle-row';
    const renderAllInput = document.createElement('input');
    renderAllInput.type = 'checkbox';
    renderAllInput.id = 'brailleRenderAll';
    renderAllInput.checked = isCharm;
    renderAllInput.setAttribute('aria-describedby', 'brailleRenderAllHelp');
    renderAllInput.addEventListener('change', () => {
      if (isCharm) {
        this.generateAll = renderAllInput.checked;
        this.showCharm(this.currentCharm, { announce: false });
        stateManager.announceChange(
          this.generateAll
            ? 'Generate all charms turned on'
            : 'Generate all charms turned off'
        );
        return;
      }
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
    renderAllLabel.textContent = isCharm
      ? 'Generate all charms'
      : 'Render all cards in one file';
    renderAllRow.appendChild(renderAllLabel);
    notice.appendChild(renderAllRow);

    const renderAllHelp = document.createElement('p');
    renderAllHelp.id = 'brailleRenderAllHelp';
    renderAllHelp.className = 'braille-panel-help';
    renderAllHelp.textContent = isCharm
      ? 'Lays every charm out side by side in one model, separated by the charm_gap_mm parameter. Turn off to render and download one charm at a time.'
      : 'Lays every card out on the bed in a single model, separated by the card_gap_mm parameter. Large sets may exceed your print bed — check the total depth before printing.';
    notice.appendChild(renderAllHelp);

    section.appendChild(notice);
    this.refs.notice = notice;
  }

  buildPager(section) {
    const isCharm = this.mode === 'charm';
    const pager = document.createElement('div');
    pager.className = 'braille-card-pager';
    pager.id = 'brailleCardPager';
    pager.hidden = true;

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'btn btn-secondary braille-pager-btn';
    prevBtn.id = 'braillePrevCard';
    prevBtn.textContent = isCharm ? 'Previous charm' : 'Previous card';
    prevBtn.addEventListener('click', () =>
      isCharm
        ? this.showCharm(this.currentCharm - 1)
        : this.showCard(this.currentCard - 1)
    );
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
    nextBtn.textContent = isCharm ? 'Next charm' : 'Next card';
    nextBtn.addEventListener('click', () =>
      isCharm
        ? this.showCharm(this.currentCharm + 1)
        : this.showCard(this.currentCard + 1)
    );
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
   * panel (width, height, spacing, grid rows). Guarded against the
   * panel's own writes.
   */
  watchGeometryParams() {
    const readWatched = () => {
      const params = stateManager.getState().parameters || {};
      return CAPACITY_WATCH_KEYS.map(
        (key) => params[this.capacityParams[key]]
      ).join('\u0000');
    };
    const readGridRows = () =>
      String(
        stateManager.getState().parameters?.[this.capacityParams.gridRows] ?? ''
      );
    this.lastWatchedValues = readWatched();
    this.lastGridRowsParam = readGridRows();

    this.unsubscribe = stateManager.subscribe(() => {
      if (this.isApplying) return;
      const next = readWatched();
      if (next === this.lastWatchedValues) return;
      this.lastWatchedValues = next;

      // Two-way sync: a direct grid_rows edit updates "Max rows per
      // card" (the user's intent) so the next layout honors it instead
      // of silently writing the panel's old value back over it. Other
      // geometry edits leave the intent untouched (sticky).
      const nextGridRows = readGridRows();
      if (nextGridRows !== this.lastGridRowsParam) {
        this.lastGridRowsParam = nextGridRows;
        this.syncRowsInputFromParam(nextGridRows);
      }

      this.syncSizePresetFromParams();
      this.scheduleLayout();
    });
  }

  /**
   * Mirror a direct grid_rows parameter edit into the "Max rows per
   * card" input (clamped to the input's 1..Line_N range).
   * @param {string} rawValue - New grid_rows parameter value
   */
  syncRowsInputFromParam(rawValue) {
    const rowsInput = this.refs.rowsInput;
    if (!rowsInput) return;
    const value = Math.floor(Number(rawValue));
    if (!Number.isFinite(value) || value < 1) return;
    const max = Number(rowsInput.max) || this.lineParams.length || 20;
    const clamped = Math.min(value, max);
    if (Number(rowsInput.value) !== clamped) {
      rowsInput.value = String(clamped);
    }
  }

  /**
   * Match the size-preset select to the current params: the auto option
   * while auto-sizing is on, otherwise the preset matching the manual
   * width/height (or Custom).
   */
  syncSizePresetFromParams() {
    const select = this.refs.sizeSelect;
    if (!select) return;
    const autoSizeParam = this.capacityParams.autoSize;
    if (autoSizeParam) {
      const autoSize = stateManager.getState().parameters?.[autoSizeParam];
      if (String(autoSize ?? '') === 'On') {
        select.value = 'auto';
        return;
      }
    }
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
    if (!preset) return;

    if (preset.id === 'auto') {
      if (this.capacityParams.autoSize) {
        this.writeParams({ [this.capacityParams.autoSize]: 'On' });
        this.scheduleLayout(0);
      }
      return;
    }
    if (preset.width === null) return; // Custom: nothing to write

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

  /**
   * Surface the rows clamp: when the card height cannot fit the
   * requested "Max rows per card", computeCapacity() lowers the row
   * count that gets written to grid_rows. That used to happen silently;
   * now it lands in the warning tier and is announced once per distinct
   * clamp. "Max rows per card" keeps the user's requested value (sticky
   * intent), so the request takes effect again when the card grows.
   * @param {Array<{ type: string, message: string }>} warnings
   * @param {Object} geometry - getGeometry() result
   * @param {number} rowsPerCard - Clamped row count from computeCapacity()
   */
  collectRowClampWarning(warnings, geometry, rowsPerCard) {
    const requested = Math.max(1, Math.floor(geometry.maxRowsPerCard));
    if (rowsPerCard >= requested) {
      this.lastRowClampAnnounced = null;
      return;
    }
    warnings.push({
      type: 'rows-clamped',
      message:
        `"Max rows per card" is ${requested}, but the card height only ` +
        `fits ${rowsPerCard} rows at the current line spacing and ` +
        `margin, so the card uses ${rowsPerCard}. Pick a taller card ` +
        `size preset, reduce the line spacing, or use a smaller margin ` +
        `to fit more rows.`,
    });
    const key = `${requested}>${rowsPerCard}`;
    if (this.lastRowClampAnnounced !== key) {
      this.lastRowClampAnnounced = key;
      stateManager.announceChange(
        `Rows per card limited to ${rowsPerCard} by the card height.`
      );
    }
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
    // The braille editor wins whenever it has content: its lines are
    // used exactly as written, with no liblouis pass.
    if (this.isBrailleFieldActive()) return this.runBrailleFieldLayout();

    this.fieldDownloadWord = null;
    this.lastFieldWordSource = null;

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
    this.collectRowClampWarning(warnings, geometry, rowsPerCard);
    this.collectCommonWarnings(warnings, {
      untranslatable,
      preserveCaps,
      text,
    });

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

  /**
   * Card layout from the braille editor: the editor's lines are used
   * verbatim (validated against the U+2800–U+28FF block and the line
   * capacity, ASCII spaces mapped to blank cells) and chunked into
   * cards exactly like translated text.
   */
  async runBrailleFieldLayout() {
    const seq = ++this.layoutSeq;
    const geometry = this.getGeometry();
    const { cellsPerLine, rowsPerCard } = computeCapacity(geometry);

    const warnings = [];
    this.collectRowClampWarning(warnings, geometry, rowsPerCard);

    const { lines, warnings: fieldWarnings } =
      this.parseBrailleField(cellsPerLine);
    warnings.push(...fieldWarnings);

    // Non-braille characters block the parameter write entirely (the
    // model keeps its previous content) — embossing garbage cells would
    // be silent data corruption for a braille reader. The error tier
    // explains exactly which line and character to fix.
    if (warnings.some((w) => w.type === 'braille-field-invalid')) {
      if (seq !== this.layoutSeq) return;
      if (this.refs.fieldEditor) this.refs.fieldEditor.open = true;
      this.renderMessages(warnings);
      return;
    }

    let allLines = lines;
    if (allLines.length > this.lineParams.length) {
      warnings.push({
        type: 'too-many-lines',
        needed: allLines.length,
        available: this.lineParams.length,
        message:
          `The braille editor has ${allLines.length} lines but only ` +
          `${this.lineParams.length} are available. The extra lines were ` +
          `dropped — shorten the braille or split it across files.`,
      });
      allLines = allLines.slice(0, this.lineParams.length);
    }

    let cards;
    if (this.refs.splitInput.checked) {
      cards = chunkIntoCards(allLines, rowsPerCard);
    } else {
      cards = [allLines];
      if (allLines.length > rowsPerCard) {
        warnings.push({
          type: 'rows-overflow',
          message:
            `Only ${rowsPerCard} of ${allLines.length} braille lines fit ` +
            `on this card. Turn on "Split overflow into additional ` +
            `cards", raise "Max rows per card", or pick a larger card ` +
            `size preset.`,
        });
      }
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

    warnings.push({
      type: 'braille-field-active',
      message:
        'The braille editor has content, so the card uses that braille ' +
        'exactly as written (the text box above is ignored until the ' +
        'editor is cleared).',
    });

    if (seq !== this.layoutSeq) return;

    this.cards = cards;
    this.allLines = allLines;
    this.cellsPerLine = cellsPerLine;
    this.currentCard = Math.min(this.currentCard, this.cards.length - 1);

    // Keep the editor visible while it drives the model.
    if (this.refs.fieldEditor) this.refs.fieldEditor.open = true;

    // Fire-and-forget: back-translate the first line for the friendly
    // download name (braille-only input has no source text to name from).
    this.updateFieldDownloadWord(allLines);

    this.renderMessages(warnings);
    this.showCard(this.currentCard, { announce: false });
    this.firstLayout = false;
  }

  /**
   * Cache a back-translated first word of the braille editor content for
   * friendly download names. Async and best-effort: names fall back to
   * "Braille Card" (and then the hashed default) when unavailable.
   * @param {Array<{ braille: string }>} allLines
   */
  updateFieldDownloadWord(allLines) {
    const first = allLines.find((line) => line.braille !== '');
    if (!first) {
      this.fieldDownloadWord = null;
      this.lastFieldWordSource = null;
      return;
    }
    if (first.braille === this.lastFieldWordSource) return;
    this.lastFieldWordSource = first.braille;

    const table = this.refs.tableSelect.value || this.defaultTable;
    backTranslateText(first.braille, table)
      .then((text) => {
        // Ignore a stale result if the first line changed meanwhile.
        if (this.lastFieldWordSource !== first.braille) return;
        this.fieldDownloadWord = firstFilenameWord(text) || null;
      })
      .catch(() => {
        if (this.lastFieldWordSource !== first.braille) return;
        this.fieldDownloadWord = null;
      });
  }

  async runCharmLayout() {
    const seq = ++this.layoutSeq;
    const text = this.refs.textarea.value.trim();
    const table = this.refs.tableSelect.value || this.defaultTable;
    const preserveCaps = this.refs.capsInput.checked;

    const untranslatable = new Set();
    const translate = this.makeTranslator(table, preserveCaps, untranslatable);

    // Each non-whitespace character becomes its own charm, translated
    // individually (so "B" = capital indicator + b = 2 cells, within the
    // per-charm cell budget).
    const chars = [...text].filter((ch) => !/\s/u.test(ch));
    const charms = [];
    for (const ch of chars) {
      charms.push({ braille: await translate(ch), source: ch });
    }

    if (seq !== this.layoutSeq) return;

    const warnings = [];
    this.collectCommonWarnings(warnings, {
      untranslatable,
      preserveCaps,
      text,
    });

    // Per-charm cell budget check (each character carries its own charm)
    const overflowing = charms.filter(
      (c) => countCells(c.braille) > this.maxCells
    );
    if (overflowing.length > 0) {
      const sample = overflowing
        .slice(0, 3)
        .map((c) => `"${c.source}" (${countCells(c.braille)} cells)`)
        .join(', ');
      warnings.push({
        type: 'charm-overflow',
        message:
          `Each charm fits ${this.maxCells} braille cells, but ` +
          `${sample} need${overflowing.length === 1 ? 's' : ''} more` +
          (preserveCaps && /\p{Lu}/u.test(text)
            ? '. Turning off "Preserve capital letters" saves the indicator cell each capital adds.'
            : '.'),
      });
    }
    if (
      charms.length > this.charmParams.length &&
      this.charmParams.length > 0
    ) {
      warnings.push({
        type: 'charm-limit',
        message:
          `Only the first ${this.charmParams.length} charms can render in ` +
          `one file; the remaining ` +
          `${charms.length - this.charmParams.length} were dropped from ` +
          `"Generate all charms". Turn the toggle off to page through and ` +
          `render every charm separately.`,
      });
    }

    this.charms = charms;
    this.cards = [charms];
    this.allLines = charms;
    this.cellsPerLine = this.maxCells;
    this.currentCharm = Math.min(
      this.currentCharm,
      Math.max(0, charms.length - 1)
    );

    this.renderMessages(warnings);
    this.showCharm(this.currentCharm, { announce: false });
    this.firstLayout = false;
  }

  /**
   * Capacity math + wrapping for the sign, shared by the translated
   * layout, the braille-editor layout, and the editor's "Translate to
   * braille" button — so the rows the button writes are exactly the rows
   * the sign would otherwise have rendered.
   * @param {{ skipBrailleRows?: boolean }} [opts]
   */
  async buildSignLayout({ skipBrailleRows = false } = {}) {
    const text = this.refs.textarea.value;
    const table = this.refs.tableSelect.value || this.defaultTable;
    const preserveCaps = this.refs.capsInput.checked;
    const maxLines = this.lineParams.length;

    const untranslatable = new Set();
    const translate = this.makeTranslator(table, preserveCaps, untranslatable);

    const geometry = this.getGeometry();

    // Raised-letter row capacity: how many print characters fit across
    // the plate. Liberation Sans uppercase advances average ~0.94 x size
    // per character (measured with textmetrics; the SCAD's
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

    // Letter rows and braille rows wrap independently (ADA 703.3.2
    // places braille as one block below the entire text; braille line
    // breaks need not mirror the print rows). The braille capacity is
    // derived from the final sign width: the set width, or wider when
    // the longest letter row stretches it via auto-fit.
    const layout = await layoutSignText({
      text,
      translate,
      maxSourceChars,
      maxRows: maxLines,
      brailleCellsPerLine: (longestRowChars) => {
        const fitWidthMm = Math.max(
          geometry.cardWidthMm,
          longestRowChars * advanceMm + 2 * geometry.marginMm
        );
        return computeCapacity({
          ...geometry,
          cardWidthMm: fitWidthMm,
          maxRowsPerCard: maxLines,
        }).cellsPerLine;
      },
      skipBrailleRows,
    });

    return {
      layout,
      text,
      preserveCaps,
      untranslatable,
      maxLines,
      fitChars,
      longestWord,
      longestWordChars,
      advanceMm,
    };
  }

  async runSignLayout() {
    // The braille editor wins whenever it has content: its lines drive
    // the braille plate verbatim, with no liblouis pass.
    if (this.isBrailleFieldActive()) return this.runSignBrailleFieldLayout();

    const seq = ++this.layoutSeq;
    const {
      layout,
      text,
      preserveCaps,
      untranslatable,
      maxLines,
      fitChars,
      longestWord,
      longestWordChars,
      advanceMm,
    } = await this.buildSignLayout();

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
    this.collectCommonWarnings(warnings, {
      untranslatable,
      preserveCaps,
      text,
    });

    this.cards = [layout.brailleRows];
    this.allLines = layout.brailleRows;
    this.cellsPerLine = layout.brailleCellsPerLine;

    this.renderMessages(warnings);
    this.renderPreview(layout.brailleRows);
    this.renderSignRowSummary(layout);
    this.applySignToParams(layout.textRows, layout.brailleRows);
    this.firstLayout = false;
  }

  /**
   * Sign layout from the braille editor: the editor's lines become the
   * braille plate verbatim, while the raised letters are still wrapped
   * from the text box. The two plates carry the same message but are
   * authored separately, which is the point — a reader who corrects a
   * contraction should not have the printed word above it change too.
   */
  async runSignBrailleFieldLayout() {
    const seq = ++this.layoutSeq;
    const { layout, text, preserveCaps, untranslatable, maxLines } =
      await this.buildSignLayout({ skipBrailleRows: true });

    if (seq !== this.layoutSeq) return;

    const cellsPerLine = layout.brailleCellsPerLine;
    const { lines, warnings } = this.parseBrailleField(cellsPerLine);
    warnings.push(...layout.warnings);

    // Non-braille characters block the parameter write entirely (the
    // sign keeps its previous content) — embossing garbage cells would
    // be silent data corruption for a braille reader.
    if (warnings.some((w) => w.type === 'braille-field-invalid')) {
      if (this.refs.fieldEditor) this.refs.fieldEditor.open = true;
      this.renderMessages(warnings);
      return;
    }

    let brailleRows = lines;
    if (brailleRows.length > maxLines) {
      warnings.push({
        type: 'too-many-lines',
        needed: brailleRows.length,
        available: maxLines,
        message:
          `The braille editor has ${brailleRows.length} lines but the sign ` +
          `holds ${maxLines}. The extra lines were dropped — shorten the ` +
          `braille or split it across multiple signs.`,
      });
      brailleRows = brailleRows.slice(0, maxLines);
    }

    this.collectCommonWarnings(warnings, {
      untranslatable,
      preserveCaps,
      text,
    });
    warnings.push({
      type: 'braille-field-active',
      message:
        'The braille editor has content, so the braille plate uses that ' +
        'braille exactly as written. The raised letters still come from ' +
        'the text above; clear the editor to translate both again.',
    });

    this.cards = [brailleRows];
    this.allLines = brailleRows;
    this.cellsPerLine = cellsPerLine;

    if (this.refs.fieldEditor) this.refs.fieldEditor.open = true;

    this.renderMessages(warnings);
    this.renderPreview(brailleRows);
    this.renderSignRowSummary({ textRows: layout.textRows, brailleRows });
    this.applySignToParams(layout.textRows, brailleRows);
    this.firstLayout = false;
  }

  /**
   * Read and validate the braille editor's content as rows.
   *
   * Only U+2800–U+28FF and ASCII spaces are accepted: anything else is
   * reported per line and character so the user knows exactly what to
   * fix. Spaces become blank cells, trailing blanks are trimmed so they
   * do not count against the capacity, and lines over `cellsPerLine` are
   * flagged (but still returned — the caller decides what to do).
   *
   * @param {number} cellsPerLine - Row capacity in braille cells
   * @returns {{
   *   lines: Array<{ braille: string, source: string }>,
   *   warnings: Array<{ type: string, message: string }>,
   * }}
   */
  parseBrailleField(cellsPerLine) {
    const warnings = [];
    const rawLines = this.refs.fieldInput.value
      .replace(/\r\n?/g, '\n')
      .split('\n');
    while (rawLines.length > 0 && rawLines[rawLines.length - 1].trim() === '') {
      rawLines.pop();
    }

    const lines = [];
    rawLines.forEach((rawLine, i) => {
      const invalid = [...rawLine].find(
        (ch) => ch !== ' ' && !BRAILLE_CHAR_RE.test(ch)
      );
      if (invalid !== undefined) {
        warnings.push({
          type: 'braille-field-invalid',
          message:
            `Line ${i + 1} of the braille editor contains "${invalid}", ` +
            `which is not a braille character. Only braille characters ` +
            `(U+2800–U+28FF) and spaces are allowed — press "Translate ` +
            `to braille" to convert text, or paste Unicode braille.`,
        });
      }
      const braille = rawLine
        .replace(/ /g, BRAILLE_SPACE)
        .replace(/\u2800+$/, '');
      const cells = countCells(braille);
      if (cells > cellsPerLine) {
        warnings.push({
          type: 'line-overflow',
          message:
            `Line ${i + 1} of the braille editor is ${cells} cells but ` +
            `the line capacity is ${cellsPerLine}. Move cells to another ` +
            `row, pick a larger size, or reduce the margin.`,
        });
      }
      lines.push({ braille, source: '' });
    });

    return { lines, warnings };
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

  /**
   * Show one charm (charm mode). With generate-all on the preview lists
   * every charm and the model renders them all; with it off the pager
   * steps through charms one at a time (mirrors showCard()).
   */
  showCharm(index, { announce = true } = {}) {
    this.currentCharm = Math.max(
      0,
      Math.min(index, Math.max(0, this.charms.length - 1))
    );
    const charm = this.charms[this.currentCharm];

    this.renderMultiCharmUI();
    const generateAll = this.charms.length > 1 && this.generateAll;
    this.renderPreview(generateAll ? this.charms : charm ? [charm] : []);
    this.applyCharmParams();

    if (announce) {
      stateManager.announceChange(
        `Charm ${this.currentCharm + 1} of ${this.charms.length}` +
          (charm?.source ? ` — ${charm.source}` : '')
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
        `Each card exports separately. Downloads are named ` +
        `${this.getCardDownloadName() ?? 'Braille Card'}.stl`;
    } else if (multi && this.renderAll) {
      this.refs.noticeText.textContent =
        `Rendering all ${this.cards.length} cards in one file, laid out ` +
        `on the bed with a gap between cards. Downloads are named ` +
        `${this.getCardDownloadName() ?? 'Braille Cards'}.stl`;
    }
  }

  /**
   * Charm-mode counterpart of renderMultiCardUI(): the notice hosts the
   * "Generate all charms" toggle and the pager steps through charms when
   * the toggle is off. Unlike cards, the toggle keeps its state when the
   * input shrinks to one charm (it is the mode default, not an opt-in).
   */
  renderMultiCharmUI() {
    const multi = this.charms.length > 1;

    this.refs.notice.hidden = !multi;
    if (multi) {
      this.refs.noticeText.textContent = this.generateAll
        ? `Your text makes ${this.charms.length} charms — one per ` +
          `character. All of them render side by side in one model.`
        : `Your text makes ${this.charms.length} charms — one per ` +
          `character. Use the pager below to render and download each ` +
          `charm separately.`;
      if (this.charms.length !== this.lastAnnouncedCards) {
        stateManager.announceChange(
          `Your text now makes ${this.charms.length} charms.`
        );
      }
    }
    this.lastAnnouncedCards = this.charms.length;

    const showPager = multi && !this.generateAll;
    this.refs.pager.hidden = !showPager;
    if (showPager) {
      const charm = this.charms[this.currentCharm];
      this.refs.pagerStatus.textContent =
        `Charm ${this.currentCharm + 1} of ${this.charms.length}` +
        (charm?.source ? ` — ${charm.source}` : '');
      this.refs.prevBtn.disabled = this.currentCharm === 0;
      this.refs.nextBtn.disabled = this.currentCharm === this.charms.length - 1;
      this.refs.pagerHint.textContent =
        `Each charm exports separately. Suggested file name: ` +
        `${this.getCharmDownloadName() ?? 'Braille Charm'}.stl`;
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
      this.lastGridRowsParam = String(
        params[this.capacityParams.gridRows] ?? ''
      );
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
      (name, i) =>
        String(currentParams[name] ?? '') !== (card[i]?.braille ?? '')
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

  /**
   * Write the charm parameters. Generate-all writes charm_layout =
   * "All charms" plus one Charm_N per character (extras cleared) and keeps
   * braille_chars in sync with the first charm; otherwise charm_layout =
   * "Single" and braille_chars carries the currently paged charm.
   */
  applyCharmParams() {
    if (!this.charParam) return;

    const charms = this.charms;
    const generateAll = charms.length > 1 && this.generateAll;

    const updates = {};
    updates[this.charParam] = generateAll
      ? (charms[0]?.braille ?? '')
      : (charms[this.currentCharm]?.braille ?? '');
    if (this.multiCharmParams.charmLayout) {
      updates[this.multiCharmParams.charmLayout] = generateAll
        ? 'All charms'
        : 'Single';
    }
    this.charmParams.forEach((paramName, i) => {
      updates[paramName] = generateAll ? (charms[i]?.braille ?? '') : '';
    });

    // On the very first layout (prefilled text mirroring the SCAD
    // defaults) leave the model untouched — avoids re-rendering the
    // just-loaded example.
    const currentParams = stateManager.getState().parameters || {};
    const differs = Object.entries(updates).some(
      ([name, value]) => String(currentParams[name] ?? '') !== String(value)
    );
    this.writeParams(updates, {
      skipIfFirstLayout: this.firstLayout && !differs,
    });
  }

  /**
   * Friendly base name for downloads (charm mode): "Braille Charm B" for
   * the single charm being shown, "Braille Charms Brennen" when every
   * charm renders in one file. Null when there is nothing to name.
   * @returns {string|null}
   */
  getCharmDownloadName() {
    const charms = this.charms;
    if (!charms || charms.length === 0) return null;
    if (charms.length > 1 && this.generateAll) {
      const word = this.refs.textarea?.value.trim() ?? '';
      return word ? `Braille Charms ${word}` : 'Braille Charms';
    }
    const source =
      charms[Math.min(this.currentCharm, charms.length - 1)]?.source ?? '';
    return source ? `Braille Charm ${source}` : 'Braille Charm';
  }

  /**
   * Friendly base name for downloads (card mode): "Braille Card hello"
   * for a single card, "Braille Card 2 of 3 hello" when paging,
   * "Braille Cards hello" in render-all mode. The word comes from the
   * source text, falling back to the cached back-translation when the
   * braille editor is the only input. Null when there is no content
   * (callers fall back to the hashed filename).
   * @returns {string|null}
   */
  getCardDownloadName() {
    const hasContent = (this.allLines || []).some(
      (line) => (line.braille ?? '') !== ''
    );
    if (!hasContent) return null;

    const word =
      firstFilenameWord(this.refs.textarea?.value ?? '') ||
      (this.isBrailleFieldActive() ? this.fieldDownloadWord : '') ||
      '';
    const suffix = word ? ` ${word}` : '';

    if (this.cards.length > 1) {
      return this.renderAll
        ? `Braille Cards${suffix}`
        : `Braille Card ${this.currentCard + 1} of ${this.cards.length}${suffix}`;
    }
    return `Braille Card${suffix}`;
  }

  /**
   * Friendly base name for downloads (sign mode): "Braille Sign Exit"
   * from the first word of the sign text. Null when there is no usable
   * word (callers fall back to the hashed filename).
   * @returns {string|null}
   */
  getSignDownloadName() {
    const word = firstFilenameWord(this.refs.textarea?.value ?? '');
    return word ? `Braille Sign ${word}` : null;
  }

  /**
   * Write the sign's raised-text and braille params. The two row lists
   * wrap independently (braille packs denser), so they are indexed
   * separately rather than paired.
   * @param {Array<{ source: string }>} textRows - Raised-letter rows
   * @param {Array<{ braille: string, source: string }>} brailleRows
   */
  applySignToParams(textRows, brailleRows) {
    const updates = {};
    this.lineParams.forEach((paramName, i) => {
      updates[paramName] = brailleRows[i]?.braille ?? '';
    });
    this.textParams.forEach((paramName, i) => {
      updates[paramName] = textRows[i]?.source ?? '';
    });

    const currentParams = stateManager.getState().parameters || {};
    const differs =
      this.lineParams.some(
        (name, i) =>
          String(currentParams[name] ?? '') !== (brailleRows[i]?.braille ?? '')
      ) ||
      this.textParams.some(
        (name, i) =>
          String(currentParams[name] ?? '') !== (textRows[i]?.source ?? '')
      );
    this.writeParams(updates, {
      skipIfFirstLayout: this.firstLayout && !differs,
    });
  }

  /**
   * Report how many rows each plate uses (sign mode). The preview lists
   * the braille rows; without this line the letter layout would be
   * invisible in the panel.
   * @param {{ textRows: Array, brailleRows: Array }} layout
   */
  renderSignRowSummary(layout) {
    const el = this.refs.rowSummary;
    if (!el) return;
    const textRows = layout.textRows.length;
    const brailleRows = layout.brailleRows.length;
    if (textRows === 0 && brailleRows === 0) {
      el.textContent = '';
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent =
      `Raised letters: ${textRows} row${textRows === 1 ? '' : 's'} — ` +
      `braille: ${brailleRows} row${brailleRows === 1 ? '' : 's'}. ` +
      `Braille rows fill the sign width independently of the letter rows ` +
      `(ADA 703.3.2 places braille in one block below the text).`;
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
