/**
 * The Tactile Map Designer panel: the print bed, the plates and the plate
 * picker, above the Tactile Map tile's controls.
 *
 * Manifest-driven, like the braille panel: a `tactileMap` block in the
 * tile's manifest names the parameters this panel writes, and
 * file-handler.js mounts it after the parameter UI renders. The panel keeps
 * the map plan, cuts it into plates for the bed a person picks, says in one
 * sentence how many plates there are, and writes the chosen plate's levels
 * file and size into the tile's parameters, so the preview and the export
 * show that plate. Whole map shows everything at once.
 *
 * The levels file reaches the tile through the file control's own input (a
 * File handed to it, as if chosen), because a file input takes no plain
 * value; the sizes go through setParameterValue like any other control.
 *
 * @license GPL-3.0-or-later
 */

import { stateManager } from '../state.js';
import { setParameterValue } from '../ui-generator.js';
import { announce, announceError } from '../announcer.js';
import { sampleStationPlan } from './plan.js';
import { buildLevelRings, levelsSvgFromRings } from './levels-svg.js';
import { BED_PRESETS, planPlates, plateLevelsSvg } from './plate-tiling.js';
import { loadSymbolLibraryFile, setLibrary } from './symbol-library.js';

const DEBOUNCE_MS = 350;
const CUSTOM_MIN_MM = 100;
const CUSTOM_MAX_MM = 600;
const SOURCE = 'tactile-map';

let panel = null;

/**
 * Hand the tile's file control a file, as if a person had chosen it.
 *
 * @param {string} paramName
 * @param {string} fileName
 * @param {string} svgText
 * @returns {boolean} Whether the control took it
 */
