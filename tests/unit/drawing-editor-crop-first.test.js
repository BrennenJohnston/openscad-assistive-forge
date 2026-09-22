/**
 * Crop first (DP-80): the crop view on a picture nothing has converted yet.
 *
 * The surface opens straight into the crop view with the photograph on it
 * and no drawing behind it: no workspace, no shape table, a status line that
 * says nothing is converted, and the crop view's own sentences for a
 * picture. Save crop hands the rectangle to the host and closes the editor
 * without a verdict; Cancel and Escape close it with nothing converted and
 * say so. Tested on the DOM and the sentences, because the view is what a
 * screen reader meets before any pixel is cropped.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDrawingEditor } from '../../src/js/drawing-editor/surface.js';
import { createCropPanel } from '../../src/js/drawing-editor/crop-panel.js';
import { EDITOR_STRINGS as S } from '../../src/js/drawing-editor/strings.js';
import { analyzeSvg } from '../../src/js/svg-preparer.js';

const PICTURE = 'data:image/png;base64,iVBORw0KGgo=';
const BOX = { x: 0, y: 0, width: 800, height: 600 };
const PLACEHOLDER =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"></svg>';
const EMPTY = { elements: [], warnings: [], recommendation: 'pass_through' };
/** Three circles in a row: an ordinary drawing for the open that follows. */
const THREE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' +
  '<circle cx="50" cy="50" r="10" fill="black"/>' +
  '<circle cx="90" cy="50" r="10" fill="black"/>' +
  '<circle cx="130" cy="50" r="10" fill="black"/>' +
  '</svg>';

describe("the crop panel's sentences (DP-80)", () => {
  let host;
  let say;
  let panel;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    say = vi.fn();
    panel = createCropPanel({ say });
    host.appendChild(panel.element);
  });

  afterEach(() => {
    panel.destroy();
    host.remove();
  });

  it('says its own two sentences by default', () => {
    panel.open({ box: BOX, previewHref: PICTURE });
    expect(say).toHaveBeenLastCalledWith(S.cropViewOpen);
    panel.cancel();
    expect(say).toHaveBeenLastCalledWith(S.cropCanceled);
  });

  it('★ says the sentences it is opened with, and forgets them on the next open', () => {
    panel.open({
      box: BOX,
      previewHref: PICTURE,
      sentences: { opened: 'Opened on a picture.', canceled: 'Nothing happened.' },
    });
    expect(say).toHaveBeenLastCalledWith('Opened on a picture.');
    panel.cancel();
    expect(say).toHaveBeenLastCalledWith('Nothing happened.');
    panel.open({ box: BOX, previewHref: PICTURE });
    expect(say).toHaveBeenLastCalledWith(S.cropViewOpen);
    panel.cancel();
    expect(say).toHaveBeenLastCalledWith(S.cropCanceled);
  });
});

