/**
 * Animate panel (F5) — Classic's equivalent of desktop OpenSCAD's Animate
 * dock, transcribed from upstream Animate.ui (Appendix U5).
 *
 * Real playback, not a mock: each frame sets `$t` and re-renders the model
 * through the ordinary -D parameter path, exactly as the desktop does.
 *
 * ## FPS is a ceiling, never a promise (D-31)
 *
 * A WASM preview render takes somewhere between 0.3 and 10 seconds depending
 * on the model. Playback therefore self-paces: it renders a frame, and only
 * then waits out whatever remains of the frame's time budget. Asking for 25
 * FPS on a model that renders in two seconds gets you a frame every two
 * seconds — the number is an upper bound on speed, not a guarantee of it. The
 * panel says so on screen rather than letting the field imply otherwise.
 *
 * ## What it will not do to a screen-reader user
 *
 * Playback is announced ONCE when it starts and once when it stops. Never per
 * frame. A model animating at even one frame per second would otherwise
 * produce a stream of announcements that makes the rest of the page
 * unusable — and this is an assistive-technology project, so that is a
 * product failure, not a rough edge.
 *
 * Playback is always user-initiated; nothing here starts on load. That is also
 * what keeps it honest with prefers-reduced-motion: the user has asked for
 * this specific motion, on this specific control, each time.
 *
 * ## Yielding to everything else
 *
 * Any render that is not ours — a parameter change, the Preview or Render
 * button — pauses playback and does NOT resume it. Two render requests
 * fighting over one blocking worker would make both slow and neither correct.
 *
 * @license GPL-3.0-or-later
 */

import { announceImmediate } from './announcer.js';

/** Upstream's defaults (Animate.ui). */
export const ANIMATE_DEFAULTS = Object.freeze({
  time: 0,
  fps: 5,
  steps: 30,
});

/**
 * $t for a frame index, wrapping at the end so playback loops the way the
 * desktop's does. OpenSCAD's $t runs 0..1 across `steps` frames.
 * @param {number} frame
 * @param {number} steps
 * @returns {number}
 */
export function tForFrame(frame, steps) {
  const total = Math.max(1, Math.trunc(steps) || 1);
  const wrapped = ((Math.trunc(frame) % total) + total) % total;
  return wrapped / total;
}

/**
 * How long to wait before starting the next frame, given how long this one
 * took. Never negative: a frame slower than the budget starts the next one
 * immediately rather than trying to catch up.
 * @param {number} fps
 * @param {number} elapsedMs
 * @returns {number}
 */
export function frameDelayMs(fps, elapsedMs) {
  const rate = Number(fps);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.max(0, 1000 / rate - Math.max(0, elapsedMs));
}

export class AnimatePanel {
  /**
   * @param {Object} [options]
   * @param {Element|null} [options.root]
   * @param {() => Object|null} [options.getAutoPreviewController]
   * @param {() => Object} [options.getParameters]
   * @param {() => number} [options.now] - injectable clock for tests
   */
  constructor(options = {}) {
    this.root = options.root || document.getElementById('animatePanel');
    this.getAutoPreviewController =
      options.getAutoPreviewController || (() => null);
    this.getParameters = options.getParameters || (() => ({}));
    this.now = options.now || (() => Date.now());

    /** @type {boolean} */
    this.playing = false;
    /** @type {number} */
    this.frame = 0;
    /** @type {number|undefined} */
    this._timer = undefined;
    /** @type {number} bumped on every stop so a frame in flight knows it is stale */
    this._runId = 0;

    if (this.root) this._bind();
  }

  /** @private */
  _bind() {
    const $ = (id) => this.root.querySelector(`#${id}`);
    this.timeField = $('animateTime');
    this.fpsField = $('animateFps');
    this.stepsField = $('animateSteps');
    this.playBtn = $('animatePlayBtn');
    this.startBtn = $('animateStartBtn');
    this.stepBackBtn = $('animateStepBackBtn');
    this.stepForwardBtn = $('animateStepForwardBtn');
    this.endBtn = $('animateEndBtn');

    this.startBtn?.addEventListener('click', () => this.goToFrame(0));
    this.stepBackBtn?.addEventListener('click', () => this.step(-1));
    this.playBtn?.addEventListener('click', () => this.togglePlay());
    this.stepForwardBtn?.addEventListener('click', () => this.step(1));
    this.endBtn?.addEventListener('click', () =>
      this.goToFrame(this.steps - 1)
    );

    // Typing a time jumps there; it is upstream's read/write field, not a
    // readout.
    this.timeField?.addEventListener('change', () => {
      const t = Number.parseFloat(this.timeField.value);
      if (!Number.isFinite(t)) return;
      this.goToFrame(Math.round(t * this.steps));
    });

    this._syncPlayButton();
  }

