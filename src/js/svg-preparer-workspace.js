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
import { classifyElements, flattenToCompoundPath } from './svg-preparer.js';

// ── Constants ────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: 'foreground', label: 'Foreground' },
  { value: 'hole', label: 'Hole' },
  { value: 'ignore', label: 'Ignore' },
];

const SHAPE_TAGS_SET = new Set([
  'path',
  'polygon',
  'polyline',
  'line',
  'circle',
  'ellipse',
  'rect',
]);

const NON_RENDERING_SCOPES = new Set([
  'defs',
  'clippath',
  'mask',
  'symbol',
  'marker',
  'pattern',
]);

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

function isInNonRenderingScope(element) {
  let parent = element.parentElement;
  while (parent) {
    if (NON_RENDERING_SCOPES.has(parent.tagName.toLowerCase())) return true;
    parent = parent.parentElement;
  }
  return false;
}

function extractSvgMeta(svgString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return { viewBox: '', width: '', height: '' };
  return {
    viewBox: svg.getAttribute('viewBox') || '',
    width: svg.getAttribute('width') || '',
    height: svg.getAttribute('height') || '',
  };
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

  const fullscreenBtn = document.createElement('button');
  fullscreenBtn.className = 'svg-prep-fullscreen-btn';
  fullscreenBtn.setAttribute('aria-label', 'Open fullscreen');
  fullscreenBtn.textContent = '\u26F6';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'svg-prep-close-btn';
  closeBtn.setAttribute('aria-label', 'Close editor');
  closeBtn.innerHTML = '&times;';

  header.append(title, fullscreenBtn, closeBtn);

  // Dual preview panes
  const previews = document.createElement('div');
  previews.className = 'svg-prep-previews';

  const sourcePane = document.createElement('div');
  sourcePane.className = 'svg-prep-source-pane';
  sourcePane.setAttribute('role', 'img');
  sourcePane.setAttribute('aria-label', 'Source SVG');

  const sourceZoom = buildZoomControls('source');
  sourcePane.appendChild(sourceZoom);

  const resultPane = document.createElement('div');
  resultPane.className = 'svg-prep-result-pane';
  resultPane.setAttribute('role', 'img');
  resultPane.setAttribute('aria-label', 'Prepared result');

  const resultZoom = buildZoomControls('result');
  resultPane.appendChild(resultZoom);

  previews.append(sourcePane, resultPane);

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

  const keepBtn = document.createElement('button');
  keepBtn.className = 'btn btn-secondary';
  keepBtn.dataset.action = 'keep';
  keepBtn.textContent = 'Keep original';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn btn-ghost';
  resetBtn.dataset.action = 'reset';
  resetBtn.textContent = 'Reset';

  footer.append(applyBtn, keepBtn, resetBtn);

  // Fullscreen backdrop (hidden by default)
  const backdrop = document.createElement('div');
  backdrop.className = 'svg-prep-fullscreen-backdrop hidden';
  backdrop.setAttribute('aria-hidden', 'true');

  root.append(header, previews, objects, warnings, footer);

  return {
    root,
    refs: {
      header,
      title,
      fullscreenBtn,
      closeBtn,
      previews,
      sourcePane,
      resultPane,
      sourceZoom,
      resultZoom,
      objects,
      warnings,
      footer,
      applyBtn,
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
 * @param {HTMLElement} liveRegion - ARIA live region for announcements
 * @returns {string[]} Initial role assignments
 */
function populateObjectList(listEl, elements, liveRegion) {
  listEl.innerHTML = '';
  const roles = [];

  elements.forEach((el, i) => {
    const name = describeElement(el.element, i);
    const color = swatchColor(el);
    const role = el.autoRole || 'ignore';
    roles.push(role);

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

    ROLE_OPTIONS.forEach(({ value, label }) => {
      const lbl = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `svg-prep-role-${i}`;
      radio.value = value;
      if (role === value) radio.checked = true;
      lbl.append(radio, document.createTextNode(label));
      fieldset.appendChild(lbl);
    });

    // Warning badge (if element has warnings)
    if (el.warnings && el.warnings.length > 0) {
      const warning = document.createElement('span');
      warning.className = 'svg-prep-object-warning';
      warning.setAttribute('aria-label', el.warnings.join('; '));
      warning.textContent = '\u26A0';
      item.append(swatch, nameSpan, fieldset, warning);
    } else {
      item.append(swatch, nameSpan, fieldset);
    }

    listEl.appendChild(item);
  });

  listEl.appendChild(liveRegion);
  return roles;
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
 *   open: (svgString: string, analysis: Object) => void,
 *   close: () => void,
 *   getResult: () => string|null,
 *   destroy: () => void,
 *   openFullscreen: () => void,
 *   closeFullscreen: () => void,
 *   _root: HTMLElement,
 *   _refs: Object,
 * }}
 */
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
  let currentSvgString = null;
  let currentAnalysis = null;
  let currentSvgMeta = null;
  let currentCallbacks = {};
  let sourceZoomCleanup = null;
  let resultZoomCleanup = null;
  let highlightCleanup = null;

  // ARIA live region for role-change and preview announcements
  const liveRegion = document.createElement('div');
  liveRegion.className = 'sr-only';
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');

  // ── Internal rendering ────────────────────────────────────────────────

  function renderSourcePane() {
    const existingSvg = refs.sourcePane.querySelector('svg');
    if (existingSvg) existingSvg.remove();
    if (!currentSvgString) return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(currentSvgString, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return null;

    const allShapes = Array.from(svg.querySelectorAll('*')).filter((el) =>
      SHAPE_TAGS_SET.has(el.tagName.toLowerCase())
    );
    let renderIdx = 0;
    for (const shape of allShapes) {
      if (!isInNonRenderingScope(shape)) {
        shape.setAttribute('data-prep-index', String(renderIdx));
        renderIdx++;
      }
    }

    const imported = document.importNode(svg, true);
    refs.sourcePane.insertBefore(imported, refs.sourceZoom);
    return imported;
  }

  function updateResultPreview() {
    if (!currentAnalysis || !currentSvgMeta) return;

    const existingSvg = refs.resultPane.querySelector('svg');
    if (existingSvg) existingSvg.remove();

    const roleOverrides = {};
    roles.forEach((role, i) => {
      roleOverrides[i] = role;
    });

    const classified = classifyElements(currentAnalysis.elements, {
      roleOverrides,
    });
    const resultSvgString = flattenToCompoundPath(classified, currentSvgMeta);

    if (!resultSvgString) {
      currentResult = null;
      liveRegion.textContent = 'No foreground elements \u2014 preview empty';
      return;
    }

    currentResult = resultSvgString;

    const parser = new DOMParser();
    const doc = parser.parseFromString(resultSvgString, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return;

    const imported = document.importNode(svg, true);
    refs.resultPane.insertBefore(imported, refs.resultZoom);

    const fgCount = classified.filter(
      (el) => el.role === 'foreground' && el.pathData
    ).length;
    const holeCount = classified.filter(
      (el) => el.role === 'hole' && el.pathData
    ).length;
    liveRegion.textContent = `Preview updated \u2014 ${fgCount} foreground, ${holeCount} holes`;
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
    function highlight(e) {
      const item = e.target.closest('.svg-prep-object');
      if (!item) return;
      const el = refs.sourcePane.querySelector(
        `[data-prep-index="${item.dataset.index}"]`
      );
      if (el) el.setAttribute('data-prep-highlight', '');
    }

    function unhighlight(e) {
      const item = e.target.closest('.svg-prep-object');
      if (!item) return;
      const el = refs.sourcePane.querySelector(
        `[data-prep-index="${item.dataset.index}"]`
      );
      if (el) el.removeAttribute('data-prep-highlight');
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
    }

    updateResultPreview();
  }

  function handleFooterClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'apply') {
      if (currentCallbacks.onApply) currentCallbacks.onApply(currentResult);
      close();
    } else if (btn.dataset.action === 'keep') {
      currentResult = null;
      if (currentCallbacks.onKeepOriginal)
        currentCallbacks.onKeepOriginal();
      close();
    } else if (btn.dataset.action === 'reset') {
      if (currentAnalysis) {
        roles = currentAnalysis.elements.map((el) => el.autoRole || 'ignore');
        const items = refs.objects.querySelectorAll('.svg-prep-object');
        items.forEach((item, i) => {
          const role = roles[i];
          const radios = item.querySelectorAll('input[type="radio"]');
          radios.forEach((r) => {
            r.checked = r.value === role;
          });
          const nameSpan = item.querySelector('.svg-prep-object-name');
          const nameText = nameSpan ? nameSpan.textContent : `Element ${i + 1}`;
          item.setAttribute('aria-label', `${nameText}, role: ${role}`);
        });
        updateResultPreview();
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

  function getRoleOverrides() {
    return [...roles];
  }

  function open(svgString, analysis, callbacks = {}) {
    if (isOpen) close();

    isOpen = true;
    root.hidden = false;

    currentCallbacks = callbacks;
    currentSvgString = svgString;
    currentAnalysis = analysis;
    currentSvgMeta = extractSvgMeta(svgString);

    roles = populateObjectList(
      refs.objects,
      analysis.elements || [],
      liveRegion
    );

    if (callbacks.initialOverrides) {
      applyInitialOverrides(callbacks.initialOverrides);
    }

    renderWarnings(refs.warnings, analysis.warnings || []);

    renderSourcePane();
    updateResultPreview();

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
    refs.footer.addEventListener('click', handleFooterClick);
    refs.closeBtn.addEventListener('click', close);
    refs.fullscreenBtn.addEventListener('click', openFullscreen);

    announce('SVG Preparation Editor opened');
  }

  function close() {
    if (!isOpen) return;

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

    root.removeEventListener('keydown', handleKeydown);
    refs.objects.removeEventListener('change', handleRoleChange);
    refs.footer.removeEventListener('click', handleFooterClick);
    refs.closeBtn.removeEventListener('click', close);
    refs.fullscreenBtn.removeEventListener('click', openFullscreen);

    announce('SVG Preparation Editor closed');
  }

  function openFullscreen() {
    if (isFullscreen || !isOpen) return;

    isFullscreen = true;
    previousFocusEl = document.activeElement;

    root.classList.add('svg-prep-fullscreen');
    refs.backdrop.classList.remove('hidden');
    refs.backdrop.setAttribute('aria-hidden', 'false');
    refs.fullscreenBtn.setAttribute('aria-label', 'Exit fullscreen');

    fullscreenTrap = createDocumentFocusTrap(root, {
      onEscape: closeFullscreen,
    });
    fullscreenTrap.activate({
      initialFocus: refs.closeBtn,
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

    if (fullscreenTrap) {
      fullscreenTrap.deactivate();
      fullscreenTrap = null;
    }

    if (previousFocusEl?.focus) previousFocusEl.focus();
    previousFocusEl = null;

    announce('Exited fullscreen SVG editor');
  }

  function getResult() {
    return currentResult;
  }

  function destroy() {
    if (isOpen) close();
    if (refs.backdrop.parentNode) refs.backdrop.parentNode.removeChild(refs.backdrop);
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  return {
    open,
    close,
    getResult,
    getRoleOverrides,
    destroy,
    openFullscreen,
    closeFullscreen,
    _root: root,
    _refs: refs,
  };
}
