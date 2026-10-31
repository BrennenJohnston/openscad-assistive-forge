/**
 * The drawing editor, where the preview lives.
 *
 * It is a surface, not a block inside the customizer's file control: it
 * takes the whole preview area - the biggest thing on the page, and on a
 * phone the only thing - the way the 2D preview does, with a toolbar across
 * the top, the drawing in the middle, and a side panel of collapsible
 * sections beside it.
 *
 * The editing itself is not here. The roles, the layer column, the
 * delete-and-undo keyed by original index, the tiers, the manual render,
 * the announcements and the persistence are all `svg-preparer-workspace.js`,
 * which has its own large test suite, and it is mounted here rather than
 * re-derived. Its pieces are then put where the surface wants them - the
 * shape list and the warnings in the side panel, the Apply/Save/Keep buttons
 * in the toolbar - by moving the nodes, which keeps every listener the
 * workspace attached to them. The way to lose a pinned behavior is to write
 * it twice. To reverse: build the table into this file and delete the
 * mount.
 *
 * The customizer stays reachable. Focus is trapped only when the editor is
 * opened from the no-model door, where there is nothing behind it to reach.
 * Opened over the preview, a person can Tab straight out into the
 * parameters, which is why the surface is a region rather than a dialog.
 *
 * Two purposes on the one component:
 *   relief   the charm tiles: the workspace's own Foreground / Hole / Ignore
 *            rows, layers and offsets, in the Regions section.
 *   stencil  the Harley law (stencil-colours.js): the drawing's regions, each
 *            with a color, the palette, the plates in paint order and the
 *            loose pieces each plate would leave. The color engine is a lazy
 *            chunk and arrives after the surface does. Its tools are a canvas
 *            a person can point at, a table a person can walk with the arrow
 *            keys, and an Undo that says what came back. The two are one
 *            selection: ticking a row and clicking a region do the same
 *            thing by the same path.
 *   map      the Tactile Map Designer: every shape of a line drawing gets a
 *            class from the map's class table (map-classes.js), in a menu on
 *            its row where the role switches stand for the relief purpose.
 *            The class lives beside the workspace, keyed by the shape's
 *            ORIGINAL index like the roles are: a column of the workspace's
 *            own row model would have to ride its saved choices key, which
 *            is a persistence change. Apply hands the host every surviving
 *            shape with its class and its rings.
 *
 * This file is `surface.js` and not `index.js` for a reason that is worth a
 * line: a chunk is named after its module, and an `index.js` here becomes an
 * `index-<hash>.js` in the build, which the bundle budget counts as the app's
 * own entry chunk. The editor is lazy; its name has to say so.
 *
 * @license GPL-3.0-or-later
 */

import { createSvgPrepWorkspace } from '../svg-preparer-workspace.js';
import { createDocumentFocusTrap, disableKeepingFocus } from '../focus-trap.js';
import { parseSvgElements, classifyElements } from '../svg-preparer.js';
import { boundsOf } from '../svg-nesting.js';
import { EDITOR_STRINGS as S } from './strings.js';
import { createCropPanel } from './crop-panel.js';
import { readDrawingBox } from '../image-crop.js';
import { createCommandStack } from './undo.js';
import { createRegionCanvas, TOOLS } from './canvas.js';
import { MAP_CLASSES } from '../tactile-map/map-classes.js';
import { fitRoute, routeLengthM } from '../tactile-map/route.js';

/** The color engine, loaded once, on the first stencil open. */
let enginePromise = null;
function loadEngine() {
  if (!enginePromise) {
    enginePromise = Promise.all([
      import('../stencil-colours.js'),
      import('../ring-geometry.js'),
      import('../stencil-plates.js'),
    ])
      .then(([colours, rings, plates]) => ({
        ...colours,
        ...rings,
        paintSequence: plates.paintSequence,
      }))
      .catch((err) => {
        enginePromise = null;
        throw err;
      });
  }
  return enginePromise;
}

/** Two editors can be on one page (the preview's and the door's). */
let instances = 0;

const SECTION_ORDER = ['colours', 'regions', 'plates', 'warnings'];

/**
 * The width at or below which the side panel is a full-width drawer.
 *
 * The stylesheet carries this number too, as an `@container` query on
 * `.drawing-editor`. It is repeated here because the drawer's STARTING state
 * has to be chosen before the editor is laid out, and a unit test pins the two
 * copies together so they cannot drift.
 */
export const PANEL_DRAWER_MAX_WIDTH = 640;

