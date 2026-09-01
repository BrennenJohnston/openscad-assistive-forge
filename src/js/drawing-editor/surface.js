/**
 * The drawing editor, where the preview lives.
 *
 * The owner's complaint about the old one was structural rather than cosmetic:
 * it was a block nested inside the customizer's file control, a long flat list
 * with no shape to it, and the preview was a before-and-after pair. So this is
 * a SURFACE. It takes the whole preview area - the biggest thing on the page,
 * and on a phone the only thing - the way the 2D preview does, with a toolbar
 * across the top, the drawing in the middle, and a side panel of collapsible
 * sections beside it.
 *
 * ★ WHAT THIS IS NOT: a rewrite of the editing itself. The roles, the layer
 * column, the delete-and-undo keyed by original index, the tiers, the manual
 * render, the announcements and the persistence are all
 * `svg-preparer-workspace.js`, which is 2,100 lines with 3,200 lines of tests
 * on it, and it is MOUNTED here rather than re-derived. Its pieces are then
 * put where the surface wants them - the shape list and the warnings in the
 * side panel, the Apply/Save/Keep buttons in the toolbar - by moving the
 * nodes, which keeps every listener the workspace attached to them. Deriving
 * it again would have spent the round's remaining time re-earning behaviour
 * the owner already has, and the way to lose a pinned behaviour is to write
 * it twice. The surface is new; what happens inside it is the tested thing.
 * To reverse: build the table into this file and delete the mount.
 *
 * ★ THE CUSTOMIZER STAYS REACHABLE. Focus is trapped only when the editor is
 * opened from the no-model door, where there is nothing behind it to reach.
 * Opened over the preview, a person can Tab straight out into the parameters,
 * which is the owner's "way out" and the reason the surface is a region rather
 * than a dialog.
 *
 * Two purposes on the one component:
 *   relief   the charm tiles: the workspace's own Foreground / Hole / Ignore
 *            rows, layers and offsets, exactly as before, in the Regions
 *            section.
 *   stencil  the Harley law (stencil-colours.js): the drawing's REGIONS, each
 *            with a colour, the palette, the plates in paint order and the
 *            loose pieces each plate would leave. The colour engine is a lazy
 *            chunk and arrives after the surface does. DP-20 gave it the
 *            tools: a canvas a person can point at, a table a person can walk
 *            with the arrow keys, and an Undo that says what came back. The
 *            two are ONE selection: ticking a row and clicking a region do
 *            the same thing by the same path.
 *
 * This file is `surface.js` and not `index.js` for a reason that is worth a
 * line: a chunk is named after its module, and an `index.js` here became an
 * `index-<hash>.js` in the build, which the bundle budget counts as the app's
 * own entry chunk. The editor is lazy; its name has to say so.
 *
 * @license GPL-3.0-or-later
 */

import { createSvgPrepWorkspace } from '../svg-preparer-workspace.js';
import { createDocumentFocusTrap } from '../focus-trap.js';
import { parseSvgElements, classifyElements } from '../svg-preparer.js';
import { boundsOf } from '../svg-nesting.js';
import { EDITOR_STRINGS as S } from './strings.js';
import { createCommandStack } from './undo.js';
import { createRegionCanvas, TOOLS } from './canvas.js';

/** The colour engine, loaded once, on the first stencil open. */
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

