/**
 * The unlock sequence from the keyboard: Up, Up, Down, Down, Left, Right,
 * Left, Right, B, A, typed anywhere but a text field or the code editor,
 * within four seconds of each other, feeding the same buffer as the camera
 * buttons.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { initSequenceDetector } from '../../src/js/_seq.js';

const KEYS = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA',
];

function press(code, target = document.body, init = {}) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init })
  );
}

describe('The unlock sequence from the keyboard', () => {
  let stop = null;

  afterEach(() => {
    stop?.();
    stop = null;
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('fires once for the ten keys typed on the page', () => {
    const onMatch = vi.fn();
    stop = initSequenceDetector(onMatch);
    for (const code of KEYS) press(code);
    expect(onMatch).toHaveBeenCalledTimes(1);
    for (const code of KEYS) press(code);
    expect(onMatch, 'again for a second sequence').toHaveBeenCalledTimes(2);
  });

  it('does not count keys typed in a text field, a select, an editable box or the code editor', () => {
    document.body.innerHTML = `
      <input id="field">
      <textarea id="area"></textarea>
      <select id="pick"><option>one</option></select>
      <div id="note" contenteditable="true"><span id="inNote">text</span></div>
      <div class="cm-editor"><div class="cm-content" id="code"></div></div>
    `;
    const onMatch = vi.fn();
    stop = initSequenceDetector(onMatch);
    for (const id of ['field', 'area', 'pick', 'inNote', 'code']) {
      const target = document.getElementById(id);
      for (const code of KEYS) press(code, target);
      expect(onMatch, `typed in #${id}`).not.toHaveBeenCalled();
    }
    for (const code of KEYS) press(code);
    expect(onMatch, 'on the page afterwards').toHaveBeenCalledTimes(1);
  });

  it('does not count a modified or repeating key', () => {
    const onMatch = vi.fn();
    stop = initSequenceDetector(onMatch);
    for (const code of KEYS) press(code, document.body, { ctrlKey: true });
    for (const code of KEYS) press(code, document.body, { altKey: true });
    for (const code of KEYS) press(code, document.body, { metaKey: true });
    for (const code of KEYS) press(code, document.body, { repeat: true });
    expect(onMatch).not.toHaveBeenCalled();
  });

  it('shifts past a wrong key: a stray key before the ten is forgotten, one inside breaks them', () => {
    const onMatch = vi.fn();
    stop = initSequenceDetector(onMatch);
    press('KeyB');
    for (const code of KEYS) press(code);
    expect(onMatch, 'a stray key first').toHaveBeenCalledTimes(1);
    for (const code of [...KEYS.slice(0, 5), 'KeyA', ...KEYS.slice(5)]) press(code);
    expect(onMatch, 'a wrong key inside').toHaveBeenCalledTimes(1);
  });

  it('forgets the keys so far after four seconds', () => {
    vi.useFakeTimers();
    const onMatch = vi.fn();
    stop = initSequenceDetector(onMatch);
    for (const code of KEYS.slice(0, 9)) press(code);
    vi.advanceTimersByTime(4_001);
    press('KeyA');
    expect(onMatch, 'too late').not.toHaveBeenCalled();
    for (const code of KEYS) press(code);
    expect(onMatch, 'a fresh run').toHaveBeenCalledTimes(1);
  });

  it('shares its buffer with the camera buttons, and stops listening when stopped', () => {
    document.body.innerHTML = `
      <button id="cameraRotateUp"></button>
      <button id="cameraRotateDown"></button>
      <button id="cameraRotateLeft"></button>
      <button id="cameraRotateRight"></button>
    `;
    const onMatch = vi.fn();
    stop = initSequenceDetector(onMatch);
    for (const id of ['cameraRotateUp', 'cameraRotateUp', 'cameraRotateDown', 'cameraRotateDown']) {
      document.getElementById(id).click();
    }
    for (const code of KEYS.slice(4)) press(code);
    expect(onMatch, 'four presses then six keys').toHaveBeenCalledTimes(1);

    stop();
    stop = null;
    for (const code of KEYS) press(code);
    expect(onMatch, 'after stopping').toHaveBeenCalledTimes(1);
  });
});
