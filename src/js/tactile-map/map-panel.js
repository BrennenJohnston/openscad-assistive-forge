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
 * Render every plate and download walks the plates in order, renders each
 * through the app's export path (the render controller the preview
 * controller holds, with the project's files: one engine, one render at a
 * time) with the parameter set the plate radio would write, and offers one
 * archive: a mesh per plate, the plan, a levels file per plate and a
 * README. The panel's own selection and the preview are not touched, so
 * there is nothing to restore after the loop. Cancel stops after the plate
 * under way; a failed plate stops the loop with its message.
 *
 * Edit drawing as a map opens the drawing editor in its map purpose on the
 * picture the tile's file control holds (a drawing a person chose through
 * that control: SVG, DXF, or a photo it traced), with a Class menu on every
 * shape; Apply classes hands the shapes back and planFromRegions turns them
 * into this panel's plan at the width the Drawing width control says, so
 * the summary, the plates and the levels file follow. The drawing is kept
 * here once seen, because the levels file this panel writes replaces it in
 * the control, and the door reopens on the drawing with the classes last
 * applied.
 *
 * @license GPL-3.0-or-later
 */

import { stateManager } from '../state.js';
import { setParameterValue } from '../ui-generator.js';
import {
  announce,
  announceChange,
  announceError,
  withdrawAnnouncement,
} from '../announcer.js';
import { dataUrlToText } from '../svg-text-encoding.js';
import { WAITING_TITLE, sampleStationPlan, waitingPlan } from './plan.js';
import {
  MAP_TYPES,
  MAP_TYPE_QUESTION,
  WORKFLOW_STRINGS,
  mapType,
} from './map-types.js';
import { STEP_STRINGS, createSteps } from './steps.js';
import {
  drawingBox,
  filledOutlines,
  planFromRegions,
  scaleFromWidth,
  scaleSentence,
} from './plan-from-drawing.js';
import { buildLevelRings, levelsSvgFromRings } from './levels-svg.js';
import {
  BED_PRESETS,
  ID_STYLES,
  PLATE_MIN_MM,
  planPlates,
  plateLevelsSvg,
} from './plate-tiling.js';
import { loadSymbolLibraryFile, setLibrary } from './symbol-library.js';
import {
  ADDRESS_STRINGS,
  BIG_BYTES,
  createAddressSection,
} from './address-section.js';
import {
  archiveEntries,
  levelHeights,
  plateGridSvg,
  plateParameterSets,
  plateRoles,
  readmeText,
} from './plate-export.js';
import { OUTPUT_FORMATS, downloadFile, projectStem } from '../download.js';

const DEBOUNCE_MS = 350;
const CUSTOM_MIN_MM = 100;
const CUSTOM_MAX_MM = 600;
const SOURCE = 'tactile-map';
const PLATE_TIMEOUT_MS = 60_000;
const ENGINE_NOT_READY =
  'The OpenSCAD engine has not initialized yet. Please wait or refresh the page.';
/** A11Y: said once when the Alt View comes on with this panel mounted. */
export const ALT_VIEW_SENTENCE =
  'The Tactile Map Designer is not available in the Alt View. Its controls return when the Alt View is off.';
/** A11Y: the name of the folded warnings list, its count first. */
export const WARNINGS_TITLE = (n) => (n === 1 ? '1 warning' : `${n} warnings`);

let panel = null;

/**
 * A render through the app's export path: the render controller the
 * preview controller holds, the project's files and libraries, the format
 * asked for, and a time limit per plate.
 *
 * @param {Function|undefined} getController - Returns the AutoPreviewController, or null
 * @returns {(parameters: Object, options: {format: string, timeoutMs: number}) => Promise<ArrayBuffer|Uint8Array>}
 */
function renderThroughEngine(getController) {
  return (parameters, { format, timeoutMs }) => {
    const controller = getController?.();
    const engine = controller?.renderController;
    const state = stateManager.getState();
    if (!engine || !state.uploadedFile?.content) {
      return Promise.reject(new Error(ENGINE_NOT_READY));
    }
    return engine
      .renderFull(state.uploadedFile.content, parameters, {
        outputFormat: format,
        timeoutMs,
        paramTypes: state.paramTypes || {},
        files: state.projectFiles,
        mainFile: state.mainFilePath,
        libraries: controller.enabledLibraries || [],
      })
      .then((result) => result.data || result.stl);
  };
}

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
 * The drawing editor the app shares: the one the file control built on the
 * surface element, or one built here the same way, left on the element
 * for the control to find (it closes whatever it finds before building its
 * own, and this panel never keeps a reference past one opening).
 *
 * @returns {Promise<object|null>} null on a page with no surface element
 */
async function sharedDrawingEditor() {
  const surfaceEl = document.getElementById('drawingEditorSurface');
  if (!surfaceEl) return null;
  if (surfaceEl.__forgeDrawingEditor) return surfaceEl.__forgeDrawingEditor;
  const { createDrawingEditor } = await import('../drawing-editor/surface.js');
  if (surfaceEl.__forgeDrawingEditor) return surfaceEl.__forgeDrawingEditor;
  const editor = createDrawingEditor({
    surfaceEl,
    announce: announceChange,
    onOpen: () => window.dispatchEvent(new CustomEvent('drawing-editor:open')),
    onClose: () =>
      window.dispatchEvent(new CustomEvent('drawing-editor:close')),
    onViewChange: (view, host) =>
      window.dispatchEvent(
        new CustomEvent('drawing-editor:view', { detail: { view, host } })
      ),
  });
  surfaceEl.__forgeDrawingEditor = editor;
  return editor;
}

/**
 * Focus back on the button that opened the drawing editor, as the editor
 * closes over the preview, which keeps no focus of its own to return.
 */
function backTo(button) {
  if (button?.isConnected && !button.disabled) button.focus();
}

/** Whether an SVG is a levels file this panel wrote, by its groups. */
function isLevelsFile(svg) {
  return /<g id="level1"/.test(svg) && /<g id="channels"/.test(svg);
}