/** A value made safe inside an attribute selector; jsdom has no CSS.escape. */
const escapeAttr = (value) => String(value).replace(/["\\]/g, '\\$&');

/** Keys that color the selection: 1-8 the palette, 0 the base. */
const NUMBER_KEYS = /^[0-8]$/;

const isTextField = (el) =>
  el &&
  (el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' &&
      !['checkbox', 'radio', 'button', 'submit'].includes(el.type)) ||
    el.isContentEditable);

/**
 * Build the editor surface and mount the workspace inside it.
 *
 * @param {object} args
 * @param {HTMLElement} args.surfaceEl - The element the surface owns
 * @param {boolean} [args.fullscreen] - True when the surface IS the screen
 *   (the no-model door): focus is trapped and Escape closes it outright
 * @param {Function} [args.onOpen] - Called when the surface takes the area
 * @param {Function} [args.onClose] - Called when it gives the area back
 * @param {Function} [args.onViewChange] - Called with ('drawing'|'charm', stage)
 * @param {Function} [args.announce] - Polite live-region announcer
 * @returns {object} The workspace's own contract, plus the surface's
 */
export function createDrawingEditor({
  surfaceEl,
  fullscreen = false,
  onOpen = null,
  onClose = null,
  onViewChange = null,
  announce = null,
}) {
  const uid = ++instances;
  const titleId = `drawingEditorTitle-${uid}`;
  const panelId = `drawingEditorPanel-${uid}`;
  const canvasLabelId = `drawingEditorCanvasLabel-${uid}`;
  const moreId = `drawingEditorMore-${uid}`;

  const root = document.createElement('div');
  root.className = 'drawing-editor';

  // ── The way in and out for a keyboard, before anything else ─────────────
  const skipToTable = document.createElement('a');
  skipToTable.className = 'drawing-editor-skip';
  skipToTable.href = `#${panelId}`;
  skipToTable.textContent = S.skipToRegions;

  // A plain header, not role="toolbar": that role promises arrow-key movement
  // between its controls, and the tools here are picked by Tab and by their
  // own letter keys. Tab is the honest contract.
  const toolbar = document.createElement('div');
  toolbar.className = 'drawing-editor-toolbar';

  const title = document.createElement('h2');
  title.className = 'drawing-editor-title';
  title.id = titleId;
  title.textContent = S.title;
  // Focusable by script only, so a screen reader meets the name of the
  // surface it just arrived on and Tab is not spent on a heading.
  title.setAttribute('tabindex', '-1');

  const button = (text, className, action) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.dataset.action = action;
    el.textContent = text;
    return el;
  };

  // The tools. Visible text, the key in the accessible name.
  const toolsGroup = document.createElement('div');
  toolsGroup.className = 'drawing-editor-tools';
  toolsGroup.setAttribute('role', 'group');
  toolsGroup.setAttribute('aria-label', S.toolsLabel);
  const toolButtons = new Map();
  for (const { id, key } of TOOLS) {
    const el = button(
      S.tools[id],
      'btn btn-secondary drawing-editor-tool',
      `tool-${id}`
    );
    el.dataset.tool = id;
    el.setAttribute('aria-pressed', String(id === 'select'));
    el.setAttribute('aria-label', S.toolKeyHint(S.tools[id], key));
    el.setAttribute('aria-keyshortcuts', key.toUpperCase());
    toolButtons.set(id, el);
    toolsGroup.appendChild(el);
  }

  // The map purpose's route: Walk this is a tool (above); Clear route empties
  // what it picked.
  const clearRouteBtn = button(
    S.clearRoute,
    'btn btn-secondary drawing-editor-clear-route',
    'clear-route'
  );
  clearRouteBtn.hidden = true;

  const paintSelect = document.createElement('select');
  paintSelect.className = 'drawing-editor-paint-select';
  paintSelect.setAttribute('aria-label', S.paintColourLabel);
  const paintSelectionBtn = button(
    S.paintSelection,
    'btn btn-secondary',
    'paint-selection'
  );
  const paintGroup = document.createElement('div');
  paintGroup.className = 'drawing-editor-paint';
  paintGroup.append(paintSelect, paintSelectionBtn);

  const undoBtn = button(S.undo, 'btn btn-secondary', 'undo');
  undoBtn.setAttribute('aria-keyshortcuts', 'Control+Z');
  const redoBtn = button(S.redo, 'btn btn-secondary', 'redo');
  redoBtn.setAttribute('aria-keyshortcuts', 'Control+Y Control+Shift+Z');
  const historyGroup = document.createElement('div');
  historyGroup.className = 'drawing-editor-history';
  historyGroup.append(undoBtn, redoBtn);

  const fitBtn = button(S.fit, 'btn btn-secondary', 'fit');
  const zoomInBtn = button('+', 'btn btn-secondary', 'zoom-in');
  zoomInBtn.setAttribute('aria-label', S.zoomIn);
  const zoomOutBtn = button('−', 'btn btn-secondary', 'zoom-out');
  zoomOutBtn.setAttribute('aria-label', S.zoomOut);
  const zoomGroup = document.createElement('div');
  zoomGroup.className = 'drawing-editor-zoom';
  zoomGroup.append(fitBtn, zoomInBtn, zoomOutBtn);

  // The view: the untouched drawing or the plan over it, and one
  // plate at a time.
  const showOriginalBtn = button(
    S.showOriginal,
    'btn btn-secondary drawing-editor-show-original',
    'show-original'
  );
  showOriginalBtn.setAttribute('aria-pressed', 'false');

  const stepper = document.createElement('div');
  stepper.className = 'drawing-editor-stepper';
  stepper.setAttribute('role', 'group');
  stepper.setAttribute('aria-label', S.stepperLabel);
  const prevPlateBtn = button('\u25C0', 'btn btn-secondary', 'prev-plate');
  prevPlateBtn.setAttribute('aria-label', S.prevPlate);
  const nextPlateBtn = button('\u25B6', 'btn btn-secondary', 'next-plate');
  nextPlateBtn.setAttribute('aria-label', S.nextPlate);
  const stepperText = button(
    S.allPlates,
    'btn btn-secondary drawing-editor-stepper-text',
    'all-plates'
  );
  stepper.append(prevPlateBtn, stepperText, nextPlateBtn);

  const viewGroup = document.createElement('div');
  viewGroup.className = 'drawing-editor-view';
  viewGroup.append(showOriginalBtn, stepper);

  const stencilTools = document.createElement('div');
  stencilTools.className = 'drawing-editor-stencil-tools';
  // The working hands only; the view, zoom and history groups get the view
  // row. At a 1280 px window the toolbar's real width is 692 px (the editor
  // shares the window with the customizer) and the groups sum to 1,705 px, so
  // two rows cannot hold them: three named rows, none of which wraps.
  stencilTools.append(toolsGroup, clearRouteBtn, paintGroup);
  stencilTools.hidden = true;
  viewGroup.hidden = true;
  zoomGroup.hidden = true;
  historyGroup.hidden = true;

  const viewControls = document.createElement('div');
  viewControls.className = 'drawing-editor-view-controls';

  // The drawing, or the thing the drawing makes.
  //
  // A real fieldset with two real radios. Two named choices where only one can
  // be true is what a radio group IS, so the markup says it and nothing has to
  // be repaired with ARIA: arrows move between them, the legend names the
  // question, and a screen reader reads "View, Drawing, radio button, 1 of 2"
  // without being told to.
  //
  // The `name` carries the instance id because more than one surface can exist
  // in a document (the preview area's and the standalone door's), and two
  // groups sharing a name would be ONE group - checking Charm on one surface
  // would silently uncheck Drawing on the other.
  const viewSwitch = document.createElement('fieldset');
  viewSwitch.className = 'drawing-editor-view-switch';
  const viewLegend = document.createElement('legend');
  viewLegend.className = 'sr-only';
  viewLegend.textContent = S.viewLegend;
  viewSwitch.appendChild(viewLegend);

  const viewGroupName = `drawingEditorView-${uid}`;
  const viewRadios = {};
  for (const [value, label] of [
    ['drawing', S.viewDrawing],
    ['charm', S.viewCharm],
  ]) {
    const id = `${viewGroupName}-${value}`;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = viewGroupName;
    input.id = id;
    input.value = value;
    input.checked = value === 'drawing';
    const labelEl = document.createElement('label');
    labelEl.setAttribute('for', id);
    labelEl.textContent = label;
    // The input is laid OVER its own label at full size rather than clipped
    // to a pixel in the corner. A clipped radio leaves the label as the only
    // thing a pointer can hit, and then the 44 px target belongs to the label
    // while the control belongs to the input - which is fine for a mouse and
    // wrong for anything that aims at the control itself.
    const option = document.createElement('span');
    option.className = 'drawing-editor-view-option';
    option.append(input, labelEl);
    viewSwitch.append(option);
    viewRadios[value] = input;
  }
  // Shown only when there is a model behind the editor. Through the standalone
  // door there is no charm, and a control offering a view that cannot exist is
  // worse than no control.
  viewSwitch.hidden = true;
  viewSwitch.addEventListener('change', (e) => {
    if (e.target && e.target.name === viewGroupName) setView(e.target.value);
  });

  // Said out loud, because a person will see the difference and should not
  // be left wondering whether their model changed. It is shown in the charm
  // view only: it describes the picture beneath, and in the drawing view
  // there is no picture beneath to describe. Not in the live region - the
  // switch already announced what happened, and one action gets one
  // sentence, not two.
  const draftNote = document.createElement('p');
  draftNote.className = 'drawing-editor-draft-note';
  draftNote.textContent = S.draftNote;

  // The charm on request. The drawing view combines by itself (the
  // workspace's business); the charm view renders the charm with the drawing
  // as it is now, as a draft the host draws without touching the design, so
  // Undo never steps through drafts and nothing is written until Apply. Shown
  // in the charm view only, and only when a host offers `onDraftRender` (the
  // standalone door has no charm). The note says which drawing the charm
  // shows, since the person may have changed it since.
  const renderCharmBtn = button(
    S.renderCharm,
    'btn btn-primary drawing-editor-render-charm',
    'render-charm'
  );
  renderCharmBtn.setAttribute('aria-label', S.renderCharmLabel);
  renderCharmBtn.hidden = true;

  // The crop. A relief editor whose host can crop shows the button in
  // the drawing view; the view itself takes the stage's place while it is
  // open, and Undo crop appears once the host says a crop can be taken back.
  const cropBtn = button(
    S.crop,
    'btn btn-secondary drawing-editor-crop-btn',
    'crop'
  );
  cropBtn.setAttribute('aria-label', S.cropLabel);
  cropBtn.hidden = true;
  const undoCropBtn = button(
    S.undoCrop,
    'btn btn-secondary drawing-editor-undo-crop',
    'undo-crop'
  );
  undoCropBtn.hidden = true;
  let panelOpenBeforeCrop = null;
  // The crop view opened on a picture nothing has converted yet
  // (Crop first). There is no drawing behind it, so Save crop hands the
  // rectangle over and closes the editor, and Cancel closes it too.
  let cropFirst = false;
  const cropPanel = createCropPanel({
    say: (text) => say(text),
    onSave: (rect, insets) => {
      const onCrop = callbacks.onCrop;
      leaveCropView();
      if (cropFirst) dismissSurface();
      if (typeof onCrop === 'function') onCrop(rect, insets);
    },
    onCancel: () => {
      leaveCropView();
      if (cropFirst) leave();
    },
  });

  /** Crop and Undo crop belong to the drawing view of a relief editor. */
  function syncCrop() {
    const drawing = purpose === 'relief' && view === 'drawing';
    cropBtn.hidden = !(drawing && typeof callbacks.onCrop === 'function');
    undoCropBtn.hidden = !(
      drawing &&
      callbacks.cropUndoable === true &&
      typeof callbacks.onUndoCrop === 'function'
    );
  }

  function svgDataUrl(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /**
   * The crop view in the stage's place. The drawer closes the way it does
   * for the charm view and comes back as it was; the host's own picture
   * (a photograph, for a traced one) is shown when it gives one, else the
   * drawing itself.
   */
  function openCropView({
    box: givenBox = null,
    href = null,
    sentences = null,
    returnTo = cropBtn,
  } = {}) {
    if (!isOpen || cropPanel.isOpen() || typeof callbacks.onCrop !== 'function')
      return;
    let box = givenBox;
    if (!box) {
      const doc = new DOMParser().parseFromString(
        currentSvg || '',
        'image/svg+xml'
      );
      const svgRoot = doc.querySelector('svg');
      box = (svgRoot && readDrawingBox(svgRoot)) || {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };
    }
    panelOpenBeforeCrop =
      panelToggleBtn.getAttribute('aria-expanded') === 'true';
    setPanel(false);
    stage.hidden = true;
    root.dataset.crop = 'open';
    cropPanel.open({
      box,
      previewHref:
        href || callbacks.cropPreviewHref || svgDataUrl(currentSvg || ''),
      insets: callbacks.cropInsets || {},
      returnTo,
      ...(sentences ? { sentences } : {}),
    });
  }

  function leaveCropView() {
    stage.hidden = false;
    delete root.dataset.crop;
    if (panelOpenBeforeCrop !== null) {
      setPanel(panelOpenBeforeCrop);
      panelOpenBeforeCrop = null;
    }
  }

  cropBtn.addEventListener('click', () => openCropView());
  undoCropBtn.addEventListener('click', () => {
    if (typeof callbacks.onUndoCrop === 'function') callbacks.onUndoCrop();
  });
  // The note under the charm view is one note in two states: draft quality
  //, and, once a draft was rendered, which drawing the charm shows.
  let draftRendering = false;
  const setCharmNote = (rendered) => {
    draftNote.textContent = rendered ? S.charmNote : S.draftNote;
    draftNote.dataset.draft = rendered ? 'rendered' : '';
  };

  const applyBtn = button(
    S.applyColours,
    'btn btn-primary drawing-editor-apply',
    'editor-apply'
  );
  applyBtn.hidden = true;

  const closeBtn = button(
    S.close,
    'btn btn-secondary drawing-editor-close',
    'editor-close'
  );

  // The picture is the editor; the side panel is a drawer over
  // it, owned by this toggle. State lives in aria-expanded.
  const panelToggleBtn = button(
    S.panelToggle,
    'btn btn-secondary drawing-editor-panel-toggle',
    'panel-toggle'
  );
  panelToggleBtn.setAttribute('aria-expanded', 'false');
  panelToggleBtn.setAttribute('aria-controls', panelId);

  const body = document.createElement('div');
  body.className = 'drawing-editor-body';

  // The workspace's own DOM goes here: the drawing and its panes.
  const stage = document.createElement('div');
  stage.className = 'drawing-editor-stage';

  const panel = document.createElement('div');
  panel.className = 'drawing-editor-panel';
  panel.id = panelId;

  /**
   * One accordion section. Native `details`/`summary`, because a disclosure
   * that a browser already knows how to open is a disclosure that works with
   * a screen reader, a keyboard and a find-in-page without anybody writing
   * ARIA for it.
   */
  const section = (name, label, open = false) => {
    const details = document.createElement('details');
    details.className = 'drawing-editor-section';
    details.dataset.section = name;
    details.open = open;
    const summary = document.createElement('summary');
    summary.className = 'drawing-editor-section-summary';
    const text = document.createElement('span');
    text.className = 'drawing-editor-section-name';
    text.textContent = label;
    const count = document.createElement('span');
    count.className = 'drawing-editor-section-count';
    count.dataset.count = name;
    summary.append(text, count);
    const content = document.createElement('div');
    content.className = 'drawing-editor-section-body';
    details.append(summary, content);
    return { details, content, count };
  };

  const sections = {
    colours: section('colours', S.sectionColours),
    regions: section('regions', S.sectionRegions, true),
    plates: section('plates', S.sectionPlates),
    warnings: section('warnings', S.sectionWarnings),
  };
  for (const key of SECTION_ORDER) panel.appendChild(sections[key].details);

  const backToToolbar = document.createElement('a');
  backToToolbar.className = 'drawing-editor-skip';
  backToToolbar.href = `#${titleId}`;
  backToToolbar.textContent = S.backToToolbar;
  panel.appendChild(backToToolbar);

  /**
   * Is the panel a full-width drawer at this size, rather than a side strip?
   *
   * The stylesheet decides where that band is, with a container query on the
   * editor. This needs the answer BEFORE anything is laid out - the starting
   * state is chosen as the editor opens - so the number is repeated in
   * PANEL_DRAWER_MAX_WIDTH and a test pins the two together.
   *
   * Falls back to the window when the editor has no width yet, which happens
   * when the purpose is applied before the host is shown.
   */
  function panelIsDrawer() {
    const width = root.getBoundingClientRect().width || window.innerWidth || 0;
    return width > 0 && width <= PANEL_DRAWER_MAX_WIDTH;
  }

  /** The drawer's one switch: the panel's own hidden is the state. */
  function setPanel(open) {
    panel.hidden = open !== true;
    panelToggleBtn.setAttribute('aria-expanded', String(open === true));
    root.classList.toggle('drawing-editor--panel-open', open === true);
  }

  const status = document.createElement('p');
  status.className = 'drawing-editor-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  // ── The stencil purpose's own content ───────────────────────────────────
  const swatchList = document.createElement('ul');
  swatchList.className = 'drawing-editor-swatches';

  const addColourForm = buildAddColourForm(uid);

  const regionsBlock = document.createElement('div');
  regionsBlock.className = 'drawing-editor-regions';
  regionsBlock.hidden = true;

  const tableUndoBtn = button(
    S.undoBesideTable,
    'btn btn-secondary drawing-editor-table-undo',
    'undo'
  );

  const platesList = document.createElement('ol');
  platesList.className = 'drawing-editor-plates';

  const ruleField = buildRuleField(uid);

  const islandsList = document.createElement('ul');
  islandsList.className = 'drawing-editor-islands';

  sections.colours.content.append(swatchList, addColourForm.form);
  sections.plates.content.append(platesList, ruleField.wrap);

  const canvasLabel = document.createElement('span');
  canvasLabel.className = 'sr-only';
  canvasLabel.id = canvasLabelId;
  canvasLabel.textContent = S.canvasLabel;

  // What the tints mean, in words beside each swatch: color is never the
  // only signal, and the legend is the one place the four looks are named.
  const legend = document.createElement('ul');
  legend.className = 'drawing-editor-legend';
  legend.setAttribute('aria-label', S.legendLabel);
  for (const [kind, text] of [
    ['painted', S.legendPainted],
    ['base', S.legendBase],
    ['removed', S.legendRemoved],
    ['unpainted', S.legendUnpainted],
    ['plate', S.legendPlate],
  ]) {
    const li = document.createElement('li');
    li.dataset.kind = kind;
    const chip = document.createElement('span');
    chip.className = 'drawing-editor-legend-chip';
    chip.setAttribute('aria-hidden', 'true');
    li.append(chip, document.createTextNode(text));
    legend.appendChild(li);
  }
  legend.hidden = true;

  // The map purpose's legend: a shape takes its level's color, as a charm's
  // shape takes its layer's, and a shape left off is hatched.
  const mapLegend = document.createElement('ul');
  mapLegend.className = 'drawing-editor-legend drawing-editor-map-legend';
  mapLegend.setAttribute('aria-label', S.mapLegendLabel);
  for (const [kind, text] of [
    ['level-1', S.mapLegendFloor],
    ['level-2', S.mapLegendSymbol],
    ['level-3', S.mapLegendTop],
    ['off', S.mapLegendOff],
  ]) {
    const li = document.createElement('li');
    li.dataset.kind = kind;
    const chip = document.createElement('span');
    chip.className = 'drawing-editor-legend-chip';
    chip.setAttribute('aria-hidden', 'true');
    li.append(chip, document.createTextNode(text));
    mapLegend.appendChild(li);
  }
  mapLegend.hidden = true;

  body.append(stage, cropPanel.element, panel);
  // Two rows that never depend on state.
  //
  // One header row holding the title, Shapes, the whole workspace footer
  // (Apply, its hint sentence, Save, Keep original, Reset) and Close wraps at
  // the editor's real 692 px, because the hint alone is 418 px wide, and it
  // reflows whenever the hint comes and goes, so the layout moves as the
  // person works. On a phone the same pile takes 401 px of a 753 px surface.
  //
  // Row 1 is the name of the thing and the two ways out of it. Row 2 is the
  // work: which view, then what to do with it, then a More for the three
  // controls a person reaches for now and then. The hint sentence lives on
  // the status line, where a sentence belongs, so no row's height depends on
  // whether a button happens to be disabled.
  const toolbarHeaderRow = document.createElement('div');
  toolbarHeaderRow.className =
    'drawing-editor-toolbar-row drawing-editor-toolbar-row--header';
  const toolbarViewRow = document.createElement('div');
  toolbarViewRow.className =
    'drawing-editor-toolbar-row drawing-editor-toolbar-row--view';
  const toolbarToolsRow = document.createElement('div');
  toolbarToolsRow.className =
    'drawing-editor-toolbar-row drawing-editor-toolbar-row--tools';

  // The overflow. In the flow under its row, not over the drawing: the same
  // choice the shapes row's More made, for the same reason - an absolutely
  // positioned menu is clipped by whatever scrolls around it.
  const moreBtn = button(
    S.moreTools,
    'btn btn-secondary drawing-editor-more-btn',
    'editor-more'
  );
  moreBtn.setAttribute('aria-label', S.moreToolsLabel);
  moreBtn.setAttribute('aria-expanded', 'false');
  moreBtn.setAttribute('aria-controls', moreId);
  const morePanel = document.createElement('div');
  morePanel.className = 'drawing-editor-more-panel';
  morePanel.id = moreId;
  morePanel.hidden = true;
  const setMore = (open) => {
    morePanel.hidden = open !== true;
    moreBtn.setAttribute('aria-expanded', String(open === true));
  };
  moreBtn.addEventListener('click', () => setMore(morePanel.hidden));
  /**
   * Escape shuts the innermost thing that is open, and this menu is one of
   * them. Without it, one press with More open would leave the editor
   * entirely. Focus goes back to the button that opened it.
   */
  function closeToolbarMore() {
    if (morePanel.hidden) return false;
    setMore(false);
    moreBtn.focus();
    return true;
  }

  toolbarHeaderRow.append(title, panelToggleBtn, closeBtn);
  toolbarViewRow.append(
    viewSwitch,
    cropBtn,
    undoCropBtn,
    renderCharmBtn,
    draftNote,
    viewGroup,
    zoomGroup,
    historyGroup,
    applyBtn,
    moreBtn
  );
  toolbarToolsRow.append(stencilTools);
  toolbar.append(toolbarHeaderRow, toolbarViewRow, morePanel, toolbarToolsRow);
  // The status line and the Apply hint share one block, so the sentence that
  // says why Apply is off sits beside the sentence that says what happened
  // instead of inside the button row.
  const statusLine = document.createElement('div');
  statusLine.className = 'drawing-editor-statusline';
  statusLine.append(status);
  // The editor opened before any picture: a sentence saying what it takes,
  // and the button that chooses one. The header keeps the name and Close.
  const emptyState = document.createElement('div');
  emptyState.className = 'drawing-editor-empty';
  emptyState.hidden = true;
  const emptySentence = document.createElement('p');
  emptySentence.className = 'drawing-editor-empty-sentence';
  const emptyChoose = document.createElement('button');
  emptyChoose.type = 'button';
  emptyChoose.className = 'btn btn-primary drawing-editor-empty-choose';
  emptyChoose.textContent = S.choosePicture;
  emptyState.append(emptySentence, emptyChoose);
  root.append(skipToTable, toolbar, statusLine, emptyState, body);
  // Whatever else is in the element is an editor nobody destroyed;
  // the surface owns the element and there is one editor in it.
  surfaceEl
    .querySelectorAll(':scope > .drawing-editor')
    .forEach((stale) => stale.remove());
  surfaceEl.appendChild(root);

  // ── Mount the workspace, then put its pieces where the surface wants them
  const workspace = createSvgPrepWorkspace(stage);
  const refs = workspace._refs;
  // Its own title, expand and close would duplicate the surface's.
  refs.title.hidden = true;
  refs.fullscreenBtn.hidden = true;
  refs.closeBtn.hidden = true;
  viewControls.append(
    refs.designWidthGroup,
    refs.compareBtn,
    refs.rolesToggleBtn
  );
  // Apply / Save SVG / Save DXF / Keep original / Reset: the workspace's
  // footer IS the action row, listeners and all, so it moves whole - into the
  // working row now, before the More it shares the line with.
  toolbarViewRow.insertBefore(refs.footer, moreBtn);
  // The three tools a person reaches for now and then go behind More; the
  // hint sentence goes to the status line. Both leave the button row, which
  // is why its height does not move with the work.
  morePanel.append(viewControls);
  statusLine.append(refs.applyHint);

  /**
   * Below the drawer band the working row cannot hold six controls: at 412 px
   * it wraps across four lines and the toolbar takes 241 px of a 753 px
   * screen. The three actions a person finishes with move into More, which is
   * already on the row, and come back when there is room again.
   *
   * Moved, never copied: the same nodes with the same listeners and one
   * accessible name each. A copy would put two "Reset" buttons in the
   * accessibility tree and let them drift apart.
   */
  let toolbarIsNarrow = null;
  function syncToolbarBand() {
    const narrow = panelIsDrawer();
    if (narrow === toolbarIsNarrow) return;
    toolbarIsNarrow = narrow;
    const secondary = [
      refs.saveBtn,
      refs.saveDxfBtn,
      refs.keepBtn,
      refs.resetBtn,
    ];
    // Focus would be lost with the button it is on when More is shut.
    const active = document.activeElement;
    const movingFocus = narrow && secondary.includes(active);
    if (narrow) morePanel.prepend(...secondary);
    else refs.footer.append(...secondary);
    if (movingFocus) moreBtn.focus();
  }
  syncToolbarBand();
  const bandObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => syncToolbarBand())
      : null;
  bandObserver?.observe(root);
  // The map purpose's column name, above the list the menus sit in.
  const classHeading = document.createElement('p');
  classHeading.className = 'drawing-editor-class-heading';
  classHeading.textContent = S.colClass;
  classHeading.hidden = true;
  const shapesBlock = document.createElement('div');
  shapesBlock.className = 'drawing-editor-shapes';
  shapesBlock.append(
    refs.thinNotice,
    refs.layerSummary,
    refs.bulkBar,
    classHeading,
    refs.objects
  );
  sections.regions.content.append(shapesBlock, regionsBlock);
  sections.warnings.content.append(refs.warnings, islandsList);

  // The region canvas lives in the stage beside the workspace's panes and
  // shows for the stencil purpose, where the panes hide.
  stage.appendChild(canvasLabel);
  const canvas = createRegionCanvas({
    container: stage,
    labelId: canvasLabelId,
    on: {
      // In the map purpose a shape has no selection and no paint: a click,
      // Enter or a double click goes to its row's Class menu.
      onClick: (key, shift) => {
        if (purpose === 'map') {
          if (canvas.getTool() === 'route') routePick(key);
          else focusMapRow(key);
          return;
        }
        if (shift) toggleSelected(key);
        else setSelection(new Set([key]));
        announceSelection();
      },
      onEmptyClick: (shift) => {
        if (purpose === 'map') return;
        if (shift || selected.size === 0) return;
        setSelection(new Set());
        announceSelection();
      },
      onMarquee: (keys, shift) => {
        if (purpose === 'map') return;
        const next = shift ? new Set(selected) : new Set();
        for (const k of keys) next.add(k);
        setSelection(next);
        announceSelection();
      },
      onPaint: (key) => {
        if (purpose !== 'map') assign([key], paintSelect.value);
      },
      onRemove: (key) => {
        if (purpose !== 'map') remove([key]);
      },
      onHighlight: (key) =>
        purpose === 'map' ? describeMapHighlight(key) : describeHighlight(key),
      onToggle: (key) => {
        if (purpose === 'map') {
          if (canvas.getTool() === 'route') routePick(key);
          else focusMapRow(key);
          return;
        }
        toggleSelected(key);
        announceSelection();
      },
      onOpenColour: (key) => {
        if (purpose === 'map') {
          focusMapRow(key);
          return;
        }
        const select = rowSelect(key);
        if (!select) return;
        select.focus();
        if (typeof select.showPicker === 'function') {
          try {
            select.showPicker();
          } catch {
            // Needs a user gesture in some browsers; focus is enough then.
          }
        }
      },
    },
  });
  canvas.root.hidden = true;
  stage.append(legend, mapLegend);

  let isOpen = false;
  /** Open before any picture: the empty state on screen. */
  let empty = false;
  let chooseFile = null;
  let purpose = 'relief';
  // The map purpose's state: a class per shape, keyed by the shape's
  // ORIGINAL index (the numbering the workspace's roles travel in, the only
  // one that survives a delete), and the elements the drawing was read into.
  const mapClasses = new Map();
  let mapElements = [];
  // A draft (a plan from OpenStreetMap): the Class menu's last entry reads
  // Off and Apply says how many features are on.
  let isDraft = false;
  // The route under the Walk this tool: the shapes picked, in walking order,
  // with their points (from the host's features), and the class each had
  // before, for Clear route.
  let route = [];
  const routePrev = new Map();
  /** 'drawing' or 'charm'. Back to the drawing on every open. */
  let view = 'drawing';
  /** Whether the drawer was open when the charm view closed it. */
  let panelOpenBeforeCharm = null;
  let callbacks = {};
  let trap = null;
  let previousFocus = null;
  // The stencil purpose's state, all of it.
  let engine = null;
  let currentSvg = null;
  let regions = [];
  let silhouette = null;
  let plan = null;
  let initialPlan = null;
  let openToken = 0;
  let selected = new Set();
  const rows = new Map();
  const stack = createCommandStack({ onChange: updateHistoryButtons });
  // The workspace rebuilds its rows on a delete and on its undo, menus and
  // switches with them, so the map purpose's menus are put back whenever
  // the list changes under it.
  const rowsObserver =
    typeof MutationObserver === 'function'
      ? new MutationObserver(() => {
          if (isOpen && purpose === 'map') ensureClassSelects();
        })
      : null;
  rowsObserver?.observe(refs.objects, { childList: true });
  // The view: the plan or the original, and which plate, if any.
  let showingOriginal = false;
  let plateIndex = -1;

  // The status line is the editor's one voice: a polite region reads its own
  // changes, and the host's announcer as well said every sentence twice. A
  // region only reads a change it was already on screen for, though, so a
  // sentence written in the turn the editor appears, or in the turn it goes,
  // is the announcer's to say instead.
  let statusOnScreen = false;
  let saidThisTurn = null;
  const say = (message) => {
    if (!message) return;
    status.textContent = message;
    if (!statusOnScreen) {
      if (typeof announce === 'function') announce(message);
      return;
    }
    saidThisTurn = message;
    setTimeout(() => {
      if (saidThisTurn === message) saidThisTurn = null;
    }, 0);
  };

  /** Put a count beside a section name, or nothing when there is none. */
  const setCount = (name, n) => {
    const el = sections[name];
    if (!el) return;
    el.count.textContent = n === null || n === undefined ? '' : String(n);
  };

  function show() {
    surfaceEl.hidden = false;
    surfaceEl.classList.remove('hidden');
    requestAnimationFrame(() => {
      statusOnScreen = !surfaceEl.hidden;
    });
  }

  function hide() {
    surfaceEl.hidden = true;
    surfaceEl.classList.add('hidden');
    statusOnScreen = false;
    if (saidThisTurn && typeof announce === 'function') announce(saidThisTurn);
    saidThisTurn = null;
  }

  /**
   * Give the area back. Never calls a callback itself: `finish` does that,
   * BEFORE this runs, because the host reads the workspace's state (roles,
   * deletions, layers) inside its callback and the workspace clears part of
   * that state as it closes.
   */
  function teardown() {
    if (trap) {
      trap.deactivate();
      trap = null;
    }
    workspace.close();
    if (cropPanel.isOpen()) {
      cropPanel.close();
      leaveCropView();
    }
    bandObserver?.disconnect();
    hide();
    cropFirst = false;
    delete root.dataset.cropFirst;
    resetView();
    status.textContent = '';
    leaveEmpty();
    if (typeof onClose === 'function') onClose(surfaceEl);
    if (fullscreen && previousFocus?.focus) previousFocus.focus();
    previousFocus = null;
  }

  /**
   * Leave without a verdict: Close, and Escape where Escape is the way out.
   *
   * Close does not mean "the original stands": a look at an applied drawing
   * must not end with the charm reverting to the raw one. A host that offers
   * `onClose` is asked to leave things as they are; one that does not (the
   * Edit Drawing door) gets Keep original. The Keep original button is not
   * routed through here and keeps its meaning.
   */
  function leave() {
    finish(
      typeof callbacks.onClose === 'function' ? 'onClose' : 'onKeepOriginal'
    );
  }

  /**
   * Leave the editor with a verdict. Idempotent: the workspace's own close
   * and the surface's Escape can both arrive for the one gesture, and only
   * the first one counts.
   */
  function finish(which, ...args) {
    if (!isOpen) return;
    isOpen = false;
    const fn = callbacks[which];
    try {
      if (typeof fn === 'function') fn(...args);
    } finally {
      teardown();
    }
  }

  /**
   * Open the surface on a drawing.
   *
   * @param {string} svgString
   * @param {object} analysis - From analyzeSvg
   * @param {object} [options] - The workspace's own options (sourceName,
   *   initialOverrides, initialOffsets, initialDeleted, layersEnabled,
   *   initialLayers, mode, tools, onSave, onSaveDxf) pass straight through,
   *   plus `purpose` ('relief' | 'stencil'), `openedSentence` and
   *   `initialPlan` (a saved plan, laid back over the regions found).
   */
  /** The empty state off, whatever replaces it. */
  function leaveEmpty() {
    empty = false;
    chooseFile = null;
    delete root.dataset.empty;
    emptyState.hidden = true;
  }

  emptyChoose.addEventListener('click', () => {
    if (typeof chooseFile === 'function') chooseFile();
  });

  /** Tab stays inside a full-screen editor, and Escape is the way out. */
  function startFullscreenTrap(initialFocus) {
    trap = createDocumentFocusTrap(root, {
      // A row's menu is the smallest thing open, so it is the first thing
      // Escape shuts. Without this, one press with a menu open left the
      // editor entirely - a long way further than anybody meant to go.
      onEscape: () => {
        if (cropPanel.isOpen()) {
          cropPanel.cancel();
          return;
        }
        if (closeToolbarMore()) return;
        if (workspace.closeOpenMenu?.()) return;
        leave();
      },
    });
    trap.activate({ initialFocus, initialFocusDelay: 0 });
  }

  /**
   * Open the editor before any picture. It says what it takes (the host
   * builds the sentence from the file types its control accepts) and offers
   * to choose a file; the host opens the editor on the file chosen. Close
   * and Escape close it as any editor.
   *
   * @param {object} options
   * @param {string} options.sentence - what to choose, said once (A11Y)
   * @param {() => void} options.onChooseFile - opens the file chooser
   * @param {() => void} [options.onClose] - the editor closed with nothing
   */
  function openEmpty({
    sentence = '',
    onChooseFile = null,
    onClose: closed,
  } = {}) {
    if (isOpen) return;
    callbacks = typeof closed === 'function' ? { onClose: closed } : {};
    resetView();
    empty = true;
    chooseFile = onChooseFile;
    root.dataset.empty = 'true';
    emptySentence.textContent = sentence;
    emptyState.hidden = false;
    isOpen = true;
    show();
    // Said by the host's announcer, not the status line: the sentence is on
    // screen already, and the status line would show it twice.
    if (typeof announce === 'function' && sentence) announce(sentence);
    if (typeof onOpen === 'function') onOpen(surfaceEl);
    previousFocus = document.activeElement;
    if (fullscreen) startFullscreenTrap(title);
    title.focus();
  }

  function open(svgString, analysis, options = {}) {
    // A drawing chosen from the empty editor opens in it.
    const fromEmpty = empty;
    if (fromEmpty) leaveEmpty();
    const {
      purpose: askedPurpose,
      openedSentence,
      initialPlan: savedPlan,
      initialClasses: savedClasses = null,
      draft = false,
      startInCropView = false,
      pictureHref = null,
      pictureBox = null,
      ...rest
    } = options;
    const reopening = isOpen;
    callbacks = rest;
    purpose =
      askedPurpose === 'stencil'
        ? 'stencil'
        : askedPurpose === 'map'
          ? 'map'
          : 'relief';
    root.dataset.purpose = purpose;
    isDraft = purpose === 'map' && draft === true;
    // Every open starts on the drawing. A re-trace calls open() on an
    // editor that is already up, and coming back to a charm view of a drawing
    // that has just changed underneath it would be showing the old charm.
    resetView();
    // No charm to switch to without a model behind the editor (`mode` is the
    // same flag the workspace reads to decide whether Apply means anything),
    // and none on the stencil purpose either: what sits behind THAT editor is
    // a tile of plates, and a control labeled Charm would be naming something
    // that is not there.
    viewSwitch.hidden = rest.mode === 'file' || purpose !== 'relief';
    syncRenderCharm();
    isOpen = true;
    currentSvg = svgString;
    initialPlan = savedPlan || null;
    show();

    // Crop first. The editor opens on a picture nothing has converted
    // yet, straight into the crop view. There is no drawing, so the
    // workspace is not opened and the rows of drawing tools stay out of the
    // way (the CSS on data-crop-first); Save crop hands the rectangle to the
    // host, whose conversion follows, and Cancel or Escape closes the editor
    // with nothing converted. Only a host that can crop gets it.
    cropFirst = startInCropView === true && typeof rest.onCrop === 'function';
    if (cropFirst) root.dataset.cropFirst = 'true';
    else delete root.dataset.cropFirst;

    if (cropFirst) {
      // A drawing already up (the file control's Crop pressed while the
      // editor shows the drawing) is dropped as it is: the crop replaces it.
      if (reopening) workspace.dismiss();
      applyPurpose();
      syncCrop();
      setCount('warnings', null);
      setCount('regions', null);
      // The crop view says its own sentence for a picture, and `say` puts
      // it on the status line: one action, one sentence, one region.
      openCropView({
        box: pictureBox,
        href: pictureHref,
        returnTo: null,
        sentences: {
          opened: S.cropFirstViewOpen,
          canceled: S.cropFirstCanceled,
        },
      });
    } else {
      // The workspace resolves Apply and Keep itself; the surface only has
      // to give the area back afterwards, and it does that in `finish`.
      workspace.open(svgString, analysis, {
        ...rest,
        hosted: true,
        onApply: (...args) => finish('onApply', ...args),
        onKeepOriginal: (...args) => finish('onKeepOriginal', ...args),
      });

      applyPurpose();
      syncCrop();
      setCount('warnings', analysis?.warnings?.length || null);

      if (purpose === 'map') {
        mapElements = analysis?.elements || [];
        mapClasses.clear();
        route = [];
        routePrev.clear();
        seedClasses(savedClasses);
        ensureClassSelects();
        setCount('regions', mapElements.length);
        feedMapCanvas(svgString).catch((err) => {
          console.error(
            '[Drawing editor] the map canvas could not be drawn:',
            err
          );
        });
        say(openedSentence || S.opened);
      } else if (purpose === 'stencil') {
        setCount('regions', null);
        setCount('colours', null);
        setCount('plates', null);
        status.textContent = S.findingRegions;
        buildStencil(svgString, openedSentence || S.opened);
      } else {
        setCount('regions', analysis?.elements?.length ?? null);
        // A reopen the workspace painted from its stored
        // result says so, with the counts, and never "The model preview is
        // behind it" as if the drawing were new.
        const asLeft =
          typeof workspace.wasOpenedAsLeft === 'function'
            ? workspace.wasOpenedAsLeft()
            : null;
        say(
          openedSentence ||
            (asLeft ? S.openedAsLeft(asLeft.on, asLeft.off) : S.opened)
        );
      }
    }

    // The crop view's first row is where a Crop first opening lands.
    const cropTop = cropPanel.element.querySelector(
      'input[type="range"][data-inset="top"]'
    );
    if (reopening) {
      // From the empty editor focus was on its button, which is gone now.
      if (fromEmpty) (cropFirst && cropTop ? cropTop : title).focus();
      return;
    }
    if (typeof onOpen === 'function') onOpen(surfaceEl);
    previousFocus = document.activeElement;
    if (fullscreen) {
      // The screen is the editor now, so Tab stays inside it and Escape is
      // the way out. Over the preview there is no trap: the customizer is
      // one Tab away on purpose.
      startFullscreenTrap(cropFirst && cropTop ? cropTop : title);
    }
    // After the host's own open hook: at phone width the customizer drawer
    // stands aside for the editor and moves focus to its toggle as
    // it goes, so the editor's first focus is set last.
    (cropFirst && cropTop ? cropTop : title).focus();
  }

  /**
   * Show the drawing, or the charm the drawing makes.
   *
   * Nothing is torn down and nothing is rebuilt: the editor keeps every role,
   * deletion and layer it had, because all that changes is which of two things
   * is on screen. The charm is not drawn here either - it is the 3D preview
   * this surface is sitting on top of, and showing it is a matter of getting
   * out of its way.
   */
  function setView(next) {
    const wanted = next === 'charm' ? 'charm' : 'drawing';
    if (wanted === view) return;
    // The crop view is the innermost thing open; a view change ends it.
    if (cropPanel.isOpen()) cropPanel.cancel();
    view = wanted;
    root.dataset.view = view;
    if (viewRadios[view] && !viewRadios[view].checked) {
      viewRadios[view].checked = true;
    }
    // The drawer is about the DRAWING's shapes, and in the charm view there is
    // no drawing on screen for it to be about. It also costs more of the charm
    // than anything else does: at 1280 px the editor's chrome covers
    // the canvas's top 215 px and the drawer its right 310 px, and the charm
    // itself is 515 px wide - so the toolbar clips 30 px off its top while the
    // drawer hides 206 px of its side. It closes here and comes back exactly
    // as it was, because closing it was this control's doing and not the
    // person's.
    if (view === 'charm') {
      panelOpenBeforeCharm =
        panelToggleBtn.getAttribute('aria-expanded') === 'true';
      setPanel(false);
    } else if (panelOpenBeforeCharm !== null) {
      setPanel(panelOpenBeforeCharm);
      panelOpenBeforeCharm = null;
    }
    // Same division as open and close: the surface says what it wants shown,
    // and whoever owns the preview decides what that means for the canvas.
    // The stage is the box the charm has to fit inside: everything else in
    // this editor is laid over the canvas, not beside it.
    if (typeof onViewChange === 'function') onViewChange(view, stage);
    syncRenderCharm();
    syncCrop();
    // One action, one announcement: one control pressed, one sentence
    // saying what is now on screen.
    say(view === 'charm' ? S.viewShowingCharm : S.viewShowingDrawing);
  }

  /** Render preview belongs to the charm view of a host that can draw one. */
  function syncRenderCharm() {
    const offered = typeof callbacks.onDraftRender === 'function';
    renderCharmBtn.hidden = !(view === 'charm' && offered);
  }

  /**
   * Ask the host for a draft of the charm with the drawing as it is now:
   * the current combined result (waiting for the combine if one is in
   * flight, and saying so) and the Layer column (null unless built).
   */
  async function renderCharm() {
    if (draftRendering || typeof callbacks.onDraftRender !== 'function') return;
    draftRendering = true;
    renderCharmBtn.disabled = true;
    try {
      if (workspace.isCombining()) {
        say(S.renderCharmWaiting);
        await workspace.whenCombined();
      }
      if (!isOpen) return;
      const result = workspace.getResult();
      if (!result) {
        say(S.renderCharmNothing);
        return;
      }
      const layerResult = workspace.getLayerAssignments();
      const layers = layerResult?.limit ? layerResult.layers : null;
      callbacks.onDraftRender(result, layers);
      setCharmNote(true);
      say(S.renderCharmStarted);
    } finally {
      draftRendering = false;
      renderCharmBtn.disabled = false;
    }
  }
  renderCharmBtn.addEventListener('click', () => {
    renderCharm();
  });

  /** Put the view back to the drawing, without announcing it. */
  function resetView() {
    const wasCharm = view === 'charm';
    view = 'drawing';
    root.dataset.view = 'drawing';
    if (viewRadios.drawing) viewRadios.drawing.checked = true;
    if (viewRadios.charm) viewRadios.charm.checked = false;
    panelOpenBeforeCharm = null;
    setCharmNote(false);
    syncRenderCharm();
    syncCrop();
    // Closing or re-opening on the charm view would otherwise leave the
    // preview showing underneath the next drawing.
    if (wasCharm && typeof onViewChange === 'function') {
      onViewChange('drawing', stage);
    }
  }

  /** Show what this purpose needs and nothing it does not. */
  function applyPurpose() {
    const stencil = purpose === 'stencil';
    const map = purpose === 'map';
    // The picture is the editor. The stencil purpose starts with the drawer
    // closed - the canvas and the paint tools carry the task; the relief
    // purpose starts with it open - the shape list is the hands, and the
    // map purpose's menus live in that same list.
    //
    // Except on a narrow screen. There the panel is not a strip beside the
    // drawing, it is a drawer laid over it: 396 px of a 412 px screen. Open,
    // the first thing a person sees after choosing a picture is a list of
    // shapes on top of the picture they chose. Shut, the picture is the first
    // thing seen as well as the first thing read, and the list is one press
    // away on a button already in the header. Nothing changes above the band,
    // where the panel covers nothing.
    setPanel(!stencil && !panelIsDrawer());
    sections.colours.details.hidden = !stencil;
    sections.plates.details.hidden = !stencil;
    regionsBlock.hidden = !stencil;
    shapesBlock.hidden = stencil;
    classHeading.hidden = !map;
    // The map purpose takes two of the stencil's hands, Select and Hand (to
    // drag the picture); the marquee, the paint and the remove tools and the
    // paint menu are the stencil's alone.
    stencilTools.hidden = !(stencil || map);
    paintGroup.hidden = map;
    for (const [id, el] of toolButtons) {
      el.hidden = map
        ? id !== 'select' && id !== 'hand' && id !== 'route'
        : id === 'route';
    }
    clearRouteBtn.hidden = !map;
    viewGroup.hidden = !stencil;
    // The region canvas is the picture of the two purposes that work on
    // shapes one by one: the stencil paints them, the map classes them.
    zoomGroup.hidden = !(stencil || map);
    // Undo and Redo belong to the two purposes with a command stack.
    historyGroup.hidden = !(stencil || map);
    canvas.root.hidden = !(stencil || map);
    canvasLabel.textContent = map ? S.mapCanvasLabel : S.canvasLabel;
    const canvasHelp = document.getElementById(`${canvasLabelId}-help`);
    if (canvasHelp) {
      canvasHelp.textContent = map ? S.mapCanvasHelp : S.canvasHelp;
    }
    legend.hidden = !stencil;
    mapLegend.hidden = !map;
    applyBtn.hidden = !(stencil || map);
    applyBtn.textContent = map ? S.applyClasses : S.applyColours;
    // The word follows the purpose too. A region is a thing the stencil lane
    // cuts and paints; what somebody is looking at on a charm is a shape, which
    // is already the word the rows and counts use.
    panelToggleBtn.textContent = stencil ? S.panelToggle : S.panelToggleShapes;
    skipToTable.textContent = stencil ? S.skipToRegions : S.skipToShapes;
    const regionsName = sections.regions?.details?.querySelector(
      '.drawing-editor-section-name'
    );
    if (regionsName) {
      regionsName.textContent = stencil ? S.sectionRegions : S.sectionShapes;
    }
    // Roles, offsets, the design width and the before/after panes are the
    // relief purpose's vocabulary: a stencil region has a color, not a
    // role, a map shape has a class, and the plate's size is a parameter
    // beside the editor.
    refs.rolesToggleBtn.hidden = stencil || map;
    refs.compareBtn.hidden = stencil;
    refs.designWidthGroup.hidden =
      stencil || map || refs.designWidthGroup.hidden;
    refs.legendRow.hidden = stencil || map || refs.legendRow.hidden;
    // The relief purpose's before-and-after panes, its bulk tools and its
    // charm-width sentence act on roles and a flatten the map never makes.
    refs.previews.hidden = stencil || map;
    refs.bulkBar.hidden = map;
    refs.designWidthHelp.hidden = stencil || map || refs.designWidthHelp.hidden;
    // The stencil and map purposes apply their plan with their own button;
    // the workspace's Apply, Save and Reset act on the flatten, which
    // neither uses.
    refs.applyBtn.hidden = stencil || map || refs.applyBtn.hidden;
    refs.applyHint.hidden = stencil || map || refs.applyHint.hidden;
    refs.saveBtn.hidden = stencil || map || refs.saveBtn.hidden;
    refs.saveDxfBtn.hidden = stencil || map || refs.saveDxfBtn.hidden;
    refs.resetBtn.hidden = stencil || map;
    if (!map) {
      mapClasses.clear();
      mapElements = [];
      removeClassSelects();
    }
    if (!stencil) {
      regionsBlock.replaceChildren();
      swatchList.replaceChildren();
      platesList.replaceChildren();
      islandsList.replaceChildren();
      rows.clear();
      regions = [];
      silhouette = null;
      plan = null;
      selected = new Set();
      stack.clear();
    }
  }

  // ── The stencil purpose ─────────────────────────────────────────────────

  async function buildStencil(svgString, openedSentence) {
    const token = ++openToken;
    try {
      engine = await loadEngine();
    } catch (err) {
      console.error('[Drawing editor] color engine failed to load:', err);
      if (token === openToken && isOpen) say(S.engineFailed);
      return;
    }
    // Closed, or reopened on another drawing, while the chunk was coming.
    if (token !== openToken || !isOpen) return;

    // The SAME reading the plate builder does, so the region keys the plan
    // is written in are the keys the plates are cut by.
    const found = engine.buildRegions(
      classifyElements(parseSvgElements(svgString))
    );
    regions = found.regions;
    silhouette = found.silhouette;
    // A saved plan comes back over the regions just found; otherwise the
    // automatic first pass. Either way the regions are the same shapes.
    const restored = initialPlan
      ? engine.applySavedPlan(initialPlan, regions)
      : null;
    if (restored) {
      plan = {
        palette: restored.palette.map((c) => ({ ...c })),
        order: [...restored.order],
        assignment: { ...restored.assignment },
        rule: restored.rule,
        lineMode: found.lineMode,
      };
    } else {
      const palette = engine.paletteFromFills(regions);
      const assignment = engine.autoAssign(regions, palette);
      plan = {
        palette,
        order: engine.defaultOrder(regions, assignment, palette),
        assignment,
        rule: 'stacked',
        lineMode: found.lineMode,
      };
    }
    selected = new Set();
    stack.clear();
    showingOriginal = false;
    showOriginalBtn.setAttribute('aria-pressed', 'false');
    canvas.setView('plan');
    plateIndex = -1;
    const extent = boundsOf(
      [...(silhouette || []), ...regions.flatMap((r) => r.rings)].flat()
    );
    canvas.setDrawing(
      svgString,
      regions.map((r) => ({
        key: r.key,
        d: engine.ringsToPathData(r.rings),
        bbox: r.bbox,
        interior: r.interior,
      })),
      extent
    );
    setTool('select');
    buildRegionsTable();
    refresh();
    say(
      regions.length === 0
        ? `${openedSentence} ${S.noRegions}`
        : `${openedSentence} ${S.regionsFound(regions.length, plan.palette.length)}`
    );
  }

  /** The plates as the plan stands, with the loose pieces each would leave. */
  function currentCuts() {
    if (!engine || !plan) return [];
    return engine.platesFor(plan, regions, silhouette).map((cut) => ({
      ...cut,
      islands: engine.islandsOf(cut.rings, regions),
    }));
  }

  const regionOf = (key) => regions.find((r) => r.key === key);
  const isRemoved = (key) => plan?.assignment[key] === engine?.REMOVED;
  const baseId = () =>
    plan.palette.find((c) => c.id === engine.BASE_COLOUR_ID)?.id ||
    plan.palette[0]?.id;

  function colourName(id) {
    if (id === engine.UNPAINTED) return S.unpainted;
    return plan.palette.find((c) => c.id === id)?.name || id;
  }

  /** The plate a region's color is painted with, 1-based, or 0 for none. */
  function plateOf(regionKey) {
    const id = plan.assignment[regionKey];
    const at = plan.order.indexOf(id);
    return at < 0 ? 0 : at + 1;
  }

  function plateText(regionKey) {
    if (isRemoved(regionKey)) return S.removedCell;
    const n = plateOf(regionKey);
    return n === 0 ? S.notCut : String(n);
  }

  /** Everything derived from the plan, painted once. */
  function refresh() {
    if (!plan) return;
    const cuts = currentCuts();
    updateRows();
    renderSwatches();
    renderPlates(cuts);
    renderIslands(cuts);
    fillPaintSelect();
    ruleField.input.checked = plan.rule !== 'own';
    paintCanvas();
    renderStepper(cuts);
    setCount('regions', regions.length);
    setCount('colours', plan.palette.length);
    setCount('plates', plan.order.length);
    const warningCount =
      (refs.warnings.querySelectorAll('li').length || 0) +
      cuts.reduce((n, c) => n + c.islands.length, 0);
    setCount('warnings', warningCount || null);
  }

  function paintCanvas() {
    const fills = {};
    const removed = new Set();
    for (const r of regions) {
      const id = plan.assignment[r.key];
      if (id === engine.REMOVED) {
        removed.add(r.key);
        continue;
      }
      if (id === engine.UNPAINTED) continue;
      const colour = plan.palette.find((c) => c.id === id);
      fills[r.key] =
        id === engine.BASE_COLOUR_ID
          ? 'var(--drawing-editor-base-tint)'
          : colour?.hex || '';
    }
    canvas.setState({ fills, selected, removed });
  }

  // ── The view: the toggle and the plate stepper ──────────────────────────

  showOriginalBtn.addEventListener('click', () => {
    showingOriginal = !showingOriginal;
    showOriginalBtn.setAttribute('aria-pressed', String(showingOriginal));
    canvas.setView(showingOriginal ? 'original' : 'plan');
    say(showingOriginal ? S.showingOriginal : S.showingPlan);
  });

  /** The stepper's text and buttons, and the plate drawn on the canvas. */
  function renderStepper(cuts) {
    if (plateIndex >= cuts.length) plateIndex = -1;
    const n = cuts.length;
    const prevOff = n === 0 || plateIndex < 0;
    const nextOff = n === 0 || plateIndex >= n - 1;
    // At either end the button pressed turns off: focus goes to the other.
    if (!prevOff) prevPlateBtn.disabled = false;
    if (!nextOff) nextPlateBtn.disabled = false;
    if (prevOff)
      disableKeepingFocus(prevPlateBtn, nextOff ? null : nextPlateBtn);
    if (nextOff)
      disableKeepingFocus(nextPlateBtn, prevOff ? null : prevPlateBtn);
    if (plateIndex < 0) {
      stepperText.textContent = S.allPlates;
      canvas.showPlate(null);
      return;
    }
    const cut = cuts[plateIndex];
    stepperText.textContent = S.plateOfN(
      plateIndex + 1,
      n,
      colourName(cut.colourId)
    );
    canvas.showPlate(cut.rings.length ? engine.ringsToPathData(cut.rings) : '');
  }

  function stepPlate(to) {
    const cuts = currentCuts();
    if (cuts.length === 0) return;
    plateIndex = to < 0 || to >= cuts.length ? -1 : to;
    renderStepper(cuts);
    if (plateIndex < 0) {
      say(S.showingAllPlates);
      return;
    }
    const names = cuts.map((c) => colourName(c.colourId));
    const sentence = engine.paintSequence(names)[plateIndex] || '';
    say(`${stepperText.textContent}. ${sentence}`);
  }

  prevPlateBtn.addEventListener('click', () => stepPlate(plateIndex - 1));
  nextPlateBtn.addEventListener('click', () => stepPlate(plateIndex + 1));
  stepperText.addEventListener('click', () => stepPlate(-1));
  stepper.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      stepPlate(plateIndex + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });

  // ── The regions table ───────────────────────────────────────────────────

  function buildRegionsTable() {
    regionsBlock.replaceChildren();
    rows.clear();
    if (regions.length === 0) return;
    const total = regions.reduce((s, r) => s + (r.area || 0), 0) || 1;
    const table = document.createElement('table');
    table.className = 'drawing-editor-regions-table';
    const caption = document.createElement('caption');
    caption.textContent = S.regionsCaption;
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const label of [
      S.colRegion,
      S.colColour,
      S.colPlate,
      S.colShare,
      S.colActions,
    ]) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    const tbody = document.createElement('tbody');
    regions.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.dataset.region = r.key;

      // The row's name IS the checkbox's label, so ticking a region and
      // hearing which one it is are the same control.
      const name = document.createElement('th');
      name.scope = 'row';
      const label = document.createElement('label');
      label.className = 'drawing-editor-region-label';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'drawing-editor-region-check';
      check.id = `drawingEditorRegion-${uid}-${i}`;
      check.dataset.region = r.key;
      check.addEventListener('change', () => {
        const next = new Set(selected);
        if (check.checked) next.add(r.key);
        else next.delete(r.key);
        setSelection(next);
      });
      label.append(check, document.createTextNode(r.name));
      name.appendChild(label);

      const colourCell = document.createElement('td');
      colourCell.className = 'drawing-editor-colour-cell';
      const select = buildColourSelect(r);
      colourCell.appendChild(select);

      const plateCell = document.createElement('td');
      plateCell.dataset.plate = '';

      const share = document.createElement('td');
      const pct = (100 * (r.area || 0)) / total;
      share.textContent = pct < 1 ? S.shareUnderOne : `${Math.round(pct)}%`;

      const actions = document.createElement('td');
      const removeBtn = button(
        S.colActions,
        'btn btn-ghost drawing-editor-region-remove',
        'remove-region'
      );
      removeBtn.dataset.region = r.key;
      removeBtn.addEventListener('click', () => {
        if (isRemoved(r.key)) restore([r.key]);
        else remove([r.key]);
      });
      actions.appendChild(removeBtn);

      tr.append(name, colourCell, plateCell, share, actions);
      tbody.appendChild(tr);
      rows.set(r.key, { tr, check, select, plateCell, removeBtn });
    });
    table.append(caption, thead, tbody);
    const undoRow = document.createElement('div');
    undoRow.className = 'drawing-editor-table-actions';
    undoRow.appendChild(tableUndoBtn);
    regionsBlock.append(table, undoRow);
  }

  /** Patch every row to the plan without rebuilding it: focus stays put. */
  function updateRows() {
    for (const r of regions) {
      const row = rows.get(r.key);
      if (!row) continue;
      const removed = isRemoved(r.key);
      fillColourOptions(row.select, r);
      row.select.disabled = removed;
      row.select.value = removed
        ? row.select.value
        : plan.assignment[r.key] || baseId() || '';
      row.plateCell.textContent = plateText(r.key);
      row.check.checked = selected.has(r.key);
      row.tr.classList.toggle('is-removed', removed);
      row.tr.classList.toggle('is-selected', selected.has(r.key));
      row.removeBtn.textContent = removed ? S.putBack : S.colActions;
      row.removeBtn.setAttribute(
        'aria-label',
        removed ? S.restoreRegion(r.name) : S.removeRegion(r.name)
      );
    }
  }

  const rowSelect = (key) => rows.get(key)?.select || null;

  function buildColourSelect(region) {
    const select = document.createElement('select');
    select.className = 'drawing-editor-colour-select';
    select.setAttribute('aria-label', S.colourFor(region.name));
    select.dataset.region = region.key;
    select.addEventListener('change', () => {
      assign([region.key], select.value);
    });
    return select;
  }

  /**
   * The palette as options, in place, so a select that has focus keeps it.
   *
   * Unpainted only where it can be true. In a line drawing plate 1 is
   * the whole outline and the base coat goes through it, so every face
   * inside the outline is painted at least that; offering "unpainted" there
   * would be offering something the plates cannot do. Filled art has no
   * outline plate, so there a region can really be left as the wall.
   */
  function fillColourOptions(select, region = null) {
    const wanted = plan.palette.map((c) => [c.id, c.name]);
    if (plan.lineMode === 'shapes')
      wanted.push([engine.UNPAINTED, S.unpainted]);
    const same =
      select.options.length === wanted.length &&
      wanted.every(
        ([id, name], i) =>
          select.options[i].value === id &&
          select.options[i].textContent === name
      );
    if (same) return;
    const value = select.value;
    select.replaceChildren();
    for (const [id, name] of wanted) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      select.appendChild(opt);
    }
    if (region) select.value = plan.assignment[region.key] || value;
    else select.value = value;
  }

  function fillPaintSelect() {
    fillColourOptions(paintSelect);
    if (!paintSelect.value || paintSelect.selectedIndex < 0) {
      paintSelect.value =
        plan.palette[Math.min(1, plan.palette.length - 1)]?.id || '';
    }
  }

  // ── Selection: one set, two views ───────────────────────────────────────

  function setSelection(next) {
    selected = next;
    for (const [key, row] of rows) row.check.checked = selected.has(key);
    for (const [key, row] of rows)
      row.tr.classList.toggle('is-selected', selected.has(key));
    paintCanvas();
  }

  function toggleSelected(key) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelection(next);
  }

  function announceSelection() {
    say(selected.size === 0 ? S.selectionCleared : S.selected(selected.size));
  }

  function describeHighlight(key) {
    const r = regionOf(key);
    if (!r) return;
    // The status line only: a screen reader reads a polite region on its
    // own, and the app-wide announcer would say it twice.
    status.textContent = isRemoved(key)
      ? S.highlightingRemoved(r.name)
      : S.highlighting(r.name, colourName(plan.assignment[key]), plateOf(key));
  }

  // ── Commands ────────────────────────────────────────────────────────────

  /** Run a change through the stack and say what it did. */
  function command(label, apply, revert, sentence) {
    stack.run({
      label,
      do: () => {
        apply();
        refresh();
      },
      undo: () => {
        revert();
        refresh();
      },
    });
    say(sentence);
  }

  /** A region, or a selection, gets a color. */
  function assign(keys, colourId) {
    if (!plan || !colourId) return;
    const targets = keys.filter((k) => regionOf(k) && !isRemoved(k));
    if (targets.length === 0) return;
    const before = Object.fromEntries(
      targets.map((k) => [k, plan.assignment[k]])
    );
    const name = colourName(colourId);
    const apply = () => {
      for (const k of targets) plan.assignment[k] = colourId;
    };
    const revert = () => {
      for (const k of targets) plan.assignment[k] = before[k];
    };
    if (targets.length === 1) {
      const r = regionOf(targets[0]);
      const sentence =
        colourId === engine.UNPAINTED ? S.regionSetUnpainted(r.name) : null;
      apply();
      const plate = plateOf(targets[0]);
      revert();
      command(
        S.labelSetColour(r.name, name),
        apply,
        revert,
        sentence || S.regionSet(r.name, name, plate)
      );
    } else {
      apply();
      const plate = plateOf(targets[0]);
      revert();
      command(
        S.labelSetColours(targets.length, name),
        apply,
        revert,
        colourId === engine.UNPAINTED
          ? S.regionsSetUnpainted(targets.length)
          : S.regionsSet(targets.length, name, plate)
      );
    }
  }

  function remove(keys) {
    const targets = keys.filter((k) => regionOf(k) && !isRemoved(k));
    if (targets.length === 0) return;
    const before = Object.fromEntries(
      targets.map((k) => [k, plan.assignment[k]])
    );
    const apply = () => {
      for (const k of targets) plan.assignment[k] = engine.REMOVED;
      const next = new Set(selected);
      for (const k of targets) next.delete(k);
      selected = next;
    };
    const revert = () => {
      for (const k of targets) plan.assignment[k] = before[k];
    };
    command(
      targets.length === 1
        ? S.labelRemove(regionOf(targets[0]).name)
        : S.labelRemoveMany(targets.length),
      apply,
      revert,
      targets.length === 1
        ? S.regionRemoved(regionOf(targets[0]).name)
        : S.regionsRemoved(targets.length)
    );
  }

  function restore(keys) {
    const targets = keys.filter((k) => regionOf(k) && isRemoved(k));
    if (targets.length === 0) return;
    const base = baseId();
    const apply = () => {
      for (const k of targets) plan.assignment[k] = base;
    };
    const revert = () => {
      for (const k of targets) plan.assignment[k] = engine.REMOVED;
    };
    command(
      S.labelRestore(regionOf(targets[0]).name),
      apply,
      revert,
      S.regionRestored(regionOf(targets[0]).name)
    );
  }

  function undo() {
    const cmd = stack.undo();
    say(cmd ? cmd.undoSentence || S.undone(cmd.label) : S.nothingToUndo);
  }

  function redo() {
    const cmd = stack.redo();
    say(cmd ? S.redone(cmd.label) : S.nothingToRedo);
  }

  function updateHistoryButtons() {
    const canUndo = stack.canUndo();
    const canRedo = stack.canRedo();
    // Enable before disabling: the step that turns one off turns its partner
    // on, and a focused button that disables itself hands focus to it, not to
    // the page body. The table's Undo has no Redo beside it: the toolbar's.
    if (canUndo) undoBtn.disabled = false;
    if (canUndo) tableUndoBtn.disabled = false;
    if (canRedo) redoBtn.disabled = false;
    if (!canUndo) {
      disableKeepingFocus(undoBtn, canRedo ? redoBtn : null);
      disableKeepingFocus(tableUndoBtn, canRedo ? redoBtn : null);
    }
    if (!canRedo) disableKeepingFocus(redoBtn, canUndo ? undoBtn : null);
  }

  function setTool(id) {
    canvas.setTool(id);
    for (const [tool, el] of toolButtons) {
      el.setAttribute('aria-pressed', String(tool === canvas.getTool()));
    }
  }

  // ── The map purpose ─────────────────────────────────────────────────────

  /** Each live row's original index, in row order. */
  function originalIndices() {
    const deleted = new Set(workspace.getDeletedIndices());
    const out = [];
    for (let i = 0; i < mapElements.length; i++) {
      if (!deleted.has(i)) out.push(i);
    }
    return out;
  }

  const className = (key) =>
    isDraft && key === 'ignore'
      ? S.offOption
      : MAP_CLASSES.find((c) => c.key === key)?.name || key;

  /** A saved set of classes, by original index, laid back over the shapes. */
  function seedClasses(saved) {
    if (!saved || typeof saved !== 'object') return;
    for (const [index, key] of Object.entries(saved)) {
      const i = Number(index);
      if (!Number.isInteger(i) || key === 'ignore') continue;
      if (MAP_CLASSES.some((c) => c.key === key)) mapClasses.set(i, key);
    }
  }

  function rowNameOf(item, live) {
    return (
      item?.querySelector('.svg-prep-object-name')?.textContent ||
      `Shape ${live + 1}`
    );
  }

  /** The Class menu on every row that lacks one, the role switches hidden. */
  function ensureClassSelects() {
    const originals = originalIndices();
    refs.objects.querySelectorAll('.svg-prep-object').forEach((item) => {
      const live = parseInt(item.dataset.index, 10);
      const orig = originals[live];
      if (!Number.isInteger(orig)) return;
      const roleGroup = item.querySelector('.svg-prep-role-group');
      if (roleGroup) roleGroup.hidden = true;
      let select = item.querySelector('.drawing-editor-class-select');
      if (!select) {
        select = document.createElement('select');
        select.className = 'drawing-editor-class-select';
        for (const c of MAP_CLASSES) {
          const opt = document.createElement('option');
          opt.value = c.key;
          opt.textContent = className(c.key);
          select.appendChild(opt);
        }
        select.addEventListener('change', () => {
          const at = parseInt(select.dataset.original, 10);
          if (Number.isInteger(at)) setClass(at, select.value);
        });
        // Where the role switches stand: before them, at the row's trailing
        // edge, ahead of the row's More.
        const before = roleGroup || item.querySelector('.svg-prep-more-btn');
        if (before) item.insertBefore(select, before);
        else item.appendChild(select);
      }
      select.dataset.original = String(orig);
      select.setAttribute('aria-label', S.classFor(rowNameOf(item, live)));
      select.value = mapClasses.get(orig) || 'ignore';
    });
    paintMapCanvas();
  }

  function removeClassSelects() {
    refs.objects
      .querySelectorAll('.drawing-editor-class-select')
      .forEach((select) => select.remove());
    refs.objects.querySelectorAll('.svg-prep-role-group').forEach((group) => {
      group.hidden = false;
    });
  }

  /** Every menu to the class its shape has now; focus stays where it is. */
  function syncClassSelects() {
    refs.objects
      .querySelectorAll('.drawing-editor-class-select')
      .forEach((select) => {
        const at = parseInt(select.dataset.original, 10);
        select.value = mapClasses.get(at) || 'ignore';
      });
  }

  function nameOfOriginal(orig) {
    const live = originalIndices().indexOf(orig);
    const item =
      live >= 0
        ? refs.objects.querySelector(`.svg-prep-object[data-index="${live}"]`)
        : null;
    return item ? rowNameOf(item, live) : `Shape ${orig + 1}`;
  }

  // ── The map purpose's picture ───────────────────────────────────────────

  /** The drawing's viewBox as a bounds box, for a drawing whose shapes give none. */
  function viewBoxExtent(svgString) {
    const m = /viewBox\s*=\s*"([^"]+)"/.exec(svgString || '');
    if (!m) return null;
    const [x, y, w, h] = m[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (![x, y, w, h].every(Number.isFinite) || !(w > 0) || !(h > 0)) {
      return null;
    }
    return { minX: x, minY: y, maxX: x + w, maxY: y + h };
  }

  const asPoint = (p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p);

  /**
   * Every shape of the drawing as a region on the canvas, keyed by its
   * ORIGINAL index (the key its class travels under), over the drawing
   * itself dimmed underneath. The rings come from the same path data Apply
   * hands back, so the picture and the plan cannot disagree.
   */
  async function feedMapCanvas(svgString) {
    const token = ++openToken;
    const geometry = await import('../ring-geometry.js');
    if (token !== openToken || !isOpen || purpose !== 'map') return;
    const list = [];
    const all = [];
    mapElements.forEach((el, i) => {
      const d = el?.pathData || '';
      if (!d) return;
      let points = [];
      try {
        points = geometry.ringsFromPathData(d).flat().map(asPoint);
      } catch {
        points = [];
      }
      all.push(...points);
      const bbox = boundsOf(points);
      // The arrow keys walk by a point inside each shape; the box's middle
      // serves (a ring's true interior is not needed to tell left from right).
      const interior = bbox
        ? { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 }
        : null;
      list.push({ key: String(i), d, bbox, interior });
    });
    canvas.setView('plan');
    setTool('select');
    canvas.setDrawing(
      svgString,
      list,
      boundsOf(all) || viewBoxExtent(svgString)
    );
    paintMapCanvas();
  }

  /**
   * Each shape in its class's level color, the charm customizer's layer
   * colors (floor, symbol, top), a line class drawn as a line; a shape with
   * no class, or Off, hatched; a deleted row hatched as before.
   */
  function paintMapCanvas() {
    if (purpose !== 'map') return;
    const fills = {};
    const looks = {};
    const removed = new Set(workspace.getDeletedIndices().map(String));
    mapElements.forEach((_, i) => {
      const key = String(i);
      if (removed.has(key)) return;
      const cls = mapClasses.get(i);
      const def = cls ? MAP_CLASSES.find((c) => c.key === cls) : null;
      if (def?.level) {
        const shape = def.kind === 'line' ? 'line' : 'area';
        looks[key] = `level-${def.level}-${shape}`;
        fills[key] = `var(--drawing-editor-level-${def.level})`;
      } else {
        looks[key] =
          callbacks.features?.[i]?.kind === 'line' ? 'off-line' : 'off-area';
      }
    });
    canvas.setState({ fills, selected: new Set(), removed, looks });
  }

  /** A live row's canvas key: the shape's original index. */
  function mapKeyOfRow(item) {
    const live = parseInt(item?.dataset.index, 10);
    const orig = originalIndices()[live];
    return Number.isInteger(orig) ? String(orig) : null;
  }

  /** A shape picked on the canvas: its row into view, its Class menu focused. */
  function focusMapRow(key) {
    const orig = Number(key);
    const live = originalIndices().indexOf(orig);
    const item =
      live >= 0
        ? refs.objects.querySelector(`.svg-prep-object[data-index="${live}"]`)
        : null;
    if (!item) return;
    if (panel.hidden) setPanel(true);
    item.scrollIntoView?.({ block: 'nearest' });
    canvas.setHighlight(key);
    item.querySelector('.drawing-editor-class-select')?.focus();
  }

  /** The status line as the highlight moves: the shape and its class. */
  function describeMapHighlight(key) {
    const orig = Number(key);
    const name = nameOfOriginal(orig);
    const cls = mapClasses.get(orig);
    status.textContent = cls
      ? S.mapHighlighting(name, className(cls))
      : S.mapHighlightingUnclassed(name);
  }

  /**
   * A shape's class, as a command Undo can take back and name. The menu
   * says its own new value as the control a person just operated; Undo says
   * what came back.
   */
  function setClass(orig, next) {
    const before = mapClasses.get(orig) || 'ignore';
    if (before === next) return;
    const name = nameOfOriginal(orig);
    const write = (key) => {
      if (key === 'ignore') mapClasses.delete(orig);
      else mapClasses.set(orig, key);
      syncClassSelects();
      paintMapCanvas();
    };
    stack.run({
      label: S.labelSetClass(name, className(next)),
      do: () => write(next),
      undo: () => write(before),
      undoSentence: S.classReverted(name, className(before)),
    });
  }

  /**
   * A shape picked with the route tool: it joins the route when one of its
   * ends lies at the route's end (the host's feature points decide; a plain
   * drawing's shapes have none and only take the class), its row goes to
   * Route through the undoable class change, and the status says how long
   * the route is.
   */
  function routePick(key) {
    const orig = Number(key);
    if (route.some((r) => r.orig === orig)) {
      say(S.routeNoFit);
      return;
    }
    const feature = callbacks.features?.[orig];
    const points = Array.isArray(feature?.points) ? feature.points : null;
    if (feature && !points) {
      // A draft's area or symbol is not a segment to walk.
      say(S.routeNoFit);
      return;
    }
    let fitted = { at: 'end', points: [] };
    if (points) {
      fitted = fitRoute(
        route.map((r) => r.points),
        points
      );
      if (!fitted) {
        say(S.routeNoFit);
        return;
      }
    }
    if (!routePrev.has(orig))
      routePrev.set(orig, mapClasses.get(orig) || 'ignore');
    setClass(orig, 'route');
    if (fitted.at === 'start') route.unshift({ orig, points: fitted.points });
    else route.push({ orig, points: fitted.points });
    const meters = Math.round(
      routeLengthM(
        route.map((r) => r.points),
        Number(callbacks.mmPerM) || 0
      )
    );
    say(S.routeJoined(route.length, meters));
  }

  /** Every route row back to the class it had; each step one Undo can take back. */
  function clearRoute() {
    for (const [orig, before] of routePrev) setClass(orig, before);
    route = [];
    routePrev.clear();
    say(S.routeCleared);
  }

  /** The sentence for a tool picked: the route tool says how it works. */
  function sayTool(id) {
    say(id === 'route' ? S.routeHelp : S.toolChosen(S.tools[id]));
  }

  /**
   * Hand the host every surviving shape with its class and its rings, in
   * the drawing's own units, and say what the plan holds as the editor goes.
   */
  async function applyMap() {
    const geometry = await import('../ring-geometry.js');
    if (!isOpen || purpose !== 'map') return;
    const regions = originalIndices().map((orig) => {
      const el = mapElements[orig];
      const pathData = el?.pathData || '';
      return {
        key: `shape-${orig}`,
        index: orig,
        name: nameOfOriginal(orig),
        class: mapClasses.get(orig) || 'ignore',
        pathData,
        rings: pathData ? geometry.ringsFromPathData(pathData) : [],
      };
    });
    const n = regions.filter((r) => r.class !== 'ignore').length;
    const sentence = isDraft
      ? S.draftApplied(n, regions.length - n)
      : S.mapApplied(n, regions.length - n);
    status.textContent = sentence;
    finish('onApply', { regions, svg: currentSvg });
    // Said by the host's announcer under a source of its own, after the
    // close: the app redraws the preview as the editor goes and says so in
    // the announcer's default slot, where a sentence with no source is
    // replaced inside the hold; one with a source is said beside it.
    if (typeof announce === 'function') {
      announce(sentence, { source: 'drawing-editor' });
    }
  }

  // ── The colors section ─────────────────────────────────────────────────

  function renderSwatches() {
    const focused = document.activeElement;
    const remember =
      focused && swatchList.contains(focused)
        ? {
            action: focused.dataset.action,
            colour: focused.closest('[data-colour]')?.dataset.colour,
          }
        : null;
    swatchList.replaceChildren();
    const base = engine.BASE_COLOUR_ID;
    for (const c of plan.palette) {
      const li = document.createElement('li');
      li.className = 'drawing-editor-swatch-row';
      li.dataset.colour = c.id;
      const chip = document.createElement('span');
      chip.className = 'drawing-editor-swatch';
      chip.setAttribute('aria-hidden', 'true');
      chip.style.setProperty('--swatch', c.hex);
      const used = regions.filter(
        (r) => plan.assignment[r.key] === c.id
      ).length;
      const text = document.createElement('span');
      text.className = 'drawing-editor-swatch-text';
      text.textContent = `${c.name} (${c.hex}), ${S.usedBy(used)}`;
      const actions = document.createElement('span');
      actions.className = 'drawing-editor-swatch-actions';

      const renameBtn = button(S.rename, 'btn btn-ghost', 'rename-colour');
      renameBtn.setAttribute('aria-label', `${S.rename} ${c.name}`);
      renameBtn.addEventListener('click', () => startRename(li, c));

      const merge = document.createElement('select');
      merge.className = 'drawing-editor-merge-select';
      merge.dataset.action = 'merge-colour';
      merge.setAttribute('aria-label', `${S.mergeInto}: ${c.name}`);
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = S.mergeInto;
      merge.appendChild(placeholder);
      for (const other of plan.palette) {
        if (other.id === c.id) continue;
        const opt = document.createElement('option');
        opt.value = other.id;
        opt.textContent = other.name;
        merge.appendChild(opt);
      }
      merge.addEventListener('change', () => {
        if (merge.value) mergeColour(c.id, merge.value);
      });

      const removeBtn = button(
        S.removeColour,
        'btn btn-ghost',
        'remove-colour'
      );
      removeBtn.setAttribute('aria-label', S.removeColourLabel(c.name));
      removeBtn.addEventListener('click', () => removeColour(c.id));

      // The base coat cannot be merged away or removed: plate 1 is where it
      // is sprayed, and a line drawing's outline plate needs it. The buttons
      // stay live and SAY so, because a dimmed button explains nothing.
      if (c.id === base && plan.lineMode !== 'shapes') {
        merge.dataset.base = 'true';
        removeBtn.dataset.base = 'true';
      }
      actions.append(renameBtn, merge, removeBtn);
      li.append(chip, text, actions);
      swatchList.appendChild(li);
    }
    if (remember) {
      const again = swatchList.querySelector(
        `[data-colour="${escapeAttr(remember.colour || '')}"] [data-action="${remember.action}"]`
      );
      if (again) again.focus();
    }
  }

  function startRename(li, colour) {
    const text = li.querySelector('.drawing-editor-swatch-text');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'drawing-editor-rename-input';
    input.value = colour.name;
    input.setAttribute('aria-label', S.renameLabel(colour.name));
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const next = input.value.trim();
      if (next && next !== colour.name) renameColour(colour.id, next);
      else renderSwatches();
      swatchList
        .querySelector(
          `[data-colour="${escapeAttr(colour.id)}"] [data-action="rename-colour"]`
        )
        ?.focus();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        done = true;
        renderSwatches();
        swatchList
          .querySelector(
            `[data-colour="${escapeAttr(colour.id)}"] [data-action="rename-colour"]`
          )
          ?.focus();
      }
    });
    input.addEventListener('blur', commit);
    text.replaceWith(input);
    input.focus();
    input.select();
  }

  function renameColour(id, name) {
    const colour = plan.palette.find((c) => c.id === id);
    if (!colour) return;
    const from = colour.name;
    command(
      S.labelRename(from, name),
      () => {
        colour.name = name;
      },
      () => {
        colour.name = from;
      },
      S.colourRenamed(from, name)
    );
  }

  function mergeColour(fromId, intoId) {
    const from = plan.palette.find((c) => c.id === fromId);
    const into = plan.palette.find((c) => c.id === intoId);
    if (!from || !into || from === into) return;
    if (fromId === engine.BASE_COLOUR_ID && plan.lineMode !== 'shapes') {
      say(S.baseStays);
      renderSwatches();
      return;
    }
    const moved = regions
      .filter((r) => plan.assignment[r.key] === fromId)
      .map((r) => r.key);
    const index = plan.palette.indexOf(from);
    const orderIndex = plan.order.indexOf(fromId);
    command(
      S.labelMerge(from.name, into.name),
      () => {
        for (const k of moved) plan.assignment[k] = intoId;
        plan.palette.splice(plan.palette.indexOf(from), 1);
        plan.order = plan.order.filter((c) => c !== fromId);
      },
      () => {
        for (const k of moved) plan.assignment[k] = fromId;
        plan.palette.splice(index, 0, from);
        if (orderIndex >= 0) plan.order.splice(orderIndex, 0, fromId);
      },
      S.colourMerged(from.name, into.name, moved.length)
    );
  }

  function removeColour(id) {
    const colour = plan.palette.find((c) => c.id === id);
    if (!colour) return;
    if (id === engine.BASE_COLOUR_ID && plan.lineMode !== 'shapes') {
      say(S.baseStays);
      return;
    }
    const fallback = plan.palette.find((c) => c.id !== id)?.id;
    if (!fallback) return;
    const moved = regions
      .filter((r) => plan.assignment[r.key] === id)
      .map((r) => r.key);
    const index = plan.palette.indexOf(colour);
    const orderIndex = plan.order.indexOf(id);
    command(
      S.labelRemoveColour(colour.name),
      () => {
        for (const k of moved) plan.assignment[k] = fallback;
        plan.palette.splice(plan.palette.indexOf(colour), 1);
        plan.order = plan.order.filter((c) => c !== id);
      },
      () => {
        for (const k of moved) plan.assignment[k] = id;
        plan.palette.splice(index, 0, colour);
        if (orderIndex >= 0) plan.order.splice(orderIndex, 0, id);
      },
      S.colourRemoved(colour.name, moved.length, colourName(fallback))
    );
  }

  addColourForm.form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!engine || !plan) return;
    const hex = String(addColourForm.hex.value || '').toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex)) return;
    const taken = new Set(plan.palette.map((c) => c.name));
    let name = String(addColourForm.name.value || '').trim();
    if (!name) {
      // No name given: the color's own plain-language name, numbered when
      // the palette already has one of those (two swatches must not share).
      const label = engine.colourLabel(hex);
      name = label;
      for (let n = 2; taken.has(name); n++) name = `${label} ${n}`;
    }
    let n = plan.palette.length + 1;
    while (plan.palette.some((c) => c.id === `colour-${n}`)) n++;
    const colour = { id: `colour-${n}`, name, hex };
    addColourForm.name.value = '';
    command(
      S.labelAddColour(name),
      () => {
        plan.palette.push(colour);
        plan.order.push(colour.id);
        paintSelect.value = colour.id;
      },
      () => {
        plan.palette = plan.palette.filter((c) => c !== colour);
        plan.order = plan.order.filter((c) => c !== colour.id);
        for (const r of regions) {
          if (plan.assignment[r.key] === colour.id)
            plan.assignment[r.key] = baseId();
        }
      },
      S.colourAdded(name)
    );
    paintSelect.value = colour.id;
  });

  // ── The plates section ──────────────────────────────────────────────────

  function renderPlates(cuts) {
    const focused = document.activeElement;
    const remember =
      focused && platesList.contains(focused)
        ? {
            action: focused.dataset.action,
            colour: focused.closest('[data-colour]')?.dataset.colour,
          }
        : null;
    platesList.replaceChildren();
    const groundFixed = plan.lineMode !== 'shapes' && silhouette?.length > 0;
    cuts.forEach((cut, k) => {
      const li = document.createElement('li');
      li.dataset.colour = cut.colourId;
      const isGround = k === 0 && groundFixed;
      const mine = regions.filter(
        (r) => plan.assignment[r.key] === cut.colourId
      ).length;
      const text = document.createElement('span');
      text.textContent = isGround
        ? S.plateGround(k + 1, colourName(cut.colourId))
        : S.plateLine(
            k + 1,
            colourName(cut.colourId),
            mine,
            cut.islands.length
          );
      const earlier = button(S.paintEarlier, 'btn btn-ghost', 'paint-earlier');
      earlier.setAttribute(
        'aria-label',
        S.orderFor(colourName(cut.colourId), S.paintEarlier)
      );
      const later = button(S.paintLater, 'btn btn-ghost', 'paint-later');
      later.setAttribute(
        'aria-label',
        S.orderFor(colourName(cut.colourId), S.paintLater)
      );
      // The ground plate stays first: the outline is sprayed before anything.
      earlier.disabled = k === 0 || (groundFixed && k === 1);
      later.disabled = k === cuts.length - 1 || isGround;
      earlier.addEventListener('click', () => moveInOrder(k, k - 1));
      later.addEventListener('click', () => moveInOrder(k, k + 1));
      const actions = document.createElement('span');
      actions.className = 'drawing-editor-plate-actions';
      actions.append(earlier, later);
      li.append(text, actions);
      platesList.appendChild(li);
    });
    if (remember) {
      const row = platesList.querySelector(
        `[data-colour="${escapeAttr(remember.colour || '')}"]`
      );
      const again = row?.querySelector(`[data-action="${remember.action}"]`);
      // At the end of the order the same button is off now (focus() on it
      // does nothing): its partner moves the plate back.
      const target =
        again && !again.disabled
          ? again
          : row?.querySelector('[data-action^="paint-"]:not(:disabled)');
      target?.focus();
    }
  }

  function moveInOrder(from, to) {
    if (to < 0 || to >= plan.order.length || from === to) return;
    const id = plan.order[from];
    command(
      S.labelOrder(colourName(id), to + 1),
      () => {
        plan.order.splice(from, 1);
        plan.order.splice(to, 0, id);
      },
      () => {
        plan.order.splice(to, 1);
        plan.order.splice(from, 0, id);
      },
      S.orderChanged(colourName(id), to + 1)
    );
  }

  ruleField.input.addEventListener('change', () => {
    const stacked = ruleField.input.checked;
    const before = plan.rule;
    command(
      S.labelRule(stacked),
      () => {
        plan.rule = stacked ? 'stacked' : 'own';
      },
      () => {
        plan.rule = before;
      },
      stacked ? S.ruleStacked : S.ruleOwn
    );
  });

  /**
   * How many loose pieces a plate lists in full. A traced picture can leave
   * hundreds of loose pieces on a plate, and listing every one is a wall
   * nobody can walk with a screen reader, so each plate shows its largest few
   * and counts the rest; the section's count stays true.
   */
  const ISLAND_LIST_CAP = 8;

  function renderIslands(cuts) {
    islandsList.replaceChildren();
    cuts.forEach((cut, k) => {
      const shown = cut.islands.slice(0, ISLAND_LIST_CAP);
      const rest = cut.islands.length - shown.length;
      for (const island of shown) {
        const li = document.createElement('li');
        const where = island.regionNames.length
          ? island.regionNames.join(', ')
          : `${Math.round(island.area)} units`;
        li.textContent = engine.ISLAND_SENTENCE.replace(
          '{plate}',
          String(k + 1)
        ).replace('{region}', where);
        const remedies = document.createElement('ul');
        for (const code of island.remedies) {
          const r = document.createElement('li');
          r.textContent = engine.REMEDY_SENTENCES[code].replace(
            '{color}',
            colourName(cut.colourId)
          );
          remedies.appendChild(r);
        }
        li.appendChild(remedies);
        islandsList.appendChild(li);
      }
      if (rest > 0) {
        const more = document.createElement('li');
        more.className = 'drawing-editor-islands-more';
        more.textContent = S.moreIslands(k + 1, rest);
        islandsList.appendChild(more);
      }
    });
  }

  // ── Toolbar and keyboard ────────────────────────────────────────────────

  for (const [id, el] of toolButtons) {
    el.addEventListener('click', () => {
      setTool(id);
      sayTool(id);
    });
  }
  clearRouteBtn.addEventListener('click', () => clearRoute());
  paintSelectionBtn.addEventListener('click', () => {
    if (selected.size === 0) {
      say(S.nothingSelected);
      return;
    }
    assign([...selected], paintSelect.value);
  });
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  tableUndoBtn.addEventListener('click', undo);
  fitBtn.addEventListener('click', () => canvas.fit());
  zoomInBtn.addEventListener('click', () => canvas.zoomIn());
  zoomOutBtn.addEventListener('click', () => canvas.zoomOut());
  panelToggleBtn.addEventListener('click', () => setPanel(panel.hidden));
  // The skip link's promise holds with the drawer closed: it opens the
  // drawer on its way there.
  skipToTable.addEventListener('click', () => {
    if (panel.hidden) setPanel(true);
  });

  /**
   * Up and Down walk the table a row at a time, staying in the same column,
   * and the canvas highlight follows. Home and End go to the ends.
   */
  function handleTableKeys(event) {
    const cell = event.target.closest?.('td, th');
    const tr = event.target.closest?.('tr[data-region]');
    if (!cell || !tr || !regionsBlock.contains(tr)) return false;
    const step = { ArrowUp: -1, ArrowDown: 1, Home: -Infinity, End: Infinity }[
      event.key
    ];
    if (step === undefined) return false;
    // A select opens on Up/Down of its own; leave that to it unless the
    // person is walking with Home/End.
    if (event.target.tagName === 'SELECT' && Math.abs(step) === 1) return false;
    const all = [...regionsBlock.querySelectorAll('tbody tr[data-region]')];
    const at = all.indexOf(tr);
    const to =
      step === -Infinity ? 0 : step === Infinity ? all.length - 1 : at + step;
    if (to < 0 || to >= all.length) return true;
    const column = [...tr.children].indexOf(cell);
    const target = all[to].children[column]?.querySelector(
      'input, select, button'
    );
    if (!target) return true;
    event.preventDefault();
    event.stopPropagation();
    target.focus();
    return true;
  }

  root.addEventListener('focusin', (event) => {
    const tr = event.target.closest?.('tr[data-region]');
    if (tr && regionsBlock.contains(tr) && plan) {
      // A keyboard arrival: the highlight pulses, then settles.
      canvas.setHighlight(tr.dataset.region, { pulse: true });
      describeHighlight(tr.dataset.region);
    }
    if (purpose === 'map') {
      const item = event.target.closest?.('.svg-prep-object');
      const key =
        item && refs.objects.contains(item) ? mapKeyOfRow(item) : null;
      if (key) canvas.setHighlight(key, { pulse: true });
    }
  });

  // A pointer over a shape's row lights the shape on the canvas; off the
  // row, the light goes.
  refs.objects.addEventListener('pointerover', (event) => {
    if (purpose !== 'map') return;
    const item = event.target.closest?.('.svg-prep-object');
    const key = item ? mapKeyOfRow(item) : null;
    if (key) canvas.setHighlight(key);
  });
  refs.objects.addEventListener('pointerout', (event) => {
    if (purpose !== 'map') return;
    const item = event.target.closest?.('.svg-prep-object');
    if (item && !item.contains(event.relatedTarget)) canvas.clearHighlight();
  });

  // Every shortcut the editor takes is stopped here. Otherwise Ctrl+Z inside
  // the editor also reaches the app's own undo, which puts the customizer's
  // parameters back a step and rebuilds the file control under the editor's
  // feet.
  root.addEventListener('keydown', (event) => {
    if (purpose === 'map') {
      // On the canvas: plus and minus zoom, 0 fits the whole drawing, V and H
      // pick the Select and the Hand tool.
      if (event.target === canvas.svg && !event.ctrlKey && !event.metaKey) {
        const zoom = { '+': 'in', '=': 'in', '-': 'out', 0: 'fit' }[event.key];
        if (zoom) {
          event.preventDefault();
          event.stopPropagation();
          if (zoom === 'in') canvas.zoomIn();
          else if (zoom === 'out') canvas.zoomOut();
          else canvas.fit();
          return;
        }
        const tool = { v: 'select', h: 'hand', w: 'route' }[
          event.key.toLowerCase()
        ];
        if (tool) {
          event.preventDefault();
          event.stopPropagation();
          setTool(tool);
          sayTool(tool);
          return;
        }
      }
      // Undo and Redo only: the workspace keeps Delete and Ctrl+A on its
      // rows, and the menus keep their own keys.
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || isTextField(event.target)) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      event.preventDefault();
      event.stopPropagation();
      if (key === 'y' || event.shiftKey) redo();
      else undo();
      return;
    }
    if (purpose !== 'stencil' || !plan) return;
    if (handleTableKeys(event)) return;
    const target = event.target;
    const inText = isTextField(target);
    const mod = event.ctrlKey || event.metaKey;

    if (mod && !inText && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && !inText && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      event.stopPropagation();
      redo();
      return;
    }
    if (mod && !inText && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      event.stopPropagation();
      setSelection(
        new Set(regions.filter((r) => !isRemoved(r.key)).map((r) => r.key))
      );
      announceSelection();
      return;
    }
    if (mod || event.altKey || inText) return;
    if (target.tagName === 'SELECT') return;

    if (NUMBER_KEYS.test(event.key)) {
      if (selected.size === 0) {
        say(S.nothingSelected);
        return;
      }
      const id =
        event.key === '0' ? baseId() : plan.palette[Number(event.key) - 1]?.id;
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      assign([...selected], id);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (
        target.type === 'checkbox' ||
        target === canvas.svg ||
        target.closest?.('tr[data-region]')
      ) {
        if (selected.size === 0) {
          say(S.nothingSelected);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        remove([...selected]);
      }
      return;
    }
    const tool = TOOLS.find((t) => t.key === event.key.toLowerCase());
    if (tool) {
      event.preventDefault();
      event.stopPropagation();
      setTool(tool.id);
      sayTool(tool.id);
    }
  });

  // ── Leaving ─────────────────────────────────────────────────────────────

  applyBtn.addEventListener('click', () => {
    if (purpose === 'map') {
      applyMap().catch((err) => {
        console.error('[Drawing editor] the map plan could not be built:', err);
        say(S.engineFailed);
      });
      return;
    }
    // The plan goes with the drawing as it is: the plates are cut from the
    // original and the plan, never from a flatten.
    finish('onApply', currentSvg);
  });

  closeBtn.addEventListener('click', () => {
    // Closing without Apply or Keep changes nothing: what the model holds is
    // what it keeps, whether that is the original or a design applied earlier.
    leave();
  });

  // Capture phase, so this runs before the workspace's own Escape handler and
  // the one gesture takes one path. A marquee in progress is canceled first,
  // and that Escape goes no further.
  root.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !isOpen) return;
      // Already spent. The focus trap listens on the document in this same
      // phase, so it reaches the press before this does and calls
      // preventDefault before its own handler runs - and it does not stop the
      // event. Without this, one Escape would shut a row's menu in the trap and
      // then close the whole editor here.
      if (event.defaultPrevented) return;
      // The crop view is the innermost thing open.
      if (cropPanel.isOpen()) {
        event.preventDefault();
        event.stopPropagation();
        cropPanel.cancel();
        return;
      }
      if (canvas.isDragging()) {
        event.preventDefault();
        event.stopPropagation();
        canvas.cancelDrag();
        return;
      }
      // Same rule as the marquee: the innermost thing in progress is what
      // Escape ends, and that press goes no further.
      if (closeToolbarMore() || workspace.closeOpenMenu?.()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.target.classList?.contains('drawing-editor-rename-input')) {
        return;
      }
      // The drawer does not intercept Escape: Escape from anywhere inside takes
      // one path, and the drawer's own way shut is its toggle.
      event.preventDefault();
      event.stopPropagation();
      leave();
    },
    true
  );

  updateHistoryButtons();

  /** Close without a verdict: no callback, the workspace dropped as it is. */
  function dismissSurface() {
    if (!isOpen) return;
    isOpen = false;
    callbacks = {};
    workspace.dismiss();
    teardown();
  }

  return {
    open,
    openEmpty,
    close: () => leave(),
    dismiss: dismissSurface,
    setCount,
    say,
    /** Resolves once the workspace's ring engine is in. */
    whenReady: () => workspace.whenReady(),
    setDesignWidthMm: (mm) => workspace.setDesignWidthMm(mm),
    /** Whether the crop view is what is on the stage. */
    isCropOpen: () => cropPanel.isOpen(),
    /** Whether the editor is open on a picture, before a conversion. */
    isCropFirst: () => isOpen && cropFirst,
    getResult: () => workspace.getResult(),
    /** The key the result on screen would be trusted by on a reopen. */
    choicesKey: () => workspace.choicesKey(),
    getRoleOverrides: () => workspace.getRoleOverrides(),
    getOffsetOverrides: () => workspace.getOffsetOverrides(),
    getDeletedIndices: () => workspace.getDeletedIndices(),
    getLayerAssignments: () => workspace.getLayerAssignments(),
    /** The color plan, as a saved project can hold it; null for relief. */
    getPlan: () =>
      purpose === 'stencil' && engine && plan
        ? engine.serialisePlan(plan, regions)
        : null,
    /** The map purpose's classes by original index; null on the others. */
    getMapClasses: () =>
      purpose === 'map' ? Object.fromEntries(mapClasses) : null,
    /** The selection and the tool, for a spec that wants to read them. */
    getSelection: () => [...selected],
    getTool: () => canvas.getTool(),
    getView: () => canvas.getView(),
    getPlateIndex: () => plateIndex,
    stepPlate,
    setTool,
    undo,
    redo,
    destroy: () => {
      dismissSurface();
      rowsObserver?.disconnect();
      canvas.destroy();
      workspace.destroy();
      root.remove();
    },
    isOpen: () => isOpen,
    _root: root,
    _workspace: workspace,
    _canvas: canvas,
    _sections: sections,
    _stack: stack,
  };
}

