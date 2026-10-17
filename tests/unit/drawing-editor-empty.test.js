/**
 * The drawing editor opened before any picture: it says what it takes, in
 * the formats the control accepts, offers a button that chooses one, and
 * closes like any editor. A drawing opened afterwards replaces the empty
 * state.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDrawingEditor } from '../../src/js/drawing-editor/surface.js';
import {
  EDITOR_STRINGS as S,
  emptyPictureSentence,
} from '../../src/js/drawing-editor/strings.js';
import { analyzeSvg } from '../../src/js/svg-preparer.js';

const THREE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' +
  '<circle cx="50" cy="50" r="10" fill="black"/>' +
  '<circle cx="90" cy="50" r="10" fill="black"/>' +
  '<circle cx="130" cy="50" r="10" fill="black"/>' +
  '</svg>';

describe('the sentence names the formats the control accepts', () => {
  it('a drawing, or a photo', () => {
    expect(emptyPictureSentence(['svg', 'png', 'jpg'])).toBe(
      'Choose a picture to draw with: an SVG drawing, or a PNG or JPG photo.'
    );
  });

  it('two kinds of drawing, and JPEG said once as JPG', () => {
    expect(emptyPictureSentence(['svg', 'png', 'jpg', 'jpeg', 'dxf'])).toBe(
      'Choose a picture to draw with: an SVG or DXF drawing, or a PNG or JPG photo.'
    );
  });

  it('only drawings, or only photos', () => {
    expect(emptyPictureSentence(['svg'])).toBe(
      'Choose a picture to draw with: an SVG drawing.'
    );
    expect(emptyPictureSentence(['png', 'jpg', 'webp'])).toBe(
      'Choose a picture to draw with: a PNG, JPG or WebP photo.'
    );
  });
});

describe('the surface opened with no picture', () => {
  let surfaceEl;
  let announce;

  const root = () => surfaceEl.querySelector('.drawing-editor');
  const empty = () => surfaceEl.querySelector('.drawing-editor-empty');

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

  it('shows the sentence and Choose a picture, keeps the drawing tools out of the way, and says the sentence once', () => {
    const editor = createDrawingEditor({ surfaceEl, announce });
    const onChooseFile = vi.fn();
    const sentence = emptyPictureSentence(['svg', 'png', 'jpg']);
    editor.openEmpty({ sentence, onChooseFile });

    expect(surfaceEl.hidden).toBe(false);
    expect(editor.isOpen()).toBe(true);
    expect(root().dataset.empty).toBe('true');
    expect(empty().hidden).toBe(false);
    expect(empty().querySelector('p').textContent).toBe(sentence);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(sentence);

    const choose = empty().querySelector('button');
    expect(choose.textContent).toBe(S.choosePicture);
    expect(choose.textContent).toBe('Choose a picture');
    choose.click();
    expect(onChooseFile).toHaveBeenCalledTimes(1);
  });

  it('Close and Escape close it like any editor, and leave nothing empty behind', () => {
    const editor = createDrawingEditor({ surfaceEl, announce });
    editor.openEmpty({ sentence: 'Choose.', onChooseFile: vi.fn() });
    surfaceEl.querySelector('.drawing-editor-close').click();
    expect(editor.isOpen()).toBe(false);
    expect(surfaceEl.hidden).toBe(true);
    expect(root().dataset.empty).toBeUndefined();
    expect(empty().hidden).toBe(true);

    editor.openEmpty({ sentence: 'Choose.', onChooseFile: vi.fn() });
    root().dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );
    expect(editor.isOpen()).toBe(false);
    expect(empty().hidden).toBe(true);
  });

  it('a drawing opened next replaces the empty state, and focus moves into the editor', () => {
    const editor = createDrawingEditor({ surfaceEl, announce });
    editor.openEmpty({ sentence: 'Choose.', onChooseFile: vi.fn() });
    empty().querySelector('button').focus();
    editor.open(THREE, analyzeSvg(THREE), {
      purpose: 'relief',
      onApply: vi.fn(),
      onKeepOriginal: vi.fn(),
      onClose: vi.fn(),
    });
    expect(editor.isOpen()).toBe(true);
    expect(root().dataset.empty).toBeUndefined();
    expect(empty().hidden).toBe(true);
    expect(root().contains(document.activeElement)).toBe(true);
    expect(empty().contains(document.activeElement)).toBe(false);
  });
});
