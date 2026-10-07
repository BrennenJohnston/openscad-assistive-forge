/**
 * The shared image store tells every subscriber about a change, even when
 * one of them throws, and the thrown error is reported rather than lost.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { onImagesChange, clear } from '../../src/js/shared-image-store.js';

describe('shared image store subscribers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a throwing subscriber does not stop the others, and its error is reported', () => {
    const queued = [];
    vi.stubGlobal('queueMicrotask', (fn) => queued.push(fn));
    const failure = new Error('subscriber failed');
    const heard = vi.fn();
    const offFailing = onImagesChange(() => {
      throw failure;
    });
    const offHeard = onImagesChange(heard);
    try {
      clear();
    } finally {
      offFailing();
      offHeard();
    }

    expect(heard).toHaveBeenCalledTimes(1);
    expect(queued).toHaveLength(1);
    expect(() => queued[0]()).toThrow(failure);
  });
});
