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
 *            chunk and arrives after the surface does.
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
import { EDITOR_STRINGS as S } from './strings.js';

/** The colour engine, loaded once, on the first stencil open. */
let enginePromise = null;
function loadEngine() {
  if (!enginePromise) {
    enginePromise = import('../stencil-colours.js').catch((err) => {
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

  const root = document.createElement('div');
  root.className = 'drawing-editor';

  // ── The way in and out for a keyboard, before anything else ─────────────
  const skipToTable = document.createElement('a');
  skipToTable.className = 'drawing-editor-skip';
  skipToTable.href = `#${panelId}`;
  skipToTable.textContent = S.skipToRegions;

  // A plain header, not role="toolbar": that role promises arrow-key movement
  // between its controls, and nothing here implements it yet. Tab is the
  // honest contract until DP-20 brings the tools.
  const toolbar = document.createElement('div');
  toolbar.className = 'drawing-editor-toolbar';

  const title = document.createElement('h2');
  title.className = 'drawing-editor-title';
  title.id = titleId;
  title.textContent = S.title;
  // Focusable by script only, so a screen reader meets the name of the
  // surface it just arrived on and Tab is not spent on a heading.
  title.setAttribute('tabindex', '-1');

  const viewControls = document.createElement('div');
  viewControls.className = 'drawing-editor-view-controls';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-secondary drawing-editor-close';
  closeBtn.dataset.action = 'editor-close';
  closeBtn.textContent = S.close;

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

  const platesList = document.createElement('ol');
  platesList.className = 'drawing-editor-plates';

  const islandsList = document.createElement('ul');
  islandsList.className = 'drawing-editor-islands';

  sections.colours.content.append(swatchList, addColourForm.form);
  sections.plates.content.appendChild(platesList);

  body.append(stage, panel);
  toolbar.append(title, viewControls, closeBtn);
  root.append(skipToTable, toolbar, body, status);
  surfaceEl.appendChild(root);

  // ── Mount the workspace, then put its pieces where the surface wants them
  const workspace = createSvgPrepWorkspace(stage);
  const refs = workspace._refs;
  // Its own title, expand and close would duplicate the surface's.
  refs.title.hidden = true;
  refs.fullscreenBtn.hidden = true;
  refs.closeBtn.hidden = true;
  viewControls.append(refs.designWidthGroup, refs.rolesToggleBtn);
  // Apply / Save / Keep original / Reset: the workspace's footer IS the
  // action row, listeners and all, so it moves whole.
  toolbar.insertBefore(refs.footer, closeBtn);
  const shapesBlock = document.createElement('div');
  shapesBlock.className = 'drawing-editor-shapes';
  shapesBlock.append(refs.layerSummary, refs.bulkBar, refs.objects);
  sections.regions.content.append(shapesBlock, regionsBlock);
  sections.warnings.content.append(refs.warnings, islandsList);

  let isOpen = false;
  let purpose = 'relief';
  let callbacks = {};
  let trap = null;
  let previousFocus = null;
  // The stencil purpose's state, all of it.
  let engine = null;
  let regions = [];
  let silhouette = null;
  let plan = null;
  let openToken = 0;

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
   *   plus `purpose` ('relief' | 'stencil') and `openedSentence`.
   */
  function open(svgString, analysis, options = {}) {
    const { purpose: askedPurpose, openedSentence, ...rest } = options;
    const reopening = isOpen;
    callbacks = rest;
    purpose = askedPurpose === 'stencil' ? 'stencil' : 'relief';
    root.dataset.purpose = purpose;
    isOpen = true;
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
      trap.activate({ initialFocus: title, initialFocusDelay: 50 });
    }
    title.focus();
  }

  /** Show what this purpose needs and nothing it does not. */
  function applyPurpose() {
    const stencil = purpose === 'stencil';
    sections.colours.details.hidden = !stencil;
    sections.plates.details.hidden = !stencil;
    regionsBlock.hidden = !stencil;
    shapesBlock.hidden = stencil;
    // Roles are the relief purpose's vocabulary: a stencil region has a
    // colour, not a role.
    refs.rolesToggleBtn.hidden = stencil;
    // Offsets and the design width are the relief purpose's too: a plate's
    // size is a parameter beside the editor, not a field inside it.
    refs.designWidthGroup.hidden = stencil || refs.designWidthGroup.hidden;
    refs.legendRow.hidden = stencil || refs.legendRow.hidden;
    if (!stencil) {
      regionsBlock.replaceChildren();
      swatchList.replaceChildren();
      platesList.replaceChildren();
      islandsList.replaceChildren();
      regions = [];
      silhouette = null;
      plan = null;
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
    const palette = engine.paletteFromFills(regions);
    const assignment = engine.autoAssign(regions, palette);
    plan = {
      palette,
      order: engine.defaultOrder(regions, assignment, palette),
      assignment,
      rule: 'stacked',
      lineMode: found.lineMode,
    };
    renderStencil();
    say(
      regions.length === 0
        ? `${openedSentence} ${S.noRegions}`
        : `${openedSentence} ${S.regionsFound(regions.length, palette.length)}`
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

  function renderStencil() {
    const cuts = currentCuts();
    renderRegionsTable();
    renderSwatches();
    renderPlates(cuts);
    renderIslands(cuts);
    setCount('regions', regions.length);
    setCount('colours', plan.palette.length);
    setCount('plates', plan.order.length);
    const warningCount =
      (refs.warnings.querySelectorAll('li').length || 0) +
      cuts.reduce((n, c) => n + c.islands.length, 0);
    setCount('warnings', warningCount || null);
  }

  function renderRegionsTable() {
    regionsBlock.replaceChildren();
    if (regions.length === 0) return;
    const total = regions.reduce((s, r) => s + (r.area || 0), 0) || 1;
    const table = document.createElement('table');
    table.className = 'drawing-editor-regions-table';
    const caption = document.createElement('caption');
    caption.textContent = S.regionsCaption;
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const label of [S.colRegion, S.colColour, S.colPlate, S.colShare]) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    const tbody = document.createElement('tbody');
    for (const r of regions) {
      const tr = document.createElement('tr');
      tr.dataset.region = r.key;
      const name = document.createElement('th');
      name.scope = 'row';
      name.textContent = r.name;
      const colourCell = document.createElement('td');
      colourCell.className = 'drawing-editor-colour-cell';
      colourCell.appendChild(buildColourSelect(r));
      const plateCell = document.createElement('td');
      plateCell.dataset.plate = '';
      plateCell.textContent = plateText(r.key);
      const share = document.createElement('td');
      const pct = (100 * (r.area || 0)) / total;
      share.textContent = pct < 1 ? S.shareUnderOne : `${Math.round(pct)}%`;
      tr.append(name, colourCell, plateCell, share);
      tbody.appendChild(tr);
    }
    table.append(caption, thead, tbody);
    regionsBlock.appendChild(table);
  }

  function plateText(regionKey) {
    const n = plateOf(regionKey);
    return n === 0 ? S.notCut : String(n);
  }

  function buildColourSelect(region) {
    const select = document.createElement('select');
    select.className = 'drawing-editor-colour-select';
    select.setAttribute('aria-label', S.colourFor(region.name));
    select.dataset.region = region.key;
    for (const c of plan.palette) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      select.appendChild(opt);
    }
    // ★ Unpainted only where it can be true. In a line drawing plate 1 is
    // the whole outline and the base coat goes through it, so every face
    // inside the outline is painted at least that; offering "unpainted" there
    // would be offering something the plates cannot do. Filled art has no
    // outline plate, so there a region can really be left as the wall.
    if (plan.lineMode === 'shapes') {
      const opt = document.createElement('option');
      opt.value = engine.UNPAINTED;
      opt.textContent = S.unpainted;
      select.appendChild(opt);
    }
    select.value = plan.assignment[region.key] || plan.palette[0]?.id || '';
    select.addEventListener('change', () => {
      setColour(region.key, select.value);
    });
    return select;
  }

  /** The one thing the column does: a region gets a colour. */
  function setColour(regionKey, colourId) {
    const region = regions.find((r) => r.key === regionKey);
    if (!region || !plan) return;
    plan.assignment[regionKey] = colourId;
    const cuts = currentCuts();
    for (const cell of regionsBlock.querySelectorAll('tr[data-region]')) {
      const plateCell = cell.querySelector('[data-plate]');
      if (plateCell) plateCell.textContent = plateText(cell.dataset.region);
    }
    renderSwatches();
    renderPlates(cuts);
    renderIslands(cuts);
    setCount(
      'warnings',
      (refs.warnings.querySelectorAll('li').length || 0) +
        cuts.reduce((n, c) => n + c.islands.length, 0) || null
    );
    say(
      colourId === engine.UNPAINTED
        ? S.regionSetUnpainted(region.name)
        : S.regionSet(region.name, colourName(colourId), plateOf(regionKey))
    );
  }

  function renderSwatches() {
    swatchList.replaceChildren();
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
      text.textContent = `${c.name} (${c.hex}), ${S.usedBy(used)}`;
      li.append(chip, text);
      swatchList.appendChild(li);
    }
  }

  function renderPlates(cuts) {
    platesList.replaceChildren();
    cuts.forEach((cut, k) => {
      const li = document.createElement('li');
      const isGround =
        k === 0 && plan.lineMode !== 'shapes' && silhouette?.length > 0;
      const mine = regions.filter(
        (r) => plan.assignment[r.key] === cut.colourId
      ).length;
      li.textContent = isGround
        ? S.plateGround(k + 1, colourName(cut.colourId))
        : S.plateLine(
            k + 1,
            colourName(cut.colourId),
            mine,
            cut.islands.length
          );
      platesList.appendChild(li);
    });
  }

  function renderIslands(cuts) {
    islandsList.replaceChildren();
    cuts.forEach((cut, k) => {
      for (const island of cut.islands) {
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
    });
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
    plan.palette.push(colour);
    plan.order.push(colour.id);
    addColourForm.name.value = '';
    renderStencil();
    say(S.colourAdded(name));
  });

  // ── Leaving ─────────────────────────────────────────────────────────────

  closeBtn.addEventListener('click', () => {
    // Closing without Apply or Keep means the original stands: never silently
    // replaced by an auto-prepared version.
    finish('onKeepOriginal');
  });

  // Capture phase, so this runs before the workspace's own Escape handler and
  // the one gesture takes one path.
  root.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !isOpen) return;
      event.preventDefault();
      event.stopPropagation();
      finish('onKeepOriginal');
    },
    true
  );

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
    destroy: () => {
      if (isOpen) {
        isOpen = false;
        callbacks = {};
        workspace.dismiss();
        teardown();
      }
      workspace.destroy();
      root.remove();
    },
    isOpen: () => isOpen,
    _root: root,
    _workspace: workspace,
    _sections: sections,
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
