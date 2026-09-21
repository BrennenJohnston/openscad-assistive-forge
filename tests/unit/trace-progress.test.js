/**
 * The Start panel and its Crop first button (DP-80).
 *
 * A photograph of a page is mostly the page. Crop first sits beside Start
 * from the moment the pixels are read, so the part that matters can be cut
 * out BEFORE anything is converted; once the picture has converted it reads
 * Crop. It goes away with Start while a person's own conversion runs and
 * comes back when it ends; a conversion that started by itself keeps it,
 * because a press on it is the person's answer to work nobody asked for.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTraceProgress,
  CROP_FIRST_LABEL,
  CROP_FIRST_NAME,
} from '../../src/js/trace-progress.js';

describe('createTraceProgress: Crop first (DP-80)', () => {
  let onStart;
  let onCrop;
  let panel;

  beforeEach(() => {
    onStart = vi.fn();
    onCrop = vi.fn();
    panel = createTraceProgress({ onStart, onCrop });
    document.body.appendChild(panel.root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('★ is not on screen until the host offers it, then sits beside Start with the visible words in its name', () => {
    expect(panel.cropButton.hidden).toBe(true);
    panel.offer('Start conversion');
    expect(panel.cropButton.hidden).toBe(true);
    expect(panel.isCropOffered()).toBe(false);

    panel.offerCrop();
    expect(panel.cropButton.hidden).toBe(false);
    expect(panel.isCropOffered()).toBe(true);
    expect(panel.cropButton.textContent).toBe(CROP_FIRST_LABEL);
    expect(panel.cropButton.getAttribute('aria-label')).toBe(CROP_FIRST_NAME);
    // The accessible name contains the visible words (WCAG 2.5.3).
    expect(CROP_FIRST_NAME.startsWith(CROP_FIRST_LABEL)).toBe(true);
    expect(panel.cropButton.parentElement).toBe(
      panel.startButton.parentElement
    );
    expect(panel.cropButton.parentElement.className).toBe(
      'trace-progress-buttons'
    );

    panel.cropButton.click();
    expect(onCrop).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("reads Crop with the editor's own name once the picture has converted", () => {
    panel.offer('Convert again');
    panel.offerCrop('Crop', 'Crop the picture');
    expect(panel.cropButton.hidden).toBe(false);
    expect(panel.cropButton.textContent).toBe('Crop');
    expect(panel.cropButton.getAttribute('aria-label')).toBe(
      'Crop the picture'
    );
  });

  it("★ goes away with Start while a person's conversion runs and comes back when it ends; a self-started run keeps it", () => {
    panel.offer();
    panel.offerCrop();

    panel.begin();
    expect(panel.startButton.hidden).toBe(true);
    expect(panel.cropButton.hidden).toBe(true);
    expect(panel.isRunning()).toBe(true);

    panel.finish();
    expect(panel.startButton.hidden).toBe(false);
    expect(panel.cropButton.hidden).toBe(false);

    panel.begin({ keepCrop: true });
    expect(panel.startButton.hidden).toBe(true);
    expect(panel.cropButton.hidden).toBe(false);

    panel.offer('Convert again');
    expect(panel.startButton.textContent).toBe('Convert again');
    expect(panel.cropButton.hidden).toBe(false);
  });

  it('offerCrop while a run is under way waits for the run to end', () => {
    panel.offer();
    panel.begin();
    panel.offerCrop();
    expect(panel.cropButton.hidden).toBe(true);
    panel.finish();
    expect(panel.cropButton.hidden).toBe(false);
  });

  it('hide() takes the crop away with the rest, and Start alone does not bring it back', () => {
    panel.offer();
    panel.offerCrop();
    panel.hide();
    expect(panel.root.hidden).toBe(true);
    expect(panel.cropButton.hidden).toBe(true);
    expect(panel.isCropOffered()).toBe(false);

    panel.show();
    panel.offer();
    expect(panel.cropButton.hidden).toBe(true);
  });

  it('a host without a crop handler never shows the button', () => {
    const bare = createTraceProgress({ onStart: vi.fn() });
    bare.offer();
    bare.offerCrop();
    expect(bare.cropButton.hidden).toBe(true);
    expect(bare.isCropOffered()).toBe(false);
  });
});
