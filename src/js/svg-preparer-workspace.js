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
  measureAllThickness,
  THIN_PRINT_MM,
  THIN_PICTURE_PX,
} from './shape-thickness.js';
import {
  classifyElements,
  applyPerPathOffsets,
  FLATTEN_COST_DEFAULT,
  predictFlattenMs,
  flattenCostFrom,
} from './svg-preparer.js';
import {
  buildNestingTree,
  layerLimit,
  estimateRingPoints,
} from './svg-nesting.js';
import { getPathBBox } from 'svg-path-commander';
import { mmToSvgUnits } from './svg-offset.js';
import { isEnabled } from './feature-flags.js';
// Re-exported below so every caller keeps the import it already had. The
// flatten itself moved to a module a worker can load: see flatten-rings.js.
import { flattenWithRings } from './flatten-rings.js';
import { createFlattenRunner, FlattenCancelled } from './flatten-runner.js';

export { flattenWithRings };

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * How wide the editor takes a design to be printed when the model does not
 * say. The Design width control has offered this since DP-5 and the thin-line
 * advisory measures against it; it is one number in one place because two
 * copies of a default is this project's oldest bug (core rule 9).
 */
export const DEFAULT_DESIGN_WIDTH_MM = 14;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The three things a shape can be, in the words a person reads.
 *
 * "Raised", not "Foreground" (DP-Q40, 2026-09-14). Foreground is a word about
 * drawing programs; what this control decides is whether the shape STANDS UP
 * off the charm's face, which is the thing a finger will find. The value
 * underneath stays `foreground`, because that is the model's parameter and
 * changing a parameter is a different decision from changing a label.
 */
const ROLE_OPTIONS = [
  { value: 'foreground', label: 'Raised' },
  { value: 'hole', label: 'Hole' },
  { value: 'ignore', label: 'Ignore' },
];

// Compound paths only distinguish included vs excluded subpaths —
// "Hole" is meaningless because subpaths are concatenated, not subtracted.
const COMPOUND_ROLE_OPTIONS = [
  { value: 'foreground', label: 'Include' },
  { value: 'ignore', label: 'Exclude' },
];

/**
 * The legend's chips, in the words of whichever role table is in force.
 *
 * It is painted again when a drawing arrives, because a compound path is not
 * offered Raised / Hole / Ignore at all - it is offered Include / Exclude -
 * and a legend that disagrees with the control beside it, for the same
 * color, is the defect this pair was built to stop.
 *
 * @param {HTMLElement} legendRow
 * @param {Array<{value: string, label: string}>} options
 */
function paintLegend(legendRow, options) {
  legendRow.replaceChildren();
  options.forEach(({ value: role, label }) => {
    const chipWrap = document.createElement('span');
    chipWrap.className = 'svg-prep-legend-item';
    const chip = document.createElement('span');
    chip.className = `svg-prep-legend-chip svg-prep-legend-chip--${role}`;
    chip.setAttribute('aria-hidden', 'true');
    chipWrap.append(chip, document.createTextNode(label));
    legendRow.appendChild(chipWrap);
  });
}

/**
 * The word for a role, from whichever table is in force.
 *
 * The row's accessible name used to carry the VALUE - "role: foreground" -
 * which was the same word a sighted person read, right up until DP-Q40 made
 * the visible word "Raised". Blind and sighted people reading the same thing
 * is the whole point of the row this release signs, so the name reads the
 * label and nothing has to be kept in step by hand.
 *
 * @param {string} value
 * @param {Array<{value: string, label: string}>} options
 * @returns {string}
 */
function roleWord(value, options) {
  const found = (options || ROLE_OPTIONS).find((o) => o.value === value);
  return found ? found.label : value;
}

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

/**
 * viewBox/width/height off an SVG, deriving a viewBox when it has none.
 *
 * Exported for DP-7's per-layer emission: every layer file must be written on
 * the SAME viewBox as the design, or the passes print offset from each other.
 *
 * @param {string} svgString
 * @returns {{viewBox: string, width: string, height: string}}
 */