/** A value made safe inside an attribute selector; jsdom has no CSS.escape. */
const escapeAttr = (value) => String(value).replace(/["\\]/g, '\\$&');

/** Keys that colour the selection: 1-8 the palette, 0 the base. */
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
 * @param {Function} [args.announce] - Polite live-region announcer
 * @returns {object} The workspace's own contract, plus the surface's
 */
export function createDrawingEditor({
  surfaceEl,
  fullscreen = false,
  onOpen = null,
  onClose = null,
  announce = null,
}) {
  const uid = ++instances;
  const titleId = `drawingEditorTitle-${uid}`;
  const panelId = `drawingEditorPanel-${uid}`;
  const canvasLabelId = `drawingEditorCanvasLabel-${uid}`;

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

  // The tools (DP-20). Visible text, the key in the accessible name.
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

  // The view (DP-21): the untouched drawing or the plan over it, and one
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
  // row. MEASURED at a 1280 window: the toolbar's real width is 692 px (the
  // editor shares the window with the customizer) and the groups sum to
  // 1,705 px, so two rows cannot hold them - the honest structure is three
  // NAMED rows, none of which wraps.
  stencilTools.append(toolsGroup, paintGroup);
  stencilTools.hidden = true;
  viewGroup.hidden = true;
  zoomGroup.hidden = true;
  historyGroup.hidden = true;

  const viewControls = document.createElement('div');
  viewControls.className = 'drawing-editor-view-controls';

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

  // G0 (DP-24): the picture is the editor; the side panel is a drawer over
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

  // What the tints mean, in words beside each swatch: colour is never the
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

  body.append(stage, panel);
  // Two rows at desktop width instead of one long wrap (G0 named the
  // four-row toolbar at 1280): the actions row a person finishes with, and
  // the working-tools row they live in.
  const toolbarHeaderRow = document.createElement('div');
  toolbarHeaderRow.className =
    'drawing-editor-toolbar-row drawing-editor-toolbar-row--header';
  const toolbarViewRow = document.createElement('div');
  toolbarViewRow.className =
    'drawing-editor-toolbar-row drawing-editor-toolbar-row--view';
  const toolbarToolsRow = document.createElement('div');
  toolbarToolsRow.className =
    'drawing-editor-toolbar-row drawing-editor-toolbar-row--tools';
  toolbarHeaderRow.append(title, panelToggleBtn, applyBtn, closeBtn);
  toolbarViewRow.append(viewGroup, zoomGroup, historyGroup, viewControls);
  toolbarToolsRow.append(stencilTools);
  toolbar.append(toolbarHeaderRow, toolbarViewRow, toolbarToolsRow);
  root.append(skipToTable, toolbar, status, body);
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
  // Apply / Save / Keep original / Reset: the workspace's footer IS the
  // action row, listeners and all, so it moves whole.
  toolbarHeaderRow.insertBefore(refs.footer, applyBtn);
  const shapesBlock = document.createElement('div');
  shapesBlock.className = 'drawing-editor-shapes';
  shapesBlock.append(refs.layerSummary, refs.bulkBar, refs.objects);
  sections.regions.content.append(shapesBlock, regionsBlock);
  sections.warnings.content.append(refs.warnings, islandsList);

  // The region canvas lives in the stage beside the workspace's panes and
  // shows for the stencil purpose, where the panes hide.
  stage.appendChild(canvasLabel);
  const canvas = createRegionCanvas({
    container: stage,
    labelId: canvasLabelId,
    on: {
      onClick: (key, shift) => {
        if (shift) toggleSelected(key);
        else setSelection(new Set([key]));
        announceSelection();
      },
      onEmptyClick: (shift) => {
        if (shift || selected.size === 0) return;
        setSelection(new Set());
        announceSelection();
      },
      onMarquee: (keys, shift) => {
        const next = shift ? new Set(selected) : new Set();
        for (const k of keys) next.add(k);
        setSelection(next);
        announceSelection();
      },
      onPaint: (key) => assign([key], paintSelect.value),
      onRemove: (key) => remove([key]),
      onHighlight: (key) => describeHighlight(key),
      onToggle: (key) => {
        toggleSelected(key);
        announceSelection();
      },
      onOpenColour: (key) => {
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
  stage.appendChild(legend);

  let isOpen = false;
  let purpose = 'relief';
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
  // The view (DP-21): the plan or the original, and which plate, if any.
  let showingOriginal = false;
  let plateIndex = -1;

  const say = (message) => {
    if (!message) return;
    status.textContent = message;
    if (typeof announce === 'function') announce(message);
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
  }

  function hide() {
    surfaceEl.hidden = true;
    surfaceEl.classList.add('hidden');
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
    hide();
    status.textContent = '';
    if (typeof onClose === 'function') onClose(surfaceEl);
    if (fullscreen && previousFocus?.focus) previousFocus.focus();
    previousFocus = null;
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
  function open(svgString, analysis, options = {}) {
    const {
      purpose: askedPurpose,
      openedSentence,
      initialPlan: savedPlan,
      ...rest
    } = options;
    const reopening = isOpen;
    callbacks = rest;
    purpose = askedPurpose === 'stencil' ? 'stencil' : 'relief';
    root.dataset.purpose = purpose;
    isOpen = true;
    currentSvg = svgString;
    initialPlan = savedPlan || null;
    show();

    // The workspace resolves Apply and Keep itself; the surface only has to
    // give the area back afterwards, and it does that in `finish`.
    workspace.open(svgString, analysis, {
      ...rest,
      hosted: true,
      onApply: (...args) => finish('onApply', ...args),
      onKeepOriginal: (...args) => finish('onKeepOriginal', ...args),
    });

    applyPurpose();
    setCount('warnings', analysis?.warnings?.length || null);

    if (purpose === 'stencil') {
      setCount('regions', null);
      setCount('colours', null);
      setCount('plates', null);
      status.textContent = S.findingRegions;
      buildStencil(svgString, openedSentence || S.opened);
    } else {
      setCount('regions', analysis?.elements?.length ?? null);
      say(openedSentence || S.opened);
    }

    if (reopening) return;
    if (typeof onOpen === 'function') onOpen(surfaceEl);
    previousFocus = document.activeElement;
    if (fullscreen) {
      // The screen is the editor now, so Tab stays inside it and Escape is
      // the way out. Over the preview there is no trap: the customizer is
      // one Tab away on purpose.
      trap = createDocumentFocusTrap(root, {
        onEscape: () => finish('onKeepOriginal'),
      });
      trap.activate({ initialFocus: title, initialFocusDelay: 0 });
    }
    title.focus();
  }

  /** Show what this purpose needs and nothing it does not. */
  function applyPurpose() {
    const stencil = purpose === 'stencil';
    // G0 (DP-24): the picture is the editor. The stencil purpose starts with
    // the drawer closed - the canvas and the paint tools carry the task; the
    // relief purpose starts with it open - the shape list IS the hands.
    setPanel(!stencil);
    sections.colours.details.hidden = !stencil;
    sections.plates.details.hidden = !stencil;
    regionsBlock.hidden = !stencil;
    shapesBlock.hidden = stencil;
    stencilTools.hidden = !stencil;
    viewGroup.hidden = !stencil;
    zoomGroup.hidden = !stencil;
    historyGroup.hidden = !stencil;
    canvas.root.hidden = !stencil;
    legend.hidden = !stencil;
    applyBtn.hidden = !stencil;
    // Roles, offsets, the design width and the before/after panes are the
    // relief purpose's vocabulary: a stencil region has a colour, not a
    // role, and the plate's size is a parameter beside the editor.
    refs.rolesToggleBtn.hidden = stencil;
    refs.compareBtn.hidden = stencil;
    refs.designWidthGroup.hidden = stencil || refs.designWidthGroup.hidden;
    refs.legendRow.hidden = stencil || refs.legendRow.hidden;
    refs.previews.hidden = stencil;
    // The stencil purpose applies its plan with its own button; the
    // workspace's Apply, Save and Reset act on the flatten, which the plates
    // do not use.
    refs.applyBtn.hidden = stencil || refs.applyBtn.hidden;
    refs.applyHint.hidden = stencil || refs.applyHint.hidden;
    refs.saveBtn.hidden = stencil || refs.saveBtn.hidden;
    refs.saveDxfBtn.hidden = stencil || refs.saveDxfBtn.hidden;
    refs.resetBtn.hidden = stencil;
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
      console.error('[Drawing editor] colour engine failed to load:', err);
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

  /** The plate a region's colour is painted with, 1-based, or 0 for none. */
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

  // ── The view: the toggle and the plate stepper (DP-21) ──────────────────

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
    prevPlateBtn.disabled = n === 0 || plateIndex < 0;
    nextPlateBtn.disabled = n === 0 || plateIndex >= n - 1;
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
   * ★ Unpainted only where it can be true. In a line drawing plate 1 is
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

  /** A region, or a selection, gets a colour. */
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
    say(cmd ? S.undone(cmd.label) : S.nothingToUndo);
  }

  function redo() {
    const cmd = stack.redo();
    say(cmd ? S.redone(cmd.label) : S.nothingToRedo);
  }

  function updateHistoryButtons() {
    undoBtn.disabled = !stack.canUndo();
    redoBtn.disabled = !stack.canRedo();
    tableUndoBtn.disabled = !stack.canUndo();
  }

  function setTool(id) {
    canvas.setTool(id);
    for (const [tool, el] of toolButtons) {
      el.setAttribute('aria-pressed', String(tool === canvas.getTool()));
    }
  }

  // ── The colours section ─────────────────────────────────────────────────

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
      // No name given: the colour's own plain-language name, numbered when
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
      const again = platesList.querySelector(
        `[data-colour="${escapeAttr(remember.colour || '')}"] [data-action="${remember.action}"]`
      );
      if (again) again.focus();
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
   * How many loose pieces a plate lists in full. MEASURED on the cat PNG
   * traced at seven colours: the masks do not tile, and 567 sliver gaps
   * between them are honest islands - 236 on plate 1 alone. Listing every
   * one is a wall nobody can walk with a screen reader, so each plate shows
   * its largest few and counts the rest; the section's count stays true.
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
            '{colour}',
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
      say(S.toolChosen(S.tools[id]));
    });
  }
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
  // The skip link's promise ("skip to the regions table") holds with the
  // drawer closed: it opens the drawer on its way there.
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
      // A keyboard arrival: the highlight pulses, then settles (DP-21).
      canvas.setHighlight(tr.dataset.region, { pulse: true });
      describeHighlight(tr.dataset.region);
    }
  });

  // ★ Every shortcut the editor takes is STOPPED here. MEASURED: Ctrl+Z
  // inside the editor also reached the app's own undo, which put the
  // customizer's parameters back a step and rebuilt the file control under
  // the editor's feet.
  root.addEventListener('keydown', (event) => {
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
      say(S.toolChosen(S.tools[tool.id]));
    }
  });

  // ── Leaving ─────────────────────────────────────────────────────────────

  applyBtn.addEventListener('click', () => {
    // The plan goes with the drawing as it is: the plates are cut from the
    // original and the plan, never from a flatten.
    finish('onApply', currentSvg);
  });

  closeBtn.addEventListener('click', () => {
    // Closing without Apply or Keep means the original stands: never silently
    // replaced by an auto-prepared version.
    finish('onKeepOriginal');
  });

  // Capture phase, so this runs before the workspace's own Escape handler and
  // the one gesture takes one path. A marquee in progress is cancelled first,
  // and that Escape goes no further.
  root.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !isOpen) return;
      if (canvas.isDragging()) {
        event.preventDefault();
        event.stopPropagation();
        canvas.cancelDrag();
        return;
      }
      if (event.target.classList?.contains('drawing-editor-rename-input')) {
        return;
      }
      // The drawer does NOT intercept Escape: "Escape from anywhere inside
      // takes one path" is pinned behaviour the owner already has, and the
      // drawer's own way shut is its toggle.
      event.preventDefault();
      event.stopPropagation();
      finish('onKeepOriginal');
    },
    true
  );

  updateHistoryButtons();

  return {
    open,
    close: () => finish('onKeepOriginal'),
    dismiss: () => {
      if (!isOpen) return;
      isOpen = false;
      callbacks = {};
      workspace.dismiss();
      teardown();
    },
    setCount,
    say,
    /** D-120: resolves once the workspace's ring engine is in. */
    whenReady: () => workspace.whenReady(),
    getResult: () => workspace.getResult(),
    getRoleOverrides: () => workspace.getRoleOverrides(),
    getOffsetOverrides: () => workspace.getOffsetOverrides(),
    getDeletedIndices: () => workspace.getDeletedIndices(),
    getLayerAssignments: () => workspace.getLayerAssignments(),
    /** The colour plan, as a saved project can hold it; null for relief. */
    getPlan: () =>
      purpose === 'stencil' && engine && plan
        ? engine.serialisePlan(plan, regions)
        : null,
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
      if (isOpen) {
        isOpen = false;
        callbacks = {};
        workspace.dismiss();
        teardown();
      }
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

/** Name + colour + button: the smallest thing that adds a swatch. */
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

/** The plate rule (DP-Q18) as one checkbox with its help beside it. */
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
