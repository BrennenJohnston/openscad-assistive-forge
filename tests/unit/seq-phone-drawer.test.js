import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { initSequenceDetector } from '../../src/js/_seq.js';

// The unlock sequence reads the phone camera drawer's buttons by their ids.
// The drawer is built from the page's own markup here, so a change to the
// drawer that drops or renames one of those buttons fails this case.
const INDEX = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

const SEQUENCE = [
  'mobileCameraRotateUp',
  'mobileCameraRotateUp',
  'mobileCameraRotateDown',
  'mobileCameraRotateDown',
  'mobileCameraRotateLeft',
  'mobileCameraRotateRight',
  'mobileCameraRotateLeft',
  'mobileCameraRotateRight',
  'mobileCameraPanDown',
  'mobileCameraPanRight',
];

describe('The unlock sequence from the phone camera drawer', () => {
  let stop = null;

  afterEach(() => {
    stop?.();
    stop = null;
    document.body.innerHTML = '';
  });

  it('fires once when the drawer buttons are pressed in order', () => {
    const page = new DOMParser().parseFromString(INDEX, 'text/html');
    document.body.innerHTML =
      page.getElementById('cameraDrawerBody').outerHTML;
    const onMatch = vi.fn();
    stop = initSequenceDetector(onMatch);

    for (const id of SEQUENCE) {
      const button = document.getElementById(id);
      expect(button, `#${id} is in the drawer`).not.toBeNull();
      button.click();
    }
    expect(onMatch).toHaveBeenCalledTimes(1);
  });
});