describe('the surface opened on a picture (Crop first, DP-80)', () => {
  let surfaceEl;
  let announce;

  const make = (options = {}) =>
    createDrawingEditor({ surfaceEl, announce, ...options });

  const openOnPicture = (editor, extra = {}) => {
    const callbacks = {
      onCrop: vi.fn(),
      onClose: vi.fn(),
      onApply: vi.fn(),
      onKeepOriginal: vi.fn(),
      ...extra,
    };
    editor.open(PLACEHOLDER, EMPTY, {
      purpose: 'relief',
      startInCropView: true,
      pictureHref: PICTURE,
      pictureBox: BOX,
      ...callbacks,
    });
    return callbacks;
  };

  const root = () => surfaceEl.querySelector('.drawing-editor');
  const view = () => surfaceEl.querySelector('.drawing-editor-crop');

  beforeEach(() => {
    surfaceEl = document.createElement('div');
    surfaceEl.id = 'drawingEditorSurface';
    surfaceEl.hidden = true;
    surfaceEl.classList.add('hidden');
    document.body.appendChild(surfaceEl);
    announce = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('★ opens straight into the crop view with the picture on it, says so once, and keeps the drawing tools out of the way', () => {
    const editor = make();
    openOnPicture(editor);

    expect(surfaceEl.hidden).toBe(false);
    expect(editor.isOpen()).toBe(true);
    expect(editor.isCropFirst()).toBe(true);
    expect(editor.isCropOpen()).toBe(true);
    expect(root().dataset.cropFirst).toBe('true');
    expect(root().dataset.crop).toBe('open');

    expect(view().hidden).toBe(false);
    expect(view().querySelector('image').getAttribute('href')).toBe(PICTURE);
    expect(view().querySelector('svg').getAttribute('viewBox')).toBe(
      '0 0 800 600'
    );
    // No drawing: the stage is out of the way and no shape rows were built.
    expect(root().querySelector('.drawing-editor-stage').hidden).toBe(true);
    expect(root().querySelectorAll('.svg-prep-object')).toHaveLength(0);

    // Said once, in the crop view's words for a picture: never the editor's
    // usual sentence, never the in-editor crop's. The status line carries
    // the same sentence, the way it does for every opening.
    expect(announce).toHaveBeenCalledWith(S.cropFirstViewOpen);
    expect(announce).not.toHaveBeenCalledWith(S.opened);
    expect(announce).not.toHaveBeenCalledWith(S.cropViewOpen);
    expect(root().querySelector('.drawing-editor-status').textContent).toBe(
      S.cropFirstViewOpen
    );
    // Focus lands on the crop's first row, not on the title.
    expect(document.activeElement).toBe(
      view().querySelector('input[type="range"][data-inset="top"]')
    );
  });

  it('★ Save crop hands the rectangle and the insets to the host and closes the editor without a verdict', () => {
    const editor = make();
    const { onCrop, onClose, onKeepOriginal, onApply } = openOnPicture(editor);
    const bottom = view().querySelector(
      'input[type="range"][data-inset="bottom"]'
    );
    bottom.value = '50';
    bottom.dispatchEvent(new Event('input', { bubbles: true }));
    view().querySelector('[data-action="save-crop"]').click();

    expect(onCrop).toHaveBeenCalledTimes(1);
    const [rect, insets] = onCrop.mock.calls[0];
    expect(rect).toEqual({ x: 0, y: 0, width: 800, height: 300 });
    expect(insets).toEqual({ top: 0, bottom: 50, left: 0, right: 0 });
    // Closed before the host was told, with no verdict of any kind.
    expect(editor.isOpen()).toBe(false);
    expect(surfaceEl.hidden).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(onKeepOriginal).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
    // The stage is back for the next open, and the mode is gone with it.
    expect(root().querySelector('.drawing-editor-stage').hidden).toBe(false);
    expect(root().dataset.cropFirst).toBeUndefined();
    expect(root().dataset.crop).toBeUndefined();
  });

  it('★ Cancel closes the editor, says nothing was converted, and tells the host it closed', () => {
    const editor = make();
    const { onCrop, onClose } = openOnPicture(editor);
    view().querySelector('[data-action="cancel-crop"]').click();

    expect(onCrop).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(editor.isOpen()).toBe(false);
    expect(surfaceEl.hidden).toBe(true);
    expect(announce).toHaveBeenLastCalledWith(S.cropFirstCanceled);
    expect(announce).not.toHaveBeenCalledWith(S.cropCanceled);
  });

  it('Escape in the crop view does the same, once', () => {
    const editor = make();
    const { onClose } = openOnPicture(editor);
    const top = view().querySelector('input[type="range"][data-inset="top"]');
    top.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(editor.isOpen()).toBe(false);
    expect(
      announce.mock.calls.filter(([t]) => t === S.cropFirstCanceled)
    ).toHaveLength(1);
  });

  it('a host that offers no crop gets an ordinary open instead', () => {
    const editor = make();
    editor.open(PLACEHOLDER, EMPTY, {
      purpose: 'relief',
      startInCropView: true,
      pictureHref: PICTURE,
      pictureBox: BOX,
      onApply: vi.fn(),
      onKeepOriginal: vi.fn(),
    });
    expect(editor.isCropFirst()).toBe(false);
    expect(editor.isCropOpen()).toBe(false);
    expect(root().dataset.cropFirst).toBeUndefined();
    expect(announce).toHaveBeenCalledWith(S.opened);
  });

  it('the ordinary open that follows a crop-first one is whole: the stage, the rows, the sentence', () => {
    const editor = make();
    openOnPicture(editor);
    view().querySelector('[data-action="cancel-crop"]').click();
    expect(editor.isOpen()).toBe(false);

    announce.mockClear();
    editor.open(THREE, analyzeSvg(THREE), {
      purpose: 'relief',
      onApply: vi.fn(),
      onKeepOriginal: vi.fn(),
    });
    expect(editor.isCropFirst()).toBe(false);
    expect(root().dataset.cropFirst).toBeUndefined();
    expect(root().querySelector('.drawing-editor-stage').hidden).toBe(false);
    expect(view().hidden).toBe(true);
    expect(announce).toHaveBeenCalledWith(S.opened);
    expect(root().querySelectorAll('.svg-prep-object')).toHaveLength(3);
  });
});
