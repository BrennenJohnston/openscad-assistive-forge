/**
 * The shared announcer (announcer.js) and a repeated message.
 *
 * A screen reader speaks a live region only when its text changes, so the
 * announcer empties the region before writing. When the same words are
 * still in the region (it clears itself 1.5 s after a message), emptying it
 * and writing again one frame later is too quick for the browser's
 * accessibility tree to see a change: a six-key cell repeating the cell
 * before it went unsaid in NVDA.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('announcer: a repeated message', () => {
  let frames;
  let announceImmediate;

  beforeEach(async () => {
    document.body.innerHTML =
      '<div id="srAnnouncer" role="status" aria-live="polite"></div>' +
      '<div id="srAnnouncerAssertive" role="alert" aria-live="assertive"></div>';
    vi.useFakeTimers();
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    // The announcer keeps its timers in module state: a fresh module per test
    vi.resetModules();
    ({ announceImmediate } = await import('../../src/js/announcer.js'));
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const region = () => document.getElementById('srAnnouncer');
  const nextFrame = () => frames.splice(0).forEach((cb) => cb(0));
  const cell = String.fromCodePoint(0x2801);

  it('writes a new message on the next frame', () => {
    announceImmediate('dots 1');
    expect(region().textContent).toBe('');
    nextFrame();
    expect(region().textContent).toBe('dots 1');
  });

  it('keeps the region empty for 100 ms before writing the same words again', () => {
    announceImmediate('dots 1');
    nextFrame();
    // The same cell 1.2 s later, while the region still holds it
    vi.advanceTimersByTime(1200);
    expect(region().textContent).toBe('dots 1');

    announceImmediate('dots 1');
    expect(region().textContent).toBe('');
    nextFrame();
    expect(region().textContent).toBe('');
    vi.advanceTimersByTime(99);
    expect(region().textContent).toBe('');
    vi.advanceTimersByTime(1);
    expect(region().textContent).toBe('dots 1');
  });

  it('lets a newer message win over a repeat that is still waiting', () => {
    announceImmediate('dots 1');
    nextFrame();
    vi.advanceTimersByTime(1200);
    announceImmediate('dots 1');
    announceImmediate('dots 2');
    nextFrame();
    vi.advanceTimersByTime(500);
    expect(region().textContent).toBe('dots 2');
  });

  it('writes the same words on the next frame once the region has cleared itself', () => {
    announceImmediate(cell);
    nextFrame();
    vi.advanceTimersByTime(2000);
    expect(region().textContent).toBe('');
    announceImmediate(cell);
    nextFrame();
    expect(region().textContent).toBe(cell);
  });
});

describe('announcer: two sentences at once', () => {
  let frames;
  let announce;
  let announceImmediate;
  let withdrawAnnouncement;

  beforeEach(async () => {
    document.body.innerHTML =
      '<div id="srAnnouncer" role="status" aria-live="polite"></div>' +
      '<div id="srAnnouncerAssertive" role="alert" aria-live="assertive"></div>';
    vi.useFakeTimers();
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.resetModules();
    ({ announce, announceImmediate, withdrawAnnouncement } =
      await import('../../src/js/announcer.js'));
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const region = () => document.getElementById('srAnnouncer');
  const nextFrame = () => frames.splice(0).forEach((cb) => cb(0));

  it('says a waiting sentence with one from another source that comes before it is written', () => {
    announce('File menu opened', { source: 'menu' });
    vi.advanceTimersByTime(100);
    announceImmediate('Preview ready', { source: 'status' });
    nextFrame();
    expect(region().textContent).toBe('File menu opened. Preview ready');
  });

  it("says only the last of one control's values, waiting or written", () => {
    announce('Width 50 mm');
    vi.advanceTimersByTime(100);
    announce('Width 51 mm');
    vi.advanceTimersByTime(100);
    announce('Width 52 mm');
    vi.advanceTimersByTime(350);
    nextFrame();
    expect(region().textContent).toBe('Width 52 mm');

    announceImmediate('Rotate up');
    nextFrame();
    vi.advanceTimersByTime(100);
    announceImmediate('Rotate down');
    nextFrame();
    expect(region().textContent).toBe('Rotate down');
  });

  it('does not say a sentence taken back before it was written', () => {
    announce('Edit menu opened', { source: 'menu' });
    vi.advanceTimersByTime(100);
    withdrawAnnouncement('menu');
    announceImmediate('Bookmark added, line 1');
    nextFrame();
    expect(region().textContent).toBe('Bookmark added, line 1');
  });
});
