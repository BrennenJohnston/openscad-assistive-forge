import { describe, it, expect, vi } from 'vitest';
import {
  ANIMATE_DEFAULTS,
  AnimatePanel,
  frameDelayMs,
  tForFrame,
} from '../../src/js/animate-panel.js';
import {
  buildDefineArgs,
  formatScadValue,
} from '../../src/js/scad-param-formatter.js';

describe('Animate panel (F5)', () => {
  describe('tForFrame', () => {
    it('spreads $t from 0 across the step count', () => {
      expect(tForFrame(0, 4)).toBe(0);
      expect(tForFrame(1, 4)).toBe(0.25);
      expect(tForFrame(3, 4)).toBe(0.75);
    });

    it('wraps at the end so playback loops', () => {
      expect(tForFrame(4, 4)).toBe(0);
      expect(tForFrame(5, 4)).toBe(0.25);
    });

    it('wraps backwards too, so stepping back from zero is the last frame', () => {
      expect(tForFrame(-1, 4)).toBe(0.75);
    });

    it('survives a nonsense step count rather than dividing by zero', () => {
      expect(Number.isFinite(tForFrame(2, 0))).toBe(true);
    });
  });

  describe('frameDelayMs — FPS is a cap, not a promise', () => {
    it('waits out the remainder of the budget after a fast frame', () => {
      expect(frameDelayMs(10, 40)).toBe(60);
    });

    it('starts the next frame immediately when one overran', () => {
      // A 2-second render at a nominal 10 FPS: no catching up, no negative wait.
      expect(frameDelayMs(10, 2000)).toBe(0);
    });

    it('does not wait at all for a nonsense rate', () => {
      expect(frameDelayMs(0, 5)).toBe(0);
      expect(frameDelayMs(Number.NaN, 5)).toBe(0);
    });
  });

  describe('$t really reaches OpenSCAD as a -D flag', () => {
    it('formats $t as a bare number', () => {
      expect(formatScadValue('$t', 0.25)).toBe('0.25');
    });

    it('appears in the define args the worker builds', () => {
      const args = buildDefineArgs({ $t: 0.25 });
      expect(args.join(' ')).toContain('$t=0.25');
    });
  });

  describe('playback', () => {
    /** A panel with no DOM: the controls are optional, the logic is not. */
    function makePanel(overrides = {}) {
      return new AnimatePanel({
        root: null,
        getAutoPreviewController: () => ({
          renderAnimationFrame: vi.fn().mockResolvedValue(true),
        }),
        ...overrides,
      });
    }

    it('starts stopped — nothing animates until the user asks', () => {
      expect(makePanel().playing).toBe(false);
    });

    it('uses upstream defaults when it has no fields to read', () => {
      const panel = makePanel();
      expect(panel.steps).toBe(ANIMATE_DEFAULTS.steps);
      expect(panel.fps).toBe(ANIMATE_DEFAULTS.fps);
    });

    it('renders the requested frame with the right $t', async () => {
      const renderAnimationFrame = vi.fn().mockResolvedValue(true);
      const panel = makePanel({
        getAutoPreviewController: () => ({ renderAnimationFrame }),
      });

      await panel.goToFrame(15); // half of the 30 default steps
      expect(renderAnimationFrame).toHaveBeenCalledWith(0.5, {});
    });

    it('stops playback when a frame fails, and does not carry on', async () => {
      const renderAnimationFrame = vi.fn().mockResolvedValue(false);
      const panel = makePanel({
        getAutoPreviewController: () => ({ renderAnimationFrame }),
      });

      panel.play();
      expect(panel.playing).toBe(true);
      // Let the first frame resolve.
      await vi.waitFor(() => expect(panel.playing).toBe(false));
      expect(renderAnimationFrame).toHaveBeenCalledTimes(1);
    });

    it('stops playback when a frame throws, rather than swallowing it', async () => {
      const renderAnimationFrame = vi
        .fn()
        .mockRejectedValue(new Error('worker died'));
      const panel = makePanel({
        getAutoPreviewController: () => ({ renderAnimationFrame }),
      });

      panel.play();
      await vi.waitFor(() => expect(panel.playing).toBe(false));
    });

    it('pauses for an external render and does NOT resume on its own', async () => {
      const panel = makePanel();
      panel.play();
      expect(panel.playing).toBe(true);

      panel.pauseForExternalRender();
      expect(panel.playing).toBe(false);

      // Nothing restarts it; only the user can.
      await new Promise((r) => setTimeout(r, 50));
      expect(panel.playing).toBe(false);
    });

    it('ignores an external-render pause when it was not playing', () => {
      const panel = makePanel();
      panel.pauseForExternalRender();
      expect(panel.playing).toBe(false);
    });

    it('stepping stops playback first, so the two cannot fight', async () => {
      const panel = makePanel();
      panel.play();
      expect(panel.playing).toBe(true);

      await panel.step(1);
      expect(panel.playing).toBe(false);
    });

    it('a frame still in flight when playback stops does not schedule another', async () => {
      let resolveFrame;
      const renderAnimationFrame = vi.fn(
        () => new Promise((r) => (resolveFrame = r))
      );
      const panel = makePanel({
        getAutoPreviewController: () => ({ renderAnimationFrame }),
      });

      panel.play();
      panel.pause();
      resolveFrame(true);
      await new Promise((r) => setTimeout(r, 20));

      // Exactly the one frame that was already running; no follow-up.
      expect(renderAnimationFrame).toHaveBeenCalledTimes(1);
      expect(panel.playing).toBe(false);
    });
  });
});
