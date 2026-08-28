/**
 * SVG Preparation Workspace
 *
 * Inline editor component for SVG preparation. Provides a dual-pane preview
 * (source + prepared result), an object list with role assignment, fullscreen
 * expansion with focus trapping, and ARIA live announcements.
 *
 * Follows the fullscreen pattern from image-measurement.js (classList toggle,
 * backdrop, createDocumentFocusTrap, announce).
 *
 * @license GPL-3.0-or-later
 */

import { createDocumentFocusTrap } from './focus-trap.js';
import { announce } from './announcer.js';
import {
  classifyElements,
  flattenToCompoundPath,
  applyPerPathOffsets,
  tierForCount,
} from './svg-preparer.js';
import {
  buildNestingTree,
  suggestLayers,
  layerLimit,
  validateLayers,
} from './svg-nesting.js';
import { getPathBBox } from 'svg-path-commander';
import { mmToSvgUnits } from './svg-offset.js';
import { isEnabled } from './feature-flags.js';

// ── Constants ────────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';

const ROLE_OPTIONS = [
  { value: 'foreground', label: 'Foreground' },
  { value: 'hole', label: 'Hole' },
  { value: 'ignore', label: 'Ignore' },
];

// Compound paths only distinguish included vs excluded subpaths —
// "Hole" is meaningless because subpaths are concatenated, not subtracted.
const COMPOUND_ROLE_OPTIONS = [
  { value: 'foreground', label: 'Include' },
  { value: 'ignore', label: 'Exclude' },
];

/** Viewport width below which the editor opens fullscreen automatically. */
const AUTO_FULLSCREEN_MAX_WIDTH = 768;

// ── Utility functions ────────────────────────────────────────────────────────

/**
 * Build a human-readable description for an SVG shape element.
 * @param {Element} element - SVG DOM element
 * @param {number} index - Zero-based index
 * @returns {string}
 */
export function describeElement(element, index) {
  const tag = element.tagName.toLowerCase();
  const attr = (name) => element.getAttribute(name);
  const n = index + 1;

  switch (tag) {
    case 'circle':
      return `Circle ${n} (r=${attr('r')})`;
    case 'ellipse':
      return `Ellipse ${n} (${attr('rx')}\u00D7${attr('ry')})`;
    case 'rect':
      return `Rectangle ${n} (${attr('width')}\u00D7${attr('height')})`;
    case 'polygon':
      return `Polygon ${n}`;
    case 'polyline':
      return `Polyline ${n}`;
    case 'line':
      return `Line ${n}`;
    case 'path':
      return `Path ${n}`;
    default:
      return `Shape ${n}`;
  }
}

/**
 * Derive a CSS-safe color for the swatch thumbnail.
 * @param {{fill: string, stroke: string}} el - Parsed element descriptor
 * @returns {string}
 */
function swatchColor(el) {
  const fill = (el.fill || '').toLowerCase();
  if (fill && fill !== 'none' && fill !== 'transparent') return el.fill;
  const stroke = (el.stroke || '').toLowerCase();
  if (stroke && stroke !== 'none') return el.stroke;
  return '#000000';
}

function extractSvgMeta(svgString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return { viewBox: '', width: '', height: '' };

  const width = svg.getAttribute('width') || '';
  const height = svg.getAttribute('height') || '';
  let viewBox = svg.getAttribute('viewBox') || '';
  if (!viewBox) {
    // Derive a viewBox from width/height (units stripped) so zoom
    // controls and mm offsets keep working on viewBox-less SVGs.
    const w = parseFloat(width);
    const h = parseFloat(height);
    if (w > 0 && h > 0) viewBox = `0 0 ${w} ${h}`;
  }
  return { viewBox, width, height };
}