/**
 * Mount the panel for a tile whose manifest declares `tactileMap`.
 *
 * @param {{ mapFileParam: string, widthParam: string, heightParam: string, plateIdParam?: string }} config
 * @param {{ plan?: object, setFile?: Function, bedKey?: string, idStyle?: string, getAutoPreviewController?: Function, render?: Function, download?: Function, getEditor?: Function }} [options]
 *   `render(parameters, { format, timeoutMs })` and `download(bytes, name,
 *   format)` stand in for the engine and the file save in a test;
 *   `getEditor()` resolves to the drawing editor the door opens.
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

/** @returns {object|null} The place picked in the address section (for tests) */
export function getMapPlace() {
  return panel?.place ?? null;
}

/** @returns {object|null} The map data last pulled or loaded (for tests) */
export function getMapData() {
  return panel?.osm ?? null;
}

/** @returns {object|null} The panel's plan (for tests) */
export function getMapPlan() {
  return panel?.plan ?? null;
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
    // The map type the card or the link chose; none opens the chooser.
    this.mapType = mapType(config.type)?.key ?? null;
    this.lastType = this.mapType;
    // The type's numbered steps (see arrange()) and the parts they hold.
    this.steps = null;
    this.parts = {};
    this.plan = options.plan || sampleStationPlan();
    this.setFile = options.setFile || setFileThroughControl;
    this.bedKey = options.bedKey || BED_PRESETS[0].key;
    this.custom = { w: 256, d: 256 };
    this.plate = 'whole';
    this.idStyle = ID_STYLES.some((s) => s.key === options.idStyle)
      ? options.idStyle
      : ID_STYLES[0].key;
    this.render =
      options.render || renderThroughEngine(options.getAutoPreviewController);
    this.download = options.download || downloadFile;
    this.getEditor = options.getEditor || sharedDrawingEditor;
    // The address section: its geocoder (a test's stub, else the lazy
    // chunk loaded on the first press) and the place last picked.
    this.searchPlaces = options.searchPlaces || null;
    this.pullArea = options.pullArea || null;
    // A test's stand-ins: the terrain host (loadTiles' fetch) or the
    // height reader itself.
    this.fetchTiles = options.fetchTiles || null;
    this.elevationAt = options.elevationAt || null;
    this.place = null;
    // The map data last pulled or loaded, for the draft: { elements, center,
    // radiusM, source, place, landmarks, bytes }.
    this.osm = null;
    this.draft = null;
    this.address = null;
    // The drawing the door works on: the picture last seen in the file
    // control that was not a levels file of this panel's own, with the
    // classes and the regions the editor last applied.
    this.drawing = null;
    // 'draft' when the plan came from the map data, 'drawing' when from a
    // drawing's classes; Edit drawing as a map reopens that source.
    this.source = null;
    this.lastPictureData = null;
    this.drawingWidthMm = null;
    this.planWarnings = [];
    this.running = false;
    this.cancelRequested = false;
    this.timer = null;
    this.layout = null;
    this.lastTape = null;
    this.lastCue = null;
    this.refs = {};
    this.el = null;
    this.unsubscribe = null;
    // The tile's own Map file control while a map from a drawing holds it
    // in its first step, the marker left where the Customizer built it, and
    // the step's slot it stands in.
    this.heldFile = null;
    this.fileHome = null;
    this.fileSlot = null;
    this.customizerObserver = null;
  }

  mount() {
    const parametersContainer = document.getElementById('parametersContainer');
    if (!parametersContainer?.parentNode) {
      console.warn('[MapPanel] parametersContainer not found; not mounting');
      return;
    }
    this.el = this.build();
    // The address section stands first: a map begins with where it is.
    this.address = createAddressSection({
      searchPlaces: (query) => this.geocode(query),
      pullArea: (where) => this.pull(where),
      readOsmFile: (file) => this.readOsmFile(file),
      say: (text, failed, options) => this.sayAddress(text, failed, options),
      unsay: () => withdrawAnnouncement(SOURCE),
      onPlace: (place) => {
        this.place = place;
        return this.wait();
      },
      onData: (osm) => {
        this.osm = osm;
        if (osm) this.wait();
      },
      onDraft: () =>
        this.makeDraft().catch((err) => {
          this.sayAddress(err?.message || String(err), true);
        }),
      onChange: () => this.steps?.refresh(),
      onSteep: (on, gradePct) => {
        this.markSteep(on, gradePct).catch((err) => {
          this.sayAddress(err?.message || String(err), true);
        });
      },
    });
    parametersContainer.parentNode.insertBefore(this.el, parametersContainer);
    // The Customizer builds its controls again on a preset, an undo or a
    // link's values, which leaves the Map file control held here stale; and
    // its detail level, which the held control shows too, can change.
    this.customizerObserver = new MutationObserver(() =>
      this.syncFileControl()
    );
    this.customizerObserver.observe(parametersContainer, {
      childList: true,
      attributes: true,
      attributeFilter: ['data-detail-level'],
    });
    // A place or route map never shows the sample station: the empty plate
    // waits for its draft from the start.
    if (this.mapType === 'place' || this.mapType === 'route') this.wait();
    this.arrange();
    // The Tactile Map Designer steps aside in the Alt View: its sections
    // hide and it says so once; the tile's own controls stay.
    this.altOff = null;
    this.altObserver = new MutationObserver(() => this.syncAltView());
    this.altObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-ui-variant'],
    });
    this.syncAltView();
    // The panel on its element, as the editor is on its surface, so a page
    // test can read the plan without a global.
    this.el.__forgeMapPanel = this;
    this.lastTape = this.tapeWidth();
    this.lastCue = this.northCue();
    this.unsubscribe = stateManager.subscribe(() => {
      const tape = this.tapeWidth();
      const cue = this.northCue();
      if (tape !== this.lastTape || cue !== this.lastCue) {
        this.lastTape = tape;
        this.lastCue = cue;
        this.schedule();
      }
      this.adoptPicture();
      if (this.mapType === 'drawing') this.steps?.refresh();
    });
    this.schedule(0);
  }

  /**
   * A map from a drawing holds the tile's Map file control in its first
   * step, so choosing, converting and tracing happen there; every other
   * type, the Alt View (where this panel hides and the tile's controls
   * stay) and the panel's end give it back to its place in the Customizer.
   * A control the Customizer built again replaces the stale one held here.
   */
  syncFileControl() {
    const container = document.getElementById('parametersContainer');
    // The Customizer's detail level (descriptions under the names, beside
    // them, or behind a help button) is an attribute on its container.
    if (this.fileSlot) {
      const level = container?.dataset.detailLevel;
      if (level) this.fileSlot.dataset.detailLevel = level;
      else delete this.fileSlot.dataset.detailLevel;
    }
    const fresh =
      container
        ?.querySelector(`[id="param-${this.config.mapFileParam}"]`)
        ?.closest('.param-control') || null;
    if (fresh && this.heldFile && fresh !== this.heldFile) {
      this.heldFile.remove();
      this.heldFile = null;
      this.fileHome = null;
    }
    const want =
      this.mapType === 'drawing' &&
      !this.altOff &&
      Boolean(this.fileSlot?.isConnected);
    if (want) {
      if (!this.heldFile) {
        if (!fresh) return;
        this.fileHome = document.createComment('map file control');
        fresh.before(this.fileHome);
        this.heldFile = fresh;
      }
      if (this.heldFile.parentNode !== this.fileSlot)
        this.fileSlot.appendChild(this.heldFile);
      return;
    }
    if (!this.heldFile) return;
    if (this.fileHome?.isConnected) this.fileHome.replaceWith(this.heldFile);
    else this.heldFile.remove();
    this.heldFile = null;
    this.fileHome = null;
  }

  /** Whether the tile's Map file control holds a file. */
  holdsMapFile() {
    const value =
      stateManager.getState()?.parameters?.[this.config.mapFileParam];
    if (typeof value === 'string') return value.length > 0;
    return Boolean(value?.data || value?.name);
  }

  /**
   * A place or a map file came in: the sample station (or a drawing's plan)
   * gives way to the empty plate titled NO MAP YET, at the map's own size,
   * until a draft is made. A draft already made is never replaced; a pick
   * after one keeps it until the next draft.
   *
   * @returns {boolean} whether the preview shows the empty plate now
   */
  wait() {
    if (this.source === 'draft') return false;
    if (this.plan.meta?.waiting) return true;
    this.plan = waitingPlan(this.plan.size.w, this.plan.size.h);
    this.planWarnings = [];
    this.plate = 'whole';
    // The sample's drawing goes with it: the door opens a drawing chosen
    // from here on, or says what to do.
    this.drawing = null;
    this.source = null;
    this.setTitle(WAITING_TITLE);
    this.schedule(0);
    return true;
  }

  /** The tile's raised title, when the manifest names its parameter. */
  setTitle(text) {
    if (this.config.titleParam) setParameterValue(this.config.titleParam, text);
  }

  /** A draft replaced the empty plate: NO MAP YET leaves, a typed title stays. */
  leaveWaiting() {
    const key = this.config.titleParam;
    if (!key) return;
    if (stateManager.getState()?.parameters?.[key] === WAITING_TITLE)
      this.setTitle('');
  }

  /**
   * The picture the file control holds, as text, or null when it holds
   * none or not an SVG.
   */
  currentPicture() {
    const value =
      stateManager.getState()?.parameters?.[this.config.mapFileParam];
    const data = value?.data;
    if (typeof data !== 'string' || !data.startsWith('data:')) return null;
    const svg = dataUrlToText(data);
    if (!svg.includes('<svg')) return null;
    return { svg, name: value.name || 'drawing.svg', data };
  }

  /**
   * A new picture in the file control that is not this panel's own levels
   * file becomes the drawing the door opens, and the Drawing width control
   * takes the width the file declares, when it declares one. Decoded only
   * when the control's value changed.
   */
  adoptPicture() {
    const value =
      stateManager.getState()?.parameters?.[this.config.mapFileParam];
    const data = value?.data;
    if (data === this.lastPictureData) return;
    this.lastPictureData = data;
    const picture = this.currentPicture();
    if (!picture || isLevelsFile(picture.svg)) return;
    const svg = filledOutlines(picture.svg);
    if (this.drawing && this.drawing.svg === svg) return;
    this.drawing = {
      svg,
      name: picture.name,
      box: drawingBox(svg),
      classes: null,
      regions: null,
    };
    this.source = 'drawing';
    const declared = this.drawing.box?.widthMm;
    if (declared > 0) {
      this.drawingWidthMm = declared;
    } else if (!(this.drawingWidthMm > 0)) {
      this.drawingWidthMm = this.plan.size.w;
    }
    if (this.refs.drawingWidth)
      this.refs.drawingWidth.value = String(this.drawingWidthMm);
  }

  /**
   * Open the drawing editor as a map on the drawing: the one kept here,
   * else whatever the file control holds (the levels file itself, when no
   * drawing was ever chosen: its shapes are a map's shapes too).
   */
  async openDrawing() {
    this.adoptPicture();
    const opener = this.refs.editDrawing;
    if (!this.drawing && this.plan.meta?.waiting) {
      this.sayDrawing(ADDRESS_STRINGS.waitingDoor);
      return;
    }
    // A draft reopens as the draft, with the classes it has now.
    if (this.source === 'draft') {
      await this.openDraft(opener);
      return;
    }
    if (!this.drawing) {
      const picture = this.currentPicture();
      if (!picture) {
        this.sayDrawing('Choose a drawing for the map file first.', true);
        return;
      }
      // The panel's own levels file is this plan drawn: open the plan, with
      // its classes, not its shapes all at Ignore.
      if (isLevelsFile(picture.svg)) {
        await this.openDraft(opener);
        return;
      }
      this.drawing = {
        svg: picture.svg,
        name: picture.name,
        box: drawingBox(picture.svg),
        classes: null,
        regions: null,
      };
      if (!(this.drawingWidthMm > 0)) this.drawingWidthMm = this.plan.size.w;
      if (this.refs.drawingWidth)
        this.refs.drawingWidth.value = String(this.drawingWidthMm);
    }
    const drawing = this.drawing;
    const editor = await this.getEditor();
    if (!editor || typeof editor.open !== 'function') {
      this.sayDrawing('The drawing editor is not on this page.', true);
      return;
    }
    const { analyzeSvg } = await import('../svg-preparer.js');
    const analysis = analyzeSvg(drawing.svg);
    editor.open(drawing.svg, analysis, {
      purpose: 'map',
      sourceName: drawing.name,
      initialClasses: drawing.classes,
      onApply: (result) => {
        this.takeRegions(result);
        backTo(opener);
      },
      onKeepOriginal: () => backTo(opener),
      onClose: () => backTo(opener),
    });
  }

  /** The editor's Apply classes: the regions become this panel's plan. */
  takeRegions(result) {
    const regions = Array.isArray(result?.regions) ? result.regions : [];
    if (!this.drawing) return;
    this.drawing.regions = regions;
    this.drawing.classes = Object.fromEntries(
      regions.map((r) => [r.index, r.class])
    );
    this.source = 'drawing';
    this.rebuildFromDrawing();
  }

  /** The plan from the kept regions at the width the control says. */
  rebuildFromDrawing() {
    const drawing = this.drawing;
    if (!drawing?.regions) return;
    const widthMm =
      this.drawingWidthMm > 0 ? this.drawingWidthMm : this.plan.size.w;
    const { plan, warnings } = planFromRegions({
      regions: drawing.regions,
      box: drawing.box,
      scale: scaleFromWidth(drawing.box, widthMm),
      mapWidthMm: widthMm,
    });
    this.plan = plan;
    this.planWarnings = warnings;
    this.plate = 'whole';
    this.schedule(0);
  }

  /**
   * The Drawing width control: the width of the drawing in millimeters,
   * which sets the scale. Said as a scale once a drawing is known, and the
   * plan is rebuilt at it when one was applied.
   */
  setDrawingWidth(value) {
    const input = this.refs.drawingWidth;
    if (!(value > 0)) {
      if (input && this.drawingWidthMm > 0)
        input.value = String(this.drawingWidthMm);
      return;
    }
    this.drawingWidthMm = value;
    const scale = scaleFromWidth(this.drawing?.box, value);
    if (scale) announce(scaleSentence(scale), { source: SOURCE });
    this.rebuildFromDrawing();
  }

  /** A sentence under the door, said once. */
  sayDrawing(text, failed = false) {
    if (this.refs.drawingStatus) this.refs.drawingStatus.textContent = text;
    (failed ? announceError : announce)(text, { source: SOURCE });
  }

  tapeWidth() {
    const value = Number(
      stateManager.getState()?.parameters?.label_tape_width_mm
    );
    return Number.isFinite(value) && value > 0 ? value : 12.7;
  }

  /** The tile's north cue, which decides where a split map's cue goes. */
  northCue() {
    const cue = stateManager.getState()?.parameters?.north_cue;
    return typeof cue === 'string' && cue ? cue : 'Arrow with N';
  }

  bed() {
    if (this.bedKey === 'custom') return { w: this.custom.w, d: this.custom.d };
    return BED_PRESETS.find((b) => b.key === this.bedKey) || BED_PRESETS[0];
  }

  build() {
    const section = el('section', 'braille-panel tactile-map-panel');
    section.id = 'tactileMapPanel';
    if (this.mapType) section.dataset.mapType = this.mapType;
    section.setAttribute('aria-labelledby', 'tactileMapHeading');

    const heading = el('h2', 'braille-panel-heading', '');
    heading.id = 'tactileMapHeading';
    section.appendChild(heading);
    this.refs.heading = heading;

    // The parts the steps lay out, by group (see arrange()).
    const parts = {};
    const add = (group, node) => {
      (parts[group] ||= []).push(node);
    };
    this.parts = parts;

    const help = el(
      'p',
      'braille-panel-help',
      'Pick your printer’s bed and the map splits into equal plates. Choose a plate to preview and export it; Whole map shows everything at once.'
    );
    help.id = 'tactileMapHelp';
    add('intro', help);

    const bedLabel = el('label', 'braille-panel-label', 'Print bed');
    bedLabel.htmlFor = 'tactileMapBed';
    add('bed', bedLabel);

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
    add('bed', select);
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
    add('bed', custom);
    this.refs.custom = custom;

    const summary = el('p', 'braille-panel-help tactile-map-summary');
    summary.id = 'tactileMapSummary';
    summary.setAttribute('aria-live', 'polite');
    add('bed', summary);
    this.refs.summary = summary;

    const plates = el('fieldset', 'braille-panel-choice');
    plates.id = 'tactileMapPlates';
    plates.appendChild(el('legend', '', 'Plate'));
    add('bed', plates);
    this.refs.plates = plates;

    const styleLabel = el('label', 'braille-panel-label', 'Plate name style');
    styleLabel.htmlFor = 'tactileMapIdStyle';
    add('bed', styleLabel);
    const styleSelect = el('select', 'braille-panel-select');
    styleSelect.id = 'tactileMapIdStyle';
    for (const style of ID_STYLES) {
      const option = document.createElement('option');
      option.value = style.key;
      option.textContent = style.name;
      styleSelect.appendChild(option);
    }
    styleSelect.value = this.idStyle;
    styleSelect.addEventListener('change', () => {
      this.idStyle = styleSelect.value;
      this.schedule(0);
    });
    add('bed', styleSelect);
    this.refs.idStyle = styleSelect;

    // The plan's warnings, folded: a draft of a whole block can carry fifty,
    // and the plates and the render button stand after them.
    const warningsBox = el(
      'details',
      'forge-disclosure tactile-map-warnings-box'
    );
    warningsBox.id = 'tactileMapWarningsBox';
    warningsBox.hidden = true;
    const warningsSummary = el('summary');
    const warningsTitle = el('span', 'forge-disclosure-title');
    warningsSummary.appendChild(warningsTitle);
    warningsBox.appendChild(warningsSummary);
    const warnings = el('ul', 'braille-panel-help tactile-map-warnings');
    warnings.id = 'tactileMapWarnings';
    warningsBox.appendChild(warnings);
    add('warnings', warningsBox);
    this.refs.warnings = warnings;
    this.refs.warningsBox = warningsBox;
    this.refs.warningsTitle = warningsTitle;

    const widthRow = el('div', 'braille-panel-toggle-row tactile-map-drawing');
    const widthLabel = el('label', 'braille-panel-label', 'Drawing width (mm)');
    widthLabel.htmlFor = 'tactileMapDrawingWidth';
    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.id = 'tactileMapDrawingWidth';
    widthInput.className = 'braille-panel-number';
    widthInput.min = '1';
    widthInput.step = 'any';
    widthInput.value = String(
      this.drawingWidthMm > 0 ? this.drawingWidthMm : this.plan.size.w
    );
    widthInput.addEventListener('change', () => {
      this.setDrawingWidth(Number(widthInput.value));
    });
    widthRow.appendChild(widthLabel);
    widthRow.appendChild(widthInput);
    add('width', widthRow);
    this.refs.drawingWidth = widthInput;

    const doorRow = el('div', 'braille-translate-row tactile-map-drawing-row');
    const door = el(
      'button',
      'btn btn-secondary braille-translate-btn',
      'Edit drawing as a map'
    );
    door.type = 'button';
    door.id = 'tactileMapEditDrawing';
    this.refs.editDrawing = door;
    door.addEventListener('click', () => {
      this.openDrawing().catch((err) => {
        this.sayDrawing(err?.message || String(err), true);
      });
    });
    doorRow.appendChild(door);
    add('door', doorRow);
    const drawingStatus = el('p', 'braille-panel-help');
    drawingStatus.id = 'tactileMapDrawingStatus';
    drawingStatus.setAttribute('role', 'status');
    add('door', drawingStatus);
    this.refs.drawingStatus = drawingStatus;

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
    add('symbols', symbols);
    add('symbols', status);

    const actions = el('div', 'braille-translate-row tactile-map-actions');
    const renderAll = el(
      'button',
      'btn btn-primary braille-translate-btn',
      'Render every plate and download'
    );
    renderAll.type = 'button';
    renderAll.id = 'tactileMapRenderAll';
    renderAll.addEventListener('click', () => {
      this.renderEveryPlate().catch((err) => {
        this.say(err?.message || String(err), true);
      });
    });
    const cancel = el(
      'button',
      'btn btn-secondary braille-translate-btn',
      'Cancel'
    );
    cancel.type = 'button';
    cancel.id = 'tactileMapRenderCancel';
    cancel.hidden = true;
    cancel.addEventListener('click', () => {
      if (!this.running) return;
      this.cancelRequested = true;
      this.say('Stopping after this plate.');
    });
    actions.appendChild(renderAll);
    actions.appendChild(cancel);
    add('render', actions);
    this.refs.renderAll = renderAll;
    this.refs.cancel = cancel;

    const renderStatus = el('p', 'braille-panel-help');
    renderStatus.id = 'tactileMapRenderStatus';
    add('render', renderStatus);
    this.refs.renderStatus = renderStatus;

    // The chooser or the type's steps: laid out by arrange().
    const workflow = el('div', 'tactile-map-workflow');
    workflow.id = 'tactileMapWorkflow';
    section.appendChild(workflow);
    this.refs.workflow = workflow;

    return section;
  }

  /**
   * The map's purpose first: the chooser when no type is known, else the
   * type's numbered steps with every control in its step. The controls are
   * the same elements whatever the layout (ids kept); a type's unused ones
   * stay out of the page.
   */
  arrange({ focus = false } = {}) {
    const box = this.refs.workflow;
    if (!box) return;
    const heading = this.refs.heading;
    if (!this.mapType) {
      delete this.el.dataset.mapType;
      heading.textContent = MAP_TYPE_QUESTION;
      this.steps = null;
      this.fileSlot = null;
      box.replaceChildren(this.buildChooser());
      this.syncFileControl();
      if (focus) box.querySelector('input[type="radio"]')?.focus();
      return;
    }
    const type = mapType(this.mapType);
    this.el.dataset.mapType = type.key;
    heading.textContent = type.name;
    this.address?.setMode(type.key);
    this.steps = createSteps({
      id: 'tactileMapSteps',
      names: type.steps,
      need: (i) => this.stepNeed(i),
      onBackFromFirst: () => this.chooseAgain(),
    });
    const a = this.address?.parts || {};
    const p = this.parts;
    const note = (text) => [el('p', 'braille-panel-help', text)];
    const fill = (section, groups) => {
      for (const group of groups) {
        for (const node of group || []) section.appendChild(node);
      }
    };
    const plates = [p.intro, p.bed, p.warnings, p.door, p.symbols, p.render];
    const [s1, s2, s3, s4, s5] = this.steps.sections;
    this.fileSlot = null;
    if (type.key === 'place') {
      fill(s1, [a.where]);
      fill(s2, [a.radius]);
      fill(s3, [a.landmarks]);
      fill(s4, [a.make]);
      fill(s5, plates);
    } else if (type.key === 'route') {
      fill(s1, [a.where, a.to]);
      fill(s2, [a.steps]);
      fill(s3, [a.landmarks]);
      fill(s4, [a.make]);
      fill(s5, plates);
    } else {
      this.fileSlot = el('div', 'tactile-map-file-slot');
      fill(s1, [note(WORKFLOW_STRINGS.drawingChoose), [this.fileSlot]]);
      fill(s2, [p.width]);
      fill(s3, [p.door, p.symbols]);
      fill(s4, [note(WORKFLOW_STRINGS.drawingApply)]);
      fill(s5, [p.intro, p.bed, p.warnings, p.render]);
    }
    box.replaceChildren(this.steps.el);
    this.syncFileControl();
    this.steps.refresh();
    if (focus) this.steps.show(0);
  }

  /** The three map types as radios, each with its sentence, and Next. */
  buildChooser() {
    const wrap = el('div', 'tactile-map-chooser');
    const group = el('fieldset', 'braille-panel-choice tactile-map-types');
    group.id = 'tactileMapChooser';
    group.appendChild(el('legend', 'sr-only', WORKFLOW_STRINGS.chooserLegend));
    const radios = MAP_TYPES.map((type) => {
      const card = el('div', 'tactile-map-type-card');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'tactileMapType';
      radio.id = `tactileMapType-${type.key}`;
      radio.value = type.key;
      radio.checked = type.key === this.lastType;
      const name = el('label', 'tactile-map-type-name', type.name);
      name.htmlFor = radio.id;
      const sentence = el('p', 'braille-panel-help', type.sentence);
      sentence.id = `${radio.id}-sentence`;
      radio.setAttribute('aria-describedby', sentence.id);
      card.appendChild(radio);
      card.appendChild(name);
      card.appendChild(sentence);
      group.appendChild(card);
      return radio;
    });
    wrap.appendChild(group);
    const row = el('div', 'braille-translate-row tactile-map-step-actions');
    const next = el(
      'button',
      'btn btn-primary braille-translate-btn',
      STEP_STRINGS.next
    );
    next.type = 'button';
    next.id = 'tactileMapChooserNext';
    const reason = el(
      'span',
      'braille-panel-help tactile-map-step-reason',
      WORKFLOW_STRINGS.chooserReason
    );
    reason.id = 'tactileMapChooserReason';
    const sync = () => {
      const chosen = radios.some((r) => r.checked);
      next.disabled = !chosen;
      reason.textContent = chosen ? '' : WORKFLOW_STRINGS.chooserReason;
      if (chosen) next.removeAttribute('aria-describedby');
      else next.setAttribute('aria-describedby', reason.id);
    };
    for (const r of radios) r.addEventListener('change', sync);
    next.addEventListener('click', () => {
      const chosen = radios.find((r) => r.checked);
      if (chosen) this.setType(chosen.value);
    });
    sync();
    row.appendChild(next);
    row.appendChild(reason);
    wrap.appendChild(row);
    return wrap;
  }

  /**
   * A type chosen: a place or route map shows the empty plate until its
   * draft; a map from a drawing shows the sample station, its example.
   */
  setType(key) {
    const type = mapType(key);
    if (!type) return;
    this.mapType = type.key;
    this.lastType = type.key;
    if (type.key === 'drawing') {
      if (this.plan.meta?.waiting) {
        this.plan = sampleStationPlan();
        this.source = null;
        this.planWarnings = [];
        this.plate = 'whole';
        this.leaveWaiting();
        this.schedule(0);
      }
    } else {
      this.wait();
    }
    this.arrange({ focus: true });
  }

  /** Back from the first step: the chooser again, the type still ticked. */
  chooseAgain() {
    this.lastType = this.mapType;
    this.mapType = null;
    this.arrange({ focus: true });
  }

  /** Why Next waits on a step, or null. */
  stepNeed(index) {
    const key = this.mapType;
    if (key === 'place' && index === 0 && !this.address?.getPlace()) {
      return WORKFLOW_STRINGS.needPlace;
    }
    if (
      key === 'route' &&
      index === 0 &&
      !(this.address?.getPlace() && this.address?.getDest())
    ) {
      return WORKFLOW_STRINGS.needBoth;
    }
    if (key === 'drawing' && index === 0 && !this.holdsMapFile()) {
      return WORKFLOW_STRINGS.needDrawing;
    }
    if (key !== 'drawing' && index === 3 && this.source !== 'draft') {
      return WORKFLOW_STRINGS.needMap;
    }
    return null;
  }

  /** The geocoder: a stub when a test handed one in, else the lazy chunk. */
  async geocode(query) {
    if (!this.searchPlaces) {
      const { searchPlaces } = await import('./geocode.js');
      this.searchPlaces = searchPlaces;
    }
    return this.searchPlaces(query);
  }

  /**
   * The map data pull: a stub when a test handed one in, else the lazy
   * chunk that asks the map tiles first and the Overpass servers after.
   */
  async pull(where) {
    if (!this.pullArea) {
      const { pullMapData } = await import('./map-data.js');
      this.pullArea = pullMapData;
    }
    return this.pullArea(where);
  }

  /**
   * A dropped export read on the device: its elements and the middle of
   * them. The reader module is a lazy chunk too.
   */
  async readOsmFile(file) {
    const { elementsFromText, centerOf } = await import('./osm-file.js');
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () =>
        reject(reader.error || new Error(`${file.name} could not be read.`));
      reader.readAsText(file);
    });
    const elements = elementsFromText(text, file.name);
    return { elements, center: centerOf(elements) };
  }

  /**
   * Make a draft map: the map data through the draft builder (a lazy chunk)
   * into this panel's plan, said in one sentence, then the editor opens on
   * it so the person chooses what stays. Nothing near the address is a
   * sentence and no change.
   */
  async makeDraft() {
    const osm = this.osm;
    if (!osm) return;
    if (osm.to) {
      await this.makeRouteDraft(osm);
      return;
    }
    const { draftPlan, NEAR_M } = await import('./plan-from-osm.js');
    const { plan, counts } = draftPlan({
      elements: osm.elements,
      center: osm.center,
      radiusM: osm.radiusM,
      landmarks: osm.landmarks,
      size: { w: this.plan.size.w, h: this.plan.size.h },
      place: osm.place,
    });
    if (!plan.features.some((f) => f.class === 'walkway' && f.on)) {
      this.sayAddress(ADDRESS_STRINGS.nothingNear(NEAR_M), true);
      return;
    }
    const { warnings } = buildLevelRings(plan);
    this.plan = plan;
    this.draft = { counts, warnings: warnings.length };
    this.source = 'draft';
    this.planWarnings = [];
    this.plate = 'whole';
    this.leaveWaiting();
    this.schedule(0);
    this.steps?.refresh();
    this.sayAddress(
      (warnings.length
        ? ADDRESS_STRINGS.draftReady(counts.on, counts.total, warnings.length)
        : ADDRESS_STRINGS.draftReadyClean(counts.on, counts.total)) +
        this.bigNote(osm)
    );
    await this.steepIfWanted();
    await this.openDraft();
  }

  /**
   * Make a route map: the walk between the two places (a lazy chunk) as
   * this panel's plan, said in one sentence with its length, crossings and
   * steps, then the editor opens on it. No walk is a sentence and no change.
   */
  async makeRouteDraft(osm) {
    const short = (p) => (p?.name || '').split(',')[0].trim();
    const from = short(osm.place);
    const to = short(osm.to);
    const { draftRoutePlan } = await import('./plan-from-route.js');
    const { plan, counts } = draftRoutePlan({
      elements: osm.elements,
      from: osm.place,
      to: osm.to,
      size: { w: this.plan.size.w, h: this.plan.size.h },
      landmarks: osm.landmarks,
      avoidSteps: this.address?.avoidSteps() ?? false,
    });
    if (!plan) {
      this.sayAddress(ADDRESS_STRINGS.noWalk(from, to), true);
      return;
    }
    const { warnings } = buildLevelRings(plan);
    this.plan = plan;
    this.draft = { counts, warnings: warnings.length };
    this.source = 'draft';
    this.planWarnings = [];
    this.plate = 'whole';
    this.leaveWaiting();
    this.schedule(0);
    this.steps?.refresh();
    this.sayAddress(
      ADDRESS_STRINGS.routeReady(
        Math.round(counts.lengthM),
        from,
        to,
        counts.crossings,
        counts.steps,
        plan.size.w,
        plan.size.h
      ) + this.bigNote(osm)
    );
    await this.steepIfWanted();
    await this.openDraft();
  }

  /**
   * The draft in the editor's map purpose: one shape per feature at its
   * index, the on ones with their class and the off ones as Off; Apply
   * lays the rows back over the plan by index and the plates follow.
   * Focus goes back to `opener`, the button that opened it, as it closes.
   */
  async openDraft(opener = this.address?.refs?.make) {
    const editor = await this.getEditor();
    if (!editor || typeof editor.open !== 'function') {
      this.sayAddress('The drawing editor is not on this page.', true);
      return;
    }
    const { drawingFromPlan, applyRowsToPlan } =
      await import('./plan-drawing.js');
    const { joinRoute } = await import('./route.js');
    const { analyzeSvg } = await import('../svg-preparer.js');
    const svg = drawingFromPlan(this.plan);
    const initialClasses = Object.fromEntries(
      this.plan.features.map((f, i) => [i, f.on ? f.class : 'ignore'])
    );
    const place =
      this.plan.meta?.title || this.osm?.place?.name || 'the address';
    const route = this.plan.meta?.route;
    editor.open(svg, analyzeSvg(svg), {
      purpose: 'map',
      draft: true,
      sourceName: route
        ? ADDRESS_STRINGS.routeName(route.from, route.to)
        : ADDRESS_STRINGS.draftName(place),
      initialClasses,
      features: this.plan.features,
      mmPerM: this.plan.meta?.geo?.mmPerM ?? null,
      onApply: (result) => {
        const applied = applyRowsToPlan(this.plan, result?.regions || []);
        // The route's segments that meet become one Route line.
        this.plan = { ...applied, features: joinRoute(applied.features) };
        this.plate = 'whole';
        this.schedule(0);
        backTo(opener);
      },
      onKeepOriginal: () => backTo(opener),
      onClose: () => backTo(opener),
    });
  }

  /** Over 2 MB of data: the size warning, said with the draft. */
  bigNote(osm) {
    return osm?.bytes > BIG_BYTES
      ? ' ' + ADDRESS_STRINGS.big((osm.bytes / (1024 * 1024)).toFixed(1))
      : '';
  }

  /** The steep switch ticked before the draft: mark them now. */
  async steepIfWanted() {
    const wish = this.address?.steepWanted();
    if (wish?.on) await this.markSteep(true, wish.gradePct);
  }

  /**
   * Mark steep sidewalks: on, the terrain tiles under the draft are read
   * (lazy chunks), every on walkway sampled, and the runs steeper than the
   * grade become Steep sidewalk features; off, those features leave. The
   * tiles are the map's third host; a failure says so and the switch rests.
   */
  async markSteep(on, gradePct) {
    const base = {
      ...this.plan,
      features: this.plan.features.filter((f) => f.class !== 'steep'),
    };
    const sw = this.address?.refs?.steep;
    if (!on) {
      if (base.features.length !== this.plan.features.length) {
        this.plan = base;
        this.schedule(0);
      }
      return;
    }
    const geo = base.meta?.geo;
    // Before a draft the switch is a wish, kept for the draft to come.
    if (!geo?.center || !this.draft) return;
    const walkways = base.features.filter(
      (f) => f.kind === 'line' && f.on && f.class === 'walkway'
    ).length;
    this.sayAddress(ADDRESS_STRINGS.reading(walkways));
    try {
      const [{ tilesCovering, loadTiles, elevationSampler }, { markSteep }] =
        await Promise.all([import('./terrain.js'), import('./steep.js')]);
      let elevationAt = this.elevationAt;
      if (!elevationAt) {
        const radiusM = this.osm?.radiusM ?? 250;
        const tiles = await loadTiles(tilesCovering(geo.center, radiusM), {
          fetch: this.fetchTiles || undefined,
        });
        elevationAt = elevationSampler(tiles);
      }
      const { plan, steepCount } = markSteep(base, { elevationAt, gradePct });
      this.plan = plan;
      this.schedule(0);
      this.sayAddress(
        steepCount
          ? ADDRESS_STRINGS.steepMarked(steepCount, gradePct)
          : ADDRESS_STRINGS.steepNone(gradePct)
      );
    } catch (error) {
      if (sw) sw.checked = false;
      if (error?.code === 'no-answer') {
        this.sayAddress(ADDRESS_STRINGS.tilesNoAnswer, true);
      } else {
        this.sayAddress(error?.message || String(error), true);
      }
    }
  }

  /**
   * A sentence in the address section's status box, said once; a failure
   * marks the box until the next sentence.
   */
  sayAddress(text, failed = false, { quiet = false } = {}) {
    const line = this.address?.refs?.status;
    if (line) {
      line.textContent = text;
      line.classList.toggle('is-failed', failed);
    }
    if (!quiet) (failed ? announceError : announce)(text, { source: SOURCE });
  }

  /** Show a sentence under the buttons and say it once through the announcer. */
  say(text, failed = false) {
    if (this.refs.renderStatus) this.refs.renderStatus.textContent = text;
    (failed ? announceError : announce)(text, { source: SOURCE });
  }

  /**
   * Render each plate in turn and offer the archive. One render at a time,
   * in plate order; Cancel stops after the plate under way; a failed plate
   * stops the loop with its message, and the plates finished so far are
   * still offered.
   */
  async renderEveryPlate() {
    if (this.running || !this.layout) return;
    const state = stateManager.getState();
    const format = state.outputFormat === '3mf' ? '3mf' : 'stl';
    const stem = projectStem(state.uploadedFile?.name || 'tactile_map');
    const parameters = state.parameters || {};
    const built = buildLevelRings(this.plan, { tapeWidthMm: this.tapeWidth() });
    const sets = plateParameterSets({
      rings: built.rings,
      layout: this.layout,
      idStyle: this.idStyle,
      northCue: this.northCue(),
      config: this.config,
      parameters,
    });
    const n = sets.length;
    const { renderAll, cancel } = this.refs;

    this.running = true;
    this.cancelRequested = false;
    renderAll.hidden = true;
    cancel.hidden = false;
    cancel.focus();

    const rendered = [];
    let stop = null;
    try {
      for (const set of sets) {
        let bytes;
        try {
          bytes = await this.render(set.parameters, {
            format,
            timeoutMs: PLATE_TIMEOUT_MS,
          });
        } catch (err) {
          stop = { error: err?.message || String(err) };
          break;
        }
        rendered.push({ id: set.id, bytes });
        this.say(`Plate ${rendered.length} of ${n} rendered.`);
        if (this.cancelRequested) {
          stop = {};
          break;
        }
      }

      let sentence;
      if (rendered.length === 0) {
        sentence =
          'Stopped before the first plate finished; nothing to download.';
      } else {
        const fileName = `${stem}_plates.zip`;
        const bytes = await this.buildArchive({
          stem,
          extension: OUTPUT_FORMATS[format]?.extension || '.stl',
          rendered,
          sets,
          rings: built.rings,
          parameters,
        });
        this.download(bytes, fileName, 'zip');
        if (stop) {
          sentence = `Stopped after plate ${rendered.length}; the zip holds the plates finished so far.`;
        } else if (n === 1) {
          sentence = `The plate is in ${fileName}.`;
        } else {
          sentence = `All ${n} plates are in ${fileName}.`;
        }
      }
      if (stop?.error) sentence += ` ${stop.error}`;
      this.say(sentence, Boolean(stop?.error));
    } finally {
      this.running = false;
      renderAll.hidden = false;
      if (document.activeElement === cancel) renderAll.focus();
      cancel.hidden = true;
    }
  }

  async buildArchive({ stem, extension, rendered, sets, rings, parameters }) {
    const bed = this.bed();
    const bedName =
      this.bedKey === 'custom' ? `custom ${bed.w} x ${bed.d} mm` : bed.name;
    const readme = readmeText({
      mapName:
        String(parameters.title_text || '').trim() ||
        this.plan.meta?.title ||
        stem,
      bedName,
      layout: this.layout,
      size: this.plan.size,
      heights: levelHeights(parameters),
      tapeWidthMm: this.tapeWidth(),
    });
    const grid = plateGridSvg({
      rings,
      layout: this.layout,
      size: this.plan.size,
      bedName,
    });
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const entry of archiveEntries({
      stem,
      extension,
      rendered,
      sets,
      plan: this.plan,
      readme,
      grid,
    })) {
      zip.file(entry.name, entry.data);
    }
    return zip.generateAsync({ type: 'uint8array' });
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
    const ids = [
      'whole',
      ...(this.layout ? this.layout.plates.map((p) => p.id) : []),
    ];
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
    const bed = this.bed();
    const layout = planPlates({ w, h, bed });
    // The tile refuses a plate under its floor; a bed that cuts the map
    // that small is refused here, in a sentence, and the whole map stays.
    const tooSmall =
      layout.plateW < PLATE_MIN_MM.w - 1e-9 ||
      layout.plateH < PLATE_MIN_MM.h - 1e-9;
    this.layout = tooSmall ? null : layout;
    const n = layout.plates.length;
    // Plate sizes in tenths of a millimeter at most.
    const pw = Math.round(layout.plateW * 10) / 10;
    const ph = Math.round(layout.plateH * 10) / 10;
    let sentence;
    if (tooSmall) {
      sentence = `A ${bed.w} x ${bed.d} mm bed cuts this map into plates of ${pw} x ${ph} mm, under the ${PLATE_MIN_MM.w} x ${PLATE_MIN_MM.h} mm minimum. Choose a larger bed.`;
    } else if (n === 1) {
      sentence = `One plate of ${pw} x ${ph} mm; the whole map fits.`;
    } else {
      sentence = `${n} plates of ${pw} x ${ph} mm, ${layout.plates[0].id} to ${layout.plates[n - 1].id}.`;
    }
    if (this.refs.summary.textContent !== sentence)
      this.refs.summary.textContent = sentence;
    this.rebuildPlates();

    const built = buildLevelRings(this.plan, { tapeWidthMm: this.tapeWidth() });
    const allWarnings = [...this.planWarnings, ...built.warnings];
    this.refs.warnings.replaceChildren(
      ...allWarnings.map((warning) => el('li', '', warning.text))
    );
    this.refs.warningsBox.hidden = allWarnings.length === 0;
    this.refs.warningsTitle.textContent = WARNINGS_TITLE(allWarnings.length);

    let svg;
    let size;
    let fileName;
    let plateId = '';
    let showTitle = 'yes';
    let showNorth = 'yes';
    if (this.plate === 'whole') {
      svg = levelsSvgFromRings(built.rings, this.plan.size, built.textBoxes);
      size = this.plan.size;
      fileName = 'levels_whole.svg';
    } else {
      const plate = this.layout.plates.find((p) => p.id === this.plate);
      const out = plateLevelsSvg(built.rings, plate, { id: this.idStyle });
      const roles = plateRoles(plate, this.layout, this.northCue());
      svg = out.svg;
      size = out.size;
      fileName = `levels_${plate.id}.svg`;
      if (this.idStyle === 'margin') plateId = plate.id;
      showTitle = roles.title ? 'yes' : 'no';
      showNorth = roles.north ? 'yes' : 'no';
    }
    setParameterValue(this.config.widthParam, size.w);
    setParameterValue(this.config.heightParam, size.h);
    if (this.config.plateIdParam)
      setParameterValue(this.config.plateIdParam, plateId);
    if (this.config.plateShowsTitleParam)
      setParameterValue(this.config.plateShowsTitleParam, showTitle);
    if (this.config.plateShowsNorthParam)
      setParameterValue(this.config.plateShowsNorthParam, showNorth);
    if (!this.setFile(this.config.mapFileParam, fileName, svg)) {
      console.warn(
        `[MapPanel] No file control for parameter: ${this.config.mapFileParam}`
      );
    }
  }

  /** The panel's sections, hidden together under the Alt View. */
  sections() {
    return [this.el, this.address?.el].filter(Boolean);
  }

  /** Hide or show the panel as the Alt View goes on or off; say it once. */
  syncAltView() {
    const off =
      document.documentElement.getAttribute('data-ui-variant') === 'mono';
    if (off === this.altOff) return;
    this.altOff = off;
    for (const el of this.sections()) el.hidden = off;
    this.syncFileControl();
    if (off) announce(ALT_VIEW_SENTENCE, { source: SOURCE });
  }

  destroy() {
    clearTimeout(this.timer);
    this.altObserver?.disconnect();
    this.altObserver = null;
    this.customizerObserver?.disconnect();
    this.customizerObserver = null;
    this.mapType = null;
    this.syncFileControl();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.el?.parentNode) this.el.parentNode.removeChild(this.el);
    this.el = null;
    this.address?.destroy();
    this.address = null;
  }
}
