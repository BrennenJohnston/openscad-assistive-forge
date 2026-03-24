/**
 * SVG Preparer Dialog
 *
 * Interactive modal for classifying SVG elements before boolean flattening.
 * Users can override auto-classification of foreground/hole/ignore roles
 * and see a live SVG preview with element highlighting.
 *
 * Follows the dialog pattern from dialogs.js and modal-manager.js:
 * dynamically created DOM, openModal/closeModal focus management,
 * Promise-based return, full keyboard navigation, and screen reader support.
 *
 * @license GPL-3.0-or-later
 */

import { openModal, closeModal } from './modal-manager.js';
import {
  parseSvgElements,
  classifyElements,
  flattenToCompoundPath,
} from './svg-preparer.js';

const SHAPE_TAGS = new Set([
  'path',
  'polygon',
  'polyline',
  'line',
  'circle',
  'ellipse',
  'rect',
]);

const ROLE_OPTIONS = [
  { value: 'foreground', label: 'Foreground' },
  { value: 'hole', label: 'Hole' },
  { value: 'ignore', label: 'Ignore' },
];

/**
 * Build a human-readable description for an SVG shape element.
 * @param {Element} element - SVG DOM element
 * @param {number} index - Zero-based index
 * @returns {string}
 */
function describeElement(element, index) {
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
 * Build an inline SVG element with data-index attributes on each shape
 * so the preview can highlight individual elements on hover/focus.
 * @param {string} svgString - Original SVG markup
 * @returns {SVGElement|null}
 */
function buildAnnotatedSvg(svgString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return null;

  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  let idx = 0;
  Array.from(svg.querySelectorAll('*'))
    .filter((el) => SHAPE_TAGS.has(el.tagName.toLowerCase()))
    .forEach((el) => {
      el.setAttribute('data-preparer-idx', String(idx++));
    });

  return svg;
}

/**
 * Apply or clear a highlight outline on an SVG shape inside the preview.
 * @param {HTMLElement} previewEl - Container holding the inline SVG
 * @param {number} index - Shape index to highlight, or -1 to clear all
 */
function setHighlight(previewEl, index) {
  const svg = previewEl.querySelector('svg');
  if (!svg) return;

  svg.querySelectorAll('[data-preparer-highlight]').forEach((el) => {
    el.removeAttribute('data-preparer-highlight');
  });

  if (index < 0) return;
  const target = svg.querySelector(`[data-preparer-idx="${index}"]`);
  if (target) {
    target.setAttribute('data-preparer-highlight', '');
  }
}

/**
 * Extract SVG container attributes for reconstructing the output SVG.
 * @param {string} svgString - Original SVG markup
 * @returns {{viewBox: string, width: string, height: string}}
 */
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

/**
 * Open the interactive SVG preparer dialog.
 *
 * Displays the source SVG with a list of detected shape elements. Each
 * element shows its auto-classified role (foreground / hole / ignore) and
 * lets the user override it. Hovering or focusing a list item highlights
 * the corresponding shape in the SVG preview.
 *
 * @param {string} svgString - Complete SVG markup to prepare
 * @param {object} [options] - Options forwarded to classifyElements()
 * @returns {Promise<string|null>} Prepared SVG string, or null if cancelled
 */
export function showSvgPreparerDialog(svgString, options = {}) {
  return new Promise((resolve) => {
    const elements = parseSvgElements(svgString);
    const classified = classifyElements(elements, options);
    const svgMeta = extractSvgMeta(svgString);
    const roles = classified.map((el) => el.role);

    // -- Modal shell --
    const modal = document.createElement('div');
    modal.className = 'preset-modal svg-preparer-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'svgPreparerTitle');
    modal.setAttribute('aria-modal', 'true');

    const content = document.createElement('div');
    content.className = 'preset-modal-content svg-preparer-content';

    // -- Header --
    const header = document.createElement('div');
    header.className = 'preset-modal-header';

    const title = document.createElement('h3');
    title.id = 'svgPreparerTitle';
    title.className = 'preset-modal-title';
    title.textContent = 'Prepare SVG for OpenSCAD';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'preset-modal-close';
    closeBtn.setAttribute('aria-label', 'Close dialog');
    closeBtn.innerHTML = '&times;';
    header.append(title, closeBtn);

    // -- Body --
    const body = document.createElement('div');
    body.className = 'modal-body svg-preparer-body';

    const instructions = document.createElement('p');
    instructions.id = 'svgPreparerInstructions';
    instructions.textContent =
      `This SVG has ${elements.length} shape element${elements.length !== 1 ? 's' : ''}. ` +
      'Assign a role to each: Foreground shapes become solid geometry, ' +
      'Hole shapes are subtracted, Ignore shapes are dropped.';

    const layout = document.createElement('div');
    layout.className = 'svg-preparer-layout';

    // SVG preview pane
    const previewPane = document.createElement('div');
    previewPane.className = 'svg-preparer-preview';
    previewPane.setAttribute(
      'aria-label',
      `SVG preview with ${elements.length} elements`
    );
    const annotatedSvg = buildAnnotatedSvg(svgString);
    if (annotatedSvg) previewPane.appendChild(annotatedSvg);

    // Element list pane
    const listPane = document.createElement('div');
    listPane.className = 'svg-preparer-elements';

    const list = document.createElement('div');
    list.className = 'svg-preparer-element-list';
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', 'SVG elements');

    // Live region for role-change announcements
    const liveRegion = document.createElement('div');
    liveRegion.className = 'sr-only';
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');

    classified.forEach((el, i) => {
      const name = describeElement(el.element, i);
      const color = swatchColor(el);
      const fillLabel =
        el.fill || (el.stroke ? `stroke: ${el.stroke}` : 'default black');

      const item = document.createElement('div');
      item.className = 'svg-preparer-element';
      item.setAttribute('role', 'listitem');
      item.dataset.index = String(i);
      item.tabIndex = 0;
      item.setAttribute(
        'aria-label',
        `${name}, ${fillLabel}, role: ${roles[i]}`
      );

      // Color swatch
      const swatch = document.createElement('span');
      swatch.className = 'svg-preparer-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.background = color;

      // Element label
      const label = document.createElement('span');
      label.className = 'svg-preparer-element-name';
      label.textContent = name;

      // Role radio group
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'svg-preparer-role-group';

      const legend = document.createElement('legend');
      legend.className = 'sr-only';
      legend.textContent = `Role for ${name}`;
      fieldset.appendChild(legend);

      ROLE_OPTIONS.forEach(({ value, label: text }) => {
        const lbl = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `svgprep-role-${i}`;
        radio.value = value;
        if (roles[i] === value) radio.checked = true;
        lbl.append(radio, document.createTextNode(text));
        fieldset.appendChild(lbl);
      });

      item.append(swatch, label, fieldset);
      list.appendChild(item);

      // Highlight on hover/focus
      item.addEventListener('mouseenter', () => setHighlight(previewPane, i));
      item.addEventListener('mouseleave', () => setHighlight(previewPane, -1));
      item.addEventListener('focusin', () => setHighlight(previewPane, i));
      item.addEventListener('focusout', () => setHighlight(previewPane, -1));
    });

    listPane.append(list, liveRegion);
    layout.append(previewPane, listPane);
    body.append(instructions, layout);

    // -- Footer --
    const footer = document.createElement('div');
    footer.className = 'preset-modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.dataset.action = 'cancel';
    cancelBtn.textContent = 'Cancel';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'btn btn-primary';
    applyBtn.dataset.action = 'apply';
    applyBtn.textContent = 'Apply';

    footer.append(cancelBtn, applyBtn);

    content.append(header, body, footer);
    modal.appendChild(content);
    document.body.appendChild(modal);

    // -- Cleanup helper --
    const cleanup = (result) => {
      closeModal(modal);
      document.body.removeChild(modal);
      resolve(result);
    };

    // -- Role change handler --
    modal.addEventListener('change', (e) => {
      if (e.target.type !== 'radio') return;
      const match = e.target.name.match(/^svgprep-role-(\d+)$/);
      if (!match) return;
      const idx = parseInt(match[1], 10);
      roles[idx] = e.target.value;

      const item = list.querySelector(
        `.svg-preparer-element[data-index="${idx}"]`
      );
      if (item) {
        const elName = item.querySelector('.svg-preparer-element-name');
        const nameText = elName ? elName.textContent : `Element ${idx + 1}`;
        item.setAttribute(
          'aria-label',
          `${nameText}, role: ${e.target.value}`
        );
      }

      const roleLabel =
        ROLE_OPTIONS.find((r) => r.value === e.target.value)?.label ||
        e.target.value;
      liveRegion.textContent = `${describeElement(classified[idx].element, idx)} set to ${roleLabel}`;
    });

    // -- Button actions --
    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      if (btn.dataset.action === 'apply') {
        const roleOverrides = {};
        roles.forEach((role, i) => {
          roleOverrides[i] = role;
        });
        const reclassified = classifyElements(elements, {
          ...options,
          roleOverrides,
        });
        const result = flattenToCompoundPath(reclassified, svgMeta);
        cleanup(result || svgString);
      } else if (btn.dataset.action === 'cancel') {
        cleanup(null);
      }
    });

    // Close button
    closeBtn.addEventListener('click', () => cleanup(null));

    // Backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cleanup(null);
    });

    // Escape key (belt-and-suspenders — modal-manager also handles Escape
    // but this ensures cleanup runs through our promise path)
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(null);
      }
    });

    // Open with focus management
    openModal(modal, {
      focusTarget:
        list.querySelector('.svg-preparer-element') || cancelBtn,
    });
  });
}
