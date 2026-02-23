/**
 * Animation Controller
 *
 * Manages $t animation for OpenSCAD models that use the special
 * variable $t (0..1).  Provides play/pause, FPS slider, and step
 * count.  On each tick the controller calls back into the render
 * pipeline with the current $t value.
 *
 * @license GPL-3.0-or-later
 */

import { getAppPrefKey } from './storage-keys.js';
import { announceImmediate } from './announcer.js';

const FPS_KEY = getAppPrefKey('anim-fps');
const STEPS_KEY = getAppPrefKey('anim-steps');

const DEFAULT_FPS = 10;
const DEFAULT_STEPS = 100;
const MIN_FPS = 1;
const MAX_FPS = 30;
const MIN_STEPS = 2;
const MAX_STEPS = 1000;

/**
 * AnimationController drives $t animation.
 */
export class AnimationController {
  /**
   * @param {Object} [options]
   * @param {Function} [options.onTick] - (t: number) => void — called each frame with current $t
   */
  constructor(options = {}) {
    this.onTick = options.onTick || (() => {});

    /** @type {number} Frames per second */
    this.fps = DEFAULT_FPS;
    /** @type {number} Total steps in one 0→1 cycle */
    this.steps = DEFAULT_STEPS;
    /** @type {boolean} */
    this.playing = false;
    /** @type {number} Current step index (0..steps-1) */
    this.currentStep = 0;

    /** @type {number|null} */
    this._intervalId = null;
  }

  init() {
    this._loadPrefs();
    this._wireControls();
    this._updateDisplay();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  play() {
    if (this.playing) return;
    this.playing = true;
    this._startInterval();
    this._syncPlayButton();
    announceImmediate('Animation started');
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this._stopInterval();
    this._syncPlayButton();
    announceImmediate('Animation paused');
  }

  togglePlay() {
    this.playing ? this.pause() : this.play();
  }

  /** @returns {number} Current $t value (0..1) */
  getT() {
    return this.steps > 1 ? this.currentStep / (this.steps - 1) : 0;
  }

  /** Reset to step 0 */
  reset() {
    this.currentStep = 0;
    this._updateDisplay();
    this.onTick(this.getT());
    announceImmediate('Animation reset to start');
  }

  /** Advance one step (even while paused) */
  stepForward() {
    this.currentStep = (this.currentStep + 1) % this.steps;
    this._updateDisplay();
    this.onTick(this.getT());
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  _startInterval() {
    this._stopInterval();
    const ms = Math.round(1000 / this.fps);
    this._intervalId = setInterval(() => {
      this.currentStep = (this.currentStep + 1) % this.steps;
      this._updateDisplay();
      this.onTick(this.getT());
    }, ms);
  }

  _stopInterval() {
    if (this._intervalId != null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  _loadPrefs() {
    try {
      const fps = parseInt(localStorage.getItem(FPS_KEY), 10);
      if (!isNaN(fps) && fps >= MIN_FPS && fps <= MAX_FPS) this.fps = fps;
    } catch {
      /* ignore */
    }
    try {
      const steps = parseInt(localStorage.getItem(STEPS_KEY), 10);
      if (!isNaN(steps) && steps >= MIN_STEPS && steps <= MAX_STEPS)
        this.steps = steps;
    } catch {
      /* ignore */
    }
  }

  _savePrefs() {
    try {
      localStorage.setItem(FPS_KEY, String(this.fps));
      localStorage.setItem(STEPS_KEY, String(this.steps));
    } catch {
      /* quota */
    }
  }

  _wireControls() {
    const playBtn = document.getElementById('anim-play-btn');
    if (playBtn) playBtn.addEventListener('click', () => this.togglePlay());

    const resetBtn = document.getElementById('anim-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', () => this.reset());

    const stepBtn = document.getElementById('anim-step-btn');
    if (stepBtn) stepBtn.addEventListener('click', () => this.stepForward());

    const fpsInput = /** @type {HTMLInputElement|null} */ (
      document.getElementById('anim-fps')
    );
    if (fpsInput) {
      fpsInput.value = String(this.fps);
      fpsInput.addEventListener('input', () => {
        const v = parseInt(fpsInput.value, 10);
        if (!isNaN(v) && v >= MIN_FPS && v <= MAX_FPS) {
          this.fps = v;
          this._savePrefs();
          if (this.playing) this._startInterval();
        }
      });
    }

    const stepsInput = /** @type {HTMLInputElement|null} */ (
      document.getElementById('anim-steps')
    );
    if (stepsInput) {
      stepsInput.value = String(this.steps);
      stepsInput.addEventListener('input', () => {
        const v = parseInt(stepsInput.value, 10);
        if (!isNaN(v) && v >= MIN_STEPS && v <= MAX_STEPS) {
          this.steps = v;
          this.currentStep = Math.min(this.currentStep, v - 1);
          this._savePrefs();
          this._updateDisplay();
        }
      });
    }
  }

  _syncPlayButton() {
    const btn = document.getElementById('anim-play-btn');
    if (btn) {
      btn.textContent = this.playing ? 'Pause' : 'Play';
      btn.setAttribute(
        'aria-label',
        this.playing ? 'Pause animation' : 'Play animation'
      );
    }
  }

  _updateDisplay() {
    const el = document.getElementById('anim-t-value');
    if (el) el.textContent = `$t = ${this.getT().toFixed(3)}`;

    const progress = /** @type {HTMLInputElement|null} */ (
      document.getElementById('anim-progress')
    );
    if (progress) progress.value = String(this.currentStep);
    if (progress) progress.max = String(Math.max(0, this.steps - 1));
  }

  dispose() {
    this._stopInterval();
  }
}

// Singleton
let instance = null;

/** @param {Object} [options] @returns {AnimationController} */
export function getAnimationController(options = {}) {
  if (!instance) instance = new AnimationController(options);
  return instance;
}

export function resetAnimationController() {
  if (instance) instance.dispose();
  instance = null;
}
