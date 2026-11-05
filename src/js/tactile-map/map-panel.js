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
import {
  DEFAULT_SETTINGS,
  buildLevelRings,
  levelsSvgFromRings,
  settingsForSet,
} from './levels-svg.js';
import { keyFor, keySentence, keyText } from './map-key.js';
import { keyLabel, keyPlates, KEY_LETTER_MM, KEY_WORDS } from './key-layout.js';
import { labelPlan } from './map-labels.js';
import {
  mapPaperSvg,
  moveTexts,
  paperChannels,
  paperColors,
  paperTexts,
  paperWords,
  shiftTexts,
} from './map-paper.js';
import { PAPER_SIZES, mapPdf } from './map-pdf.js';
import { svgToDataUrl } from '../svg-text-encoding.js';
import {
  BED_PRESETS,
  ID_STYLES,
  PLATE_MIN_MM,
  isTitleId,
  planPlates,
  plateLevelsSvg,
  titleLabel,
} from './plate-tiling.js';
import {
  MARGIN_MM,
  TITLE_PLACEMENTS,
  plateRows,
  rowsText,
  sheetOf,
  shiftRings,
  titleRows,
  trimFace,
} from './sheet.js';
import {
  BUILT_IN_SETS,
  activeSet,
  activeSetKey,
  loadSymbolLibraryFile,
  setActiveSet,
  setLibrary,
} from './symbol-library.js';
import {
  ADDRESS_STRINGS,
  BIG_BYTES,
  DETAIL_START,
  createAddressSection,
} from './address-section.js';
import { applyDetail, judgeSymbols, switchesFor } from './detail-levels.js';
import {
  EMPTY_RINGS,
  PDF_NAME,
  archiveEntries,
  coneRows,
  levelHeights,
  mapAbout as aboutLines,
  plateGridSvg,
  plateParameterSets,
  plateRoles,
  readmeText,
  titlePlateSets,
} from './plate-export.js';
import { OUTPUT_FORMATS, downloadFile, projectStem } from '../download.js';

const DEBOUNCE_MS = 350;
const CUSTOM_MIN_MM = 100;
const CUSTOM_MAX_MM = 600;
/**
 * Whether a map type starts with its empty edges trimmed: a place map is
 * drawn on the whole ground step 2 chose, so most of it may be blank; a
 * drawing is the size its maker gave it; a route map already fits its walk
 * and offers no switch.
 */
const TRIM_BY_TYPE = { place: true, drawing: false, route: false };
const SOURCE = 'tactile-map';
const PLATE_TIMEOUT_MS = 60_000;
const ENGINE_NOT_READY =
  'The OpenSCAD engine has not initialized yet. Please wait or refresh the page.';
/** A11Y: said once when the Alt View comes on with this panel mounted. */
export const ALT_VIEW_SENTENCE =
  'The Tactile Map Designer is not available in the Alt View. Its controls return when the Alt View is off.';
/** A11Y: the name of the folded warnings list, its count first. */
export const WARNINGS_TITLE = (n) => (n === 1 ? '1 warning' : `${n} warnings`);
/** A11Y: said when the paper could not be laid on the plate. */
export const PAPER_FAILED = (why) => `The map paper could not be drawn: ${why}`;
/**
 * The paper lies this far under the plate's underside: a sheet under a
 * print, covered until the model is switched off. On the plate it would
 * fight the raised faces for depth: the preview's depth buffer cannot tell
 * surfaces half a millimeter apart on a 480 mm plate (MEASURED).
 */
const PAPER_GAP_MM = 2;

let panel = null;

/**
 * A render through the app's export path: the render controller the
 * preview controller holds, the project's files and libraries, the format
 * asked for, and a time limit per plate.
 *
 * @param {Function|undefined} getController - Returns the AutoPreviewController, or null
 * @returns {(parameters: Object, options: {format: string, timeoutMs: number}) => Promise<ArrayBuffer|Uint8Array>}
 */