export function setFileThroughControl(paramName, fileName, svgText) {
  const input = document.getElementById(`param-${paramName}`);
  if (
    !input ||
    typeof DataTransfer === 'undefined' ||
    typeof File === 'undefined'
  ) {
    return false;
  }
  const transfer = new DataTransfer();
  transfer.items.add(new File([svgText], fileName, { type: 'image/svg+xml' }));
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/**
 * Mount the panel for a tile whose manifest declares `tactileMap`.
 *
 * @param {{ mapFileParam: string, widthParam: string, heightParam: string, plateIdParam?: string }} config
 * @param {{ plan?: object, setFile?: Function, bedKey?: string }} [options]
 */
export function initMapPanel(config, options = {}) {
  destroyMapPanel();
  panel = new MapPanel(config, options);
  panel.mount();
}

/** Remove the panel. */
export function destroyMapPanel() {
  if (panel) {
    panel.destroy();
    panel = null;
  }
}

/** @returns {boolean} Whether the panel is mounted (for tests) */
export function isMapPanelActive() {
  return panel !== null;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

class MapPanel {
  constructor(config, options) {
    this.config = config;
    this.plan = options.plan || sampleStationPlan();
    this.setFile = options.setFile || setFileThroughControl;
    this.bedKey = options.bedKey || BED_PRESETS[0].key;
    this.custom = { w: 256, d: 256 };
    this.plate = 'whole';
    this.idStyle = options.idStyle || 'none';
    this.timer = null;
    this.layout = null;
    this.lastTape = null;
    this.refs = {};
    this.el = null;
    this.unsubscribe = null;
  }

  mount() {
    const parametersContainer = document.getElementById('parametersContainer');
    if (!parametersContainer?.parentNode) {
      console.warn('[MapPanel] parametersContainer not found; not mounting');
      return;
    }
    this.el = this.build();
    parametersContainer.parentNode.insertBefore(this.el, parametersContainer);
    this.lastTape = this.tapeWidth();
    this.unsubscribe = stateManager.subscribe(() => {
      const tape = this.tapeWidth();
      if (tape !== this.lastTape) {
        this.lastTape = tape;
        this.schedule();
      }
    });
    this.schedule(0);
  }

  tapeWidth() {
    const value = Number(
      stateManager.getState()?.parameters?.label_tape_width_mm
    );
    return Number.isFinite(value) && value > 0 ? value : 12.7;
  }

  bed() {
    if (this.bedKey === 'custom') return { w: this.custom.w, d: this.custom.d };
    return BED_PRESETS.find((b) => b.key === this.bedKey) || BED_PRESETS[0];
  }

  build() {
    const section = el('section', 'braille-panel tactile-map-panel');
    section.id = 'tactileMapPanel';
    section.setAttribute('aria-labelledby', 'tactileMapHeading');

    const heading = el('h2', 'braille-panel-heading', 'Tactile map plates');
    heading.id = 'tactileMapHeading';
    section.appendChild(heading);

    const help = el(
      'p',
      'braille-panel-help',
      'Pick your printer’s bed and the map splits into equal plates. Choose a plate to preview and export it; Whole map shows everything at once.'
    );
    help.id = 'tactileMapHelp';
    section.appendChild(help);

    const bedLabel = el('label', 'braille-panel-label', 'Print bed');
    bedLabel.htmlFor = 'tactileMapBed';
    section.appendChild(bedLabel);

    const select = el('select', 'braille-panel-select');
    select.id = 'tactileMapBed';
    select.setAttribute('aria-describedby', 'tactileMapHelp');
    for (const bed of BED_PRESETS) {
      const option = document.createElement('option');
      option.value = bed.key;
      option.textContent = bed.name;
      select.appendChild(option);
    }
    select.value = this.bedKey;
    select.addEventListener('change', () => {
      this.bedKey = select.value;
      this.refs.custom.hidden = this.bedKey !== 'custom';
      this.schedule();
    });
    section.appendChild(select);
    this.refs.select = select;

    const custom = el('div', 'tactile-map-custom');
    custom.hidden = this.bedKey !== 'custom';
    for (const [key, id, text] of [
      ['w', 'tactileMapBedWidth', 'Bed width (mm)'],
      ['d', 'tactileMapBedDepth', 'Bed depth (mm)'],
    ]) {
      const row = el('div', 'braille-panel-toggle-row');
      const label = el('label', 'braille-panel-label', text);
      label.htmlFor = id;
      const input = document.createElement('input');
      input.type = 'number';
      input.id = id;
      input.className = 'braille-panel-number';
      input.min = String(CUSTOM_MIN_MM);
      input.max = String(CUSTOM_MAX_MM);
      input.step = '1';
      input.value = String(this.custom[key]);
      input.addEventListener('change', () => {
        const value = Number(input.value);
        if (Number.isFinite(value)) {
          this.custom[key] = Math.min(
            CUSTOM_MAX_MM,
            Math.max(CUSTOM_MIN_MM, value)
          );
          input.value = String(this.custom[key]);
          this.schedule();
        }
      });
      row.appendChild(label);
      row.appendChild(input);
      custom.appendChild(row);
    }
    section.appendChild(custom);
    this.refs.custom = custom;

    const summary = el('p', 'braille-panel-help tactile-map-summary');
    summary.id = 'tactileMapSummary';
    summary.setAttribute('aria-live', 'polite');
    section.appendChild(summary);
    this.refs.summary = summary;

    const plates = el('fieldset', 'braille-panel-choice');
    plates.id = 'tactileMapPlates';
    plates.appendChild(el('legend', '', 'Plate'));
    section.appendChild(plates);
    this.refs.plates = plates;

    const warnings = el('ul', 'braille-panel-help tactile-map-warnings');
    warnings.id = 'tactileMapWarnings';
    section.appendChild(warnings);
    this.refs.warnings = warnings;

    const symbols = el('div', 'braille-translate-row tactile-map-symbols');
    const load = el(
      'button',
      'btn btn-secondary braille-translate-btn',
      'Load a symbol library'
    );
    load.type = 'button';
    const reset = el(
      'button',
      'btn btn-secondary braille-translate-btn',
      'Use the built-in symbols'
    );
    reset.type = 'button';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.id = 'tactileMapSymbolFile';
    file.hidden = true;
    file.tabIndex = -1;
    file.setAttribute('aria-hidden', 'true');
    const status = el('p', 'braille-panel-help');
    status.id = 'tactileMapSymbolStatus';
    status.setAttribute('role', 'status');
    load.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const chosen = file.files && file.files[0];
      if (!chosen) return;
      loadSymbolLibraryFile(chosen)
        .then(({ symbols: set, warnings: notes }) => {
          setLibrary(set);
          const sentence = `Loaded ${set.length} symbols from ${chosen.name}. They replace the built-in set until you clear them.`;
          status.textContent = [sentence, ...notes].join(' ');
          announce(status.textContent, { source: SOURCE });
          this.schedule(0);
        })
        .catch((err) => {
          status.textContent = err.message;
          announceError(err.message, { source: SOURCE });
        })
        .finally(() => {
          file.value = '';
        });
    });
    reset.addEventListener('click', () => {
      setLibrary(null);
      status.textContent = 'Using the built-in symbols.';
      announce(status.textContent, { source: SOURCE });
      this.schedule(0);
    });
    symbols.appendChild(load);
    symbols.appendChild(reset);
    symbols.appendChild(file);
    section.appendChild(symbols);
    section.appendChild(status);

    return section;
  }

  schedule(delay = DEBOUNCE_MS) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.update(), delay);
  }

  rebuildPlates() {
    const fieldset = this.refs.plates;
    const focused = document.activeElement;
    const hadFocus =
      focused && fieldset.contains(focused) ? focused.value : null;
    for (const row of [
      ...fieldset.querySelectorAll('.braille-panel-toggle-row'),
    ])
      row.remove();
    const ids = ['whole', ...this.layout.plates.map((p) => p.id)];
    if (!ids.includes(this.plate)) this.plate = 'whole';
    for (const id of ids) {
      const row = el('div', 'braille-panel-toggle-row');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'tactileMapPlate';
      input.id = `tactileMapPlate-${id}`;
      input.value = id;
      input.checked = id === this.plate;
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this.plate = id;
        announce(
          id === 'whole' ? 'Showing the whole map.' : `Showing plate ${id}.`,
          {
            source: SOURCE,
          }
        );
        this.schedule(0);
      });
      const label = el(
        'label',
        '',
        id === 'whole' ? 'Whole map' : `Plate ${id}`
      );
      label.htmlFor = input.id;
      row.appendChild(input);
      row.appendChild(label);
      fieldset.appendChild(row);
      if (hadFocus === id) input.focus();
    }
    if (hadFocus && !ids.includes(hadFocus)) {
      fieldset.querySelector(`input[value="${this.plate}"]`)?.focus();
    }
  }

  update() {
    if (!this.el) return;
    const { w, h } = this.plan.size;
    this.layout = planPlates({ w, h, bed: this.bed() });
    const n = this.layout.plates.length;
    const first = this.layout.plates[0].id;
    const last = this.layout.plates[n - 1].id;
    const sentence =
      n === 1
        ? `One plate of ${this.layout.plateW} x ${this.layout.plateH} mm; the whole map fits.`
        : `${n} plates of ${this.layout.plateW} x ${this.layout.plateH} mm, ${first} to ${last}.`;
    if (this.refs.summary.textContent !== sentence)
      this.refs.summary.textContent = sentence;
    this.rebuildPlates();

    const built = buildLevelRings(this.plan, { tapeWidthMm: this.tapeWidth() });
    this.refs.warnings.replaceChildren(
      ...built.warnings.map((warning) => el('li', '', warning.text))
    );

    let svg;
    let size;
    let fileName;
    let plateId = '';
    if (this.plate === 'whole') {
      svg = levelsSvgFromRings(built.rings, this.plan.size, built.textBoxes);
      size = this.plan.size;
      fileName = 'levels_whole.svg';
    } else {
      const plate = this.layout.plates.find((p) => p.id === this.plate);
      const out = plateLevelsSvg(built.rings, plate, { id: this.idStyle });
      svg = out.svg;
      size = out.size;
      fileName = `levels_${plate.id}.svg`;
      if (this.idStyle === 'margin') plateId = plate.id;
    }
    setParameterValue(this.config.widthParam, size.w);
    setParameterValue(this.config.heightParam, size.h);
    if (this.config.plateIdParam)
      setParameterValue(this.config.plateIdParam, plateId);
    if (!this.setFile(this.config.mapFileParam, fileName, svg)) {
      console.warn(
        `[MapPanel] No file control for parameter: ${this.config.mapFileParam}`
      );
    }
  }

  destroy() {
    clearTimeout(this.timer);
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.el?.parentNode) this.el.parentNode.removeChild(this.el);
    this.el = null;
  }
}