/** Name + color + button: the smallest thing that adds a swatch. */
function buildAddColourForm(uid) {
  const form = document.createElement('form');
  form.className = 'drawing-editor-add-colour';
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = S.addColourLegend;

  const nameLabel = document.createElement('label');
  nameLabel.htmlFor = `drawingEditorColourName-${uid}`;
  nameLabel.textContent = S.addColourName;
  const name = document.createElement('input');
  name.type = 'text';
  name.id = nameLabel.htmlFor;
  name.autocomplete = 'off';

  const hexLabel = document.createElement('label');
  hexLabel.htmlFor = `drawingEditorColourHex-${uid}`;
  hexLabel.textContent = S.addColourHex;
  const hex = document.createElement('input');
  hex.type = 'color';
  hex.id = hexLabel.htmlFor;
  hex.value = '#8b5a2b';

  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'btn btn-secondary';
  button.textContent = S.addColourButton;

  fieldset.append(legend, nameLabel, name, hexLabel, hex, button);
  form.appendChild(fieldset);
  return { form, name, hex, button };
}

/** The plate rule as one checkbox with its help beside it. */
function buildRuleField(uid) {
  const wrap = document.createElement('div');
  wrap.className = 'drawing-editor-rule';
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = true;
  input.id = `drawingEditorRule-${uid}`;
  const help = document.createElement('p');
  help.className = 'drawing-editor-rule-help';
  help.id = `drawingEditorRuleHelp-${uid}`;
  help.textContent = S.ruleHelp;
  input.setAttribute('aria-describedby', help.id);
  label.append(input, document.createTextNode(` ${S.ruleLabel}`));
  wrap.append(label, help);
  return { wrap, input };
}