function parseViewBox(str) {
  if (!str) return null;
  const parts = str
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

function viewBoxString(vb) {
  return `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
}

// ── DOM Construction ─────────────────────────────────────────────────────────

/**
 * Build the static workspace DOM shell.
 * @returns {{root: HTMLElement, refs: Object}} Root element and named references
 */
function buildWorkspaceDom() {
  const root = document.createElement('div');
  root.className = 'svg-prep-workspace';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-labelledby', 'svg-prep-title');
  root.hidden = true;

  // Header
  const header = document.createElement('div');
  header.className = 'svg-prep-header';

  const title = document.createElement('h3');
  title.id = 'svg-prep-title';
  title.textContent = 'SVG Preparation Editor';

  const rolesToggleBtn = document.createElement('button');
  rolesToggleBtn.className = 'svg-prep-roles-toggle btn btn-ghost';
  rolesToggleBtn.type = 'button';
  rolesToggleBtn.textContent = 'Show roles';
  rolesToggleBtn.setAttribute('aria-pressed', 'true');

  const fullscreenBtn = document.createElement('button');
  fullscreenBtn.className = 'svg-prep-fullscreen-btn';
  fullscreenBtn.setAttribute('aria-label', 'Open fullscreen');
  fullscreenBtn.textContent = '\u26F6';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'svg-prep-close-btn';
  closeBtn.setAttribute('aria-label', 'Close editor');
  closeBtn.textContent = '\u00D7';

  const designWidthGroup = document.createElement('div');
  designWidthGroup.className = 'svg-prep-design-width';
  designWidthGroup.hidden = !isEnabled('svg_path_offset');

  const designWidthLabel = document.createElement('label');
  designWidthLabel.textContent = 'Design width ';

  const designWidthInput = document.createElement('input');
  designWidthInput.type = 'number';
  designWidthInput.className = 'svg-prep-design-width-input';
  designWidthInput.min = '1';
  designWidthInput.max = '200';
  designWidthInput.step = '1';
  designWidthInput.value = '14';

  const designWidthUnit = document.createElement('span');
  designWidthUnit.className = 'svg-prep-design-width-unit';
  designWidthUnit.textContent = 'mm';

  designWidthLabel.append(designWidthInput, ' ', designWidthUnit);
  designWidthGroup.appendChild(designWidthLabel);

  header.append(
    title,
    designWidthGroup,
    rolesToggleBtn,
    fullscreenBtn,
    closeBtn
  );

  // Dual preview panes
  const previews = document.createElement('div');
  previews.className = 'svg-prep-previews';

  const sourcePaneWrap = document.createElement('div');
  sourcePaneWrap.className = 'svg-prep-pane-wrap';

  const sourceCaption = document.createElement('span');
  sourceCaption.className = 'svg-prep-pane-caption';
  sourceCaption.textContent = 'Original';

  const sourcePane = document.createElement('div');
  sourcePane.className = 'svg-prep-source-pane';
  // A group, not an image: these panes hold zoom buttons, and role="img" with
  // focusable descendants is refused by assistive technology (D-102). The
  // picture itself carries role="img" when it is rendered in.
  sourcePane.setAttribute('role', 'group');
  sourcePane.setAttribute('aria-label', 'Source SVG');

  const sourceZoom = buildZoomControls('source');
  sourcePane.appendChild(sourceZoom);
  sourcePaneWrap.append(sourceCaption, sourcePane);

  const resultPaneWrap = document.createElement('div');
  resultPaneWrap.className = 'svg-prep-pane-wrap';

  const resultCaption = document.createElement('span');
  resultCaption.className = 'svg-prep-pane-caption';
  resultCaption.textContent = 'Will print as';

  const resultPane = document.createElement('div');
  resultPane.className = 'svg-prep-result-pane';
  resultPane.setAttribute('role', 'group');
  resultPane.setAttribute('aria-label', 'Prepared result');

  // DP-4's bulk bar. It sits OUTSIDE the object list on purpose: that list is
  // role="list", which accepts only listitem children, so a toolbar inside it
  // would be dropped from the accessibility tree (D-101).
  const bulkBar = document.createElement('div');
  bulkBar.className = 'svg-prep-bulk-bar';
  bulkBar.setAttribute('role', 'group');
  bulkBar.setAttribute('aria-label', 'Remove shapes from the list');

  const bulkCount = document.createElement('span');
  bulkCount.className = 'svg-prep-bulk-count';

  const bulkHelp = document.createElement('p');
  bulkHelp.className = 'svg-prep-bulk-help';
  bulkHelp.id = 'svgPrepBulkHelp';
  bulkHelp.textContent =
    'Sizes are measured against the design width above, so they are the size the shape will really print.';

  const smallLabel = document.createElement('label');
  smallLabel.className = 'svg-prep-bulk-field';
  smallLabel.append(document.createTextNode('Smaller than '));
  const smallInput = document.createElement('input');
  smallInput.type = 'number';
  smallInput.className = 'svg-prep-bulk-input';
  smallInput.min = '0';
  smallInput.step = '0.1';
  smallInput.value = '1';
  smallInput.setAttribute('aria-describedby', bulkHelp.id);
  smallLabel.append(smallInput, document.createTextNode(' mm²'));

  const deleteSmallBtn = document.createElement('button');
  deleteSmallBtn.type = 'button';
  deleteSmallBtn.className = 'btn btn-secondary svg-prep-bulk-btn';
  deleteSmallBtn.dataset.action = 'delete-small';
  deleteSmallBtn.textContent = 'Delete those';

  const keepLabel = document.createElement('label');
  keepLabel.className = 'svg-prep-bulk-field';
  keepLabel.append(document.createTextNode('Keep largest '));
  const keepInput = document.createElement('input');
  keepInput.type = 'number';
  keepInput.className = 'svg-prep-bulk-input';
  keepInput.min = '1';
  keepInput.step = '1';
  keepInput.value = '50';
  keepLabel.appendChild(keepInput);

  const keepLargestBtn = document.createElement('button');
  keepLargestBtn.type = 'button';
  keepLargestBtn.className = 'btn btn-secondary svg-prep-bulk-btn';
  keepLargestBtn.dataset.action = 'keep-largest';
  keepLargestBtn.textContent = 'Delete the rest';

  const undoDeleteBtn = document.createElement('button');
  undoDeleteBtn.type = 'button';
  undoDeleteBtn.className = 'btn btn-secondary svg-prep-bulk-btn';
  undoDeleteBtn.dataset.action = 'undo-delete';
  undoDeleteBtn.textContent = 'Undo delete';
  undoDeleteBtn.disabled = true;

  bulkBar.append(
    bulkCount,
    smallLabel,
    deleteSmallBtn,
    keepLabel,
    keepLargestBtn,
    undoDeleteBtn,
    bulkHelp
  );

  const resultZoom = buildZoomControls('result');
  resultPane.appendChild(resultZoom);

  // DP-3: above tier A the boolean never runs on its own, so the result pane
  // needs a way to ask for it. Hidden (and never focusable) in the auto band.
  const renderRow = document.createElement('div');
  renderRow.className = 'svg-prep-render-row';
  renderRow.hidden = true;

  const renderNote = document.createElement('p');
  renderNote.className = 'svg-prep-render-note';
  renderNote.id = 'svgPrepRenderNote';

  const renderBtn = document.createElement('button');
  renderBtn.type = 'button';
  renderBtn.className = 'btn btn-primary svg-prep-render-btn';
  renderBtn.dataset.action = 'render-preview';
  renderBtn.textContent = 'Render preview';
  renderBtn.setAttribute('aria-describedby', renderNote.id);

  renderRow.append(renderNote, renderBtn);
  resultPaneWrap.append(resultCaption, resultPane, renderRow);

  previews.append(sourcePaneWrap, resultPaneWrap);

  // Role color legend (shown under the source pane)
  const legendRow = document.createElement('div');
  legendRow.className = 'svg-prep-legend';
  [
    { role: 'foreground', label: 'Printed shape' },
    { role: 'hole', label: 'Cut-out (hole)' },
    { role: 'ignore', label: 'Ignored' },
  ].forEach(({ role, label }) => {
    const chipWrap = document.createElement('span');
    chipWrap.className = 'svg-prep-legend-item';
    const chip = document.createElement('span');
    chip.className = `svg-prep-legend-chip svg-prep-legend-chip--${role}`;
    chip.setAttribute('aria-hidden', 'true');
    chipWrap.append(chip, document.createTextNode(label));
    legendRow.appendChild(chipWrap);
  });

  // DP-7. How many layers this artwork can carry, and how many rows currently
  // break the containment law. Sits OUTSIDE the role="list" (D-101).
  const layerSummary = document.createElement('p');
  layerSummary.className = 'svg-prep-layer-summary';
  layerSummary.hidden = true;

  // Object list
  const objects = document.createElement('div');
  objects.className = 'svg-prep-objects';
  objects.setAttribute('role', 'list');
  objects.setAttribute('aria-label', 'SVG objects');

  // Warning summary
  const warnings = document.createElement('div');
  warnings.className = 'svg-prep-warnings';
  warnings.setAttribute('role', 'status');
  warnings.setAttribute('aria-live', 'polite');

  // Footer
  const footer = document.createElement('div');
  footer.className = 'svg-prep-footer';

  const applyBtn = document.createElement('button');
  applyBtn.className = 'btn btn-primary';
  applyBtn.dataset.action = 'apply';
  applyBtn.textContent = 'Apply prepared SVG';

  const applyHint = document.createElement('span');
  applyHint.className = 'svg-prep-apply-hint';
  applyHint.textContent = 'No shapes included';
  applyHint.hidden = true;

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-secondary';
  saveBtn.dataset.action = 'save';
  saveBtn.textContent = 'Save edited SVG';
  saveBtn.setAttribute(
    'aria-label',
    'Save the edited SVG to a file on this computer'
  );

  const saveDxfBtn = document.createElement('button');
  saveDxfBtn.className = 'btn btn-secondary';
  saveDxfBtn.dataset.action = 'save-dxf';
  saveDxfBtn.textContent = 'Save as DXF';
  saveDxfBtn.setAttribute(
    'aria-label',
    'Save the edited drawing as a DXF file on this computer'
  );
  saveDxfBtn.hidden = true;

  const keepBtn = document.createElement('button');
  keepBtn.className = 'btn btn-secondary';
  keepBtn.dataset.action = 'keep';
  keepBtn.textContent = 'Keep original';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn btn-ghost';
  resetBtn.dataset.action = 'reset';
  resetBtn.textContent = 'Reset';

  footer.append(applyBtn, applyHint, saveBtn, saveDxfBtn, keepBtn, resetBtn);

  // Fullscreen backdrop (hidden by default)
  const backdrop = document.createElement('div');
  backdrop.className = 'svg-prep-fullscreen-backdrop hidden';
  backdrop.setAttribute('aria-hidden', 'true');

  // A slot a host can put its own controls in - the ink-mode panel, when the
  // drawing came from a photograph. Empty and hidden otherwise, so the editor
  // looks exactly as it did when nothing fills it.
  const toolsSlot = document.createElement('div');
  toolsSlot.className = 'svg-prep-tools-slot';
  toolsSlot.hidden = true;

  root.append(
    header,
    toolsSlot,
    previews,
    legendRow,
    layerSummary,
    bulkBar,
    objects,
    warnings,
    footer
  );

  return {
    root,
    refs: {
      header,
      toolsSlot,
      title,
      designWidthGroup,
      designWidthInput,
      rolesToggleBtn,
      fullscreenBtn,
      closeBtn,
      previews,
      sourcePane,
      resultPane,
      sourceCaption,
      resultCaption,
      legendRow,
      layerSummary,
      sourceZoom,
      resultZoom,
      bulkBar,
      bulkCount,
      smallInput,
      keepInput,
      deleteSmallBtn,
      keepLargestBtn,
      undoDeleteBtn,
      renderRow,
      renderNote,
      renderBtn,
      objects,
      warnings,
      footer,
      applyBtn,
      applyHint,
      saveBtn,
      saveDxfBtn,
      keepBtn,
      resetBtn,
      backdrop,
    },
  };
}

/**
 * Build zoom controls for a preview pane.
 * @param {string} pane - Pane identifier ('source' or 'result')
 * @returns {HTMLElement}
 */
function buildZoomControls(pane) {
  const container = document.createElement('div');
  container.className = 'svg-prep-zoom-controls';

  const fitBtn = document.createElement('button');
  fitBtn.className = 'svg-prep-zoom-fit';
  fitBtn.setAttribute('aria-label', `Fit ${pane} to view`);
  fitBtn.textContent = 'Fit';

  const zoomInBtn = document.createElement('button');
  zoomInBtn.className = 'svg-prep-zoom-in';
  zoomInBtn.setAttribute('aria-label', `Zoom in ${pane}`);
  zoomInBtn.textContent = '+';

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.className = 'svg-prep-zoom-out';
  zoomOutBtn.setAttribute('aria-label', `Zoom out ${pane}`);
  zoomOutBtn.textContent = '\u2212';

  container.append(fitBtn, zoomInBtn, zoomOutBtn);
  return container;
}

// ── Object list ──────────────────────────────────────────────────────────────

/**
 * Populate the object list from analysis data.
 * @param {HTMLElement} listEl - The .svg-prep-objects container
 * @param {Array} elements - Elements from analyzeSvg().elements
 * @param {HTMLElement} liveRegion - ARIA live region for announcements. It
 *   lives on the workspace root, NOT in this list: role="list" accepts only
 *   listitem children, and a live region among them made the whole list
 *   invalid to assistive technology (D-101).
 * @param {boolean} [isCompound=false] - Compound-path mode (Include/Exclude)
 * @returns {{roles: string[], offsets: number[]}} Initial assignments
 */
function populateObjectList(
  listEl,
  elements,
  liveRegion,
  isCompound = false,
  layerInfo = null
) {
  listEl.innerHTML = '';
  const roles = [];
  const offsets = [];
  const offsetEnabled = isEnabled('svg_path_offset');
  const roleOptions = isCompound ? COMPOUND_ROLE_OPTIONS : ROLE_OPTIONS;
  const layerCount = layerInfo ? layerInfo.limit : 0;
  const layers = [];

  elements.forEach((el, i) => {
    const name = isCompound
      ? `Subpath ${i + 1}`
      : describeElement(el.element, i);
    const color = swatchColor(el);
    let role = el.autoRole || 'ignore';
    // Compound subpaths are either included or excluded
    if (isCompound && role !== 'ignore') role = 'foreground';
    roles.push(role);
    offsets.push(0);

    const item = document.createElement('div');
    item.className = 'svg-prep-object';
    item.setAttribute('role', 'listitem');
    item.tabIndex = 0;
    item.dataset.index = String(i);
    item.setAttribute('aria-label', `${name}, role: ${role}`);

    // Color swatch
    const swatch = document.createElement('span');
    swatch.className = 'svg-prep-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.background = color;

    // Element name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'svg-prep-object-name';
    nameSpan.textContent = name;

    // Role radio group
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'svg-prep-role-group';

    const legend = document.createElement('legend');
    legend.className = 'sr-only';
    legend.textContent = `Role for ${name}`;
    fieldset.appendChild(legend);

    roleOptions.forEach(({ value, label }) => {
      const lbl = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `svg-prep-role-${i}`;
      radio.value = value;
      if (role === value) radio.checked = true;
      lbl.append(radio, document.createTextNode(label));
      fieldset.appendChild(lbl);
    });

    item.append(swatch, nameSpan, fieldset);

    if (offsetEnabled) {
      const offsetInput = document.createElement('input');
      offsetInput.type = 'number';
      offsetInput.className = 'svg-prep-offset-input';
      offsetInput.name = `svg-prep-offset-${i}`;
      offsetInput.min = '-2';
      offsetInput.max = '2';
      offsetInput.step = '0.1';
      offsetInput.value = '0';
      offsetInput.setAttribute('aria-label', `Offset for ${name} (mm)`);
      if (role === 'ignore') offsetInput.disabled = true;
      item.appendChild(offsetInput);
    }

    if (layerCount > 0) {
      // The suggestion is the shape's nesting depth. Editable straight away:
      // auto-categorized is a starting point, not a verdict.
      const suggested = Math.min(
        Math.max(layerInfo.suggestions[i] || 1, 1),
        layerCount
      );
      layers.push(suggested);

      const layerSelect = document.createElement('select');
      layerSelect.className = 'svg-prep-layer-select';
      layerSelect.name = `svg-prep-layer-${i}`;
      layerSelect.setAttribute('aria-label', `Layer for ${name}`);
      for (let n = 1; n <= layerCount; n++) {
        const opt = document.createElement('option');
        opt.value = String(n);
        opt.textContent = `Layer ${n}`;
        if (n === suggested) opt.selected = true;
        layerSelect.appendChild(opt);
      }
      if (role === 'ignore') layerSelect.disabled = true;
      item.appendChild(layerSelect);

      // Filled in by validateAndMarkLayers(); an empty node keeps the row's
      // layout from jumping when a warning appears under it.
      const layerNote = document.createElement('span');
      layerNote.className = 'svg-prep-layer-note';
      layerNote.hidden = true;
      item.appendChild(layerNote);
    } else {
      layers.push(1);
    }

    if (el.warnings && el.warnings.length > 0) {
      const warning = document.createElement('span');
      warning.className = 'svg-prep-object-warning';
      warning.setAttribute('aria-label', el.warnings.join('; '));
      warning.textContent = '\u26A0';
      item.appendChild(warning);
    }

    // DP-4. Ignore already removes a shape from the OUTPUT; this removes it
    // from the LIST. At 831 rows that is the difference between a table you
    // can work in and one you only scroll past.
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'svg-prep-object-delete';
    deleteBtn.dataset.deleteIndex = String(i);
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('aria-label', `Delete ${name}`);
    item.appendChild(deleteBtn);

    listEl.appendChild(item);
  });

  return { roles, offsets, layers };
}

/**
 * Render global warnings from the analysis into the warnings region.
 * @param {HTMLElement} warningsEl - The .svg-prep-warnings container
 * @param {string[]} warnings - Global warnings from analyzeSvg()
 */
function renderWarnings(warningsEl, warnings) {
  warningsEl.innerHTML = '';
  if (!warnings || warnings.length === 0) return;

  const ul = document.createElement('ul');
  warnings.forEach((msg) => {
    const li = document.createElement('li');
    li.textContent = msg;
    ul.appendChild(li);
  });
  warningsEl.appendChild(ul);
}

// ── Main factory ─────────────────────────────────────────────────────────────

/**
 * Create an SVG preparation workspace and attach it to the given container.
 *
 * Returns a controller object for managing the workspace lifecycle.
 * The workspace starts hidden and must be opened with controller.open().
 *
 * @param {HTMLElement} containerEl - Parent element to append the workspace into
 * @returns {{
 *   open: (svgString: string, analysis: Object, callbacks?: Object) => void,
 *   close: () => void,
 *   getResult: () => string|null,
 *   getRoleOverrides: () => string[],
 *   getOffsetOverrides: () => number[],
 *   destroy: () => void,
 *   openFullscreen: () => void,
 *   closeFullscreen: () => void,
 *   toggleFullscreen: () => void,
 *   _root: HTMLElement,
 *   _refs: Object,
 * }}
 */
/**
 * The name an edited SVG is saved under. Provenance-aware: the file it came
 * from is still recognisable in what goes back, which is the whole point when
 * the file is travelling between two tools and a person.
 *
 * @param {string|null} sourceName - The file the editor was opened on
 * @returns {string}
 */
export function editedSvgFileName(sourceName) {
  const base = String(sourceName || 'drawing')
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'drawing'}-edited.svg`;
}

function downloadSvgString(svgString, fileName) {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Mark a rendered SVG as the picture in its pane. The pane around it is a
 * group, because it holds zoom controls; the drawing itself is the image.
 *
 * @param {SVGElement} svgEl
 * @param {string} label
 */
function markAsPicture(svgEl, label) {
  svgEl.setAttribute('role', 'img');
  svgEl.setAttribute('aria-label', label);
}

export function createSvgPrepWorkspace(containerEl) {
  const { root, refs } = buildWorkspaceDom();
  containerEl.appendChild(refs.backdrop);
  containerEl.appendChild(root);

  // ── State ──────────────────────────────────────────────────────────────
  let isOpen = false;
  let isFullscreen = false;
  let fullscreenTrap = null;
  let previousFocusEl = null;
  let currentResult = null;
  let roles = [];
  let offsets = [];
  let currentSvgString = null;
  let currentAnalysis = null;
  let currentSvgMeta = null;
  let currentCallbacks = {};
  let currentSourceName = null;
  // 'parameter' - the editor is preparing a value for a model's file parameter
  // (Apply writes it back). 'file' - the editor was opened on a file with no
  // model behind it, so saving is the only thing Apply could have meant.
  let hostMode = 'parameter';
  let sourceZoomCleanup = null;
  let resultZoomCleanup = null;
  let highlightCleanup = null;
  let offsetDebounceTimer = null;
  // True once Apply or Keep original has fired; closing without either
  // triggers the keep-original callback so the original is never silently
  // replaced by an auto-prepared version.
  let resolved = false;
  let rolesVisible = true;
  // DP-3: whether the boolean flatten may run by itself. True only in tier A
  // (50 shapes or fewer), where DP-0 measured it at about a second.
  let autoPreview = true;
  // DP-4. Deleting a row shifts every index after it, and roles, offsets, the
  // rows' data-index, the radio names and the SAVED prepOverrides/prepOffsets
  // are ALL positional. So each surviving row remembers the index it had in
  // the analysis as first read, and everything that leaves this module is
  // expressed in those ORIGINAL indices. Without it, deleting one shape and
  // reopening the project would silently apply every later shape's role to
  // its neighbour.
  let originalIndex = [];
  // The element list as it stands after deletions - what the rows, roles and
  // offsets are parallel to. currentAnalysis.elements keeps the full original.
  let liveElements = [];
  // One level, this session only. A stack that rode prepMetadata into saved
  // projects would grow without bound in a 2 MB localStorage lane.
  let lastDeletion = null;
  // DP-7. The layer column appears only for a tile that asked for it, so a
  // non-layered editor is byte-for-byte what it was before.
  let layersEnabled = false;
  let nestingTree = null;
  let layerCount = 0;
  let layers = [];

  // ARIA live region for role-change and preview announcements
  const liveRegion = document.createElement('div');
  liveRegion.className = 'sr-only';
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  // On the root, never inside the object list: see populateObjectList (D-101).
  root.appendChild(liveRegion);

  // ── Internal rendering ────────────────────────────────────────────────

  function renderSourcePane() {
    const existingSvg = refs.sourcePane.querySelector('svg');
    if (existingSvg) existingSvg.remove();
    if (!currentSvgString) return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(currentSvgString, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return null;

    const imported = document.importNode(svg, true);

    // Ensure a usable viewBox for zoom controls on viewBox-less SVGs
    if (!imported.getAttribute('viewBox') && currentSvgMeta?.viewBox) {
      imported.setAttribute('viewBox', currentSvgMeta.viewBox);
    }

    // Role tint layer below the hover-highlight overlay; both draw on top
    // of the artwork and are purely decorative.
    const roleLayer = document.createElementNS(SVG_NS, 'g');
    roleLayer.setAttribute('class', 'svg-prep-role-layer');
    roleLayer.setAttribute('aria-hidden', 'true');
    imported.appendChild(roleLayer);

    const overlay = document.createElementNS(SVG_NS, 'g');
    overlay.setAttribute('class', 'svg-prep-overlay');
    overlay.setAttribute('aria-hidden', 'true');
    imported.appendChild(overlay);

    markAsPicture(imported, 'Source SVG');
    refs.sourcePane.insertBefore(imported, refs.sourceZoom);
    return imported;
  }

  function clearSvgGroup(group) {
    while (group.firstChild) group.removeChild(group.firstChild);
  }

  /**
   * Render one translucent tint path per descriptor, color-coded by its
   * current role, into the role layer of the source pane.
   */
  function renderRoleLayer() {
    const layer = refs.sourcePane.querySelector('.svg-prep-role-layer');
    if (!layer) return;
    clearSvgGroup(layer);
    if (!rolesVisible || !currentAnalysis) return;

    liveElements.forEach((el, i) => {
      if (!el.pathData) return;
      const role = roles[i] || 'ignore';
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', el.pathData);
      p.setAttribute('class', `svg-prep-role-path svg-prep-role--${role}`);
      layer.appendChild(p);
    });
  }

  /**
   * Build an SVG string by concatenating selected subpath d-values into a
   * single compound path. Used for compound-path SVGs where boolean
   * flattening would destroy the original spatial arrangement.
   */
  function concatenateSubpaths(classified, svgMeta) {
    const included = classified.filter(
      (el) => el.role !== 'ignore' && el.pathData
    );
    if (included.length === 0) return null;

    const compoundD = included.map((el) => el.pathData).join(' ');
    const { viewBox, width, height } = svgMeta;
    let attrs = 'xmlns="http://www.w3.org/2000/svg"';
    if (viewBox) attrs += ` viewBox="${viewBox}"`;
    if (width) attrs += ` width="${width}"`;
    if (height) attrs += ` height="${height}"`;
    return `<svg ${attrs}><path d="${compoundD}" fill="black" fill-rule="evenodd"/></svg>`;
  }

  /**
   * @param {boolean} enabled
   * @param {string} [hint] - Why not, when disabled. Naming the real reason
   *   matters: the hint's one fixed sentence used to be "No shapes included",
   *   which is a lie when the shapes are there and only the flatten is
   *   waiting (D-117's mistake in miniature).
   */
  function setApplyEnabled(enabled, hint = 'No shapes included') {
    refs.applyBtn.disabled = !enabled;
    refs.applyBtn.setAttribute('aria-disabled', String(!enabled));
    if (!enabled) refs.applyHint.textContent = hint;
    refs.applyHint.hidden = enabled;
    // Nothing to save either: an empty result is an empty file.
    refs.saveBtn.disabled = !enabled;
    refs.saveBtn.setAttribute('aria-disabled', String(!enabled));
    refs.saveDxfBtn.disabled = !enabled;
    refs.saveDxfBtn.setAttribute('aria-disabled', String(!enabled));
  }

  function clearResultError() {
    const err = refs.resultPane.querySelector('.svg-prep-result-error');
    if (err) err.remove();
  }

  function showResultError(message) {
    clearResultError();
    const err = document.createElement('p');
    err.className = 'svg-prep-result-error';
    err.textContent = message;
    refs.resultPane.insertBefore(err, refs.resultZoom);
  }

  /**
   * Read the tier from the number of shapes ON SCREEN and set whether the
   * boolean may run by itself.
   *
   * Anything the analyzer did not label is treated as tier A, so an older
   * caller keeps exactly the behaviour it had.
   */
  function setPreviewBand() {
    const count = liveElements.length;
    autoPreview = count > 0 && tierForCount(count) === 'auto';
    refs.renderRow.hidden = autoPreview;
  }

  /**
   * Ask for the result preview the way this drawing's size allows.
   *
   * DP-3: `updateResultPreview` IS the boolean flatten - the "Will print as"
   * pane is its output - and DP-0 measured that flatten at 1.0 s for 50
   * shapes, 56.7 s for 200 and 447.9 s for 400, roughly 7.5x per doubling.
   * Running it on open and again on every role change is what made the
   * owner's 831-shape drawing take 64.7 SECONDS to appear. Above tier A the
   * pane goes stale instead, and waits to be asked.
   */
  function requestResultPreview() {
    if (autoPreview) {
      updateResultPreview();
      return;
    }
    markPreviewStale();
  }

  /**
   * Show that the result pane is out of date and offer to bring it up to
   * date, rather than silently showing a picture of older choices.
   */
  function markPreviewStale() {
    // currentResult === null IS "stale": Apply and Save already refuse on it,
    // so a second flag saying the same thing could only drift from it.
    currentResult = null;
    const existingSvg = refs.resultPane.querySelector('svg');
    if (existingSvg) existingSvg.remove();
    clearResultError();
    setApplyEnabled(
      false,
      'Render the preview before applying it, so you can see what you get.'
    );
    refs.renderRow.hidden = false;
    refs.renderNote.textContent = staleNoteText();
    refs.renderBtn.disabled = false;
  }

  /** The sentence under the Render preview button. */
  function staleNoteText() {
    const count = liveElements.length;
    return (
      `This drawing has ${count} shapes. Combining them takes a while, ` +
      `so Forge waits until you ask.`
    );
  }

  function updateResultPreview() {
    if (!currentAnalysis || !currentSvgMeta) return;

    // Preserve the user's zoom level across preview re-renders
    const existingSvg = refs.resultPane.querySelector('svg');
    const previousViewBox = existingSvg
      ? existingSvg.getAttribute('viewBox')
      : null;
    if (existingSvg) existingSvg.remove();
    clearResultError();

    try {
      const roleOverrides = {};
      roles.forEach((role, i) => {
        roleOverrides[i] = role;
      });

      const classified = classifyElements(liveElements, {
        roleOverrides,
      });

      const vb = parseViewBox(currentSvgMeta.viewBox);
      const vbWidth = vb ? vb.w : 0;
      const designWidthMm = parseFloat(refs.designWidthInput.value) || 14;
      const svgOffsets = offsets.map((mm) =>
        mmToSvgUnits(mm, vbWidth, designWidthMm)
      );
      const withOffsets = applyPerPathOffsets(classified, svgOffsets);

      const isCompound = currentAnalysis.isCompoundPathOnly;
      const resultSvgString = isCompound
        ? concatenateSubpaths(withOffsets, currentSvgMeta)
        : flattenToCompoundPath(withOffsets, currentSvgMeta);

      if (!resultSvgString) {
        currentResult = null;
        setApplyEnabled(false);
        liveRegion.textContent = 'No foreground elements \u2014 preview empty';
        return;
      }

      currentResult = resultSvgString;
      setApplyEnabled(true);

      const parser = new DOMParser();
      const doc = parser.parseFromString(resultSvgString, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      if (!svg) return;

      const imported = document.importNode(svg, true);
      if (previousViewBox) imported.setAttribute('viewBox', previousViewBox);
      markAsPicture(imported, 'Prepared result');
      refs.resultPane.insertBefore(imported, refs.resultZoom);

      const fgCount = withOffsets.filter(
        (el) => el.role !== 'ignore' && el.pathData
      ).length;
      const ignoredCount = withOffsets.filter(
        (el) => el.role === 'ignore'
      ).length;
      liveRegion.textContent = isCompound
        ? `Preview updated \u2014 ${fgCount} subpaths included, ${ignoredCount} ignored`
        : `Preview updated \u2014 ${fgCount} foreground, ${withOffsets.filter((el) => el.role === 'hole' && el.pathData).length} holes`;
    } catch (err) {
      console.error('[SVG Prep] Preview failed:', err);
      currentResult = null;
      setApplyEnabled(false);
      showResultError(
        'Preview failed for this combination \u2014 original will be kept'
      );
      liveRegion.textContent =
        'Preview failed for this combination \u2014 original will be kept';
    }
  }

  function setupPaneZoom(pane, zoomEl, naturalVBStr) {
    const naturalVB = parseViewBox(naturalVBStr);
    if (!naturalVB) return null;

    pane.tabIndex = 0;

    function getSvg() {
      return pane.querySelector('svg');
    }

    function applyVB(vb) {
      const svg = getSvg();
      if (svg) svg.setAttribute('viewBox', viewBoxString(vb));
    }

    function handleFit() {
      applyVB({ ...naturalVB });
    }

    function handleZoomIn() {
      const svg = getSvg();
      if (!svg) return;
      const cur = parseViewBox(svg.getAttribute('viewBox')) || { ...naturalVB };
      const w = cur.w / 1.5;
      const h = cur.h / 1.5;
      applyVB({
        x: cur.x + cur.w / 2 - w / 2,
        y: cur.y + cur.h / 2 - h / 2,
        w,
        h,
      });
    }

    function handleZoomOut() {
      const svg = getSvg();
      if (!svg) return;
      const cur = parseViewBox(svg.getAttribute('viewBox')) || { ...naturalVB };
      const w = cur.w * 1.5;
      const h = cur.h * 1.5;
      applyVB({
        x: cur.x + cur.w / 2 - w / 2,
        y: cur.y + cur.h / 2 - h / 2,
        w,
        h,
      });
    }

    function handlePaneKeydown(e) {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      }
    }

    const fitBtn = zoomEl.querySelector('.svg-prep-zoom-fit');
    const zoomInBtn = zoomEl.querySelector('.svg-prep-zoom-in');
    const zoomOutBtn = zoomEl.querySelector('.svg-prep-zoom-out');

    fitBtn.addEventListener('click', handleFit);
    zoomInBtn.addEventListener('click', handleZoomIn);
    zoomOutBtn.addEventListener('click', handleZoomOut);
    pane.addEventListener('keydown', handlePaneKeydown);

    return () => {
      fitBtn.removeEventListener('click', handleFit);
      zoomInBtn.removeEventListener('click', handleZoomIn);
      zoomOutBtn.removeEventListener('click', handleZoomOut);
      pane.removeEventListener('keydown', handlePaneKeydown);
      pane.removeAttribute('tabindex');
    };
  }

  function setupObjectHighlighting() {
    // Highlight paths are drawn into an overlay <g> keyed by the
    // descriptor's own pathData (viewBox coordinates, transforms baked),
    // so indexes always match the object list — including subpaths of
    // compound paths — and rendering works in every browser.
    function getOverlay() {
      return refs.sourcePane.querySelector('.svg-prep-overlay');
    }

    function highlight(e) {
      const item = e.target.closest('.svg-prep-object');
      if (!item) return;
      const overlay = getOverlay();
      if (!overlay || !currentAnalysis) return;
      clearSvgGroup(overlay);
      const idx = parseInt(item.dataset.index, 10);
      const el = liveElements[idx];
      if (!el || !el.pathData) return;
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', el.pathData);
      p.setAttribute('class', 'svg-prep-highlight-path');
      overlay.appendChild(p);
    }

    function unhighlight(e) {
      const item = e.target.closest('.svg-prep-object');
      if (!item) return;
      const overlay = getOverlay();
      if (overlay) clearSvgGroup(overlay);
    }

    refs.objects.addEventListener('mouseover', highlight);
    refs.objects.addEventListener('mouseout', unhighlight);
    refs.objects.addEventListener('focusin', highlight);
    refs.objects.addEventListener('focusout', unhighlight);

    return () => {
      refs.objects.removeEventListener('mouseover', highlight);
      refs.objects.removeEventListener('mouseout', unhighlight);
      refs.objects.removeEventListener('focusin', highlight);
      refs.objects.removeEventListener('focusout', unhighlight);
    };
  }

  function clearPanes() {
    const srcSvg = refs.sourcePane.querySelector('svg');
    if (srcSvg) srcSvg.remove();
    const resSvg = refs.resultPane.querySelector('svg');
    if (resSvg) resSvg.remove();
    clearResultError();
  }

  // ── Event handlers ─────────────────────────────────────────────────────

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (isFullscreen) {
        closeFullscreen();
      } else {
        close();
      }
    }
  }

  function handleRoleChange(e) {
    if (e.target.type !== 'radio') return;
    const match = e.target.name.match(/^svg-prep-role-(\d+)$/);
    if (!match) return;
    const idx = parseInt(match[1], 10);
    roles[idx] = e.target.value;

    const item = refs.objects.querySelector(
      `.svg-prep-object[data-index="${idx}"]`
    );
    if (item) {
      const nameSpan = item.querySelector('.svg-prep-object-name');
      const nameText = nameSpan ? nameSpan.textContent : `Element ${idx + 1}`;
      item.setAttribute('aria-label', `${nameText}, role: ${e.target.value}`);

      const offsetInput = item.querySelector('.svg-prep-offset-input');
      if (offsetInput) {
        if (e.target.value === 'ignore') {
          offsetInput.disabled = true;
          offsetInput.value = '0';
          offsets[idx] = 0;
        } else {
          offsetInput.disabled = false;
        }
      }

      // An ignored shape is not built at all, so it cannot be on a layer.
      const layerSelect = item.querySelector('.svg-prep-layer-select');
      if (layerSelect) layerSelect.disabled = e.target.value === 'ignore';
    }

    if (layersEnabled) validateAndMarkLayers();

    renderRoleLayer();
    requestResultPreview();
  }

  /**
   * Re-check every assignment against the containment law and mark the rows
   * that break it. NOTHING is reassigned: a row the person set stays as they
   * set it, wearing the reason it will not build.
   */
  function validateAndMarkLayers() {
    if (!layersEnabled || !nestingTree) return [];
    const problems = validateLayers(nestingTree, layers);
    const byIndex = new Map(problems.map((pr) => [pr.index, pr]));

    const items = refs.objects.querySelectorAll('.svg-prep-object');
    for (const item of items) {
      const idx = parseInt(item.dataset.index, 10);
      const note = item.querySelector('.svg-prep-layer-note');
      const select = item.querySelector('.svg-prep-layer-select');
      if (!note || !select) continue;
      const problem = byIndex.get(idx);
      if (problem) {
        note.textContent = layerProblemText(problem);
        note.hidden = false;
        item.classList.add('svg-prep-layer-problem');
        select.setAttribute('aria-invalid', 'true');
        select.setAttribute('aria-describedby', ensureNoteId(note, idx));
      } else {
        note.textContent = '';
        note.hidden = true;
        item.classList.remove('svg-prep-layer-problem');
        select.removeAttribute('aria-invalid');
        select.removeAttribute('aria-describedby');
      }
    }
    updateLayerSummary(problems.length);
    return problems;
  }

  function ensureNoteId(note, idx) {
    if (!note.id) note.id = `svg-prep-layer-note-${idx}`;
    return note.id;
  }

  /**
   * The containment law, said to a person rather than quoted at them.
   * STRINGS: owner review pending (accessibility-critical, DP-R1 text pack).
   */
  function layerProblemText(problem) {
    const below = problem.layer - 1;
    if (problem.reason === 'not-enclosed') {
      return `Nothing surrounds this shape, so layer ${problem.layer} would print with nothing under it. Put it on layer 1, or place it inside a shape on layer ${below}.`;
    }
    return `The shape around this one is not on layer ${below}, so it is cut away before layer ${problem.layer} is built. This shape would print with nothing under it.`;
  }

  function updateLayerSummary(problemCount) {
    if (!refs.layerSummary) return;
    if (!layersEnabled || layerCount === 0) {
      refs.layerSummary.hidden = true;
      return;
    }
    refs.layerSummary.hidden = false;
    const limitText =
      layerCount === 1
        ? 'This design supports 1 layer.'
        : `This design supports ${layerCount} layers.`;
    const problemText =
      problemCount === 0
        ? ''
        : problemCount === 1
          ? ' 1 shape needs a different layer.'
          : ` ${problemCount} shapes need a different layer.`;
    refs.layerSummary.textContent = limitText + problemText;
    refs.layerSummary.classList.toggle(
      'svg-prep-layer-summary-problem',
      problemCount > 0
    );
  }

  function handleLayerChange(e) {
    if (!layersEnabled) return;
    const target = e.target;
    if (!target || !target.classList.contains('svg-prep-layer-select')) return;
    const match = target.name.match(/^svg-prep-layer-(\d+)$/);
    if (!match) return;
    const idx = parseInt(match[1], 10);
    layers[idx] = parseInt(target.value, 10) || 1;

    const problems = validateAndMarkLayers();
    const mine = problems.find((pr) => pr.index === idx);
    if (mine) {
      announce(layerProblemText(mine));
    } else if (problems.length > 0) {
      // Moving one shape can strand a DIFFERENT one - lift the middle square
      // to layer 1 and it is the inner square that ends up standing on air.
      // Announcing only this row would report success while the design broke
      // somewhere the person is not looking.
      announce(
        problems.length === 1
          ? `Layer ${layers[idx]} set. 1 other shape now needs a different layer.`
          : `Layer ${layers[idx]} set. ${problems.length} other shapes now need a different layer.`
      );
    } else {
      announce(`Layer ${layers[idx]} set. This shape has something under it.`);
    }
  }

  function handleRolesToggle() {
    rolesVisible = !rolesVisible;
    refs.rolesToggleBtn.setAttribute('aria-pressed', String(rolesVisible));
    refs.legendRow.hidden = !rolesVisible;
    renderRoleLayer();
    liveRegion.textContent = rolesVisible
      ? 'Role colors shown'
      : 'Role colors hidden';
  }

  function handleOffsetChange(e) {
    const match =
      e.target.name && e.target.name.match(/^svg-prep-offset-(\d+)$/);
    if (!match) return;
    const idx = parseInt(match[1], 10);
    offsets[idx] = parseFloat(e.target.value) || 0;

    clearTimeout(offsetDebounceTimer);
    offsetDebounceTimer = setTimeout(() => {
      requestResultPreview();
      if (currentResult) {
        const item = refs.objects.querySelector(
          `.svg-prep-object[data-index="${idx}"]`
        );
        const nameSpan = item?.querySelector('.svg-prep-object-name');
        const nameText = nameSpan ? nameSpan.textContent : `Element ${idx + 1}`;
        liveRegion.textContent = `Offset for ${nameText} updated to ${offsets[idx]} mm`;
      }
    }, 300);
  }

  function handleDesignWidthChange() {
    clearTimeout(offsetDebounceTimer);
    offsetDebounceTimer = setTimeout(updateResultPreview, 300);
  }

  /**
   * Run the flatten because someone asked for it, and say so while it happens.
   *
   * The work is synchronous and, on a big drawing, long - DP-0 measured 56.7 s
   * at 200 shapes. So the waiting state is painted and announced, then a frame
   * is yielded, so the button really does look and read as busy instead of the
   * page freezing with the old label still on it.
   */
  function renderPreviewOnDemand() {
    if (!currentAnalysis) return;
    const count = liveElements.length;
    refs.renderBtn.disabled = true;
    refs.renderNote.textContent = `Combining ${count} shapes. This can take a while.`;
    const message = `Combining ${count} shapes. This can take a while.`;
    liveRegion.textContent = message;
    announce(message);

    // Two frames: one to paint the busy state, one to be sure it was painted
    // before the main thread is taken for the boolean.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const started = performance.now();
        updateResultPreview();
        const seconds = Math.max(
          1,
          Math.round((performance.now() - started) / 1000)
        );
        refs.renderBtn.disabled = false;
        refs.renderNote.textContent = currentResult
          ? `Preview is up to date. Change anything and you can render it again.`
          : staleNoteText();
        const done = currentResult
          ? `Preview ready. It took ${seconds} seconds.`
          : 'Preview could not be built from these choices.';
        liveRegion.textContent = done;
        announce(done);
      });
    });
  }

  // ── DP-4: deleting rows, and keeping the saved metadata honest ──────────

  /**
   * Rebuild the rows from `liveElements`, then put the kept roles and offsets
   * back on them.
   *
   * Re-running populateObjectList rather than surgically renumbering the DOM:
   * data-index, the radio group names, the offset input names and every
   * aria-label all carry the index, and a partial renumber that misses one of
   * them is a defect nobody sees until a radio in row 40 drives row 41.
   */
  function rebuildRows() {
    // DP-4: the band is a property of HOW MANY shapes there are, so it has to
    // be re-read after every delete and undo. Cutting a 210-shape drawing down
    // to 40 puts it in tier A, and the preview should start behaving like the
    // simple drawing it has just been made into.
    setPreviewBand();
    const keptRoles = [...roles];
    const keptOffsets = [...offsets];
    const keptLayers = [...layers];
    // Deleting a shape CHANGES what encloses what: remove the outer square and
    // the inner one is supported by nothing. The tree has to be rebuilt or the
    // law would be checked against a design that no longer exists. Deleting is
    // deliberate and occasional, so the 157 ms is affordable here in a way it
    // would not be on every role click.
    if (layersEnabled) {
      nestingTree = buildNestingTree(liveElements);
      layerCount = layerLimit(nestingTree);
    }
    const populated = populateObjectList(
      refs.objects,
      liveElements,
      liveRegion,
      Boolean(currentAnalysis?.isCompoundPathOnly),
      layersEnabled && layerCount > 0
        ? { limit: layerCount, suggestions: suggestLayers(nestingTree) }
        : null
    );
    roles = populated.roles;
    offsets = populated.offsets;
    layers = populated.layers;
    for (let i = 0; i < roles.length; i++) {
      if (keptRoles[i]) roles[i] = keptRoles[i];
      offsets[i] = keptOffsets[i] ?? 0;
      // A layer the person chose survives, but never above a limit the
      // shortened design can no longer support.
      if (keptLayers[i]) layers[i] = Math.min(keptLayers[i], layerCount || 1);
    }
    applyInitialOverrides(roles);
    applyInitialOffsets(offsets);
    applyLayerSelections();
    renderRoleLayer();
    requestResultPreview();
  }

  /** Push the current layer array back into the selects, then re-check. */
  function applyLayerSelections() {
    if (!layersEnabled || layerCount === 0) {
      updateLayerSummary(0);
      return;
    }
    const items = refs.objects.querySelectorAll('.svg-prep-object');
    for (const item of items) {
      const idx = parseInt(item.dataset.index, 10);
      const select = item.querySelector('.svg-prep-layer-select');
      if (select && layers[idx]) select.value = String(layers[idx]);
    }
    validateAndMarkLayers();
  }

  /**
   * The name a row shows, for announcements.
   * @param {number} i - Position in the CURRENT list
   */
  function rowName(i) {
    const item = refs.objects.querySelector(
      `.svg-prep-object[data-index="${i}"]`
    );
    const span = item?.querySelector('.svg-prep-object-name');
    return span ? span.textContent : `Element ${i + 1}`;
  }

  /**
   * Remove rows by their CURRENT positions, remembering enough to undo.
   * @param {number[]} positions
   * @param {string} what - How to describe them in the announcement
   */
  function deleteRows(positions, what) {
    if (!currentAnalysis || positions.length === 0) return;
    const doomed = new Set(positions);
    lastDeletion = {
      elements: [...liveElements],
      roles: [...roles],
      offsets: [...offsets],
      originalIndex: [...originalIndex],
    };
    const keep = (arr) => arr.filter((_, i) => !doomed.has(i));
    liveElements = keep(liveElements);
    roles = keep(roles);
    offsets = keep(offsets);
    originalIndex = keep(originalIndex);
    rebuildRows();
    updateDeleteUi();
    const message =
      positions.length === 1
        ? `Deleted ${what}. ${liveElements.length} shapes left. Undo available.`
        : `Deleted ${positions.length} shapes. ${liveElements.length} left. Undo available.`;
    liveRegion.textContent = message;
    announce(message);
  }

  /** Put the last deletion back. One level, by design. */
  function undoDelete() {
    if (!lastDeletion) return;
    liveElements = lastDeletion.elements;
    roles = lastDeletion.roles;
    offsets = lastDeletion.offsets;
    originalIndex = lastDeletion.originalIndex;
    lastDeletion = null;
    rebuildRows();
    updateDeleteUi();
    const message = `Undone. ${liveElements.length} shapes.`;
    liveRegion.textContent = message;
    announce(message);
  }

  /**
   * The bbox area of a row's path, in square millimetres.
   *
   * The viewBox-to-mm mapping is the one the offsets already use: the design's
   * width in mm (the header field) divided by the viewBox width. Quoting the
   * area in mm rather than SVG units matters because "smaller than 1" means
   * nothing without a unit, and the person is deciding about a printed thing.
   *
   * @param {number} i - Position in the CURRENT list
   * @returns {number} Area in mm squared, or 0 when it cannot be measured
   */
  function rowAreaMm2(i) {
    const el = liveElements[i];
    if (!el || !el.pathData) return 0;
    const vb = parseViewBox(currentSvgMeta?.viewBox);
    if (!vb || !vb.w) return 0;
    const designWidthMm = parseFloat(refs.designWidthInput.value) || 14;
    const perUnit = designWidthMm / vb.w;
    try {
      const box = getPathBBox(el.pathData);
      if (!box || !Number.isFinite(box.width) || !Number.isFinite(box.height)) {
        return 0;
      }
      return box.width * perUnit * (box.height * perUnit);
    } catch {
      return 0;
    }
  }

  /** Keep the delete controls telling the truth about what they can do. */
  function updateDeleteUi() {
    const count = liveElements.length;
    refs.undoDeleteBtn.disabled = !lastDeletion;
    refs.deleteSmallBtn.disabled = count === 0;
    refs.keepLargestBtn.disabled = count === 0;
    refs.bulkCount.textContent = `${count} ${count === 1 ? 'shape' : 'shapes'}`;
  }

  /** A click on a row's Delete, or on one of the bulk controls. */
  function handleDeleteClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.deleteIndex !== undefined) {
      const i = parseInt(btn.dataset.deleteIndex, 10);
      if (Number.isInteger(i)) deleteRows([i], rowName(i));
      return;
    }
    if (btn.dataset.action === 'undo-delete') {
      undoDelete();
    } else if (btn.dataset.action === 'delete-small') {
      const limit = parseFloat(refs.smallInput.value);
      if (!Number.isFinite(limit) || limit < 0) return;
      const doomed = [];
      for (let i = 0; i < liveElements.length; i++) {
        if (rowAreaMm2(i) < limit) doomed.push(i);
      }
      if (doomed.length === 0) {
        const nothing = `Nothing is smaller than ${limit} square millimetres.`;
        liveRegion.textContent = nothing;
        announce(nothing);
        return;
      }
      deleteRows(doomed, `${doomed.length} small shapes`);
    } else if (btn.dataset.action === 'keep-largest') {
      const keep = parseInt(refs.keepInput.value, 10);
      if (!Number.isInteger(keep) || keep < 1) return;
      if (keep >= liveElements.length) {
        const nothing = `There are already ${liveElements.length} or fewer shapes.`;
        liveRegion.textContent = nothing;
        announce(nothing);
        return;
      }
      const ranked = liveElements
        .map((_, i) => ({ i, area: rowAreaMm2(i) }))
        .sort((a, b) => b.area - a.area);
      const doomed = ranked.slice(keep).map((r) => r.i);
      deleteRows(doomed, `${doomed.length} smaller shapes`);
    }
  }

  function handleFooterClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'apply') {
      if (!currentResult) return;
      resolved = true;
      if (currentCallbacks.onApply) currentCallbacks.onApply(currentResult);
      close();
    } else if (btn.dataset.action === 'save') {
      if (!currentResult) return;
      const fileName = editedSvgFileName(currentSourceName);
      downloadSvgString(currentResult, fileName);
      liveRegion.textContent = `Saved ${fileName}`;
      announce(`Saved ${fileName}`);
      if (currentCallbacks.onSave) currentCallbacks.onSave(fileName);
    } else if (btn.dataset.action === 'save-dxf') {
      if (!currentResult || !currentCallbacks.onSaveDxf) return;
      // The host owns the conversion: it is the only layer with an engine.
      currentCallbacks.onSaveDxf(currentResult, currentSourceName);
    } else if (btn.dataset.action === 'keep') {
      currentResult = null;
      resolved = true;
      if (currentCallbacks.onKeepOriginal) currentCallbacks.onKeepOriginal();
      close();
    } else if (btn.dataset.action === 'reset') {
      if (currentAnalysis) {
        roles = liveElements.map((el) => {
          let role = el.autoRole || 'ignore';
          if (currentAnalysis.isCompoundPathOnly && role !== 'ignore') {
            role = 'foreground';
          }
          return role;
        });
        offsets = liveElements.map(() => 0);
        const items = refs.objects.querySelectorAll('.svg-prep-object');
        items.forEach((item, i) => {
          const role = roles[i];
          const radios = item.querySelectorAll('input[type="radio"]');
          radios.forEach((r) => {
            r.checked = r.value === role;
          });
          const offsetInput = item.querySelector('.svg-prep-offset-input');
          if (offsetInput) {
            offsetInput.value = '0';
            offsetInput.disabled = role === 'ignore';
          }
          const nameSpan = item.querySelector('.svg-prep-object-name');
          const nameText = nameSpan ? nameSpan.textContent : `Element ${i + 1}`;
          item.setAttribute('aria-label', `${nameText}, role: ${role}`);
        });
        renderRoleLayer();
        requestResultPreview();
      }
      liveRegion.textContent = 'Roles reset to auto-classification';
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  function applyInitialOverrides(overrides) {
    if (!Array.isArray(overrides)) return;
    overrides.forEach((role, i) => {
      if (i >= roles.length || !role) return;
      roles[i] = role;
      const item = refs.objects.querySelector(
        `.svg-prep-object[data-index="${i}"]`
      );
      if (!item) return;
      const radios = item.querySelectorAll('input[type="radio"]');
      radios.forEach((r) => {
        r.checked = r.value === role;
      });
      const nameSpan = item.querySelector('.svg-prep-object-name');
      const nameText = nameSpan ? nameSpan.textContent : `Element ${i + 1}`;
      item.setAttribute('aria-label', `${nameText}, role: ${role}`);
    });
  }

  function applyInitialOffsets(initialOffsets) {
    if (!Array.isArray(initialOffsets)) return;
    initialOffsets.forEach((val, i) => {
      if (i >= offsets.length) return;
      const num = typeof val === 'number' && Number.isFinite(val) ? val : 0;
      offsets[i] = num;
      const item = refs.objects.querySelector(
        `.svg-prep-object[data-index="${i}"]`
      );
      if (!item) return;
      const input = item.querySelector('.svg-prep-offset-input');
      if (input) input.value = String(num);
    });
  }

  /**
   * Re-index a saved array (original indices) onto the CURRENT rows.
   * @param {Array} saved
   * @returns {Array} One entry per surviving row, in row order
   */
  function byOriginalIndex(saved) {
    if (!Array.isArray(saved)) return [];
    return originalIndex.map((orig) => saved[orig]);
  }

  /**
   * Roles as an array indexed by ORIGINAL element index, so a saved project
   * can be reopened against a fresh analysis of the untouched source file.
   *
   * The editor reopens on the RAW svg and re-analyses it (ui-generator's Edit
   * button), so anything positional against the post-delete list would be
   * applied to the wrong shapes. Deleted positions are left undefined and the
   * deleted list carries them instead.
   */
  function getRoleOverrides() {
    const out = [];
    originalIndex.forEach((orig, i) => {
      out[orig] = roles[i];
    });
    return out;
  }

  function getOffsetOverrides() {
    const out = [];
    originalIndex.forEach((orig, i) => {
      out[orig] = offsets[i];
    });
    return out;
  }

  /** Original indices of the shapes removed from the list. */
  function getDeletedIndices() {
    const kept = new Set(originalIndex);
    const total = currentAnalysis?.elements?.length ?? 0;
    const out = [];
    for (let i = 0; i < total; i++) if (!kept.has(i)) out.push(i);
    return out;
  }

  /**
   * Layer per element, keyed by ORIGINAL index - the same numbering the role
   * and offset overrides travel in, and the only one that survives a delete.
   *
   * A SPARSE ARRAY, the same shape roles and offsets travel in, so the
   * persistence and reopen plumbing needs no special case for layers.
   *
   * @returns {{layers: Array, limit: number, problems: Array}} Empty when the
   *   tile did not opt in.
   */
  function getLayerAssignments() {
    if (!layersEnabled || layerCount === 0) {
      return { layers: [], limit: 0, problems: [] };
    }
    const out = [];
    originalIndex.forEach((original, live) => {
      out[original] = layers[live] || 1;
    });
    const problems = validateLayers(nestingTree, layers).map((pr) => ({
      ...pr,
      index: originalIndex[pr.index],
    }));
    return { layers: out, limit: layerCount, problems };
  }

  function open(svgString, analysis, callbacks = {}) {
    // A re-trace calls open() on an editor that is already up. Closing drops
    // it out of fullscreen and hands focus back to whatever opened it, which
    // is not what "the picture changed" should do to someone mid-adjustment.
    const wasFullscreen = isFullscreen;
    const focusedBefore = wasFullscreen ? document.activeElement : null;
    if (isOpen) dismiss();

    isOpen = true;
    resolved = false;
    rolesVisible = true;
    refs.rolesToggleBtn.setAttribute('aria-pressed', 'true');
    refs.legendRow.hidden = false;
    root.hidden = false;

    currentCallbacks = callbacks;
    currentSourceName = callbacks.sourceName || null;
    hostMode = callbacks.mode === 'file' ? 'file' : 'parameter';
    currentSvgString = svgString;
    currentAnalysis = analysis;
    currentSvgMeta = extractSvgMeta(svgString);

    // With no model behind the editor there is nothing for Apply to apply to,
    // and "Keep original" would keep it where? Saving is the whole task.
    refs.applyBtn.hidden = hostMode === 'file';
    refs.keepBtn.hidden = hostMode === 'file';
    refs.saveBtn.classList.toggle('btn-primary', hostMode === 'file');
    refs.saveBtn.classList.toggle('btn-secondary', hostMode !== 'file');
    // A file-mode host has no page behind the editor worth returning to, so
    // there is no inline size to shrink back into.
    refs.fullscreenBtn.hidden = hostMode === 'file';
    // Only offered where a host can actually convert: the engine lives there.
    refs.saveDxfBtn.hidden = typeof callbacks.onSaveDxf !== 'function';

    if (callbacks.tools) {
      // Re-inserting the SAME element would move it in the DOM, and moving a
      // node blurs whatever inside it had focus. A re-trace happens every time
      // a slider moves, so re-parenting here would throw a keyboard user out
      // of the control they are using, on every change.
      if (refs.toolsSlot.firstChild !== callbacks.tools) {
        refs.toolsSlot.replaceChildren(callbacks.tools);
      }
      refs.toolsSlot.hidden = false;
    } else {
      refs.toolsSlot.replaceChildren();
      refs.toolsSlot.hidden = true;
    }

    // DP-4: deletions are restored FIRST, so the roles and offsets that follow
    // are read against the list the person actually left behind. They travel as
    // ORIGINAL indices, which is the only numbering that survives a delete.
    const allElements = analysis.elements || [];
    const deleted = new Set(
      Array.isArray(callbacks.initialDeleted) ? callbacks.initialDeleted : []
    );
    originalIndex = allElements.map((_, i) => i).filter((i) => !deleted.has(i));
    liveElements = originalIndex.map((i) => allElements[i]);
    lastDeletion = null;

    // DP-7. The tree is built ONCE per open, on the geometry the emission
    // will actually use - analysis.elements carries stroke-converted pathData.
    // MEASURED (browser, WATAP HD, 831 elements): 157 ms on the converted
    // geometry against 9 ms on the raw. Recomputing it on every radio click
    // would be that cost per click, and the depth SUGGESTION is a starting
    // point that does not need to chase each role change.
    layersEnabled = callbacks.layersEnabled === true;
    if (layersEnabled) {
      nestingTree = buildNestingTree(liveElements);
      layerCount = layerLimit(nestingTree);
    } else {
      nestingTree = null;
      layerCount = 0;
    }

    const populated = populateObjectList(
      refs.objects,
      liveElements,
      liveRegion,
      Boolean(analysis.isCompoundPathOnly),
      layersEnabled && layerCount > 0
        ? { limit: layerCount, suggestions: suggestLayers(nestingTree) }
        : null
    );
    roles = populated.roles;
    offsets = populated.offsets;
    layers = populated.layers;

    if (callbacks.initialOverrides) {
      applyInitialOverrides(byOriginalIndex(callbacks.initialOverrides));
    }
    if (callbacks.initialOffsets) {
      applyInitialOffsets(byOriginalIndex(callbacks.initialOffsets));
    }
    if (layersEnabled && callbacks.initialLayers) {
      const saved = byOriginalIndex(callbacks.initialLayers);
      for (let i = 0; i < layers.length; i++) {
        const v = parseInt(saved[i], 10);
        if (v >= 1) layers[i] = Math.min(v, layerCount || 1);
      }
    }
    // Run the law once on open, so a design that already breaks it says so
    // instead of waiting for the person to touch a control first.
    applyLayerSelections();
    updateDeleteUi();

    renderWarnings(refs.warnings, analysis.warnings || []);

    renderSourcePane();
    renderRoleLayer();
    // DP-3: tier decides whether the boolean may run without being asked.
    // Anything the analyzer did not label is treated as tier A, so an older
    // caller keeps exactly the behaviour it had.
    setPreviewBand();
    if (autoPreview) {
      updateResultPreview();
    } else {
      markPreviewStale();
    }

    sourceZoomCleanup = setupPaneZoom(
      refs.sourcePane,
      refs.sourceZoom,
      currentSvgMeta.viewBox
    );
    resultZoomCleanup = setupPaneZoom(
      refs.resultPane,
      refs.resultZoom,
      currentSvgMeta.viewBox
    );
    highlightCleanup = setupObjectHighlighting();

    root.addEventListener('keydown', handleKeydown);
    refs.objects.addEventListener('change', handleRoleChange);
    refs.objects.addEventListener('change', handleLayerChange);
    refs.objects.addEventListener('input', handleOffsetChange);
    refs.designWidthInput.addEventListener('input', handleDesignWidthChange);
    refs.footer.addEventListener('click', handleFooterClick);
    // The render control lives under the result pane, not in the footer, so
    // the footer's delegated handler cannot see it.
    refs.renderBtn.addEventListener('click', renderPreviewOnDemand);
    refs.objects.addEventListener('click', handleDeleteClick);
    refs.bulkBar.addEventListener('click', handleDeleteClick);
    refs.rolesToggleBtn.addEventListener('click', handleRolesToggle);
    refs.closeBtn.addEventListener('click', close);
    refs.fullscreenBtn.addEventListener('click', handleFullscreenButton);
    refs.backdrop.addEventListener('click', closeFullscreen);

    if (wasFullscreen) {
      // Put it back the way it was, with focus where the person left it.
      openFullscreen({
        initialFocus:
          focusedBefore && root.contains(focusedBefore)
            ? focusedBefore
            : refs.closeBtn,
      });
      return;
    }

    announce('SVG Preparation Editor opened');

    // Small screens: the inline editor is cramped, expand automatically
    if (
      typeof window !== 'undefined' &&
      window.innerWidth < AUTO_FULLSCREEN_MAX_WIDTH
    ) {
      openFullscreen();
    }
  }

  function close() {
    if (!isOpen) return;

    // Closing without Apply/Keep counts as keeping the original
    if (!resolved) {
      resolved = true;
      currentResult = null;
      if (currentCallbacks.onKeepOriginal) currentCallbacks.onKeepOriginal();
    }

    if (isFullscreen) closeFullscreen();
    isOpen = false;
    root.hidden = true;

    if (sourceZoomCleanup) {
      sourceZoomCleanup();
      sourceZoomCleanup = null;
    }
    if (resultZoomCleanup) {
      resultZoomCleanup();
      resultZoomCleanup = null;
    }
    if (highlightCleanup) {
      highlightCleanup();
      highlightCleanup = null;
    }
    clearPanes();

    currentSvgString = null;
    currentAnalysis = null;
    currentSvgMeta = null;
    currentCallbacks = {};

    clearTimeout(offsetDebounceTimer);
    offsetDebounceTimer = null;

    root.removeEventListener('keydown', handleKeydown);
    refs.objects.removeEventListener('change', handleRoleChange);
    refs.objects.removeEventListener('input', handleOffsetChange);
    refs.designWidthInput.removeEventListener('input', handleDesignWidthChange);
    refs.footer.removeEventListener('click', handleFooterClick);
    refs.renderBtn.removeEventListener('click', renderPreviewOnDemand);
    refs.objects.removeEventListener('click', handleDeleteClick);
    refs.bulkBar.removeEventListener('click', handleDeleteClick);
    refs.rolesToggleBtn.removeEventListener('click', handleRolesToggle);
    refs.closeBtn.removeEventListener('click', close);
    refs.fullscreenBtn.removeEventListener('click', handleFullscreenButton);
    refs.backdrop.removeEventListener('click', closeFullscreen);

    announce('SVG Preparation Editor closed');
  }

  function openFullscreen({ initialFocus } = {}) {
    if (isFullscreen || !isOpen) return;

    isFullscreen = true;
    previousFocusEl = document.activeElement;

    // Portal: reparent root and backdrop to document.body to escape
    // any ancestor transform/will-change containing blocks (e.g. drawer).
    document.body.appendChild(refs.backdrop);
    document.body.appendChild(root);

    root.classList.add('svg-prep-fullscreen');
    refs.backdrop.classList.remove('hidden');
    refs.backdrop.setAttribute('aria-hidden', 'false');
    refs.fullscreenBtn.setAttribute('aria-label', 'Exit fullscreen');

    fullscreenTrap = createDocumentFocusTrap(root, {
      // In file mode there is nothing behind the editor: Escape must close it
      // outright rather than strand it inline at the foot of the page.
      onEscape: hostMode === 'file' ? close : closeFullscreen,
    });
    fullscreenTrap.activate({
      initialFocus: initialFocus || refs.closeBtn,
      initialFocusDelay: 50,
    });

    announce('SVG editor expanded to fullscreen');
  }

  function closeFullscreen() {
    if (!isFullscreen) return;

    isFullscreen = false;

    root.classList.remove('svg-prep-fullscreen');
    refs.backdrop.classList.add('hidden');
    refs.backdrop.setAttribute('aria-hidden', 'true');
    refs.fullscreenBtn.setAttribute('aria-label', 'Open fullscreen');

    // Portal: move root and backdrop back to original container
    containerEl.appendChild(refs.backdrop);
    containerEl.appendChild(root);

    if (fullscreenTrap) {
      fullscreenTrap.deactivate();
      fullscreenTrap = null;
    }

    if (previousFocusEl?.focus) previousFocusEl.focus();
    previousFocusEl = null;

    announce('Exited fullscreen SVG editor');
  }

  function toggleFullscreen() {
    if (isFullscreen) {
      closeFullscreen();
    } else {
      openFullscreen();
    }
  }

  // The fullscreen button is wired to this rather than openFullscreen so a
  // click event can never arrive where an options object is expected.
  function handleFullscreenButton() {
    toggleFullscreen();
  }

  function getResult() {
    return currentResult;
  }

  /**
   * Close programmatically without firing the keep-original callback.
   * Used when a new file replaces the one being edited.
   */
  function dismiss() {
    if (!isOpen) return;
    resolved = true;
    close();
  }

  function destroy() {
    if (isOpen) dismiss();
    if (refs.backdrop.parentNode)
      refs.backdrop.parentNode.removeChild(refs.backdrop);
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  return {
    open,
    close,
    dismiss,
    getResult,
    getRoleOverrides,
    getOffsetOverrides,
    getDeletedIndices,
    getLayerAssignments,
    destroy,
    openFullscreen,
    closeFullscreen,
    toggleFullscreen,
    _root: root,
    _refs: refs,
  };
}