export function extractSvgMeta(svgString) {
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

  // G0 (DP-24): the edited drawing is the editor's one picture; the original
  // sits beside it only while this is pressed.
  const compareBtn = document.createElement('button');
  compareBtn.className = 'svg-prep-compare-btn btn btn-secondary';
  compareBtn.type = 'button';
  compareBtn.textContent = 'Compare with original';
  compareBtn.setAttribute('aria-pressed', 'false');

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
  designWidthInput.value = String(DEFAULT_DESIGN_WIDTH_MM);

  // Under the tools, above the picture. It started in the header beside the
  // width control - the two numbers do belong together - but the header is a
  // flex row of buttons and the sentence collapsed to nothing between them.
  // An e2e caught it reading the right words at zero width. A sentence that
  // has to wrap does not live in a button row.
  //
  // Not inside designWidthGroup either: that is hidden unless the offset
  // control is on, and a line that will not print is worth saying regardless.
  const thinLines = document.createElement('p');
  thinLines.className = 'svg-prep-thin-lines';
  thinLines.hidden = true;

  const designWidthUnit = document.createElement('span');
  designWidthUnit.className = 'svg-prep-design-width-unit';
  designWidthUnit.textContent = 'mm';

  designWidthLabel.append(designWidthInput, ' ', designWidthUnit);
  designWidthGroup.appendChild(designWidthLabel);

  header.append(
    title,
    designWidthGroup,
    compareBtn,
    rolesToggleBtn,
    fullscreenBtn,
    closeBtn
  );

  // Dual preview panes
  const previews = document.createElement('div');
  previews.className = 'svg-prep-previews';

  const sourcePaneWrap = document.createElement('div');
  sourcePaneWrap.className = 'svg-prep-pane-wrap svg-prep-pane-wrap--source';
  // One picture by default (DP-24): the original waits behind Compare.
  sourcePaneWrap.hidden = true;

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
  resultPaneWrap.className = 'svg-prep-pane-wrap svg-prep-pane-wrap--result';

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
  bulkBar.setAttribute('aria-label', 'Remove or ignore shapes');

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

  // DP-54: the shapes too thin to print, and one press to leave them out.
  // Opt-in: nothing is ignored until the button is pressed, every row keeps
  // its own Raised / Hole / Ignore control, and Undo ignore is one level.
  const thinLabel = document.createElement('label');
  thinLabel.className = 'svg-prep-bulk-field';
  thinLabel.append(document.createTextNode('Thinner than '));
  const thinInput = document.createElement('input');
  thinInput.type = 'number';
  thinInput.className = 'svg-prep-bulk-input svg-prep-thin-input';
  thinInput.min = '0';
  thinInput.step = '0.1';
  thinInput.value = String(THIN_PRINT_MM);
  thinInput.setAttribute('aria-describedby', bulkHelp.id);
  thinLabel.append(thinInput, document.createTextNode(' mm'));

  const ignoreThinBtn = document.createElement('button');
  ignoreThinBtn.type = 'button';
  ignoreThinBtn.className = 'btn btn-secondary svg-prep-bulk-btn';
  ignoreThinBtn.dataset.action = 'ignore-thin';
  ignoreThinBtn.textContent = 'Ignore those';
  ignoreThinBtn.setAttribute(
    'aria-label',
    'Ignore the shapes thinner than this'
  );

  const undoIgnoreBtn = document.createElement('button');
  undoIgnoreBtn.type = 'button';
  undoIgnoreBtn.className = 'btn btn-secondary svg-prep-bulk-btn';
  undoIgnoreBtn.dataset.action = 'undo-ignore';
  undoIgnoreBtn.textContent = 'Undo ignore';
  undoIgnoreBtn.disabled = true;

  // DP-39 P2. A selection nobody can act on is not a feature, and Delete is
  // the thing people said they wanted it for. It says how many, because "3"
  // is the whole reason somebody selected rather than deleted one at a time.
  const deleteSelectedBtn = document.createElement('button');
  deleteSelectedBtn.type = 'button';
  deleteSelectedBtn.className = 'btn btn-secondary svg-prep-bulk-btn';
  deleteSelectedBtn.dataset.action = 'delete-selected';
  deleteSelectedBtn.textContent = 'Remove from list';
  deleteSelectedBtn.hidden = true;

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
    thinLabel,
    ignoreThinBtn,
    undoIgnoreBtn,
    deleteSelectedBtn,
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
  // DP-53: the combine runs by itself, so the drawing view has no button
  // to ask for it. The row still carries the bar and Cancel while it runs.
  renderBtn.hidden = true;

  // DP-37 P2: while the combine runs it runs in a worker, so there is a bar to
  // watch and a way to stop it. A native <progress> with no value: the ring
  // union is one call into the engine and cannot say where it has got to, and
  // an honest bar with no number beats a number that is made up.
  const renderProgress = document.createElement('progress');
  renderProgress.className = 'svg-prep-render-progress';
  renderProgress.id = 'svgPrepRenderProgress';
  renderProgress.hidden = true;
  // A <label for> does NOT name a <progress> in Chromium - measured at DP-34,
  // where the same mistake left the trace's bar unnamed. aria-labelledby does.
  renderProgress.setAttribute('aria-labelledby', renderNote.id);

  const renderCancelBtn = document.createElement('button');
  renderCancelBtn.type = 'button';
  renderCancelBtn.className = 'btn btn-secondary svg-prep-render-cancel';
  renderCancelBtn.dataset.action = 'cancel-render';
  renderCancelBtn.textContent = 'Cancel';
  renderCancelBtn.hidden = true;
  renderCancelBtn.setAttribute('aria-describedby', renderNote.id);

  renderRow.append(renderNote, renderProgress, renderBtn, renderCancelBtn);
  resultPaneWrap.append(resultCaption, resultPane, renderRow);

  previews.append(sourcePaneWrap, resultPaneWrap);
  previews.classList.add('svg-prep-previews--single');

  // Role color legend (shown under the source pane)
  const legendRow = document.createElement('div');
  legendRow.className = 'svg-prep-legend';
  paintLegend(legendRow, ROLE_OPTIONS);

  // DP-7. How many layers this artwork can carry, and how many rows currently
  // break the containment law. Sits OUTSIDE the role="list" (D-101).
  const layerSummary = document.createElement('p');
  layerSummary.className = 'svg-prep-layer-summary';
  layerSummary.hidden = true;

  // DP-54: how many shapes are under the print floor at the design width,
  // said above the list. A status region, so a screen reader hears the count
  // change as the width or the floor moves.
  const thinNotice = document.createElement('p');
  thinNotice.className = 'svg-prep-thin-notice';
  thinNotice.setAttribute('role', 'status');
  thinNotice.setAttribute('aria-live', 'polite');
  thinNotice.hidden = true;
  const thinMarkPrefix = `svg-prep-thin-${Math.random().toString(36).slice(2, 8)}`;

  // Object list
  const objects = document.createElement('div');
  objects.className = 'svg-prep-objects';
  objects.setAttribute('role', 'list');
  objects.setAttribute('aria-label', 'Shapes');

  // DP-47: the keys, said once, where a person meets the list.
  //
  // A shortcut nobody is told about is a shortcut nobody has. It is a
  // DESCRIPTION rather than aria-keyshortcuts, because the keys belong to the
  // selection and not to any one control - and it is read out when the list is
  // entered, which is the moment it is useful.
  const objectsHelp = document.createElement('p');
  objectsHelp.className = 'sr-only';
  objectsHelp.id = `svg-prep-objects-help-${Math.random().toString(36).slice(2, 8)}`;
  objectsHelp.textContent =
    'Click a shape to choose it. Ctrl or Cmd adds one, Shift takes a range, ' +
    'Ctrl+A takes all. Delete sets the chosen shapes to Ignore.';
  objects.setAttribute('aria-describedby', objectsHelp.id);

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
  // DP-46: one word on the button, the whole sentence in the accessible name.
  // The row has to hold six controls at the editor's real 692 px, and "Apply
  // prepared SVG" is a third of that on its own; but a person listening still
  // needs to know WHAT is applied and WHERE it goes.
  applyBtn.textContent = 'Apply';
  applyBtn.setAttribute(
    'aria-label',
    'Apply the prepared drawing to your design'
  );

  const applyHint = document.createElement('span');
  applyHint.className = 'svg-prep-apply-hint';
  applyHint.textContent = 'No shapes included';
  applyHint.hidden = true;

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-secondary';
  saveBtn.dataset.action = 'save';
  saveBtn.textContent = 'Save SVG';
  saveBtn.setAttribute(
    'aria-label',
    'Save the edited SVG to a file on this computer'
  );

  const saveDxfBtn = document.createElement('button');
  saveDxfBtn.className = 'btn btn-secondary';
  saveDxfBtn.dataset.action = 'save-dxf';
  saveDxfBtn.textContent = 'Save DXF';
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

  // ★ The picture first, at every width (audit 21).
  //
  // The ink panel used to come before it, and the panel is tall: MEASURED with
  // a traced icon through the Edit Drawing door, the panel ran 694 px at 1280,
  // 853 at 900 and 1,242 at 412, which put "Will print as" at y 862, y 1,024
  // and y 1,590. On a 900-tall window the person's own picture was below the
  // fold at every width, and nearly two screens down on a phone - so the first
  // thing they met after choosing a picture was a column of settings for a
  // drawing they could not see.
  //
  // What sits with the picture stays with it: the thin-line advisory and the
  // tint legend both describe what is in the frame above them.
  root.append(
    header,
    previews,
    thinLines,
    legendRow,
    toolsSlot,
    thinNotice,
    layerSummary,
    bulkBar,
    objects,
    // On the ROOT rather than beside the list, because a host may move the
    // list into a panel of its own (the surface does) and aria-describedby
    // reaches across the whole document by id.
    objectsHelp,
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
      thinLines,
      compareBtn,
      rolesToggleBtn,
      fullscreenBtn,
      closeBtn,
      previews,
      sourcePane,
      sourcePaneWrap,
      resultPane,
      resultPaneWrap,
      sourceCaption,
      resultCaption,
      legendRow,
      layerSummary,
      sourceZoom,
      resultZoom,
      bulkBar,
      deleteSelectedBtn,
      bulkCount,
      smallInput,
      keepInput,
      thinNotice,
      thinInput,
      ignoreThinBtn,
      undoIgnoreBtn,
      thinMarkPrefix,
      deleteSmallBtn,
      keepLargestBtn,
      undoDeleteBtn,
      renderRow,
      renderNote,
      renderBtn,
      renderProgress,
      renderCancelBtn,
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

  // D-153: once the picture is zoomed there was no way to move the view on a
  // desktop, and only two fingers on a phone. Four buttons, a quarter of a
  // view each; the arrow keys do the same with the picture focused.
  const pan = (dir, glyph, label) => {
    const btn = document.createElement('button');
    btn.className = `svg-prep-pan svg-prep-pan-${dir}`;
    btn.setAttribute('aria-label', label);
    btn.textContent = glyph;
    return btn;
  };
  container.append(
    fitBtn,
    zoomInBtn,
    zoomOutBtn,
    pan('left', '\u25C0', `Move the ${pane} view left`),
    pan('up', '\u25B2', `Move the ${pane} view up`),
    pan('down', '\u25BC', `Move the ${pane} view down`),
    pan('right', '\u25B6', `Move the ${pane} view right`)
  );
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
 * @param {{limit: number}|null} [layerInfo=null] - How many layers this
 *   drawing can offer; null for a tile that did not ask for the column. The
 *   starting VALUE is always layer 1 (D-142).
 * @returns {{roles: string[], offsets: number[], layers: number[]}} Initial
 *   assignments
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
    // SIGNED BY THE OWNER at DP-Q45 (2026-09-14): "Shape", not "Subpath".
    // A subpath is SVG's word for an internal detail of a path's `d`
    // attribute, and nobody in this editor is choosing about a `d` attribute -
    // they are choosing whether a shape is part of the drawing. It became
    // worth saying when DP-Q43 made Potrace the default: Potrace returns one
    // compound path, so this branch went from occasional to usual and the word
    // is now what a screen reader says about every traced picture. Element
    // mode keeps describeElement's richer names, which say something true
    // about the shape ("Circle 3 (r=12)").
    const name = isCompound ? `Shape ${i + 1}` : describeElement(el.element, i);
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
    item.setAttribute('aria-label', `${name}, ${roleWord(role, roleOptions)}`);

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

    // DP-39 P2, row model A (DP-Q36): offset, Layer and Delete stop competing
    // with the name for the one line and live behind one control instead.
    //
    // A button and a panel it names, not a <details>: the panel has to take
    // the row's full width when it opens, and a <details> keeps its summary
    // and its panel in one box, so the row would either grow a narrow column
    // or need `display: contents` to escape it. An absolutely positioned menu
    // was the other way and would be clipped by the drawer that scrolls these
    // rows, on the row that most needs it - the last one.
    const moreId = `svg-prep-more-${i}`;
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'svg-prep-more-btn';
    moreBtn.dataset.moreIndex = String(i);
    moreBtn.textContent = 'More';
    // The visible word is the same on every row, so the accessible name says
    // which row it belongs to - and it CONTAINS the visible word, which is
    // what anybody driving this by voice will say.
    moreBtn.setAttribute('aria-label', `More for ${name}`);
    moreBtn.setAttribute('aria-expanded', 'false');
    moreBtn.setAttribute('aria-controls', moreId);

    const morePanel = document.createElement('div');
    morePanel.className = 'svg-prep-more-panel';
    morePanel.id = moreId;
    morePanel.hidden = true;

    item.append(moreBtn, morePanel);

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
      morePanel.appendChild(offsetInput);
    }

    if (layerCount > 0) {
      // ★ D-142 (DP-51, the owner's second walk of 2026-09-16): EVERY SHAPE
      // STARTS ON LAYER 1. This used to pre-select the shape's nesting depth.
      // MEASURED on the owner's CREATE logo in Colors: 394 of 553 rows opened
      // on layer 2 and 158 on layer 3, so the counter inside the R read
      // "Layer 3" and Apply emitted a three-layer stack nobody had built.
      // Nesting depth still decides how many layers a drawing can OFFER
      // (layerLimit, below); it no longer decides what a shape sits on. A
      // stack is something a person builds (D-135, the owner at DP-Q44).
      layers.push(1);

      const layerSelect = document.createElement('select');
      layerSelect.className = 'svg-prep-layer-select';
      layerSelect.name = `svg-prep-layer-${i}`;
      layerSelect.setAttribute('aria-label', `Layer for ${name}`);
      for (let n = 1; n <= layerCount; n++) {
        const opt = document.createElement('option');
        opt.value = String(n);
        opt.textContent = `Layer ${n}`;
        if (n === 1) opt.selected = true;
        layerSelect.appendChild(opt);
      }
      if (role === 'ignore') layerSelect.disabled = true;
      morePanel.appendChild(layerSelect);
    } else {
      layers.push(1);
    }

    if (el.warnings && el.warnings.length > 0) {
      const warning = document.createElement('span');
      warning.className = 'svg-prep-object-warning';
      warning.setAttribute('aria-label', el.warnings.join('; '));
      warning.textContent = '\u26A0';
      // Beside the NAME, not after the menu button. It is an advisory about
      // this shape, and appended at the end it read as though it belonged to
      // More - which is a control, not a shape.
      nameSpan.after(warning);
    }

    // DP-4. Ignore already removes a shape from the OUTPUT; this removes it
    // from the LIST. At 831 rows that is the difference between a table you
    // can work in and one you only scroll past.
    //
    // DP-47: it says "Remove from list" now. The Delete KEY sets a shape to
    // Ignore and leaves it in the list, so two things called Delete would mean
    // two different things one press apart.
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'svg-prep-object-delete';
    deleteBtn.dataset.deleteIndex = String(i);
    deleteBtn.textContent = 'Remove from list';
    deleteBtn.setAttribute('aria-label', `Remove ${name} from the list`);
    morePanel.appendChild(deleteBtn);

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
 * from is still recognizable in what goes back, which is the whole point when
 * the file is traveling between two tools and a person.
 *
 * @param {string|null} sourceName - The file the editor was opened on
 * @returns {string}
 */
/**
 * Under this, a 0.4 mm nozzle cannot be relied on to lay a line down. One
 * number, kept where the per-shape measure lives (DP-54); DP-Q58 signed it.
 */
export const THIN_LINE_MM = THIN_PRINT_MM;

/**
 * What to say about how thin the lines are, at the size this will be printed.
 *
 * The measurement arrives in picture pixels, which mean nothing to anybody: a
 * three-pixel line on a 700-pixel icon is 0.06 mm on a charm and 0.6 mm on a
 * coaster. It only becomes a fact a person can act on once it is converted at
 * the width the design will actually be, so this needs that width and says
 * which one it used.
 *
 * A PROPOSAL, never an action. MEASURED on nine stock icons at charm size,
 * their outlines land between 0.31 and 0.65 mm: some print and some do not,
 * and a blanket offset applied to all of them would fatten the ones that were
 * already fine. So it names the lever and leaves the hand on it.
 *
 * @param {{p10: number}|null} lineWidthPx from the trace summary
 * @param {number} pictureWidthPx the traced picture's width
 * @param {number} designWidthMm how wide this will be printed
 * @param {boolean} [widthKnown] false when designWidthMm is the editor's own
 *   default rather than a width read from the model
 * @returns {string} empty when there is nothing measured to say
 */
export function thinLineSentence(
  lineWidthPx,
  pictureWidthPx,
  designWidthMm,
  widthKnown = true
) {
  const p10 = lineWidthPx && lineWidthPx.p10;
  if (!p10 || !(pictureWidthPx > 0) || !(designWidthMm > 0)) return '';

  const mm = (p10 * designWidthMm) / pictureWidthPx;
  if (mm >= THIN_LINE_MM) return 'Lines look thick enough to print.';

  const at = widthKnown
    ? `${+designWidthMm.toFixed(1)} mm wide`
    : `${+designWidthMm.toFixed(1)} mm wide, the editor's default width`;
  return (
    `Thin lines: about ${mm.toFixed(2)} mm at ${at}. ` +
    `Lines under ${THIN_LINE_MM} mm may not print. ` +
    'Raise Design offset (0.6 suits a 0.4 mm nozzle) or make the design bigger.'
  );
}

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

/**
 * DP-53: how long the changes have to settle before the combine runs by
 * itself. A person clicking through a column of radios makes one combine,
 * not one per click; a change during a combine supersedes it.
 */
export const COMBINE_SETTLE_MS = 350;

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
  let picturePointerCleanup = null;
  let offsetDebounceTimer = null;
  // DP-53: the combine runs by itself after every change, once the changes
  // settle. The owner's instruction of 2026-09-16 (plan §1.6, item 1)
  // superseded DP-Q33's budget for the decision to RUN it; the prediction now
  // phrases the wait instead of gating the work, and DP-Q34 stands (the
  // painted stand-in is the picture until a result exists).
  let combineSettleTimer = null;
  let combineWaiters = [];
  // True once Apply or Keep original has fired; closing without either
  // triggers the keep-original callback so the original is never silently
  // replaced by an auto-prepared version.
  let resolved = false;
  let rolesVisible = true;
  // One picture by default (G0, DP-24); Compare turns the pair on.
  let compareOpen = false;
  // DP-3: whether the boolean flatten may run by itself. True only in tier A
  // (50 shapes or fewer), where DP-0 measured it at about a second.
  let autoPreview = true;
  // D-120: the flatten goes through the ring engine, which lives in the
  // lazy chunk. Loaded once at the first open; a preview asked for before
  // it lands is re-run the moment it does.
  let ringEngine = null;
  let ringEnginePromise = null;

  // DP-37 P2: the flatten runs off the main thread. MEASURED on it before this,
  // in Chromium over traced curves: 50 shapes 485 ms, 200 shapes 14.7 s, 800
  // shapes eight and a half minutes - every one of them with the page frozen.
  let flattenRunner = null;
  /** Where the measured constant is kept between visits. */
  const FLATTEN_COST_KEY = 'openscad-forge-flatten-cost';

  /**
   * The bounds a stored constant has to be inside to be believed.
   *
   * The whole measured range is 1.6e-4 (synthetic shapes) to 1.5e-3 (real
   * prepped artwork). These are two orders either side of that, which is wide
   * enough for a machine far slower or faster than any measured here and
   * narrow enough that a corrupted value cannot teach the app that a
   * thousand-shape drawing is free.
   */
  const FLATTEN_COST_MIN = 1e-6;
  const FLATTEN_COST_MAX = 1e-1;

  /** @returns {number} the remembered constant, or the default */
  function readFlattenCost() {
    try {
      const raw = localStorage.getItem(FLATTEN_COST_KEY);
      if (!raw) return FLATTEN_COST_DEFAULT;
      const value = Number(raw);
      if (!Number.isFinite(value)) return FLATTEN_COST_DEFAULT;
      if (value < FLATTEN_COST_MIN || value > FLATTEN_COST_MAX) {
        return FLATTEN_COST_DEFAULT;
      }
      return value;
    } catch {
      // A private window, or storage the person has turned off. The default
      // is a working answer, so there is nothing to report and nothing to fix.
      return FLATTEN_COST_DEFAULT;
    }
  }

  /** Keep what a real flatten just proved, for the next visit. */
  function writeFlattenCost(value) {
    try {
      localStorage.setItem(FLATTEN_COST_KEY, String(value));
    } catch {
      // Same: the session still has the number in hand.
    }
  }

  function getFlattenRunner() {
    if (!flattenRunner) flattenRunner = createFlattenRunner();
    return flattenRunner;
  }
  /**
   * Can the work actually leave this thread?
   *
   * Everywhere a person uses this, yes. Under jsdom there is no Worker at all,
   * and the alternative to running it inline there is not running the tests.
   * Narrow on purpose, and said out loud rather than discovered.
   */
  const canUseWorker = () => typeof Worker !== 'undefined';
  let previewWaitingForEngine = false;
  /**
   * Milliseconds per (shape x ring point), as this machine has measured it.
   *
   * DP-Q33 signed the calibration as well as the predictor because the
   * constant belongs to the artwork and the machine, not to the formula:
   * MEASURED, it moves less than a quarter within one class of drawing and
   * five-fold between classes. It starts at the default and is replaced by
   * the first real flatten big enough to have measured anything.
   *
   * The owner signed remembering it (2026-09-14): without that, the first
   * drawing of every visit is judged by the cautious default and some quick
   * drawings are handed a button they did not need. What is kept is ONE
   * number about this machine's speed - never a drawing, never a file name.
   */
  let flattenCost = readFlattenCost();
  function loadRingEngine() {
    if (!ringEnginePromise) {
      ringEnginePromise = import('./ring-geometry.js')
        .then((m) => {
          ringEngine = m;
          if (isOpen && previewWaitingForEngine) {
            previewWaitingForEngine = false;
            updateResultPreview();
          }
          return m;
        })
        .catch((err) => {
          ringEnginePromise = null;
          console.error('[SVG Prep] ring engine failed to load:', err);
          throw err;
        });
    }
    return ringEnginePromise;
  }
  // DP-4. Deleting a row shifts every index after it, and roles, offsets, the
  // rows' data-index, the radio names and the SAVED prepOverrides/prepOffsets
  // are ALL positional. So each surviving row remembers the index it had in
  // the analysis as first read, and everything that leaves this module is
  // expressed in those ORIGINAL indices. Without it, deleting one shape and
  // reopening the project would silently apply every later shape's role to
  // its neighbor.
  let originalIndex = [];
  // The element list as it stands after deletions - what the rows, roles and
  // offsets are parallel to. currentAnalysis.elements keeps the full original.
  let liveElements = [];
  // One level, this session only. A stack that rode prepMetadata into saved
  // projects would grow without bound in a 2 MB localStorage lane.
  let lastDeletion = null;
  // DP-54: every row's thickness at the width and floor as they stand, and
  // the last batch Ignore those made, for one level of undo.
  let thickness = null;
  let lastIgnore = null;
  // DP-7. The layer column appears only for a tile that asked for it, so a
  // non-layered editor is byte-for-byte what it was before.
  let layersEnabled = false;
  let nestingTree = null;
  let layerCount = 0;
  let layers = [];
  // D-142. A stack exists only once a person has built one: a Layer select
  // changed this session, or a saved column restored above layer 1. Until
  // then getLayerAssignments() reports no stack at all, so the emit leaves
  // every layer file empty and the charm is the ordinary design with its
  // holes cut - the "previous logic" the owner asked to come back.
  let layersTouched = false;
  // DP-19. When a host surface has mounted this workspace inside itself, the
  // host owns the announcements and the size: it says "opened" once, in its
  // own words, and it is already the biggest thing on the page, so there is
  // no cramped inline box to expand out of.
  let hosted = false;

  // ARIA live region for role-change and preview announcements
  const liveRegion = document.createElement('div');
  liveRegion.className = 'sr-only';
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  // On the root, never inside the object list: see populateObjectList (D-101).
  root.appendChild(liveRegion);

  // ── Internal rendering ────────────────────────────────────────────────

  /**
   * Draw the drawing into a pane, with its role tints over it.
   *
   * @param {HTMLElement} pane
   * @param {HTMLElement} before - the zoom controls to insert ahead of
   * @param {string} label - what a screen reader calls this picture
   * @param {boolean} [withOverlay] - add the hover-highlight layer, which only
   *   the pane the list points at has any use for
   * @returns {SVGElement|null}
   */
  function renderPictureInto(pane, before, label, withOverlay = false) {
    const existingSvg = pane.querySelector('svg');
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

    if (withOverlay) imported.appendChild(buildOverlay());
    imported.appendChild(buildHitLayer());

    markAsPicture(imported, label);
    pane.insertBefore(imported, before);
    return imported;
  }

  function renderSourcePane() {
    return renderPictureInto(
      refs.sourcePane,
      refs.sourceZoom,
      'Source SVG',
      true
    );
  }

  /**
   * ★ The picture that stands in until a combined result exists.
   *
   * Above the auto budget the result pane used to be EMPTY: `markPreviewStale`
   * removed the drawing and left a captioned box with nothing in it, and DP-24
   * had already hidden the source pane behind Compare. So a person who opened
   * a drawing of 210 shapes was shown "Will print as", an empty rectangle, two
   * zoom buttons floating in it, and a sentence telling them to press a button.
   * MEASURED at 1268 x 160 with no svg in it at all.
   *
   * "One picture" was built by hiding rather than by showing, and it was walked
   * on the one class of drawing - the bird, at tier A - that could not show it.
   *
   * So this fills it: the same drawing, with the same role tints, marked as not
   * yet combined. It is a picture of what the person HAS, standing where the
   * picture of what they will GET goes, and the button below says which is
   * which. Signed at DP-Q34.
   */
  function renderStandInResult() {
    // DP-47 P4: the name says what is IN the picture, because the picture now
    // changes with the roles. Somebody who cannot see it presses Ignore and
    // hears the count fall, which is the same answer the drawing gives.
    const counts = { foreground: 0, hole: 0, ignore: 0 };
    liveElements.forEach((el, i) => {
      if (!el.pathData) return;
      const role = roles[i] || 'ignore';
      if (counts[role] !== undefined) counts[role] += 1;
    });
    const picture = renderPaintedInto(
      refs.resultPane,
      refs.resultZoom,
      `The drawing as it is now: ${counts.foreground} raised, ` +
        `${counts.hole} ${counts.hole === 1 ? 'hole' : 'holes'}, ` +
        `${counts.ignore} left out, not yet combined`
    );
    if (picture) {
      picture.classList.add('svg-prep-standin');
      renderRoleLayer();
    }
    return picture;
  }

  /**
   * ★ The drawing as the ROLES have left it (DP-47 P4).
   *
   * The stand-in used to be the raw drawing with translucent role tints laid
   * over it, and the owner's sentence about that is the reason this exists:
   * "I tried to select and change the letters at the bottom and could not
   * ignore any path." Pressing Ignore changed a radio, a tint at 12 % opacity
   * and a number in a note - and left the shape sitting in the picture exactly
   * as before, because the picture WAS the original file. Above the combine
   * budget, which is where a drawing of any size lives, that is every visible
   * answer a person gets until they press Render preview.
   *
   * So this paints the picture from the live elements instead: raised shapes
   * in ink, holes in the paper color over them, and ignored shapes ABSENT.
   * An ignored letter leaves the drawing the moment it is ignored.
   *
   * The hit layer is still built from EVERY element, ignored ones included:
   * a shape you cannot see is still a shape you must be able to choose again,
   * and its row is still in the list pointing at it.
   */
  function renderPaintedInto(pane, before, label) {
    const existingSvg = pane.querySelector('svg');
    if (existingSvg) existingSvg.remove();
    if (!currentSvgString) return null;

    const svg = document.createElementNS(SVG_NS, 'svg');
    const viewBox =
      currentSvgMeta?.viewBox ||
      (() => {
        const parsed = new DOMParser().parseFromString(
          currentSvgString,
          'image/svg+xml'
        );
        return parsed.querySelector('svg')?.getAttribute('viewBox') || '';
      })();
    if (viewBox) svg.setAttribute('viewBox', viewBox);

    // Raised first, holes over them: a hole is a shape cut OUT of what it
    // sits in, and painting it under would show nothing at all.
    const art = document.createElementNS(SVG_NS, 'g');
    art.setAttribute('class', 'svg-prep-standin-art');
    const order = paintOrder();
    const paint = (wanted, className) => {
      order.forEach((i) => {
        const el = liveElements[i];
        if (!el.pathData || (roles[i] || 'ignore') !== wanted) return;
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', el.pathData);
        p.setAttribute('fill-rule', 'evenodd');
        p.setAttribute('class', className);
        art.appendChild(p);
      });
    };
    paint('foreground', 'svg-prep-standin-path--raised');
    paint('hole', 'svg-prep-standin-path--hole');
    svg.appendChild(art);

    // D-154: a shape set to Ignore used to leave the picture entirely, so
    // there was nothing to point at to bring it back. It stays, painted in
    // the left-out style, above the ink so it can be seen where it was.
    svg.appendChild(buildLeftOutLayer());

    const roleLayer = document.createElementNS(SVG_NS, 'g');
    roleLayer.setAttribute('class', 'svg-prep-role-layer');
    roleLayer.setAttribute('aria-hidden', 'true');
    svg.appendChild(roleLayer);

    svg.appendChild(buildOverlay());

    svg.appendChild(buildHitLayer());

    markAsPicture(svg, label);
    pane.insertBefore(svg, before);
    return svg;
  }

  function clearSvgGroup(group) {
    while (group.firstChild) group.removeChild(group.firstChild);
  }

  /**
   * Render one translucent tint path per descriptor, color-coded by its
   * current role, into the role layer of the source pane.
   */
  function renderRoleLayer() {
    // Every layer, not just the source pane's: the stand-in picture in the
    // result pane carries one too, and the two must never disagree about what
    // color a shape is.
    const layers = root.querySelectorAll('.svg-prep-role-layer');
    layers.forEach((layer) => paintRoleLayer(layer));
    // A rebuilt picture is a picture with an empty selection group in it, and
    // the selection did not change just because the drawing was repainted.
    paintSelectionLayers();
  }

  /**
   * One shape per element, invisible, on top, and the only thing in the
   * picture a pointer can hit.
   *
   * DP-40: the list can already point at the picture (DP-39 P3); this is the
   * other direction. It is its own layer rather than the role tints, because
   * the tints are a VIEW - "Show roles" turns them off - and a picture you can
   * no longer touch because you turned the colors off would be a strange
   * thing to build.
   *
   * `pointer-events: all` is what makes an unpainted shape hittable: it means
   * "answer for your fill and your stroke whatever they are painted", which is
   * the only way a stroke-only drawing (every CAD export, D-118's whole
   * subject) can be pointed at at all.
   */
  /**
   * The marks layer of a picture: what a person CHOSE, and where the pointer
   * IS. Two groups, because one must not wipe the other - the selection stays
   * until it is changed and the hover mark is cleared on every move.
   */
  function buildOverlay() {
    const overlay = document.createElementNS(SVG_NS, 'g');
    overlay.setAttribute('class', 'svg-prep-overlay');
    overlay.setAttribute('aria-hidden', 'true');
    const selectionLayer = document.createElementNS(SVG_NS, 'g');
    selectionLayer.setAttribute('class', 'svg-prep-overlay-selection');
    const hoverLayer = document.createElementNS(SVG_NS, 'g');
    hoverLayer.setAttribute('class', 'svg-prep-overlay-hover');
    overlay.append(selectionLayer, hoverLayer);
    return overlay;
  }

  /**
   * The wall behind a Colors drawing, while it is left out. MEASURED on the
   * owner's logo (DP-R5 session 4): that element is the whole canvas, so its
   * hit target sat under every point of the picture - pointing at the
   * background washed the whole drawing in the hover color, and a click on
   * empty space chose "Path 1, Ignore" instead of clearing the choice. Its row
   * stays, and a wall somebody raises is a shape again and can be pointed at.
   * Every other ignored shape keeps its target (DP-47 P4's rule).
   */
  function isIgnoredWall(el, i) {
    return (
      (roles[i] || 'ignore') === 'ignore' &&
      typeof el.element?.getAttribute === 'function' &&
      el.element.getAttribute('data-background') === 'true'
    );
  }

  /**
   * D-154: the shapes left out, painted so they can be seen and chosen
   * again. Every ignored shape but the wall of a Colors drawing, which is
   * the whole canvas and would flood the picture; its row still turns it on.
   */
  function buildLeftOutLayer() {
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.setAttribute('class', 'svg-prep-standin-left-out');
    layer.setAttribute('aria-hidden', 'true');
    paintOrder().forEach((i) => {
      const el = liveElements[i];
      if (!el.pathData || (roles[i] || 'ignore') !== 'ignore') return;
      if (isIgnoredWall(el, i)) return;
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', el.pathData);
      p.setAttribute('fill-rule', 'evenodd');
      p.setAttribute('class', 'svg-prep-standin-path--ignore');
      p.dataset.index = String(i);
      layer.appendChild(p);
    });
    return layer;
  }

  /**
   * D-159: the order the picture is painted and hit-tested in. Containers
   * first and islands last, by the box each outline fills, so the navy dot
   * inside the figure's arm is painted over the figure and is what a click
   * there finds. Element order put the wall's islands under everything.
   */
  function paintOrder() {
    const area = (el) => {
      if (!el.pathData) return 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      const nums = el.pathData.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
      if (!nums) return 0;
      for (let k = 0; k + 1 < nums.length; k += 2) {
        const x = Number(nums[k]);
        const y = Number(nums[k + 1]);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
    };
    return liveElements
      .map((el, i) => ({ i, a: area(el) }))
      .sort((p, q) => q.a - p.a || p.i - q.i)
      .map((p) => p.i);
  }

  function buildHitLayer() {
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.setAttribute('class', 'svg-prep-hit-layer');
    layer.setAttribute('aria-hidden', 'true');
    paintOrder().forEach((i) => {
      const el = liveElements[i];
      if (!el.pathData || isIgnoredWall(el, i)) return;
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', el.pathData);
      p.setAttribute('class', 'svg-prep-hit-path');
      p.dataset.index = String(i);
      layer.appendChild(p);
    });
    return layer;
  }

  function paintRoleLayer(layer) {
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
   * How big the combine on screen actually is: the shapes that will be folded
   * together, and the ring points they will make.
   *
   * Ignored shapes are left out of BOTH numbers because the flatten leaves
   * them out too, and the prediction and the calibration have to be measured
   * on the same thing or the constant learned from one would be read back
   * against the other.
   */
  function flattenSizeOf() {
    let shapes = 0;
    let points = 0;
    for (let i = 0; i < liveElements.length; i++) {
      if (roles[i] === 'ignore') continue;
      const pathData = liveElements[i] && liveElements[i].pathData;
      if (!pathData) continue;
      shapes++;
      points += estimateRingPoints(pathData);
    }
    return { shapes, points };
  }

  /**
   * Decide whether the combine may run by itself, from what it is PREDICTED to
   * cost rather than from how many shapes there are.
   *
   * DP-Q33 (2026-09-13) retired DP-Q9's 50 / 200 counts: the same 200 shapes
   * cost 77 ms as rectangles and 593 ms as curves, so a count was answering
   * the question in the wrong unit. The budget is in milliseconds and the
   * predictor is calibrated by this session's own flattens.
   */
  function setPreviewBand() {
    // DP-53: every drawing combines by itself, whatever it is predicted to
    // cost. The prediction is still made, to say how long the wait is.
    autoPreview = true;
    refs.renderRow.hidden = true;
  }

  /**
   * A change was made: the pane goes stale at once, and the combine follows
   * once the changes settle.
   *
   * DP-3 measured the flatten at 1.0 s for 50 shapes, 56.7 s for 200 and
   * 447.9 s for 400 (the retired pairwise chain; the ring engine and the
   * worker have since replaced it), and DP-Q33 gated the automatic run on a
   * predicted 300 ms. DP-53 retires the gate: the combine always runs by
   * itself, in the worker, after the settle, and a change made while one is
   * in flight supersedes it (the runner's start() does that). A person who
   * keeps changing a very large drawing gets a result when they pause for
   * the predicted wait, and the status sentence says so.
   */
  function requestResultPreview() {
    markPreviewStale();
    clearTimeout(combineSettleTimer);
    combineSettleTimer = setTimeout(() => {
      combineSettleTimer = null;
      updateResultPreview();
    }, COMBINE_SETTLE_MS);
  }

  /**
   * Show that the result pane is out of date, rather than silently showing a
   * picture of older choices, and say that the combine is on its way.
   */
  function markPreviewStale({ keepZoom = true } = {}) {
    // currentResult === null IS "stale": Apply and Save already refuse on it,
    // so a second flag saying the same thing could only drift from it.
    currentResult = null;
    // The person's zoom outlives the picture: the stand-in that replaces the
    // result keeps the viewBox the result had, as the result keeps the
    // stand-in's when it lands.
    const previousViewBox = keepZoom
      ? refs.resultPane.querySelector('svg')?.getAttribute('viewBox') || null
      : null;
    // A combine already in flight is answering a question nobody is asking any
    // more: it was built from the choices as they stood BEFORE this change, so
    // letting it land would put the very picture of older choices into the
    // pane that this function exists to prevent. MEASURED on the 210-shape
    // drawing: a role changed 200 ms into the combine armed Apply fifteen
    // seconds later with the replaced choice's result. It could not happen
    // before DP-37 P2 - nothing could be clicked while the thread was taken.
    if (flattenRunner && flattenRunner.isRunning()) {
      flattenRunner.cancel('stale');
    }
    clearResultError();
    // The pane is REPLACED, never emptied. See renderStandInResult.
    renderStandInResult();
    if (previousViewBox) {
      const picture = refs.resultPane.querySelector('svg');
      if (picture) picture.setAttribute('viewBox', previousViewBox);
    }
    setApplyEnabled(false, combiningSentence());
  }

  /** Whether a combine is pending or in flight. */
  function isCombining() {
    return (
      combineSettleTimer !== null ||
      Boolean(flattenRunner && flattenRunner.isRunning())
    );
  }

  /**
   * Resolves once no combine is pending or in flight: the charm view's
   * Render preview waits on this before it asks for the current result.
   * @returns {Promise<void>}
   */
  function whenCombined() {
    if (!isCombining()) return Promise.resolve();
    return new Promise((resolve) => {
      combineWaiters.push(resolve);
    });
  }

  function settleCombineWaiters() {
    if (isCombining()) return;
    const waiting = combineWaiters;
    combineWaiters = [];
    waiting.forEach((resolve) => resolve());
  }

  /**
   * The predicted wait in words somebody can act on.
   *
   * A number of milliseconds is not a decision. "About four seconds" is: a
   * person can decide to wait for that, and cannot decide anything about
   * 3,847. The bands are coarse on purpose - the prediction is good to a
   * factor, not to a digit, and a sentence precise beyond its own accuracy
   * is a lie with a decimal point in it.
   */
  function waitInWords(ms) {
    if (ms < 1500) return 'about a second';
    if (ms < 90000) return `about ${Math.round(ms / 1000)} seconds`;
    return `about ${Math.round(ms / 60000)} minutes`;
  }

  /**
   * The status sentence while the shapes are being combined (DP-53). Both
   * numbers read fresh: holding the prediction from when the band was last set
   * would let the count move while the duration stood still.
   */
  function combiningSentence() {
    const { shapes, points } = flattenSizeOf();
    const ms = predictFlattenMs(shapes, points, flattenCost);
    return (
      `Combining ${shapes} shapes, ${waitInWords(ms)}. ` +
      'Apply is ready when they are combined.'
    );
  }

  /** Show the combine as work in progress, with a way to stop it. */
  function setRenderBusy(busy) {
    // The bar and the Cancel button live INSIDE the render row, and on an
    // auto-preview drawing that row is hidden - so unhiding the two of them
    // showed a person NOTHING while the combine ran. The row is what reports
    // the work, at every tier; it goes back to the tier's own state after.
    refs.renderRow.hidden = busy ? false : autoPreview;
    refs.renderProgress.hidden = !busy;
    refs.renderCancelBtn.hidden = !busy;
    refs.resultPane.setAttribute('aria-busy', String(busy));
    if (busy) {
      const { shapes } = flattenSizeOf();
      refs.renderNote.textContent = `Combining ${shapes} shapes.`;
    }
  }

  async function updateResultPreview() {
    try {
      await runResultPreview();
    } finally {
      settleCombineWaiters();
    }
  }

  async function runResultPreview() {
    if (!currentAnalysis || !currentSvgMeta) return;

    // Preserve the user's zoom level across preview re-renders.
    //
    // ★ The old picture is NOT removed here. It used to be, and that was fine
    // while the combine finished inside this same turn - but the combine went
    // into a worker (DP-37 P2) and now the await below can last seconds, which
    // would leave the pane empty for all of them. That is the blank P1 just
    // repaired, reintroduced by making the work asynchronous. Whatever is in
    // the pane stays there until there is something better to put in it.
    const existingSvg = refs.resultPane.querySelector('svg');
    const previousViewBox = existingSvg
      ? existingSvg.getAttribute('viewBox')
      : null;
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
      const designWidthMm =
        parseFloat(refs.designWidthInput.value) || DEFAULT_DESIGN_WIDTH_MM;
      const svgOffsets = offsets.map((mm) =>
        mmToSvgUnits(mm, vbWidth, designWidthMm)
      );
      const withOffsets = applyPerPathOffsets(classified, svgOffsets);

      const isCompound = currentAnalysis.isCompoundPathOnly;
      let resultSvgString;
      if (isCompound) {
        resultSvgString = concatenateSubpaths(withOffsets, currentSvgMeta);
      } else if (canUseWorker()) {
        // D-120: order-independent ring flatten; never the pairwise chain.
        // DP-37 P2: and off this thread, because it is the most expensive
        // thing this app does to a drawing and it used to freeze the page for
        // as long as it took.
        setRenderBusy(true);
        // There is no result to apply until the combine lands. Pressing Apply
        // used to be impossible too early because the combine finished inside
        // this same turn; now it is seconds of worker start-up and work, and
        // Apply's handler refuses on a null result by RETURNING - so the
        // button sat enabled and did nothing at all when pressed. Firefox on
        // CI pressed it in that window and the stack was never built.
        setApplyEnabled(false, combiningSentence());
        try {
          const size = flattenSizeOf();
          const out = await getFlattenRunner().start(
            withOffsets,
            currentSvgMeta
          );
          resultSvgString = out.svg;
          // DP-Q33's calibration: what this drawing really cost, on this
          // machine, replaces the default for every prediction after it.
          const measured = flattenCostFrom(size.shapes, size.points, out.ms);
          if (measured !== null) {
            flattenCost = measured;
            writeFlattenCost(measured);
          }
        } catch (error) {
          // None of the three is a failure and none may be reported as one:
          // the person stopped this combine, a newer one replaced it, or the
          // choices it was built from changed under it.
          if (error instanceof FlattenCancelled) {
            if (error.reason === 'superseded') {
              // The job that replaced this one owns the pane now. Clearing the
              // busy state here would take the bar and the Cancel button away
              // from work that is still running, and tell a screen reader the
              // pane had settled while it had not.
              return;
            }
            setRenderBusy(false);
            // Only the person's own Cancel has anything to say here. A job
            // abandoned because the choices changed has already been spoken
            // for by markPreviewStale, and one dropped because the editor
            // closed has nowhere to say it.
            if (error.reason !== 'cancelled') return;
            currentResult = null;
            setApplyEnabled(
              false,
              'Combining was stopped, so there is no result to apply.'
            );
            // The way back is any change: the combine runs again by itself.
            refs.renderNote.textContent = 'Combining canceled.';
            liveRegion.textContent =
              'Combining canceled. Change anything and it runs again.';
            return;
          }
          setRenderBusy(false);
          currentResult = null;
          setApplyEnabled(
            false,
            'The shapes could not be combined, so there is nothing to apply.'
          );
          showResultError(
            `The drawing could not be combined: ${error.message}`
          );
          liveRegion.textContent = `The drawing could not be combined: ${error.message}`;
          return;
        }
        setRenderBusy(false);
      } else if (ringEngine) {
        // No Worker here, which in practice means a test environment. Running
        // it inline is the only way to run at all; see canUseWorker.
        resultSvgString = flattenWithRings(
          ringEngine,
          withOffsets,
          currentSvgMeta
        );
      } else {
        // The engine is still on its way (first open). No fallback to the
        // order-dependent path - the preview re-runs when the chunk lands.
        previewWaitingForEngine = true;
        loadRingEngine().catch(() => {});
        return;
      }

      if (!resultSvgString) {
        currentResult = null;
        setApplyEnabled(false);
        // The pane keeps the drawing rather than emptying: there is no result
        // to show, and showing nothing at all is the defect P1 repaired.
        renderStandInResult();
        liveRegion.textContent = 'No shapes included. The preview is empty.';
        return;
      }

      currentResult = resultSvgString;
      setApplyEnabled(true);

      // Now, and not before: the old picture held the pane while the combine
      // ran. And the zoom is read NOW, from that picture, not from when the
      // combine began: DP-53 runs the combine by itself and lets a person
      // pinch the stand-in meanwhile, and PR #240's board found the result
      // landing with the earlier viewBox, so two fingers did nothing.
      const stale = refs.resultPane.querySelector('svg');
      const keptViewBox = stale
        ? stale.getAttribute('viewBox') || previousViewBox
        : previousViewBox;
      if (stale) stale.remove();

      const parser = new DOMParser();
      const doc = parser.parseFromString(resultSvgString, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      if (!svg) return;

      const imported = document.importNode(svg, true);
      if (keptViewBox) imported.setAttribute('viewBox', keptViewBox);
      // The picture a person is looking at is the one the list has to be able
      // to point at, and since DP-37 P1 that is THIS one. ★ DP-47: through
      // the SAME builder as every other picture. This used to build a bare
      // overlay of its own, and the two marks that live in it went missing on
      // the combined result the moment they moved into groups - which is a
      // third copy of the same three lines, and exactly how the first two
      // copies drifted apart.
      // D-154: the combined result is what will print, and the shapes left
      // out are drawn over it in the left-out style, so they can be seen and
      // chosen again here too.
      imported.appendChild(buildLeftOutLayer());
      imported.appendChild(buildOverlay());
      imported.appendChild(buildHitLayer());
      markAsPicture(imported, 'Prepared result');
      refs.resultPane.insertBefore(imported, refs.resultZoom);

      const fgCount = withOffsets.filter(
        (el) => el.role !== 'ignore' && el.pathData
      ).length;
      const ignoredCount = withOffsets.filter(
        (el) => el.role === 'ignore'
      ).length;
      liveRegion.textContent = isCompound
        ? `Preview updated: ${fgCount} shapes included, ${ignoredCount} ignored.`
        : `Preview updated: ${fgCount} raised, ${withOffsets.filter((el) => el.role === 'hole' && el.pathData).length} holes.`;
    } catch (err) {
      console.error('[SVG Prep] Preview failed:', err);
      currentResult = null;
      setApplyEnabled(false);
      showResultError(
        'Preview failed for this combination. The original will be kept.'
      );
      liveRegion.textContent =
        'Preview failed for this combination. The original will be kept.';
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

    /**
     * D-153: move the view by a share of itself. The view's middle never
     * leaves the drawing's box, so the picture cannot be steered out of
     * sight; Fit brings the whole drawing back.
     */
    function handlePan(fx, fy) {
      const svg = getSvg();
      if (!svg) return;
      const cur = parseViewBox(svg.getAttribute('viewBox')) || { ...naturalVB };
      const x = cur.x + cur.w * fx;
      const y = cur.y + cur.h * fy;
      const minX = naturalVB.x - cur.w / 2;
      const maxX = naturalVB.x + naturalVB.w - cur.w / 2;
      const minY = naturalVB.y - cur.h / 2;
      const maxY = naturalVB.y + naturalVB.h - cur.h / 2;
      applyVB({
        x: Math.min(Math.max(x, minX), maxX),
        y: Math.min(Math.max(y, minY), maxY),
        w: cur.w,
        h: cur.h,
      });
    }
    const PAN_STEP = 0.25;
    const handlePanLeft = () => handlePan(-PAN_STEP, 0);
    const handlePanRight = () => handlePan(PAN_STEP, 0);
    const handlePanUp = () => handlePan(0, -PAN_STEP);
    const handlePanDown = () => handlePan(0, PAN_STEP);

    function handlePaneKeydown(e) {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePanLeft();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handlePanRight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handlePanUp();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handlePanDown();
      }
    }

    const fitBtn = zoomEl.querySelector('.svg-prep-zoom-fit');
    const zoomInBtn = zoomEl.querySelector('.svg-prep-zoom-in');
    const zoomOutBtn = zoomEl.querySelector('.svg-prep-zoom-out');
    const panLeftBtn = zoomEl.querySelector('.svg-prep-pan-left');
    const panRightBtn = zoomEl.querySelector('.svg-prep-pan-right');
    const panUpBtn = zoomEl.querySelector('.svg-prep-pan-up');
    const panDownBtn = zoomEl.querySelector('.svg-prep-pan-down');

    fitBtn.addEventListener('click', handleFit);
    zoomInBtn.addEventListener('click', handleZoomIn);
    zoomOutBtn.addEventListener('click', handleZoomOut);
    panLeftBtn?.addEventListener('click', handlePanLeft);
    panRightBtn?.addEventListener('click', handlePanRight);
    panUpBtn?.addEventListener('click', handlePanUp);
    panDownBtn?.addEventListener('click', handlePanDown);
    pane.addEventListener('keydown', handlePaneKeydown);

    // ── DP-40 P2: two fingers, signed at DP-Q37 ─────────────────────────
    //
    // A cache keyed by pointerId, which is the pattern the platform is built
    // for: a touch is not a mouse with one position, it is N pointers that
    // arrive and leave independently, and anything that tracks "the" pointer
    // gets the second finger wrong.
    //
    // The split is DP-Q37's: two fingers pinch and pan the picture, ONE
    // finger scrolls the page. That is `touch-action: pan-y` on the picture
    // and nowhere else - the browser keeps vertical panning, which is how
    // somebody gets DOWN a long editor on a phone, and hands us everything
    // else. A tap still lands as a click, so tapping a shape still chooses it.
    //
    // Nothing here is the only way to do anything (WCAG 2.5.7): Fit, + and -
    // are single-pointer, and the keyboard walks the panes.
    const pointers = new Map();
    let pinch = null;

    const spanOf = (a, b) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const midOf = (a, b) => ({
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    });

    function currentVB() {
      const svg = getSvg();
      if (!svg) return null;
      return parseViewBox(svg.getAttribute('viewBox')) || { ...naturalVB };
    }

    function onPointerDown(e) {
      if (e.pointerType === 'mouse') return;
      pointers.set(e.pointerId, e);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const vb = currentVB();
        if (!vb) return;
        pinch = {
          span: spanOf(a, b),
          mid: midOf(a, b),
          vb,
          box: pane.getBoundingClientRect(),
        };
      }
    }

    function onPointerMove(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, e);
      if (pointers.size !== 2 || !pinch) return;
      const [a, b] = [...pointers.values()];
      const span = spanOf(a, b);
      if (span <= 0 || pinch.span <= 0) return;
      e.preventDefault();

      // Fingers apart, viewBox smaller: a viewBox IS the window onto the
      // drawing, so zooming in means asking for less of it.
      const scale = pinch.span / span;
      const w = Math.max(
        naturalVB.w / 64,
        Math.min(naturalVB.w * 8, pinch.vb.w * scale)
      );
      const h = pinch.vb.h * (w / pinch.vb.w);

      // And the drawing follows the fingers: how far the midpoint moved, in
      // the units the viewBox is written in.
      const mid = midOf(a, b);
      const perPxX = pinch.vb.w / Math.max(1, pinch.box.width);
      const perPxY = pinch.vb.h / Math.max(1, pinch.box.height);
      const dx = (mid.x - pinch.mid.x) * perPxX;
      const dy = (mid.y - pinch.mid.y) * perPxY;

      applyVB({
        x: pinch.vb.x + (pinch.vb.w - w) / 2 - dx,
        y: pinch.vb.y + (pinch.vb.h - h) / 2 - dy,
        w,
        h,
      });
    }

    function onPointerUp(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
    }

    pane.addEventListener('pointerdown', onPointerDown);
    pane.addEventListener('pointermove', onPointerMove);
    pane.addEventListener('pointerup', onPointerUp);
    pane.addEventListener('pointercancel', onPointerUp);
    pane.addEventListener('pointerleave', onPointerUp);

    return () => {
      fitBtn.removeEventListener('click', handleFit);
      zoomInBtn.removeEventListener('click', handleZoomIn);
      zoomOutBtn.removeEventListener('click', handleZoomOut);
      panLeftBtn?.removeEventListener('click', handlePanLeft);
      panRightBtn?.removeEventListener('click', handlePanRight);
      panUpBtn?.removeEventListener('click', handlePanUp);
      panDownBtn?.removeEventListener('click', handlePanDown);
      pane.removeEventListener('keydown', handlePaneKeydown);
      pane.removeEventListener('pointerdown', onPointerDown);
      pane.removeEventListener('pointermove', onPointerMove);
      pane.removeEventListener('pointerup', onPointerUp);
      pane.removeEventListener('pointercancel', onPointerUp);
      pane.removeEventListener('pointerleave', onPointerUp);
      pointers.clear();
      pinch = null;
      pane.removeAttribute('tabindex');
    };
  }

  /**
   * The picture answers a pointer, and the list follows.
   *
   * Hover lights the shape up and marks its row; a press chooses it, with the
   * same Ctrl and Shift as the list. Signed at DP-Q37 and directive item 6.
   *
   * ★ Built on the SVG picture, NOT on the DP-20 canvas the plan named. That
   * line was written before DP-37 P1 made one picture the default; mounting a
   * second one to be able to touch it would undo the release that got the
   * editor down to a single drawing.
   */
  function setupPicturePointer() {
    const indexOf = (e) => {
      const hit = e.target.closest?.('.svg-prep-hit-path');
      if (!hit) return null;
      const i = parseInt(hit.dataset.index, 10);
      return Number.isInteger(i) ? i : null;
    };

    function paint(index) {
      hoverLayersIn(root).forEach((layer) => {
        clearSvgGroup(layer);
        const el = index === null ? null : liveElements[index];
        if (!el || !el.pathData) return;
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', el.pathData);
        p.setAttribute('class', 'svg-prep-highlight-path');
        layer.appendChild(p);
      });
      refs.objects.querySelectorAll('.svg-prep-object').forEach((r) => {
        r.classList.toggle(
          'svg-prep-object--pointed',
          index !== null && parseInt(r.dataset.index, 10) === index
        );
      });
    }

    function onMove(e) {
      paint(indexOf(e));
    }

    function onLeave() {
      paint(null);
    }

    function onClick(e) {
      const index = indexOf(e);
      if (index === null) {
        // Empty picture: the same thing a click on empty space does in every
        // list of things people already use.
        if (selected.size > 0) {
          selectionAnchor = null;
          setSelection(new Set());
        }
        return;
      }
      chooseRow(index, {
        toggle: e.ctrlKey || e.metaKey,
        range: e.shiftKey,
      });
      // The list can be long; a row chosen on the picture has to be findable
      // in it.
      const chosenRow = refs.objects.querySelector(
        `.svg-prep-object[data-index="${index}"]`
      );
      if (chosenRow) {
        chosenRow.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    }

    const panes = [refs.sourcePane, refs.resultPane];
    panes.forEach((pane) => {
      pane.addEventListener('pointermove', onMove);
      pane.addEventListener('pointerleave', onLeave);
      pane.addEventListener('click', onClick);
    });

    return () => {
      panes.forEach((pane) => {
        pane.removeEventListener('pointermove', onMove);
        pane.removeEventListener('pointerleave', onLeave);
        pane.removeEventListener('click', onClick);
      });
    };
  }

  /** Where the pointer is this instant, in every picture on screen. */
  function hoverLayersIn(scope) {
    return scope.querySelectorAll('.svg-prep-overlay-hover');
  }

  /** What a person has chosen, in every picture on screen. */
  function selectionLayersIn(scope) {
    return scope.querySelectorAll('.svg-prep-overlay-selection');
  }

  function setupObjectHighlighting() {
    // Highlight paths are drawn into an overlay <g> keyed by the
    // descriptor's own pathData (viewBox coordinates, transforms baked),
    // so indexes always match the object list — including subpaths of
    // compound paths — and rendering works in every browser.
    /**
     * Every picture on screen, not one named pane.
     *
     * ★ It used to be the SOURCE pane alone, which was right until DP-37 P1
     * made one picture the default and put the source behind Compare. MEASURED
     * at 1280 after that: the source pane was 0 by 0, the result pane was 808
     * by 354, and hovering a row drew a highlight path 0 px wide into the pane
     * nobody could see. The list stopped being able to point at the drawing
     * and nothing said so.
     *
     * Every overlay, so Compare lights the shape up in both pictures at once -
     * the same rule renderRoleLayer already follows for the tints.
     */
    const hoverLayers = () => hoverLayersIn(root);

    function highlight(e) {
      const item = e.target.closest('.svg-prep-object');
      if (!item || !currentAnalysis) return;
      const idx = parseInt(item.dataset.index, 10);
      const el = liveElements[idx];
      hoverLayers().forEach((layer) => {
        clearSvgGroup(layer);
        if (!el || !el.pathData) return;
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', el.pathData);
        p.setAttribute('class', 'svg-prep-highlight-path');
        layer.appendChild(p);
      });
    }

    function unhighlight(e) {
      const item = e.target.closest('.svg-prep-object');
      if (!item) return;
      hoverLayers().forEach(clearSvgGroup);
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

  /**
   * Escape, innermost thing first.
   *
   * A row's menu is the smallest thing open, so it is the first thing Escape
   * shuts - anything else and one press with a menu open would close the whole
   * editor, which is a long way further than anybody meant to go.
   *
   * This has to live HERE rather than on the list, where it started. The focus
   * trap listens on the document in the CAPTURE phase, so it reaches Escape
   * before any bubbling listener inside the editor could: MEASURED, the menu
   * stayed open and the editor closed under it. One Escape policy, one place.
   *
   * @returns {boolean} whether the press was spent
   */
  function closeOpenMenu() {
    const open = refs.objects.querySelector(
      '.svg-prep-more-btn[aria-expanded="true"]'
    );
    if (!open) return false;
    setMoreOpen(open, false);
    open.focus();
    return true;
  }

  /** A key pressed inside a control belongs to the control. */
  function isTypingTarget(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    if (tag === 'input') {
      const type = (target.type || 'text').toLowerCase();
      // A radio or a checkbox is not a place anybody types, and the shapes
      // list is made of radios: Delete pressed on one is Delete pressed on
      // the row it belongs to.
      return type !== 'radio' && type !== 'checkbox' && type !== 'button';
    }
    return tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  /**
   * ★ The keys the owner asked for, in the relief purpose (D-141).
   *
   * MEASURED before this: Delete did nothing at all, and Ctrl+A selected
   * 35,759 characters of PAGE TEXT - the whole app turned blue - because the
   * editor bound neither and the browser's own select-all took the press.
   *
   * Both are handled here and STOPPED here. The app has its own Ctrl+Z and
   * its own ideas about Delete; an editor that lets its shortcuts through to
   * the page is the Ctrl+Z bug of DP-21 again.
   */
  function handleShortcutKey(e) {
    if (e.altKey || isTypingTarget(e.target)) return false;
    const mod = e.ctrlKey || e.metaKey;

    if (mod && !e.shiftKey && e.key.toLowerCase() === 'a') {
      if (liveElements.length === 0) return false;
      selectAllRows();
      return true;
    }
    if (mod) return false;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      // The selection if there is one; otherwise the row a person is standing
      // on, which is what Delete means everywhere else in a list.
      let rows = [...selected];
      if (rows.length === 0) {
        const focused = e.target.closest?.('.svg-prep-object');
        const idx = focused ? parseInt(focused.dataset.index, 10) : NaN;
        if (Number.isInteger(idx)) rows = [idx];
      }
      if (rows.length === 0) {
        const sentence = 'Choose a shape first.';
        liveRegion.textContent = sentence;
        announce(sentence);
        return true;
      }
      applyRole(rows, 'ignore', { announce: true });
      return true;
    }
    return false;
  }

  /**
   * The shortcut keys, wherever the press lands.
   *
   * ★ This is attached to the LIST as well as to the root, and the reason is
   * a defect this release nearly shipped: the surface MOVES the shapes list
   * out of the workspace and into its own panel
   * (`shapesBlock.append(refs.layerSummary, refs.bulkBar, refs.objects)`), so
   * a press on a row does not bubble through the workspace root at all. The
   * workspace's own unit tests passed; the editor a person actually uses did
   * nothing. Listeners belong on the elements that travel.
   */
  function handleShortcutKeydown(e) {
    if (e.key === 'Escape') return;
    if (!handleShortcutKey(e)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function handleKeydown(e) {
    if (e.key !== 'Escape' && handleShortcutKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key === 'Escape') {
      // Somebody upstream has already spent this press. The surface's focus
      // trap listens on the document in the capture phase and calls
      // preventDefault before its own handler runs, and it does NOT stop the
      // event - so without this, one Escape shut the row's menu on the way
      // down and then closed the whole editor on the way up. MEASURED.
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (closeOpenMenu()) return;
      if (isFullscreen) {
        closeFullscreen();
      } else {
        close();
      }
    }
  }

  // ── DP-39 P2: the selection ────────────────────────────────────────────
  //
  // Signed at DP-Q36 as part of row model A: "click selects, Shift and Ctrl
  // extend". The ROW is the target and nothing is added to it - which is not
  // only tidy, it is the only thing that fits. MEASURED at the drawer's 280 px
  // floor the signed row has no spare width at all, so a checkbox per row
  // (about 30 px once it clears the 44 px floor) would have cost the one line
  // this release just bought.
  //
  // What it does NOT do is claim `aria-selected`. That attribute belongs to
  // options and grid rows; these are list items, and they hold radios and a
  // button, which an option may not. Rather than change what the whole list
  // reads as - the thing the gate pinned - the state is said out loud when it
  // changes and counted where the actions are.

  /** Indices currently selected. */
  let selected = new Set();
  /** Where a Shift range starts: the last row chosen on its own. */
  let selectionAnchor = null;

  function selectionSentence() {
    if (selected.size === 0) return 'Nothing selected.';
    return `${selected.size} of ${liveElements.length} shapes selected.`;
  }

  /**
   * ★ The selection, drawn ON THE PICTURE as well as on the rows (D-141).
   *
   * MEASURED before this: choosing two rows drew two highlighted rows and
   * nothing at all in the drawing - the only thing the picture ever showed was
   * the hover mark of ONE shape. A person choosing shapes to ignore could not
   * see which shapes they had chosen, in the one place where shapes look like
   * anything.
   *
   * An outline, not a fill: the role tints already fill, and two fills over
   * one shape is a color nobody chose. `non-scaling-stroke` keeps the outline
   * one width at every zoom.
   */
  function paintSelectionLayers() {
    selectionLayersIn(root).forEach((layer) => {
      clearSvgGroup(layer);
      if (selected.size === 0) return;
      for (const index of selected) {
        const el = liveElements[index];
        if (!el || !el.pathData) continue;
        // A light halo under the outline, so the mark shows on a shape painted
        // in the ink color as well as on the paper. LOOKED AT on the owner's
        // logo (DP-R5 session 4): an outline in the ink color over shapes in
        // the ink color marked nothing a person could see - the DOM said six
        // marks, the eyes said none.
        const halo = document.createElementNS(SVG_NS, 'path');
        halo.setAttribute('d', el.pathData);
        halo.setAttribute('class', 'svg-prep-selected-halo');
        layer.appendChild(halo);
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', el.pathData);
        p.setAttribute('class', 'svg-prep-selected-path');
        layer.appendChild(p);
      }
    });
  }

  /** Paint the rows, the picture, the count and the button from `selected`. */
  function renderSelection() {
    refs.objects.querySelectorAll('.svg-prep-object').forEach((row) => {
      const on = selected.has(parseInt(row.dataset.index, 10));
      row.classList.toggle('svg-prep-object--selected', on);
    });
    paintSelectionLayers();
    refs.deleteSelectedBtn.hidden = selected.size === 0;
    // DP-47: "Remove from list" and not "Delete", because the Delete KEY now
    // means something else on this list - it sets the chosen shapes to Ignore,
    // which keeps them in the drawing. This button takes rows out of the list
    // and is the one that cannot be undone by a radio.
    refs.deleteSelectedBtn.textContent =
      selected.size > 0
        ? `Remove from list (${selected.size})`
        : 'Remove from list';
  }

  /** Every row, in one press (Ctrl+A). */
  function selectAllRows() {
    const all = new Set(liveElements.map((_, i) => i));
    selectionAnchor = all.size > 0 ? 0 : null;
    setSelection(all, { announce: false });
    const sentence =
      all.size === 1
        ? 'All 1 shape selected.'
        : `All ${all.size} shapes selected.`;
    liveRegion.textContent = sentence;
    announce(sentence);
  }

  /** Change the selection and say what it is now. */
  function setSelection(next, { announce: say = true } = {}) {
    selected = next;
    renderSelection();
    if (say) {
      const sentence = selectionSentence();
      liveRegion.textContent = sentence;
      announce(sentence);
    }
  }

  function clearSelection() {
    if (selected.size === 0) return;
    selectionAnchor = null;
    setSelection(new Set(), { announce: false });
  }

  /**
   * One press on a row.
   *
   * Plain: this row alone. Ctrl or Cmd: add or remove this row. Shift: every
   * row from the last single choice to this one, which is what every list
   * people already use does.
   */
  function chooseRow(index, { toggle = false, range = false } = {}) {
    if (!Number.isInteger(index) || index < 0) return;
    const next = new Set(selected);
    if (range && selectionAnchor !== null) {
      const from = Math.min(selectionAnchor, index);
      const to = Math.max(selectionAnchor, index);
      for (let i = from; i <= to; i++) next.add(i);
    } else if (toggle) {
      if (next.has(index)) next.delete(index);
      else next.add(index);
      selectionAnchor = index;
    } else {
      next.clear();
      next.add(index);
      selectionAnchor = index;
    }
    setSelection(next);
  }

  /**
   * A press on the row, but not on anything the row holds.
   *
   * The radios, the menu and everything inside it are controls with their own
   * jobs; a click on one of those is not a click on the row.
   */
  function handleRowClick(e) {
    const row = e.target.closest('.svg-prep-object');
    if (!row || !refs.objects.contains(row)) return;
    if (
      e.target.closest(
        'input, button, select, label, .svg-prep-more-panel, .svg-prep-role-group'
      )
    ) {
      return;
    }
    chooseRow(parseInt(row.dataset.index, 10), {
      toggle: e.ctrlKey || e.metaKey,
      range: e.shiftKey,
    });
  }

  /**
   * A Shift-click chooses a range of rows. The browser's own Shift-click
   * extends a TEXT selection from wherever the caret was, and MEASURED on the
   * built app (DP-R5 session 4) it painted 49 characters of the rows' own text
   * blue across two rows. The default is stopped for that one modifier, and
   * the row still takes focus, which is the part of the default worth keeping.
   */
  function handleRowMousedown(e) {
    if (!e.shiftKey) return;
    const row = e.target.closest('.svg-prep-object');
    if (!row || !refs.objects.contains(row)) return;
    if (
      e.target.closest(
        'input, button, select, label, .svg-prep-more-panel, .svg-prep-role-group'
      )
    ) {
      return;
    }
    e.preventDefault();
    row.focus({ preventScroll: true });
  }

  /** The same three choices from the keyboard, on the focused row. */
  function handleRowKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const row = e.target.closest('.svg-prep-object');
    // Only when the ROW itself has focus: inside a control, Space and Enter
    // belong to the control.
    if (!row || e.target !== row) return;
    e.preventDefault();
    chooseRow(parseInt(row.dataset.index, 10), {
      toggle: e.ctrlKey || e.metaKey,
      range: e.shiftKey,
    });
  }

  /** Which role table this drawing is using. */
  function currentRoleOptions() {
    return currentAnalysis?.isCompoundPathOnly
      ? COMPOUND_ROLE_OPTIONS
      : ROLE_OPTIONS;
  }

  /**
   * ★ Set a role on one shape or on fifty, with ONE repaint, ONE preview
   * request and ONE sentence (DP-47).
   *
   * The Delete key acts on a SELECTION, and a selection is often several
   * shapes: the two lines of small text on the owner's logo are dozens. Doing
   * this per row would ask for the combine dozens of times and say dozens of
   * sentences, and a screen reader would still be reading the first when the
   * last arrived.
   *
   * @param {Iterable<number>} indices - Rows, in the LIVE numbering
   * @param {string} role - foreground, hole or ignore
   * @param {{announce?: boolean}} [options] - Say what happened. False for a
   *   radio, which announces itself as the control a person just operated.
   * @returns {number} How many rows changed
   */
  function applyRole(indices, role, { announce: say = false } = {}) {
    const options = currentRoleOptions();
    if (!options.some((o) => o.value === role)) return 0;
    const rows = [...new Set(indices)].filter(
      (i) => Number.isInteger(i) && i >= 0 && i < liveElements.length
    );
    if (rows.length === 0) return 0;

    for (const idx of rows) {
      roles[idx] = role;
      const item = refs.objects.querySelector(
        `.svg-prep-object[data-index="${idx}"]`
      );
      if (!item) continue;

      const radio = item.querySelector(`input[type="radio"][value="${role}"]`);
      if (radio) radio.checked = true;

      const nameSpan = item.querySelector('.svg-prep-object-name');
      const nameText = nameSpan ? nameSpan.textContent : `Element ${idx + 1}`;
      item.setAttribute(
        'aria-label',
        `${nameText}, ${roleWord(role, options)}`
      );

      const offsetInput = item.querySelector('.svg-prep-offset-input');
      if (offsetInput) {
        if (role === 'ignore') {
          offsetInput.disabled = true;
          offsetInput.value = '0';
          offsets[idx] = 0;
        } else {
          offsetInput.disabled = false;
        }
      }

      // An ignored shape is not built at all, so it cannot be on a layer.
      const layerSelect = item.querySelector('.svg-prep-layer-select');
      if (layerSelect) layerSelect.disabled = role === 'ignore';
    }

    if (layersEnabled) updateLayerSummary();
    renderRoleLayer();
    requestResultPreview();

    if (say) {
      const word = roleWord(role, options);
      const sentence =
        rows.length === 1
          ? `${rowName(rows[0])} set to ${word}.`
          : `${rows.length} shapes set to ${word}.`;
      liveRegion.textContent = sentence;
      announce(sentence);
    }
    return rows.length;
  }

  function handleRoleChange(e) {
    if (e.target.type !== 'radio') return;
    const match = e.target.name.match(/^svg-prep-role-(\d+)$/);
    if (!match) return;
    // The radio is the control the person operated and says its own name and
    // state; applyRole does the rest of the work for one row.
    applyRole([parseInt(match[1], 10)], e.target.value);
  }

  /**
   * D-160: the containment law that used to be checked here ("Nothing
   * surrounds this shape, so layer 3 would print with nothing under it") is
   * gone. Every shape on layer N or deeper is written into layer N's file and
   * the model extrudes each raised pass from below every floor, so a layer 3
   * shape carries its own column wherever it sits; the warning was false and
   * the owner believed it.
   */
  function updateLayerSummary() {
    if (!refs.layerSummary) return;
    if (!layersEnabled || layerCount === 0) {
      refs.layerSummary.hidden = true;
      return;
    }
    refs.layerSummary.hidden = false;
    // D-142, text-pack row 180. The sentence says what the column HOLDS, not
    // only what the drawing could carry: until somebody builds a stack every
    // shape is on layer 1, and the way to build one is worth saying once,
    // because the selects live behind each row's More button.
    const limitText =
      layerCount === 1
        ? 'This design supports 1 layer.'
        : `This design supports up to ${layerCount} layers.`;
    const startText =
      layersTouched || layerCount === 1
        ? ''
        : ' Every shape starts on layer 1. Choose a layer under More to build a stack.';
    // DP-47: once a stack exists, the thing worth knowing is WHEN it shows.
    // The charm behind the editor is the last APPLIED design, so a person who
    // has just built a stack and is looking at an unchanged charm is owed the
    // reason rather than left to conclude the layers did nothing.
    const builtText =
      layersTouched && layerCount > 1
        ? ' Layers show on the charm after you press Apply.'
        : '';
    refs.layerSummary.textContent = limitText + startText + builtText;
  }

  function handleLayerChange(e) {
    if (!layersEnabled) return;
    const target = e.target;
    if (!target || !target.classList.contains('svg-prep-layer-select')) return;
    const match = target.name.match(/^svg-prep-layer-(\d+)$/);
    if (!match) return;
    const idx = parseInt(match[1], 10);
    layers[idx] = parseInt(target.value, 10) || 1;
    layersTouched = true;
    updateLayerSummary();
    announce(`Layer ${layers[idx]} set.`);
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

  /**
   * G0 (DP-24): one picture by default. The edited drawing is the editor;
   * pressing Compare puts the original beside it, un-pressing takes it away.
   */
  function setCompare(on, { silent = false } = {}) {
    compareOpen = on === true;
    refs.compareBtn.setAttribute('aria-pressed', String(compareOpen));
    refs.sourcePaneWrap.hidden = !compareOpen;
    refs.previews.classList.toggle('svg-prep-previews--single', !compareOpen);
    if (silent) return;
    announce(
      compareOpen
        ? 'Comparing with the original drawing.'
        : 'Showing your edited drawing.'
    );
  }

  function handleCompareToggle() {
    setCompare(!compareOpen);
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

  /**
   * The whole-drawing advisory (DP-36) at the width as it stands: the trace's
   * line widths against the box beside it, saying which width it used.
   */
  function updateThinLineSentence() {
    const thin = thinLineSentence(
      currentCallbacks.lineWidthPx,
      parseFloat(currentSvgMeta?.width) || 0,
      currentDesignWidthMm(),
      currentCallbacks.designWidthKnown !== false
    );
    refs.thinLines.textContent = thin;
    refs.thinLines.hidden = thin === '';
  }

  /**
   * The width the host has learned since the editor opened (D-144: the charm
   * re-renders and its fit box arrives after the drawing was chosen). Sets
   * the box and everything that reads it.
   * @param {number} mm
   */
  function setDesignWidthMm(mm) {
    if (!Number.isFinite(mm) || mm <= 0) return;
    const next = String(+mm.toFixed(2));
    if (refs.designWidthInput.value === next) return;
    refs.designWidthInput.value = next;
    if (!isOpen) return;
    currentCallbacks = { ...currentCallbacks, designWidthKnown: true };
    handleDesignWidthChange();
  }

  function handleDesignWidthChange() {
    // DP-54: the print floor is a width away; the marks, the notice and the
    // advisory follow the box at once (65 ms on the logo), the combine after
    // the settle.
    measureThickness();
    updateThinLineSentence();
    clearTimeout(offsetDebounceTimer);
    // Through the GATE, not straight at the combine (the owner, 2026-09-14).
    // This called `updateResultPreview` directly and so obeyed no budget at
    // all: typing in the width box on a thousand-shape drawing started a
    // flatten nobody had asked for. Every other change in this editor asks
    // first; this one now asks too.
    offsetDebounceTimer = setTimeout(requestResultPreview, 300);
  }

  /**
   * Run the flatten because someone asked for it, and say so while it happens.
   *
   * The work is synchronous and, on a big drawing, long - DP-0 measured 56.7 s
   * at 200 shapes. So the waiting state is painted and announced, then a frame
   * is yielded, so the button really does look and read as busy instead of the
   * page freezing with the old label still on it.
   */
  /** Stop a combine in flight. The person gets the page and the button back. */
  function cancelRender() {
    if (!flattenRunner || !flattenRunner.isRunning()) return;
    // The announcement is made HERE, by the action the person took, and
    // updateResultPreview says nothing more about it (DP-32: one action, one
    // announcement).
    flattenRunner.cancel();
    announce('Combining canceled');
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
      layersEnabled && layerCount > 0 ? { limit: layerCount } : null
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
    // DP-4: the band is a property of what is left to combine, so it has to be
    // re-read after every delete and undo. Cutting a 210-shape drawing down to
    // 40 brings it under the budget, and the preview should start behaving
    // like the simple drawing it has just been made into.
    //
    // AFTER the roles are back, not before: the band reads them, and until
    // this point `roles` is still the array from before the rebuild and is a
    // different length from `liveElements`.
    setPreviewBand();
    // Every index after a deleted row has moved, so a selection kept across
    // the rebuild would point at different shapes than the ones a person
    // chose. It goes rather than lies.
    clearSelection();
    requestResultPreview();
    measureThickness();
  }

  /** Push the current layer array back into the selects, then re-check. */
  function applyLayerSelections() {
    if (!layersEnabled || layerCount === 0) {
      updateLayerSummary();
      return;
    }
    const items = refs.objects.querySelectorAll('.svg-prep-object');
    for (const item of items) {
      const idx = parseInt(item.dataset.index, 10);
      const select = item.querySelector('.svg-prep-layer-select');
      if (select && layers[idx]) select.value = String(layers[idx]);
    }
    updateLayerSummary();
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

  // ── DP-54: the shapes too thin to print ──────────────────────────────────

  function thinFloorMm() {
    const v = parseFloat(refs.thinInput.value);
    return Number.isFinite(v) && v >= 0 ? v : THIN_PRINT_MM;
  }

  function currentDesignWidthMm() {
    return parseFloat(refs.designWidthInput.value) || DEFAULT_DESIGN_WIDTH_MM;
  }

  /**
   * Measure every row at the width and the floor as they stand, then show
   * it: the marks on the rows and the notice above the list. MEASURED at P0:
   * about 65 ms for the logo's 206 shapes, 95 ms for 1,200.
   */
  function measureThickness() {
    const vb = parseViewBox(currentSvgMeta?.viewBox);
    if (!currentAnalysis || !vb || !vb.w) {
      thickness = null;
    } else {
      thickness = measureAllThickness(
        liveElements.map((el) => el.pathData || ''),
        {
          viewBoxWidth: vb.w,
          designWidthMm: currentDesignWidthMm(),
          thinPrintMm: thinFloorMm(),
          thinPicturePx: THIN_PICTURE_PX,
        }
      );
    }
    refreshThinMarks();
    updateThinNotice();
  }

  /** The rows under the print floor, in list order. */
  function thinRows() {
    const out = [];
    if (!thickness) return out;
    thickness.shapes.forEach((shape, i) => {
      if (shape.tooThinToPrint) out.push(i);
    });
    return out;
  }

  /** Each too-thin row says so beside its name, read with it. */
  function refreshThinMarks() {
    refs.objects.querySelectorAll('.svg-prep-object').forEach((item) => {
      const i = parseInt(item.dataset.index, 10);
      const shape = thickness && thickness.shapes[i];
      const words = [];
      if (shape && shape.tooThinToPrint) words.push('too thin to print');
      if (shape && shape.tooSmallToTrace) {
        words.push('too small to trace clearly');
      }
      let mark = item.querySelector('.svg-prep-thin-mark');
      if (words.length === 0) {
        if (mark) mark.remove();
        item.removeAttribute('aria-describedby');
        return;
      }
      if (!mark) {
        mark = document.createElement('span');
        mark.className = 'svg-prep-thin-mark';
        mark.id = `${refs.thinMarkPrefix}-${i}`;
        // A short badge to the eye, the full words to a screen reader as the
        // row's description. The words themselves after the name wrapped the
        // signed one-line row (DP-39) on CI's wider Firefox fonts (REPORTED
        // by PR #242's board: "row 1 took 2 lines").
        const badge = document.createElement('span');
        badge.className = 'svg-prep-thin-mark-badge';
        badge.setAttribute('aria-hidden', 'true');
        badge.textContent = 'thin';
        const wordsEl = document.createElement('span');
        wordsEl.className = 'sr-only svg-prep-thin-mark-words';
        mark.append(badge, wordsEl);
        const name = item.querySelector('.svg-prep-object-name');
        if (name) name.after(mark);
        else item.appendChild(mark);
      }
      mark.querySelector('.svg-prep-thin-mark-words').textContent =
        words.join(', ');
      item.setAttribute('aria-describedby', mark.id);
    });
  }

  function updateThinNotice() {
    const n = thinRows().length;
    if (n === 0) {
      refs.thinNotice.hidden = true;
      refs.thinNotice.textContent = '';
      return;
    }
    const floor = thinFloorMm();
    const at = `${+currentDesignWidthMm().toFixed(1)} mm wide`;
    refs.thinNotice.textContent =
      n === 1
        ? `1 shape is thinner than ${floor} mm at ${at} and may not print.`
        : `${n} shapes are thinner than ${floor} mm at ${at} and may not print.`;
    refs.thinNotice.hidden = false;
  }

  /** One press: every row under the floor to Ignore, through applyRole. */
  function ignoreThin() {
    const rows = thinRows().filter((i) => roles[i] !== 'ignore');
    if (rows.length === 0) {
      const nothing = `Nothing is thinner than ${thinFloorMm()} mm.`;
      liveRegion.textContent = nothing;
      announce(nothing);
      return;
    }
    lastIgnore = { rows, roles: rows.map((i) => roles[i]) };
    applyRole(rows, 'ignore');
    refs.undoIgnoreBtn.disabled = false;
    const sentence =
      rows.length === 1
        ? '1 thin shape set to Ignore. It can be turned back on in the list.'
        : `${rows.length} thin shapes set to Ignore. Each can be turned back on in the list.`;
    liveRegion.textContent = sentence;
    announce(sentence);
  }

  /** The last batch back to the roles it had. One level, by design. */
  function undoIgnore() {
    if (!lastIgnore) return;
    const groups = new Map();
    lastIgnore.rows.forEach((i, k) => {
      const role = lastIgnore.roles[k];
      if (!groups.has(role)) groups.set(role, []);
      groups.get(role).push(i);
    });
    for (const [role, rows] of groups) applyRole(rows, role);
    const n = lastIgnore.rows.length;
    lastIgnore = null;
    refs.undoIgnoreBtn.disabled = true;
    const sentence =
      n === 1
        ? 'Undone. 1 shape is back to how it was.'
        : `Undone. ${n} shapes are back to how they were.`;
    liveRegion.textContent = sentence;
    announce(sentence);
  }

  /**
   * The bbox area of a row's path, in square millimeters.
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
    const designWidthMm =
      parseFloat(refs.designWidthInput.value) || DEFAULT_DESIGN_WIDTH_MM;
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
  /** Open or shut one row's menu. */
  function setMoreOpen(btn, open) {
    if (!btn) return;
    const panel = refs.objects.querySelector(
      `#${CSS.escape(btn.getAttribute('aria-controls'))}`
    );
    btn.setAttribute('aria-expanded', String(open === true));
    if (panel) panel.hidden = open !== true;
  }

  /** Shut every row's menu except the one named. */
  function closeOtherMenus(keep) {
    refs.objects
      .querySelectorAll('.svg-prep-more-btn[aria-expanded="true"]')
      .forEach((btn) => {
        if (btn !== keep) setMoreOpen(btn, false);
      });
  }

  function handleMoreClick(e) {
    const btn = e.target.closest('.svg-prep-more-btn');
    if (!btn || !refs.objects.contains(btn)) return;
    const open = btn.getAttribute('aria-expanded') !== 'true';
    // One at a time: two open menus on a long list is two rows' worth of
    // controls with nothing saying which row each belongs to.
    closeOtherMenus(open ? btn : null);
    setMoreOpen(btn, open);
  }

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
    } else if (btn.dataset.action === 'ignore-thin') {
      ignoreThin();
    } else if (btn.dataset.action === 'undo-ignore') {
      undoIgnore();
    } else if (btn.dataset.action === 'delete-small') {
      const limit = parseFloat(refs.smallInput.value);
      if (!Number.isFinite(limit) || limit < 0) return;
      const doomed = [];
      for (let i = 0; i < liveElements.length; i++) {
        if (rowAreaMm2(i) < limit) doomed.push(i);
      }
      if (doomed.length === 0) {
        const nothing = `Nothing is smaller than ${limit} square millimeters.`;
        liveRegion.textContent = nothing;
        announce(nothing);
        return;
      }
      deleteRows(doomed, `${doomed.length} small shapes`);
    } else if (btn.dataset.action === 'delete-selected') {
      const doomed = [...selected].filter((i) => i < liveElements.length);
      if (doomed.length === 0) return;
      clearSelection();
      deleteRows(doomed, `${doomed.length} selected shapes`);
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
          // The word on the control, not the value behind it. FOUR places
          // write this label; DP-39 changed two and left these two, so Reset
          // used to turn every row from "Shape 3, Raised" back into "Shape 3,
          // role: foreground" - the word this round retired, spoken only to
          // the people who cannot see the control that says otherwise.
          item.setAttribute(
            'aria-label',
            `${nameText}, ${roleWord(role, currentRoleOptions())}`
          );
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
      item.setAttribute(
        'aria-label',
        `${nameText}, ${roleWord(role, currentRoleOptions())}`
      );
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
   * D-142: `layers` is NULL until somebody builds a stack, which is what
   * `buildLayerCompanions` reads as "no stack to emit". A column of ones is
   * not a stack, and reporting it as one is how a three-layer emission used
   * to ride out of an editor nobody had touched.
   *
   * @returns {{layers: Array|null, limit: number, problems: Array}} Empty when
   *   the tile did not opt in; `layers: null` when no stack has been built.
   */
  function getLayerAssignments() {
    if (!layersEnabled || layerCount === 0) {
      return { layers: [], limit: 0, problems: [] };
    }
    if (!layersTouched) {
      return { layers: null, limit: layerCount, problems: [] };
    }
    const out = [];
    originalIndex.forEach((original, live) => {
      out[original] = layers[live] || 1;
    });
    const problems = [];
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
    setCompare(false, { silent: true });
    // D-120: the flatten needs the ring engine; start it on its way now so
    // the first preview rarely has to wait for it.
    loadRingEngine().catch(() => {});
    root.hidden = false;

    currentCallbacks = callbacks;
    currentSourceName = callbacks.sourceName || null;
    hostMode = callbacks.mode === 'file' ? 'file' : 'parameter';
    hosted = callbacks.hosted === true;
    currentSvgString = svgString;
    currentAnalysis = analysis;
    paintLegend(refs.legendRow, currentRoleOptions());
    currentSvgMeta = extractSvgMeta(svgString);

    // DP-54 (D-144): a host that knows how wide the design prints says so,
    // and the box starts there rather than at the editor's default.
    if (
      Number.isFinite(callbacks.designWidthMm) &&
      callbacks.designWidthMm > 0
    ) {
      refs.designWidthInput.value = String(+callbacks.designWidthMm.toFixed(2));
    }
    // How thin the thinnest lines are, at the width this will be printed. The
    // measurement comes from the trace; the width comes from the control right
    // beside this sentence, so the two numbers are read together.
    updateThinLineSentence();

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
    layersTouched = false;
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
      layersEnabled && layerCount > 0 ? { limit: layerCount } : null
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
      // D-142: a saved column that stands above layer 1 is a stack somebody
      // built in an earlier visit, so reopening the design keeps it rather
      // than quietly flattening their work back to one pass.
      if (layers.some((v) => v >= 2)) layersTouched = true;
    }
    // Run the law once on open, so a design that already breaks it says so
    // instead of waiting for the person to touch a control first.
    applyLayerSelections();
    updateDeleteUi();

    renderWarnings(refs.warnings, analysis.warnings || []);

    renderSourcePane();
    renderRoleLayer();
    // DP-53: the first combine runs at once (there is nothing to settle);
    // every change after it waits for the settle. The stand-in goes up
    // first, so the pane is never empty while the engine loads or the
    // worker works (DP-37 P1's rule).
    setPreviewBand();
    clearSelection();
    markPreviewStale({ keepZoom: false });
    updateResultPreview();
    measureThickness();

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
    picturePointerCleanup = setupPicturePointer();

    root.addEventListener('keydown', handleKeydown);
    refs.objects.addEventListener('change', handleRoleChange);
    refs.objects.addEventListener('change', handleLayerChange);
    refs.objects.addEventListener('input', handleOffsetChange);
    refs.designWidthInput.addEventListener('input', handleDesignWidthChange);
    refs.thinInput.addEventListener('input', measureThickness);
    refs.footer.addEventListener('click', handleFooterClick);
    refs.renderCancelBtn.addEventListener('click', cancelRender);
    refs.objects.addEventListener('click', handleRowClick);
    refs.objects.addEventListener('mousedown', handleRowMousedown);
    refs.objects.addEventListener('keydown', handleRowKeydown);
    refs.objects.addEventListener('keydown', handleShortcutKeydown);
    refs.objects.addEventListener('click', handleMoreClick);
    refs.objects.addEventListener('click', handleDeleteClick);
    refs.bulkBar.addEventListener('click', handleDeleteClick);
    refs.rolesToggleBtn.addEventListener('click', handleRolesToggle);
    refs.compareBtn.addEventListener('click', handleCompareToggle);
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

    if (hosted) return;

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

    // A combine outlives the editor otherwise. `destroy` stopped one, but the
    // surface's Close calls THIS, so the worker carried on with a drawing
    // nobody is looking at any more and then drew its result into the closed
    // editor and announced it - MEASURED at 419 ms on the 210-shape drawing,
    // and minutes on the biggest this app accepts. It could not happen before
    // DP-37 P2, when the thread was taken for the whole combine and there was
    // nothing to press.
    if (flattenRunner && flattenRunner.isRunning()) {
      flattenRunner.cancel('closed');
    }

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
    if (picturePointerCleanup) {
      picturePointerCleanup();
      picturePointerCleanup = null;
    }
    clearPanes();

    currentSvgString = null;
    currentAnalysis = null;
    currentSvgMeta = null;
    currentCallbacks = {};

    clearTimeout(offsetDebounceTimer);
    offsetDebounceTimer = null;
    clearTimeout(combineSettleTimer);
    combineSettleTimer = null;
    // Nothing may wait on a combine the closing editor will never run.
    const waiting = combineWaiters;
    combineWaiters = [];
    waiting.forEach((resolve) => resolve());

    root.removeEventListener('keydown', handleKeydown);
    refs.objects.removeEventListener('change', handleRoleChange);
    refs.objects.removeEventListener('input', handleOffsetChange);
    refs.designWidthInput.removeEventListener('input', handleDesignWidthChange);
    refs.thinInput.removeEventListener('input', measureThickness);
    thickness = null;
    lastIgnore = null;
    refs.undoIgnoreBtn.disabled = true;
    refs.thinNotice.hidden = true;
    refs.thinNotice.textContent = '';
    refs.footer.removeEventListener('click', handleFooterClick);
    refs.objects.removeEventListener('click', handleRowClick);
    refs.objects.removeEventListener('mousedown', handleRowMousedown);
    refs.objects.removeEventListener('keydown', handleRowKeydown);
    refs.objects.removeEventListener('keydown', handleShortcutKeydown);
    refs.objects.removeEventListener('click', handleMoreClick);
    refs.objects.removeEventListener('click', handleDeleteClick);
    refs.bulkBar.removeEventListener('click', handleDeleteClick);
    refs.rolesToggleBtn.removeEventListener('click', handleRolesToggle);
    refs.compareBtn.removeEventListener('click', handleCompareToggle);
    refs.closeBtn.removeEventListener('click', close);
    refs.fullscreenBtn.removeEventListener('click', handleFullscreenButton);
    refs.backdrop.removeEventListener('click', closeFullscreen);

    if (!hosted) announce('SVG Preparation Editor closed');
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
      onEscape: () => {
        if (closeOpenMenu()) return;
        if (hostMode === 'file') close();
        else closeFullscreen();
      },
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
    // A combine outlives the editor otherwise: the worker keeps grinding on a
    // drawing nobody is looking at any more.
    if (flattenRunner) {
      flattenRunner.destroy();
      flattenRunner = null;
    }
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
    isCombining,
    whenCombined,
    setDesignWidthMm,
    /**
     * The ring engine, once the lazy chunk is in; null while it is not.
     * D-132: the file control's layer companions flatten with the same engine
     * the preview uses, and the control cannot import the chunk itself without
     * pulling clipper into the core bundle.
     */
    getRingEngine: () => ringEngine,
    /**
     * Shut a row's open menu, and say whether there was one.
     *
     * Escape belongs to whoever is hosting this editor - the standalone door
     * traps focus and uses Escape as the way out, and the surface's trap
     * listens on the document in the CAPTURE phase, so nothing inside the
     * workspace can reach the press first. MEASURED: the workspace's own
     * keydown handler never ran at all. So the host asks this before it acts,
     * and the innermost open thing is the first thing Escape shuts.
     *
     * @returns {boolean} true if a menu was open and is now shut
     */
    closeOpenMenu,
    destroy,
    openFullscreen,
    closeFullscreen,
    toggleFullscreen,
    /**
     * Resolves once the ring engine is in and any preview that waited on
     * it has re-run (the internal re-run is chained on the same promise,
     * registered first, so awaiting this is deterministic).
     */
    whenReady: () => (ringEnginePromise || Promise.resolve()).catch(() => {}),
    _root: root,
    _refs: refs,
  };
}