  /** @returns {number} */
  get steps() {
    const value = Math.trunc(Number(this.stepsField?.value));
    return Number.isFinite(value) && value > 0 ? value : ANIMATE_DEFAULTS.steps;
  }

  /** @returns {number} */
  get fps() {
    const value = Number(this.fpsField?.value);
    return Number.isFinite(value) && value > 0 ? value : ANIMATE_DEFAULTS.fps;
  }

  /** Start playing, or stop if it already is. */
  togglePlay() {
    if (this.playing) this.pause('Animation paused');
    else this.play();
  }

  /** Begin playback. User-initiated only — nothing calls this on load. */
  play() {
    if (this.playing) return;
    this.playing = true;
    this._runId += 1;
    this._syncPlayButton();
    // Announced once, here, and once when it stops. Never per frame.
    announceImmediate('Animation playing');
    this._tick(this._runId);
  }

  /**
   * Stop playback.
   * @param {string|null} [announcement] - said once, or nothing when null
   */
  pause(announcement = null) {
    if (!this.playing) return;
    this.playing = false;
    this._runId += 1;
    clearTimeout(this._timer);
    this._syncPlayButton();
    if (announcement) announceImmediate(announcement);
  }

  /**
   * Something else is rendering — a parameter change, the Preview or Render
   * button. Give up the worker and stay stopped: silently resuming would put
   * the user back in an animation they did not restart.
   */
  pauseForExternalRender() {
    if (!this.playing) return;
    this.pause('Animation paused because something else is rendering');
  }

  /**
   * Render one frame and, if still playing, schedule the next.
   * @param {number} runId
   * @private
   */
  async _tick(runId) {
    if (!this.playing || runId !== this._runId) return;

    const started = this.now();
    let ok = false;
    try {
      ok = await this._renderCurrentFrame();
    } catch (error) {
      console.warn('[Animate] Frame render failed:', error);
      ok = false;
    }

    // A stop that arrived while the frame was rendering wins.
    if (runId !== this._runId) return;

    if (!ok) {
      // Not swallowed: playback stops where it failed, and says so once.
      this.pause('Animation stopped: the frame could not be rendered');
      return;
    }

    this.frame += 1;
    this._syncTimeField();

    const delay = frameDelayMs(this.fps, this.now() - started);
    this._timer = setTimeout(() => this._tick(runId), delay);
  }

  /**
   * Move by whole frames without starting playback.
   * @param {number} delta
   */
  step(delta) {
    this.pause();
    this.goToFrame(this.frame + delta);
  }

  /**
   * Jump to a frame and render it.
   * @param {number} frame
   * @returns {Promise<boolean>}
   */
  async goToFrame(frame) {
    const total = this.steps;
    this.frame = ((Math.trunc(frame) % total) + total) % total;
    this._syncTimeField();
    return this._renderCurrentFrame();
  }

  /**
   * @returns {Promise<boolean>}
   * @private
   */
  _renderCurrentFrame() {
    const controller = this.getAutoPreviewController();
    if (!controller?.renderAnimationFrame) return Promise.resolve(false);
    return controller.renderAnimationFrame(
      tForFrame(this.frame, this.steps),
      this.getParameters()
    );
  }

  /** @private */
  _syncTimeField() {
    if (!this.timeField || this.timeField === document.activeElement) return;
    this.timeField.value = String(
      Number(tForFrame(this.frame, this.steps).toFixed(4))
    );
  }

  /**
   * One button plays and pauses, as upstream's does. The accessible name says
   * what pressing it will DO, which is what a screen-reader user needs.
   * @private
   */
  _syncPlayButton() {
    if (!this.playBtn) return;
    const label = this.playing ? 'Pause animation' : 'Play animation';
    this.playBtn.setAttribute('aria-label', label);
    this.playBtn.setAttribute('title', label);
    this.playBtn.setAttribute('aria-pressed', String(this.playing));
    const icon = this.playBtn.querySelector('.classic-icon');
    if (icon) {
      icon.dataset.icon = this.playing
        ? 'vcr-control-pause'
        : 'vcr-control-play';
    }
    const text = this.playBtn.querySelector('.sr-only');
    if (text) text.textContent = label;
  }
}

/** @type {AnimatePanel|null} */
let instance = null;

/**
 * @param {Object} [options]
 * @returns {AnimatePanel}
 */
export function initAnimatePanel(options = {}) {
  if (!instance) instance = new AnimatePanel(options);
  return instance;
}

/** @returns {AnimatePanel|null} */
export function getAnimatePanel() {
  return instance;
}

/** Reset the singleton. Used in unit tests. */
export function resetAnimatePanel() {
  instance = null;
}