/** A key plate's id: 'key', or 'key-1' and on when the key takes several. */
const isKeyId = (id) => /^key(-\d+)?$/.test(String(id));

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
 * @param {{ plan?: object, setFile?: Function, bedKey?: string, idStyle?: string, keyWords?: string, getAutoPreviewController?: Function, render?: Function, download?: Function, getEditor?: Function }} [options]
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
    this.keyWords = KEY_WORDS.some((w) => w.key === options.keyWords)
      ? options.keyWords
      : KEY_WORDS[0].key;
    // The sheet: the band around the face and where the title stands; the
    // empty plate around what prints trimmed away for a place map.
    this.marginMm = MARGIN_MM.start;
    this.titlePlacement = TITLE_PLACEMENTS[0].key;
    this.trim = TRIM_BY_TYPE[this.mapType] ?? false;
    this.view = {
      face: { w: this.plan.size.w, h: this.plan.size.h },
      offset: [0, 0],
      trimmed: false,
    };
    // The face a draft is drawn on, before any orientation swaps it.
    this.baseSize = { w: this.plan.size.w, h: this.plan.size.h };
    this.render =
      options.render || renderThroughEngine(options.getAutoPreviewController);
    this.download = options.download || downloadFile;
    this.getEditor = options.getEditor || sharedDrawingEditor;
    // The map paper: the plate shown, drawn flat with its names, laid on
    // the preview's reference overlay while the checkbox says so.
    this.getController = options.getAutoPreviewController || null;
    this.showPaper = options.showPaper !== false;
    this.paper = null;
    this.paperShown = false;
    this.paperToken = 0;
    // The PDF's paper, Letter unless chosen.
    this.paperSize = PAPER_SIZES.some((p) => p.key === options.paperSize)
      ? options.paperSize
      : PAPER_SIZES[0].key;
    // The address section: its geocoder (a test's stub, else the lazy
    // chunk loaded on the first press) and the place last picked.
    this.searchPlaces = options.searchPlaces || null;
    this.planJourneys = options.planJourneys || null;
    this.transitPlanner = null;
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
    this.keyPages = [];
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
        this.countDetail().catch((err) => {
          this.sayAddress(err?.message || String(err), true);
        });
      },
      onDetail: (detail) =>
        this.detailChanged(detail).catch((err) => {
          this.sayAddress(err?.message || String(err), true);
        }),
      onSymbolSet: (key) => this.symbolSetChanged(key),
      onDraft: () =>
        this.makeDraft().catch((err) => {
          this.sayAddress(err?.message || String(err), true);
        }),
      onChange: () => this.steps?.refresh(),
      plateSize: () => this.draftSize(),
      planJourneys: (ask) => this.journeys(ask),
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
    this.lastTitle = this.titleKey();
    this.unsubscribe = stateManager.subscribe(() => {
      const tape = this.tapeWidth();
      const cue = this.northCue();
      const title = this.titleKey();
      if (
        tape !== this.lastTape ||
        cue !== this.lastCue ||
        title !== this.lastTitle
      ) {
        this.lastTape = tape;
        this.lastCue = cue;
        this.lastTitle = title;
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

  /**
   * Tell the model what the map file holds, when the manifest names the
   * parameter: its levels file, or a drawing whose shapes are not classed
   * yet, which the model raises whole instead of looking up levels it lacks.
   */
  setFileKind(kind) {
    const key = this.config.mapFileKindParam;
    if (!key || stateManager.getState()?.parameters?.[key] === kind) return;
    setParameterValue(key, kind);
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

  /** The title as typed in the model's control; the waiting words are none. */
  titleText() {
    if (!this.config.titleParam) return '';
    const text = String(
      stateManager.getState()?.parameters?.[this.config.titleParam] || ''
    ).trim();
    return text === WAITING_TITLE ? '' : text;
  }

  /** The raised title's capital height, from the model's control. */
  titleLetterMm() {
    const parameters = stateManager.getState()?.parameters || {};
    return (
      Number(parameters[this.config.titleLetterParam]) ||
      DEFAULT_SETTINGS.titleCharHeightMm
    );
  }

  /** What the title band depends on: the words and their capital height. */
  titleKey() {
    return `${this.titleText()}\n${this.titleLetterMm()}`;
  }

  /**
   * The sheet around the plan's face, as step 5 sets it. A tile that keeps
   * its title to itself (no title parameter in its manifest) draws the
   * title inside the face as it always did.
   */
  sheetNow() {
    return sheetOf({
      face: this.view?.face || this.plan.size,
      marginMm: this.marginMm,
      title: this.titleText(),
      placement: this.config.titleParam ? this.titlePlacement : 'inside',
      letterMm: this.titleLetterMm(),
    });
  }

  /**
   * The face the sheet goes around: the plan's whole face, or, with the
   * trim on, the box around what prints (the rings and the letters; the
   * tile's own title stands on the sheet's edge and does not count).
   */
  measureView(built) {
    const whole = {
      face: { w: this.plan.size.w, h: this.plan.size.h },
      offset: [0, 0],
      trimmed: false,
    };
    if (!this.trim) return whole;
    return trimFace({
      face: this.plan.size,
      printed: {
        rings: built.rings,
        boxes: (built.textBoxes || []).filter((b) => !b.title),
      },
    });
  }

  /** What the face's coordinates add to land on the sheet. */
  faceShift(sheet) {
    const [ox, oy] = this.view?.offset || [0, 0];
    return [sheet.faceAt[0] - ox, sheet.faceAt[1] - oy];
  }

  /**
   * The face a draft is drawn on: the model's size, turned upright when
   * step 2 says portrait (the same scale: less ground across, more up and
   * down). A drawing keeps its own size.
   */
  draftSize() {
    const { w, h } = this.baseSize;
    const portrait =
      this.mapType === 'place' &&
      this.address?.getOrientation?.() === 'portrait';
    return portrait ? { w: h, h: w } : { w, h };
  }

  /**
   * What the sheet holds, from the plan's rings: the rings and the cones
   * moved into the sheet's frame, the letters' boxes with them, and the
   * title's rows on the band.
   */
  sheetParts(sheet, built) {
    const [dx, dy] = this.faceShift(sheet);
    return {
      rings: shiftRings(built.rings, [dx, dy]),
      cones: (built.cones || []).map(([x, y]) => [x + dx, y + dy]),
      textBoxes: (built.textBoxes || []).map((b) => ({
        ...b,
        x: b.x + dx,
        y: b.y + dy,
      })),
      rows: sheet.titleBand ? titleRows(sheet, this.titleLetterMm()) : [],
    };
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
    if (picture) {
      // After the file control's own change has reached the preview: its
      // handler hands the preview the values it had, without this one, and
      // the preview renders the last values it was given.
      const kind = isLevelsFile(picture.svg) ? 'levels' : 'drawing';
      queueMicrotask(() => this.setFileKind(kind));
    }
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
      designWidthMm: this.drawingWidthMm,
      designWidthKnown: true,
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

    // The trim: the empty plate around what prints cut away, the band kept.
    const trimRow = el('div', 'braille-panel-toggle-row');
    const trimBox = document.createElement('input');
    trimBox.type = 'checkbox';
    trimBox.id = 'tactileMapTrim';
    trimBox.checked = this.trim;
    trimBox.setAttribute('aria-describedby', 'tactileMapTrimHelp');
    trimBox.addEventListener('change', () => {
      this.trim = trimBox.checked;
      this.schedule(0);
    });
    const trimLabel = el('label', '', 'Trim the empty edges');
    trimLabel.htmlFor = trimBox.id;
    trimRow.appendChild(trimBox);
    trimRow.appendChild(trimLabel);
    add('trim', trimRow);
    const trimHelp = el(
      'p',
      'braille-panel-help',
      'Cuts the empty plate around what prints; the margin stays.'
    );
    trimHelp.id = 'tactileMapTrimHelp';
    add('trim', trimHelp);
    this.refs.trim = trimBox;

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

    const paperRow = el('div', 'braille-panel-toggle-row');
    const paperBox = document.createElement('input');
    paperBox.type = 'checkbox';
    paperBox.id = 'tactileMapPaper';
    paperBox.checked = this.showPaper;
    paperBox.addEventListener('change', () => {
      this.showPaper = paperBox.checked;
      this.syncPaper();
    });
    const paperLabel = el('label', '', 'Show the map paper');
    paperLabel.htmlFor = paperBox.id;
    paperRow.appendChild(paperBox);
    paperRow.appendChild(paperLabel);
    add('bed', paperRow);
    this.refs.paper = paperBox;

    const sizeLabel = el('label', 'braille-panel-label', 'Paper');
    sizeLabel.htmlFor = 'tactileMapPaperSize';
    add('bed', sizeLabel);
    const sizeSelect = el('select', 'braille-panel-select');
    sizeSelect.id = 'tactileMapPaperSize';
    for (const size of PAPER_SIZES) {
      const option = document.createElement('option');
      option.value = size.key;
      option.textContent = size.name;
      sizeSelect.appendChild(option);
    }
    sizeSelect.value = this.paperSize;
    sizeSelect.addEventListener('change', () => {
      this.paperSize = sizeSelect.value;
    });
    add('bed', sizeSelect);
    this.refs.paperSize = sizeSelect;

    // The sheet: the blank band around the face, and where the title
    // stands (on its own band above the face, inside its top edge, or not
    // at all).
    const marginRow = el('div', 'braille-panel-toggle-row');
    const marginLabel = el('label', 'braille-panel-label', 'Margin (mm)');
    marginLabel.htmlFor = 'tactileMapMargin';
    const marginInput = document.createElement('input');
    marginInput.type = 'number';
    marginInput.id = 'tactileMapMargin';
    marginInput.className = 'braille-panel-number';
    marginInput.min = String(MARGIN_MM.min);
    marginInput.max = String(MARGIN_MM.max);
    marginInput.step = '1';
    marginInput.value = String(this.marginMm);
    marginInput.setAttribute('aria-describedby', 'tactileMapMarginHelp');
    marginInput.addEventListener('change', () => {
      const value = Number(marginInput.value);
      if (Number.isFinite(value)) {
        this.marginMm = Math.min(
          MARGIN_MM.max,
          Math.max(MARGIN_MM.min, Math.round(value))
        );
        marginInput.value = String(this.marginMm);
        this.schedule(0);
      }
    });
    marginRow.appendChild(marginLabel);
    marginRow.appendChild(marginInput);
    add('bed', marginRow);
    const marginHelp = el(
      'p',
      'braille-panel-help',
      'The blank band around the map on every side, 10 to 40 mm, where the title and the labels have room to stand clear of the shapes.'
    );
    marginHelp.id = 'tactileMapMarginHelp';
    add('bed', marginHelp);
    this.refs.margin = marginInput;

    if (this.config.titleParam) {
      const placeLabel = el('label', 'braille-panel-label', 'Title placement');
      placeLabel.htmlFor = 'tactileMapTitlePlacement';
      add('bed', placeLabel);
      const placeSelect = el('select', 'braille-panel-select');
      placeSelect.id = 'tactileMapTitlePlacement';
      for (const choice of TITLE_PLACEMENTS) {
        const option = document.createElement('option');
        option.value = choice.key;
        option.textContent = choice.name;
        placeSelect.appendChild(option);
      }
      placeSelect.value = this.titlePlacement;
      placeSelect.addEventListener('change', () => {
        this.titlePlacement = placeSelect.value;
        this.schedule(0);
      });
      add('bed', placeSelect);
      this.refs.titlePlacement = placeSelect;
    }

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

    if (this.config.plateKindParam) {
      const wordsLabel = el('label', 'braille-panel-label', 'Key words');
      wordsLabel.htmlFor = 'tactileMapKeyWords';
      add('bed', wordsLabel);
      const wordsSelect = el('select', 'braille-panel-select');
      wordsSelect.id = 'tactileMapKeyWords';
      for (const choice of KEY_WORDS) {
        const option = document.createElement('option');
        option.value = choice.key;
        option.textContent = choice.name;
        wordsSelect.appendChild(option);
      }
      wordsSelect.value = this.keyWords;
      wordsSelect.addEventListener('change', () => {
        this.keyWords = wordsSelect.value;
        this.schedule(0);
      });
      add('bed', wordsSelect);
      this.refs.keyWords = wordsSelect;
    }

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

    // Your own set: the file door under step 3's Symbol set choice. A file
    // loaded stays yours to come back to; a built-in set puts it aside.
    const symbols = el('div', 'braille-translate-row tactile-map-symbols');
    const load = el(
      'button',
      'btn btn-secondary braille-translate-btn',
      'Load a symbol library'
    );
    load.type = 'button';
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
          this.ownSymbols = set;
          setActiveSet(BUILT_IN_SETS[0].key);
          setLibrary(set);
          const sentence = `Loaded ${set.length} symbols from ${chosen.name}. They draw the map until you choose a set above.`;
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
    symbols.appendChild(load);
    symbols.appendChild(file);
    this.refs.symbolStatus = status;
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
    const pdfButton = el(
      'button',
      'btn btn-secondary braille-translate-btn',
      'Download the PDF'
    );
    pdfButton.type = 'button';
    pdfButton.id = 'tactileMapPdf';
    pdfButton.addEventListener('click', () => {
      try {
        this.downloadPdf();
      } catch (err) {
        this.say(err?.message || String(err), true);
      }
    });
    actions.appendChild(renderAll);
    actions.appendChild(pdfButton);
    actions.appendChild(cancel);
    add('render', actions);
    this.refs.renderAll = renderAll;
    this.refs.pdfButton = pdfButton;
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
    // Your own set's file door lives under step 3's Symbol set choice.
    const symbolDoor = this.address?.refs?.symbolDoor;
    if (symbolDoor) {
      for (const node of p.symbols || []) symbolDoor.appendChild(node);
    }
    const note = (text) => [el('p', 'braille-panel-help', text)];
    const fill = (section, groups) => {
      for (const group of groups) {
        for (const node of group || []) section.appendChild(node);
      }
    };
    const [s1, s2, s3, s4, s5] = this.steps.sections;
    this.fileSlot = null;
    // A route map fits its walk already: no trim switch for it.
    for (const node of p.trim || []) node.remove();
    if (type.key === 'place') {
      fill(s1, [a.where]);
      fill(s2, [a.scale]);
      fill(s3, [a.landmarks]);
      fill(s4, [a.make]);
      fill(s5, [p.intro, p.trim, p.bed, p.warnings, p.door, p.render]);
    } else if (type.key === 'route') {
      fill(s1, [a.where, a.to]);
      fill(s2, [a.travel, a.steps]);
      fill(s3, [a.landmarks]);
      fill(s4, [a.make]);
      fill(s5, [p.intro, p.bed, p.warnings, p.door, p.render]);
    } else {
      this.fileSlot = el('div', 'tactile-map-file-slot');
      fill(s1, [note(WORKFLOW_STRINGS.drawingChoose), [this.fileSlot]]);
      fill(s2, [p.width]);
      fill(s3, [p.door, a.symbolSet]);
      fill(s4, [note(WORKFLOW_STRINGS.drawingApply)]);
      fill(s5, [p.intro, p.trim, p.bed, p.warnings, p.render]);
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
    this.trim = TRIM_BY_TYPE[type.key] ?? false;
    if (this.refs.trim) this.refs.trim.checked = this.trim;
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
    if (key === 'route' && index === 1) {
      const travel = this.address?.getTravel();
      if (travel?.mode === 'transit' && !travel.journey) {
        return WORKFLOW_STRINGS.needJourney;
      }
    }
    if (key !== 'drawing' && index === 3 && this.source !== 'draft') {
      return WORKFLOW_STRINGS.needMap;
    }
    return null;
  }

  /**
   * Journeys by bus and train: a stub when a test handed one in, else the
   * planner from the lazy transit chunk, kept for the session.
   */
  async journeys(ask) {
    if (this.planJourneys) return this.planJourneys(ask);
    if (!this.transitPlanner) {
      const { createTransitPlanner } = await import('./transit.js');
      this.transitPlanner = createTransitPlanner();
    }
    return this.transitPlanner.planJourneys(ask);
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
  /**
   * Step 3's tier and groups, or the first tier's when the section is not
   * there to ask.
   */
  currentDetail(osm = this.osm) {
    const type = osm?.to ? 'route' : 'place';
    const asked = this.address?.getDetail?.();
    if (asked && asked.type === type) return asked;
    return {
      type,
      level: DETAIL_START,
      changed: false,
      switches: switchesFor(type, DETAIL_START),
    };
  }

  /**
   * A place map's draft with step 3's tier applied: the draft builder (a
   * lazy chunk) enters every feature, the tier decides which are on.
   * `found` is false when nothing is near the address to draw.
   */
  async placeDraft(osm, detail) {
    const { draftPlan, NEAR_M } = await import('./plan-from-osm.js');
    const { plan, counts } = draftPlan({
      symbolSizeMm: this.levelSettings().symbolSizeMm,
      elements: osm.elements,
      center: osm.center,
      radiusM: osm.radiusM,
      scale: osm.scale,
      landmarks: osm.landmarks,
      size: this.draftSize(),
      // The typed words travel with the place: the destination is named
      // by them, so the map says the address the person asked for.
      place: osm.place ? { ...osm.place, query: osm.query || '' } : null,
    });
    // A scale that draws sidewalks needs one near the address; one that
    // draws streets alone needs a street.
    const drawsSidewalks = osm.scale?.rules?.sidePaths !== false;
    const found = drawsSidewalks
      ? plan.features.some((f) => f.class === 'walkway' && f.on)
      : plan.features.some((f) => f.class === 'curb' && f.on);
    const applied = applyDetail(plan.features, {
      switches: detail.switches,
      scale: osm.scale,
      mmPerM: plan.meta?.geo?.mmPerM,
    });
    return {
      plan: { ...plan, features: applied.features },
      counts: { ...counts, on: applied.on },
      judged: applied,
      found,
      nothing: drawsSidewalks
        ? ADDRESS_STRINGS.nothingNear(NEAR_M)
        : ADDRESS_STRINGS.nothingDrawn,
    };
  }

  /** A route map's draft with step 3's tier, or no plan when no walk joins. */
  async routeDraft(osm, detail) {
    const { draftRoutePlan } = await import('./plan-from-route.js');
    // A walk of a trip by bus and train ends, or starts, at its stop.
    const travel = osm.travel;
    const stop = travel?.stopName ? { name: travel.stopName } : null;
    const { plan, counts } = draftRoutePlan({
      symbolSizeMm: this.levelSettings().symbolSizeMm,
      elements: osm.elements,
      from: osm.place,
      to: osm.to,
      size: this.draftSize(),
      landmarks: osm.landmarks,
      avoidSteps: this.address?.avoidSteps() ?? false,
      fromStop: travel?.walk === 'from' ? stop : null,
      toStop: travel?.walk === 'to' ? stop : null,
      switches: detail.switches,
    });
    return {
      plan,
      counts,
      judged: plan ? judgeSymbols(plan.features, detail.switches) : null,
    };
  }

  /** The live line under step 3's choices, from the data kept. */
  async countDetail(detail = this.currentDetail()) {
    const osm = this.osm;
    if (!osm || !this.address?.setDetailCount) {
      this.address?.setDetailCount?.('');
      return null;
    }
    const built = osm.to
      ? await this.routeDraft(osm, detail)
      : await this.placeDraft(osm, detail);
    if (!built.judged || built.found === false) {
      this.address.setDetailCount('');
      return built;
    }
    const { on, symbols, warning, refusal } = built.judged;
    if (!refusal) {
      this.address.setDetailCount(
        warning
          ? ADDRESS_STRINGS.detailCountWarned(on, warning)
          : ADDRESS_STRINGS.detailCount(on, symbols)
      );
    }
    return built;
  }

  /**
   * Step 3's tier or a group changed: the live line follows and is said
   * once; a choice past the symbol limit is refused, said, and put back.
   */
  async detailChanged(detail) {
    if (!this.osm) {
      this.lastDetail = detail;
      return;
    }
    const built = await this.countDetail(detail);
    if (built?.judged?.refusal) {
      this.sayAddress(built.judged.refusal, true);
      this.address?.setDetail?.(this.lastDetail || this.currentDetail());
      return;
    }
    this.lastDetail = detail;
    const line = this.address?.refs?.detailCount?.textContent;
    if (line) this.sayAddress(line);
  }

  async makeDraft() {
    const osm = this.osm;
    if (!osm) return;
    if (osm.to) {
      await this.makeRouteDraft(osm);
      return;
    }
    const { plan, counts, judged, found, nothing } = await this.placeDraft(
      osm,
      this.currentDetail(osm)
    );
    if (!found) {
      this.sayAddress(nothing, true);
      return;
    }
    if (judged.refusal) {
      this.sayAddress(judged.refusal, true);
      return;
    }
    this.plan = plan;
    this.source = 'draft';
    // Counted as step 5 lists them: the labels' and the plates' warnings.
    const labeled = this.labeled();
    const warnings = [
      ...labeled.warnings,
      ...buildLevelRings(labeled.plan, this.levelSettings()).warnings,
    ];
    this.draft = { counts, warnings: warnings.length };
    this.planWarnings = [];
    this.plate = 'whole';
    this.leaveWaiting();
    this.schedule(0);
    this.steps?.refresh();
    this.sayAddress(
      (warnings.length
        ? ADDRESS_STRINGS.draftReady(counts.on, counts.total, warnings.length)
        : ADDRESS_STRINGS.draftReadyClean(counts.on, counts.total)) +
        (judged.warning ? ` ${judged.warning}` : '') +
        (counts.leftOut ? ADDRESS_STRINGS.leftOut(counts.leftOut) : '') +
        this.bigNote(osm) +
        ` ${keySentence(this.labeled().key)}`
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
    const travel = osm.travel;
    const { plan, counts, judged } = await this.routeDraft(
      osm,
      this.currentDetail(osm)
    );
    if (!plan) {
      this.sayAddress(ADDRESS_STRINGS.noWalk(from, to), true);
      return;
    }
    if (judged.refusal) {
      this.sayAddress(judged.refusal, true);
      return;
    }
    const { warnings } = buildLevelRings(plan, this.levelSettings());
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
      ) +
        (judged.warning ? ` ${judged.warning}` : '') +
        (travel?.words ? ADDRESS_STRINGS.journeyNote(travel.words) : '') +
        this.bigNote(osm) +
        ` ${keySentence(this.labeled().key)}`
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
    const { drawingFromPlan, applyRowsToPlan, rowOrder } =
      await import('./plan-drawing.js');
    const { joinRoute } = await import('./route.js');
    const { analyzeSvg } = await import('../svg-preparer.js');
    // The rows in the editor's order; Apply lays them back on this plan.
    const opened = this.plan;
    const order = rowOrder(opened.features);
    const rows = order.map((i) => opened.features[i]);
    const svg = drawingFromPlan(opened, this.levelSettings(), { order });
    const initialClasses = Object.fromEntries(
      rows.map((f, i) => [i, f.on ? f.class : 'ignore'])
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
      features: rows,
      mmPerM: opened.meta?.geo?.mmPerM ?? null,
      // The thin-shape check measures the map at its own width.
      designWidthMm: opened.size.w,
      designWidthKnown: true,
      // The trimmed sheet's frame over the plan, as step 5 has it now.
      trim: this.view?.trimmed
        ? {
            x: this.view.offset[0],
            y: this.view.offset[1],
            w: this.view.face.w,
            h: this.view.face.h,
          }
        : null,
      onApply: (result) => {
        const applied = applyRowsToPlan(opened, result?.regions || [], order);
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
   * Mark steep sidewalks: on, each sidewalk's incline is taken from the
   * map data where it gives a number, the terrain tiles under the draft
   * are read (lazy chunks) for the rest, and the runs steeper than the
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
      const { markSteep, inclinesOf, needsTerrain } =
        await import('./steep.js');
      const inclines = inclinesOf(this.osm?.elements);
      let elevationAt = this.elevationAt;
      if (!elevationAt && needsTerrain(base, inclines)) {
        const { tilesCovering, loadTiles, elevationSampler } =
          await import('./terrain.js');
        const radiusM = this.osm?.radiusM ?? 250;
        const tiles = await loadTiles(tilesCovering(geo.center, radiusM), {
          fetch: this.fetchTiles || undefined,
        });
        elevationAt = elevationSampler(tiles);
      }
      const { plan, steepCount } = markSteep(base, {
        elevationAt,
        gradePct,
        inclines,
      });
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
    const labeled = this.labeled();
    const built = buildLevelRings(labeled.plan, {
      ...this.levelSettings(),
    });
    this.view = this.measureView(built);
    const sheet = this.sheetNow();
    const parts = this.sheetParts(sheet, built);
    const mapParameters = this.mapKindParameters(parameters);
    const sets = [
      ...titlePlateSets({
        titlePlates: this.layout.titlePlates,
        rows: parts.rows,
        sheetH: sheet.h,
        config: this.config,
        parameters: mapParameters,
      }),
      ...plateParameterSets({
        rings: parts.rings,
        cones: parts.cones,
        rows: parts.rows,
        sheetH: sheet.h,
        titleInside: sheet.placement === 'inside',
        layout: this.layout,
        idStyle: this.idStyle,
        northCue: this.northCue(),
        config: this.config,
        parameters: mapParameters,
      }),
      ...this.keyParameterSets(parameters),
    ];
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
          rings: parts.rings,
          sheet,
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

  /**
   * What the map is, for the README: its type, what it was made from, and
   * the published symbol set it draws with, if any.
   */
  mapAbout() {
    const credit = BUILT_IN_SETS.find((s) => s.key === activeSetKey())?.credit;
    const about = this.mapKind();
    return credit ? { ...about, symbolsCredit: credit } : about;
  }

  /** The map's type and what it was made from. */
  mapKind() {
    const short = (p) => (p?.name || '').split(',')[0].trim();
    const osm = this.osm;
    if (this.source === 'draft' && osm?.to) {
      return {
        type: 'route',
        from: short(osm.place),
        to: short(osm.to),
        lengthM: Math.round(this.draft?.counts?.lengthM ?? 0),
        journey: osm.travel?.words,
      };
    }
    if (this.source === 'draft' && osm) {
      return {
        type: 'place',
        place: short(osm.place),
        ratio: osm.scale?.ratio,
      };
    }
    return { type: 'drawing' };
  }

  /** The map's name for the README and the PDF: the title, else the plan's, else the file's. */
  mapName(parameters, stem) {
    return (
      String(parameters.title_text || '').trim() ||
      this.plan.meta?.title ||
      stem
    );
  }

  async buildArchive({
    stem,
    extension,
    rendered,
    sets,
    rings,
    sheet,
    parameters,
  }) {
    const bed = this.bed();
    const bedName =
      this.bedKey === 'custom' ? `custom ${bed.w} x ${bed.d} mm` : bed.name;
    const pdf = this.buildPdf({ stem, parameters });
    const readme = readmeText({
      mapName: this.mapName(parameters, stem),
      bedName,
      layout: this.layout,
      size: { w: sheet.w, h: sheet.h },
      heights: levelHeights(parameters),
      tapeWidthMm: this.tapeWidth(),
      about: this.mapAbout(),
      keyIds: this.keyPages.map((p) => p.id),
      keyText: this.keyPages.length ? keyText(this.labeled().key) : '',
      keyTape: this.keyPages.map((p) => ({ id: p.id, texts: p.tape })),
      pdfName: PDF_NAME,
      unspelled: pdf.unspelled,
      trimMm: this.trim ? sheet.marginMm : 0,
    });
    const grid = plateGridSvg({
      rings,
      layout: this.layout,
      size: { w: sheet.w, h: sheet.h },
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
      pdf: pdf.bytes,
    })) {
      zip.file(entry.name, entry.data);
    }
    return zip.generateAsync({ type: 'uint8array' });
  }

  /**
   * The PDF for the transcriber: the whole map with its plates, each plate
   * at full size with its channels and their texts, the labels, the key.
   * Built from the same data as the paper, on the paper size chosen.
   */
  buildPdf({ stem, parameters }) {
    const labeled = this.labeled();
    const built = buildLevelRings(labeled.plan, this.levelSettings());
    this.view = this.measureView(built);
    const sheet = this.sheetNow();
    const parts = this.sheetParts(sheet, built);
    const inside = sheet.placement === 'inside';
    const faceAt = this.faceShift(sheet);
    const whole = this.paperDataFor({
      rings: parts.rings,
      size: { w: sheet.w, h: sheet.h },
      labeled,
      keyPage: null,
      plate: null,
      title: inside,
      words: rowsText(parts.rows),
      faceAt,
    });
    const titles = (this.layout?.titlePlates || []).map((plate) => ({
      id: titleLabel(plate.id),
      ...this.paperDataFor({
        rings: EMPTY_RINGS(),
        size: { w: plate.w, h: plate.h },
        labeled,
        keyPage: null,
        plate,
        title: false,
        words: rowsText(plateRows(parts.rows, plate, sheet.h)),
        faceAt,
      }),
    }));
    const plates = (this.layout?.plates || []).map((plate) => {
      const out = plateLevelsSvg(parts.rings, plate, { id: this.idStyle });
      const roles = plateRoles(plate, this.layout, this.northCue());
      return {
        id: plate.id,
        ...this.paperDataFor({
          rings: out.rings,
          size: out.size,
          labeled,
          keyPage: null,
          plate,
          title: inside && roles.title,
          words: rowsText(plateRows(parts.rows, plate, sheet.h)),
          faceAt,
        }),
      };
    });
    const keys = this.keyPages.map((page) => ({
      id: keyLabel(page.id),
      ...this.paperDataFor({
        rings: null,
        size: page.size,
        labeled,
        keyPage: page,
        plate: null,
        title: false,
      }),
    }));
    const lengths = new Map(
      (labeled.plan.features || [])
        .filter((f) => f.kind === 'channel')
        .map((f) => [f.id, f.length])
    );
    const labels = (labeled.labels || []).map((l) => ({
      ...l,
      lengthMm: lengths.get(`label-${l.featureId}`) ?? 0,
    }));
    return mapPdf({
      mapName: this.mapName(parameters, stem),
      lead: aboutLines(this.mapAbout()).lead || '',
      paper: this.paperSize,
      whole,
      plates: [...titles, ...plates, ...keys],
      layout: this.layout,
      keyLines: keyText(labeled.key).trimEnd().split('\n'),
      labels,
      tapeWidthMm: this.tapeWidth(),
      colors: this.paperColors(),
    });
  }

  /** Download the PDF alone, as the button asks. */
  downloadPdf() {
    const state = stateManager.getState();
    const parameters = state.parameters || {};
    const stem = projectStem(state.uploadedFile?.name || 'tactile_map');
    const { bytes } = this.buildPdf({ stem, parameters });
    const fileName = `${stem}_print.pdf`;
    this.download(bytes, fileName, 'pdf');
    this.say(`The PDF is in ${fileName}.`);
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
    const ids = [
      'whole',
      ...(this.layout ? this.layout.titlePlates.map((p) => p.id) : []),
      ...(this.layout ? this.layout.plates.map((p) => p.id) : []),
      ...this.keyPages.map((p) => p.id),
    ];
    if (!ids.includes(this.plate)) this.plate = 'whole';
    // The same plates keep their radios: one built again takes focus again,
    // and a screen reader says the plate a second time.
    const shown = [...fieldset.querySelectorAll('input[type="radio"]')];
    if (
      shown.length === ids.length &&
      shown.every((radio, i) => radio.value === ids[i])
    ) {
      for (const radio of shown) radio.checked = radio.value === this.plate;
      return;
    }
    for (const row of [
      ...fieldset.querySelectorAll('.braille-panel-toggle-row'),
    ])
      row.remove();
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
          id === 'whole'
            ? 'Showing the whole map.'
            : isKeyId(id)
              ? `Showing the ${keyLabel(id).toLowerCase()} plate.`
              : isTitleId(id)
                ? `Showing the ${titleLabel(id).toLowerCase()} plate.`
                : `Showing plate ${id}.`,
          {
            source: SOURCE,
          }
        );
        this.schedule(0);
      });
      const label = el(
        'label',
        '',
        id === 'whole'
          ? 'Whole map'
          : isKeyId(id)
            ? keyLabel(id)
            : isTitleId(id)
              ? titleLabel(id)
              : `Plate ${id}`
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

  /**
   * The plan as it prints: a draft's named places get channels for their
   * braille labels (map-labels.js), with the key that goes with them; a
   * map from your own drawing keeps the channels you drew.
   */
  labeled() {
    if (this.source !== 'draft') {
      return {
        plan: this.plan,
        key: keyFor(this.plan, this.levelSettings()),
        warnings: [],
      };
    }
    return labelPlan(this.plan, this.levelSettings());
  }

  /**
   * The levels builder's settings: the tape the labels take and the symbol
   * set in use (its shapes, its size, its line styles).
   */
  levelSettings() {
    return {
      tapeWidthMm: this.tapeWidth(),
      ...settingsForSet(activeSetKey()),
    };
  }

  /**
   * Step 3's symbol set changed: a built-in set is put in use and said
   * once; Your own set shows the file door and brings a loaded file back.
   */
  symbolSetChanged(key) {
    const own = key === 'file';
    setActiveSet(own ? BUILT_IN_SETS[0].key : key);
    setLibrary(own ? this.ownSymbols || null : null);
    if (!own && this.refs.symbolStatus) {
      this.refs.symbolStatus.textContent = '';
    }
    this.schedule(0);
    this.countDetail().catch((err) => {
      this.sayAddress(err?.message || String(err), true);
    });
    // Your own set with no file yet: the door's own button speaks next.
    if (own && !this.ownSymbols) return;
    this.sayAddress(ADDRESS_STRINGS.symbolsSet(activeSet().name));
  }

  /** The map's title for the key: the title control, else the plan's. */
  keyTitle() {
    const parameters = stateManager.getState().parameters || {};
    return (
      String(parameters[this.config.titleParam] || '').trim() ||
      this.plan.meta?.title ||
      ''
    );
  }

  /**
   * The key's plates at the map's plate size, their channels cut for the
   * tape the map's labels use.
   */
  buildKeyPages(layout) {
    if (!this.config.plateKindParam) return [];
    const parameters = stateManager.getState().parameters || {};
    return keyPlates(this.labeled().key, {
      plateW: layout.plateW,
      plateH: layout.plateH,
      title: this.keyTitle(),
      words: this.keyWords,
      letterHeightMm:
        Number(parameters[this.config.keyLetterParam]) || KEY_LETTER_MM,
      settings: this.levelSettings(),
    });
  }

  /** The parameters of a map plate: the tile in its Map mode. */
  mapKindParameters(parameters) {
    const next = { ...parameters };
    if (this.config.plateKindParam) next[this.config.plateKindParam] = 'Map';
    if (this.config.raisedWordsParam) next[this.config.raisedWordsParam] = '';
    const sheet = this.sheet || this.sheetNow();
    if (this.config.marginParam) next[this.config.marginParam] = sheet.marginMm;
    if (this.config.titleBandParam)
      next[this.config.titleBandParam] = sheet.titleBand?.h || 0;
    return next;
  }

  /** The key's plates as render sets, in the tile's Key mode. */
  keyParameterSets(parameters) {
    if (!this.config.plateKindParam) return [];
    return this.keyPages.map((page) => {
      const fileName = `levels_${page.id}.svg`;
      const next = {
        ...parameters,
        [this.config.widthParam]: page.size.w,
        [this.config.heightParam]: page.size.h,
        [this.config.mapFileParam]: {
          name: fileName,
          data: svgToDataUrl(page.svg),
          type: 'image/svg+xml',
        },
        [this.config.plateKindParam]: 'Key',
        [this.config.raisedWordsParam]: page.print,
      };
      if (this.config.coneMarksParam) {
        next[this.config.coneMarksParam] = coneRows(page.cones, {
          x: 0,
          y: 0,
          w: page.size.w,
          h: page.size.h,
        });
      }
      if (this.config.plateIdParam) next[this.config.plateIdParam] = '';
      if (this.config.plateShowsTitleParam)
        next[this.config.plateShowsTitleParam] = 'no';
      if (this.config.plateShowsNorthParam)
        next[this.config.plateShowsNorthParam] = 'no';
      if (this.config.mapFileKindParam)
        next[this.config.mapFileKindParam] = 'levels';
      return {
        id: page.id,
        size: page.size,
        svg: page.svg,
        fileName,
        parameters: next,
        roles: { title: false, north: false },
      };
    });
  }

  update() {
    if (!this.el) return;
    const labeled = this.labeled();
    const built = buildLevelRings(labeled.plan, {
      ...this.levelSettings(),
    });
    this.view = this.measureView(built);
    const sheet = this.sheetNow();
    this.sheet = sheet;
    const { w, h } = sheet;
    const bed = this.bed();
    const layout = planPlates({
      w,
      h,
      bed,
      titleBandMm: sheet.titleBand?.h || 0,
    });
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
    const t = layout.titlePlates.length;
    if (t && !tooSmall) {
      sentence += ` The title takes ${t === 1 ? 'a plate of its own' : `${t} plates of its own`} above row A.`;
    }
    this.keyPages = this.layout ? this.buildKeyPages(layout) : [];
    const k = this.keyPages.length;
    if (k) {
      sentence += ` The key takes ${k === 1 ? 'one plate' : `${k} plates`}.`;
    }
    if (this.refs.summary.textContent !== sentence)
      this.refs.summary.textContent = sentence;
    this.rebuildPlates();

    const allWarnings = [
      ...this.planWarnings,
      ...labeled.warnings,
      ...built.warnings,
    ];
    this.refs.warnings.replaceChildren(
      ...allWarnings.map((warning) => el('li', '', warning.text))
    );
    this.refs.warningsBox.hidden = allWarnings.length === 0;
    this.refs.warningsTitle.textContent = WARNINGS_TITLE(allWarnings.length);

    // The sheet's frame: the face's rings, cones and letter boxes moved
    // inside the band, the title's rows on its band.
    const parts = this.sheetParts(sheet, built);
    const inside = sheet.placement === 'inside';
    let svg;
    let size;
    let fileName;
    let plateId = '';
    let showTitle = inside ? 'yes' : 'no';
    let showNorth = 'yes';
    let keyPage = null;
    let plate = null;
    let rings = parts.rings;
    let words = '';
    let cones = parts.cones;
    const sheetSize = { w: sheet.w, h: sheet.h };
    if (this.plate === 'whole') {
      svg = levelsSvgFromRings(parts.rings, sheetSize, parts.textBoxes);
      size = sheetSize;
      fileName = 'levels_whole.svg';
      words = rowsText(parts.rows);
    } else if (isKeyId(this.plate)) {
      keyPage = this.keyPages.find((p) => p.id === this.plate);
      svg = keyPage.svg;
      size = keyPage.size;
      fileName = `levels_${keyPage.id}.svg`;
      showTitle = 'no';
      showNorth = 'no';
      words = keyPage.print;
      cones = keyPage.cones;
    } else if (isTitleId(this.plate)) {
      // The title band on a plate of its own: the title's lines, nothing
      // of the map.
      plate = this.layout.titlePlates.find((p) => p.id === this.plate);
      size = { w: plate.w, h: plate.h };
      rings = EMPTY_RINGS();
      svg = levelsSvgFromRings(rings, size);
      fileName = `levels_${plate.id}.svg`;
      showTitle = 'no';
      showNorth = 'no';
      words = rowsText(plateRows(parts.rows, plate, sheet.h));
      cones = [];
    } else {
      plate = this.layout.plates.find((p) => p.id === this.plate);
      const out = plateLevelsSvg(parts.rings, plate, { id: this.idStyle });
      const roles = plateRoles(plate, this.layout, this.northCue());
      svg = out.svg;
      size = out.size;
      rings = out.rings;
      fileName = `levels_${plate.id}.svg`;
      if (this.idStyle === 'margin') plateId = plate.id;
      showTitle = inside && roles.title ? 'yes' : 'no';
      showNorth = roles.north ? 'yes' : 'no';
      words = rowsText(plateRows(parts.rows, plate, sheet.h));
    }
    setParameterValue(this.config.widthParam, size.w);
    setParameterValue(this.config.heightParam, size.h);
    if (this.config.plateIdParam)
      setParameterValue(this.config.plateIdParam, plateId);
    if (this.config.plateShowsTitleParam)
      setParameterValue(this.config.plateShowsTitleParam, showTitle);
    if (this.config.plateShowsNorthParam)
      setParameterValue(this.config.plateShowsNorthParam, showNorth);
    if (this.config.plateKindParam) {
      setParameterValue(this.config.plateKindParam, keyPage ? 'Key' : 'Map');
    }
    if (this.config.raisedWordsParam)
      setParameterValue(this.config.raisedWordsParam, words);
    if (this.config.marginParam)
      setParameterValue(this.config.marginParam, sheet.marginMm);
    if (this.config.titleBandParam)
      setParameterValue(this.config.titleBandParam, sheet.titleBand?.h || 0);
    if (this.config.coneMarksParam) {
      // The cones the plate holds, in the model's frame; a key page's are
      // its samples, the whole map's every one, a title plate's none.
      const frame =
        plate && !isTitleId(this.plate)
          ? plate
          : { x: 0, y: 0, w: size.w, h: size.h };
      const edge =
        plate && !isTitleId(this.plate)
          ? {
              lastCol: plate.col === this.layout.cols - 1,
              lastRow: plate.row === this.layout.rows - 1,
            }
          : {};
      setParameterValue(
        this.config.coneMarksParam,
        coneRows(cones, frame, edge)
      );
    }
    this.setFileKind('levels');
    if (!this.setFile(this.config.mapFileParam, fileName, svg)) {
      console.warn(
        `[MapPanel] No file control for parameter: ${this.config.mapFileParam}`
      );
    }
    if (this.previewManager()) {
      this.paper = this.paperFor({
        rings,
        size,
        labeled,
        keyPage,
        plate,
        title: showTitle === 'yes',
        words,
        faceAt: this.faceShift(sheet),
      });
      this.syncPaper();
    }
  }

  /** The preview the paper lies on; none in a test without one. */
  previewManager() {
    return this.getController?.()?.previewManager || null;
  }

  /**
   * What a plate's paper and its PDF page draw: its rings as drawn, every
   * name at its thing, the channels with their tape's text, a key plate's
   * raised words, the title where the raised one stands, the plate's name.
   */
  paperDataFor({
    rings,
    size,
    labeled,
    keyPage,
    plate,
    title,
    words: rows = '',
    faceAt = [0, 0],
  }) {
    const parameters = stateManager.getState().parameters || {};
    const s = { ...DEFAULT_SETTINGS, ...this.levelSettings() };
    const across = this.tapeWidth() + s.channelClearanceMm;
    const labelText = new Map(
      (labeled.labels || []).map((l) => [`label-${l.featureId}`, l.text])
    );
    const textOf = (f) => labelText.get(f.id) || '';
    // The names and the channels stand in the sheet's frame, inside the band.
    const allTexts = moveTexts(paperTexts(labeled.plan), faceAt);
    const allChannels = moveTexts(
      paperChannels(labeled.plan.features, across, textOf),
      faceAt
    );
    let texts = [];
    let channels = [];
    let words = [];
    let plateId = '';
    let drawn = rings;
    if (keyPage) {
      drawn = buildLevelRings(keyPage.plan, s).rings;
      channels = paperChannels(
        keyPage.plan.features,
        across,
        (f, i) => keyPage.tape[i]
      );
      words = paperWords(
        keyPage.print,
        Number(parameters[this.config.keyLetterParam]) || KEY_LETTER_MM,
        keyPage.size.h
      );
      plateId = keyLabel(keyPage.id);
    } else if (plate) {
      texts = shiftTexts(allTexts, plate);
      channels = shiftTexts(allChannels, plate);
      words = paperWords(rows, this.titleLetterMm(), size.h);
      plateId = isTitleId(plate.id) ? titleLabel(plate.id) : plate.id;
    } else {
      texts = allTexts;
      channels = allChannels;
      words = paperWords(rows, this.titleLetterMm(), size.h);
    }
    return {
      rings: drawn,
      size,
      texts,
      channels,
      words,
      title: title ? String(parameters[this.config.titleParam] || '') : '',
      plateId,
    };
  }

  /** The paper's colors: the tokens' values as the page shows them now. */
  paperColors() {
    const style = getComputedStyle(document.documentElement);
    return paperColors((name) => style.getPropertyValue(name));
  }

  /** The paper of the plate shown, as the overlay's SVG. */
  paperFor(input) {
    return {
      name: `paper_${this.plate}.svg`,
      svg: mapPaperSvg({
        ...this.paperDataFor(input),
        colors: this.paperColors(),
      }),
    };
  }

  /**
   * Lay the paper on the preview's reference overlay, or take it off: it
   * keeps its own colors, lies under the plate wherever the model stands,
   * and the overlay's own switch follows it.
   */
  syncPaper() {
    const pm = this.previewManager();
    if (!pm) return;
    const toggle = document.getElementById('overlayToggle');
    if (!this.showPaper || !this.paper) {
      if (!this.paperShown) return;
      this.paperShown = false;
      this.paperToken += 1;
      pm.setReferenceOverlaySource({
        kind: null,
        name: null,
        dataUrlOrText: null,
      });
      pm.setOverlayEnabled(false);
      if (toggle) toggle.checked = false;
      return;
    }
    const { name, svg } = this.paper;
    const token = (this.paperToken += 1);
    Promise.resolve(
      pm.setReferenceOverlaySource({
        kind: 'svg',
        name,
        dataUrlOrText: svg,
        keepColors: true,
      })
    )
      .then(() => {
        if (token !== this.paperToken) return;
        pm.setOverlayTransform({ offsetX: 0, offsetY: 0, rotationDeg: 0 });
        pm.setOverlayZ({ preset: 'model-bottom', customMm: -PAPER_GAP_MM });
        pm.setOverlayEnabled(true);
        this.paperShown = true;
        if (toggle) toggle.checked = true;
      })
      .catch((err) => {
        this.sayAddress(PAPER_FAILED(err?.message || String(err)), true);
      });
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
    this.paper = null;
    this.syncPaper();
    // The next panel starts on its first set, as its radios say.
    setLibrary(null);
    setActiveSet(BUILT_IN_SETS[0].key);
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
