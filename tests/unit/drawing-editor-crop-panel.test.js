/**
 * The crop view (DP-49 P2).
 *
 * Four rows a person can read and type into, a picture with the kept
 * rectangle clear and the rest shaded, Save crop and Cancel, focus that lands
 * on Top and goes back where it came from, Escape that cancels without
 * closing the editor around it. Tested on the DOM and its names, because the
 * view is what a screen reader meets before any pixel is cropped.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCropPanel } from '../../src/js/drawing-editor/crop-panel.js';
import { EDITOR_STRINGS as S } from '../../src/js/drawing-editor/strings.js';

const BOX = { x: 0, y: 0, width: 400, height: 300 };
const HREF = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>';

function setRange(panel, name, value) {
  const range = panel.element.querySelector(
    `input[type="range"][data-inset="${name}"]`
  );
  range.value = String(value);
  range.dispatchEvent(new Event('input', { bubbles: true }));
  return range;
}

describe('createCropPanel', () => {
  let host;
  let say;
  let onSave;
  let onCancel;
  let panel;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    say = vi.fn();
    onSave = vi.fn();
    onCancel = vi.fn();
    panel = createCropPanel({ say, onSave, onCancel });
    host.appendChild(panel.element);
  });

  afterEach(() => {
    panel.destroy();
    host.remove();
  });

  it('★ names itself, its four rows and its two buttons, with the customizer\'s own row classes', () => {
    const el = panel.element;
    expect(el.hidden).toBe(true);
    const group = el.querySelector('fieldset');
    expect(group).not.toBeNull();
    expect(group.querySelector('legend').textContent).toBe(S.cropTitle);
    const labels = Array.from(el.querySelectorAll('label')).map(
      (l) => l.textContent
    );
    expect(labels).toEqual([S.cropTop, S.cropBottom, S.cropLeft, S.cropRight]);
    const rows = el.querySelectorAll('.param-control');
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      const range = row.querySelector('.slider-container input[type="range"]');
      const spin = row.querySelector('.slider-spinbox');
      expect(range).not.toBeNull();
      expect(spin).not.toBeNull();
      expect(range.min).toBe('0');
      expect(range.max).toBe('90');
      // Each range is described by the help sentence and the live one.
      const described = range.getAttribute('aria-describedby').split(' ');
      expect(described).toHaveLength(2);
      expect(document.getElementById(described[0]).textContent).toBe(S.cropHelp);
      expect(spin.max).toBe('90');
      // The number box is named after the range, and the range after the row.
      const label = row.querySelector('label');
      expect(label.getAttribute('for')).toBe(range.id);
      expect(spin.getAttribute('aria-label')).toBe(
        `${label.textContent} value in percent, editable`
      );
      expect(row.querySelector('.slider-unit').textContent).toBe('%');
    }
    expect(el.querySelector('[data-action="save-crop"]').textContent).toBe(
      S.cropSave
    );
    expect(el.querySelector('[data-action="cancel-crop"]').textContent).toBe(
      S.cropCancel
    );
    expect(el.querySelector('.drawing-editor-crop-starts-over').textContent).toBe(
      S.cropStartsOver
    );
  });

  it('★ opens on the whole picture, says so, and puts focus on Top', () => {
    const returnTo = document.createElement('button');
    host.appendChild(returnTo);
    panel.open({ box: BOX, previewHref: HREF, returnTo });
    expect(panel.element.hidden).toBe(false);
    expect(panel.isOpen()).toBe(true);
    expect(say).toHaveBeenCalledWith(S.cropViewOpen);
    expect(document.activeElement).toBe(
      panel.element.querySelector('input[type="range"][data-inset="top"]')
    );
    expect(panel.element.querySelector('.drawing-editor-crop-keeping').textContent).toBe(
      S.cropKeeping(100, 100)
    );
    expect(panel.getRect()).toEqual(BOX);
    const image = panel.element.querySelector('image');
    expect(image.getAttribute('href')).toBe(HREF);
  });

  it('★ the rows move the rectangle, the sentence and the shade together', () => {
    panel.open({ box: BOX, previewHref: HREF });
    setRange(panel, 'top', 10);
    setRange(panel, 'right', 25);
    expect(panel.element.querySelector('.drawing-editor-crop-keeping').textContent).toBe(
      S.cropKeeping(75, 90)
    );
    expect(panel.getRect()).toEqual({ x: 0, y: 30, width: 300, height: 270 });
    const spinTop = panel.element.querySelector(
      '.slider-spinbox[data-inset="top"]'
    );
    expect(spinTop.value).toBe('10');
    // The shade is one even-odd path: the whole box with the kept rectangle
    // cut out of it.
    const shade = panel.element.querySelector('.drawing-editor-crop-shade');
    expect(shade.getAttribute('fill-rule')).toBe('evenodd');
    expect(shade.getAttribute('d')).toContain('M0 30');
  });

  it('a typed number moves its slider', () => {
    panel.open({ box: BOX, previewHref: HREF });
    const spin = panel.element.querySelector('.slider-spinbox[data-inset="left"]');
    spin.value = '40';
    spin.dispatchEvent(new Event('input', { bubbles: true }));
    expect(
      panel.element.querySelector('input[type="range"][data-inset="left"]').value
    ).toBe('40');
    expect(panel.getRect().x).toBe(160);
    // Past the range's end, it is held to the end.
    spin.value = '95';
    spin.dispatchEvent(new Event('input', { bubbles: true }));
    expect(panel.getRect().x).toBe(360);
  });

  it('★ Save hands the rectangle and the insets over; Cancel hands nothing; both close and return focus', () => {
    const returnTo = document.createElement('button');
    host.appendChild(returnTo);
    panel.open({ box: BOX, previewHref: HREF, returnTo });
    setRange(panel, 'bottom', 20);
    panel.element.querySelector('[data-action="save-crop"]').click();
    expect(onSave).toHaveBeenCalledWith(
      { x: 0, y: 0, width: 400, height: 240 },
      { top: 0, bottom: 20, left: 0, right: 0 }
    );
    expect(panel.isOpen()).toBe(false);
    expect(panel.element.hidden).toBe(true);
    expect(document.activeElement).toBe(returnTo);

    panel.open({ box: BOX, previewHref: HREF, returnTo });
    panel.element.querySelector('[data-action="cancel-crop"]').click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(say).toHaveBeenLastCalledWith(S.cropCanceled);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(panel.isOpen()).toBe(false);
  });

  it('★ Escape cancels the view and goes no further', () => {
    const outer = vi.fn();
    document.addEventListener('keydown', outer, true);
    try {
      panel.open({ box: BOX, previewHref: HREF });
      const range = panel.element.querySelector('input[type="range"][data-inset="top"]');
      range.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      );
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(panel.isOpen()).toBe(false);
      // The panel listens in the capture phase on its own element, which the
      // document's capture listener precedes; it must therefore be told
      // through the event that the view took it.
      const seen = outer.mock.calls[0][0];
      expect(seen.defaultPrevented).toBe(true);
    } finally {
      document.removeEventListener('keydown', outer, true);
    }
  });

  it('remembers the insets it was opened with, and reads them back', () => {
    panel.open({
      box: BOX,
      previewHref: HREF,
      insets: { top: 5, bottom: 0, left: 0, right: 15 },
    });
    expect(panel.getInsets()).toEqual({ top: 5, bottom: 0, left: 0, right: 15 });
    expect(panel.element.querySelector('.drawing-editor-crop-keeping').textContent).toBe(
      S.cropKeeping(85, 95)
    );
  });
});
