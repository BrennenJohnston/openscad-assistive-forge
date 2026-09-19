/**
 * The crop view (DP-49).
 *
 * Opens in place of the drawing: the picture with the kept rectangle clear
 * and the rest shaded, four rows named Top, Bottom, Left and Right, each a
 * share of the picture's height or width from 0 to 90 percent, and two
 * buttons, Save crop and Cancel. Built with the customizer's own row classes
 * (a native range, a number box, a unit) so it reads and works the way every
 * other slider in the app does: arrow keys on the range, exact values typed
 * into the box.
 *
 * The view says the rectangle; whoever opened it owns the crop itself (the
 * pixels or the drawing, and the trace that follows).
 *
 * @license GPL-3.0-or-later
 */

import { EDITOR_STRINGS as S } from './strings.js';
import { INSET_MAX_PERCENT, insetRect } from '../image-crop.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const INSETS = ['top', 'bottom', 'left', 'right'];
let panelCounter = 0;

function clampPercent(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), INSET_MAX_PERCENT);
}

function fmt(n) {
  return String(+n.toFixed(2));
}

/**
 * @param {{say?: (text: string) => void, onSave?: (rect: object, insets: object) => void, onCancel?: () => void}} [callbacks]
 */
export function createCropPanel({ say, onSave, onCancel } = {}) {
  const idBase = `drawing-editor-crop-${++panelCounter}`;
  const labels = {
    top: S.cropTop,
    bottom: S.cropBottom,
    left: S.cropLeft,
    right: S.cropRight,
  };

  let open = false;
  let box = null;
  let returnTo = null;

  const element = document.createElement('div');
  element.className = 'drawing-editor-crop';
  element.hidden = true;

  // The picture: the source as an image, one even-odd path shading what
  // goes, a frame on what stays. Decorative: the rows carry the numbers.
  const picture = document.createElement('div');
  picture.className = 'drawing-editor-crop-picture';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const image = document.createElementNS(SVG_NS, 'image');
  image.setAttribute('preserveAspectRatio', 'none');
  const shade = document.createElementNS(SVG_NS, 'path');
  shade.setAttribute('class', 'drawing-editor-crop-shade');
  shade.setAttribute('fill-rule', 'evenodd');
  const frame = document.createElementNS(SVG_NS, 'rect');
  frame.setAttribute('class', 'drawing-editor-crop-frame');
  svg.append(image, shade, frame);
  picture.appendChild(svg);

  const keeping = document.createElement('p');
  keeping.className = 'drawing-editor-crop-keeping';
  keeping.id = `${idBase}-keeping`;

  // The rows.
  const group = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = S.cropTitle;
  const help = document.createElement('p');
  help.className = 'drawing-editor-crop-help';
  help.id = `${idBase}-help`;
  help.textContent = S.cropHelp;
  group.append(legend, help);
  const controls = {};
  for (const name of INSETS) {
    const row = document.createElement('div');
    row.className = 'param-control';
    const label = document.createElement('label');
    label.textContent = labels[name];
    label.htmlFor = `${idBase}-${name}`;
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'slider-container';
    const range = document.createElement('input');
    range.type = 'range';
    range.id = label.htmlFor;
    range.min = '0';
    range.max = String(INSET_MAX_PERCENT);
    range.step = '1';
    range.value = '0';
    range.dataset.inset = name;
    range.setAttribute('aria-describedby', `${help.id} ${keeping.id}`);
    const spin = document.createElement('input');
    spin.type = 'number';
    spin.className = 'slider-spinbox';
    spin.min = '0';
    spin.max = String(INSET_MAX_PERCENT);
    spin.step = '1';
    spin.value = '0';
    spin.dataset.inset = name;
    spin.setAttribute('inputmode', 'numeric');
    spin.setAttribute(
      'aria-label',
      `${labels[name]} value in percent, editable`
    );
    spin.setAttribute('aria-describedby', range.id);
    const unit = document.createElement('span');
    unit.className = 'slider-unit';
    unit.textContent = '%';
    unit.setAttribute('aria-hidden', 'true');
    sliderContainer.append(range, spin, unit);
    row.append(label, sliderContainer);
    group.appendChild(row);
    controls[name] = { range, spin };

    range.addEventListener('input', () => {
      spin.value = range.value;
      update();
    });
    // The range follows every keystroke; the box is put right only once the
    // person is done typing, so "9" on the way to "90" is not fought.
    spin.addEventListener('input', () => {
      if (spin.value !== '') range.value = String(clampPercent(spin.value));
      update();
    });
    spin.addEventListener('change', () => {
      spin.value = String(clampPercent(spin.value));
      range.value = spin.value;
      update();
    });
  }

  const startsOver = document.createElement('p');
  startsOver.className = 'drawing-editor-crop-starts-over';
  startsOver.textContent = S.cropStartsOver;

  const buttons = document.createElement('div');
  buttons.className = 'drawing-editor-crop-buttons';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary';
  saveBtn.dataset.action = 'save-crop';
  saveBtn.textContent = S.cropSave;
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.dataset.action = 'cancel-crop';
  cancelBtn.textContent = S.cropCancel;
  buttons.append(saveBtn, cancelBtn);

  // Two columns when there is room: the picture, then everything about it.
  const controlsColumn = document.createElement('div');
  controlsColumn.className = 'drawing-editor-crop-controls';
  controlsColumn.append(keeping, group, startsOver, buttons);
  element.append(picture, controlsColumn);

  function getInsets() {
    const out = {};
    for (const name of INSETS)
      out[name] = clampPercent(controls[name].range.value);
    return out;
  }

  function getRect() {
    return box ? insetRect(box, getInsets()) : null;
  }

  function update() {
    if (!box) return;
    const insets = getInsets();
    const rect = insetRect(box, insets);
    keeping.textContent = S.cropKeeping(
      Math.max(100 - insets.left - insets.right, 1),
      Math.max(100 - insets.top - insets.bottom, 1)
    );
    const x1 = box.x + box.width;
    const y1 = box.y + box.height;
    shade.setAttribute(
      'd',
      `M${fmt(box.x)} ${fmt(box.y)}H${fmt(x1)}V${fmt(y1)}H${fmt(box.x)}Z ` +
        `M${fmt(rect.x)} ${fmt(rect.y)}H${fmt(rect.x + rect.width)}` +
        `V${fmt(rect.y + rect.height)}H${fmt(rect.x)}Z`
    );
    frame.setAttribute('x', fmt(rect.x));
    frame.setAttribute('y', fmt(rect.y));
    frame.setAttribute('width', fmt(rect.width));
    frame.setAttribute('height', fmt(rect.height));
  }

  function setInsets(insets = {}) {
    for (const name of INSETS) {
      const v = String(clampPercent(insets[name]));
      controls[name].range.value = v;
      controls[name].spin.value = v;
    }
    update();
  }

  /**
   * @param {{box: {x: number, y: number, width: number, height: number}, previewHref: string, insets?: object, returnTo?: HTMLElement}} options
   */
  function openPanel(options) {
    box = { ...options.box };
    returnTo = options.returnTo || null;
    svg.setAttribute(
      'viewBox',
      `${fmt(box.x)} ${fmt(box.y)} ${fmt(box.width)} ${fmt(box.height)}`
    );
    image.setAttribute('x', fmt(box.x));
    image.setAttribute('y', fmt(box.y));
    image.setAttribute('width', fmt(box.width));
    image.setAttribute('height', fmt(box.height));
    image.setAttribute('href', options.previewHref || '');
    setInsets(options.insets || {});
    element.hidden = false;
    open = true;
    if (typeof say === 'function') say(S.cropViewOpen);
    controls.top.range.focus();
  }

  function closePanel() {
    if (!open) return;
    open = false;
    element.hidden = true;
    if (returnTo && returnTo.isConnected) returnTo.focus();
    returnTo = null;
  }

  function save() {
    if (!open) return;
    const rect = getRect();
    const insets = getInsets();
    closePanel();
    if (typeof onSave === 'function') onSave(rect, insets);
  }

  function cancel() {
    if (!open) return;
    closePanel();
    if (typeof say === 'function') say(S.cropCanceled);
    if (typeof onCancel === 'function') onCancel();
  }

  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', cancel);
  // Capture phase, like the editor's own Escape chain: the innermost thing
  // open is what a press ends. A press the editor's focus trap already took
  // (it runs first, on the document) is left alone.
  element.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !open || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    },
    true
  );

  return {
    element,
    open: openPanel,
    close: closePanel,
    save,
    cancel,
    isOpen: () => open,
    getRect,
    getInsets,
    setInsets,
    destroy() {
      closePanel();
      element.remove();
    },
  };
}
