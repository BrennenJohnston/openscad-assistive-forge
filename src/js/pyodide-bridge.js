/**
 * Pyodide Bridge
 *
 * Promise-based bridge between the UI thread and the Pyodide Web Worker.
 * Manages worker lifecycle, in-flight request tracking, and progress callbacks.
 *
 * Usage:
 *   import { PyodideBridge } from './pyodide-bridge.js';
 *   const bridge = new PyodideBridge();
 *   await bridge.init(progressCallback);
 *   const form = await bridge.analyze(files, projectName, progressCallback);
 *   const scad  = await bridge.generate(form);
 *   bridge.terminate();
 *
 * @license GPL-3.0-or-later
 */

let _nextId = 1;

function nextId() {
  return _nextId++;
}

export class PyodideBridge {
  constructor() {
    this._worker = null;
    this._pending = new Map(); // id → { resolve, reject, onProgress }
    this._globalProgressCb = null;
  }

  /**
   * Start the worker and initialise Pyodide (loads CDN scripts, installs packages).
   * This must be called once before analyze() or generate().
   *
   * @param {function(string,string):void} [onProgress] - Called with (stage, message) during init
   * @returns {Promise<void>}
   */
  init(onProgress) {
    if (!this._worker) {
      // Use a blob URL so Vite treats this as a separate chunk entry point.
      // The worker module itself uses importScripts() so it is NOT an ES module.
      this._worker = new Worker(new URL('./pyodide-worker.js', import.meta.url));
      this._worker.onmessage = this._handleMessage.bind(this);
      this._worker.onerror = this._handleError.bind(this);
    }

    return this._call('init', {}, onProgress);
  }

  /**
   * Run the full analysis pipeline on uploaded CAD files.
   *
   * @param {Array<{name: string, data: Uint8Array}>} files  - Uploaded file buffers
   * @param {string} projectName                             - Project name for the form
   * @param {function(string,string):void} [onProgress]      - Called with (stage, message)
   * @param {object} [intent]                                - User intent from questionnaire
   * @returns {Promise<object>} ProjectForm as a plain JS object
   */
  analyze(files, projectName, onProgress, intent = null) {
    return this._call('analyze', { files, projectName, intent }, onProgress);
  }

  /**
   * Generate a parametric .scad file from a (possibly user-edited) ProjectForm dict.
   *
   * @param {object} form  - ProjectForm serialised as a plain JS object (matches Python _to_dict())
   * @param {function(string,string):void} [onProgress]
   * @returns {Promise<string>} Generated OpenSCAD source code
   */
  generate(form, onProgress) {
    return this._call('generate', { form }, onProgress);
  }

  /**
   * Terminate the worker. The bridge instance should be discarded after this.
   */
  terminate() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    // Reject any outstanding promises
    for (const [, { reject }] of this._pending) {
      reject(new Error('PyodideBridge: worker terminated'));
    }
    this._pending.clear();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  _call(action, payload, onProgress) {
    return new Promise((resolve, reject) => {
      const id = nextId();
      this._pending.set(id, { resolve, reject, onProgress: onProgress ?? null });
      this._worker.postMessage({ action, id, ...payload });
    });
  }

  _handleMessage(event) {
    const msg = event.data;

    // Progress notifications may arrive before the terminal reply
    if (msg.type === 'progress') {
      const entry = this._pending.get(msg.id);
      if (entry?.onProgress) {
        entry.onProgress(msg.stage, msg.message);
      }
      // Also broadcast to any global listener
      if (this._globalProgressCb) {
        this._globalProgressCb(msg.stage, msg.message);
      }
      return;
    }

    const entry = this._pending.get(msg.id);
    if (!entry) {
      // Orphaned reply (e.g. from a stale request)
      return;
    }

    this._pending.delete(msg.id);

    if (msg.type === 'error') {
      entry.reject(new Error(`[forge_cad:${msg.stage}] ${msg.message}`));
      return;
    }

    // Map terminal reply types to their payload fields
    if (msg.type === 'init_complete') {
      entry.resolve();
    } else if (msg.type === 'analyze_complete') {
      entry.resolve(msg.form);
    } else if (msg.type === 'generate_complete') {
      entry.resolve(msg.scad);
    } else {
      entry.reject(new Error(`PyodideBridge: unexpected message type "${msg.type}"`));
    }
  }

  _handleError(event) {
    // Worker script-level error (syntax error, etc.) — reject all pending
    const err = new Error(`Pyodide worker error: ${event.message ?? 'unknown'}`);
    for (const [, { reject }] of this._pending) {
      reject(err);
    }
    this._pending.clear();
  }

  /**
   * Subscribe to all progress events regardless of which call they belong to.
   * Useful for a persistent progress display.
   *
   * @param {function(string,string):void|null} cb
   */
  setGlobalProgressCallback(cb) {
    this._globalProgressCb = cb;
  }
}

// Singleton – the bridge is created lazily on first import usage
let _sharedBridge = null;

/**
 * Get the shared bridge instance (created on first call).
 * @returns {PyodideBridge}
 */
export function getSharedBridge() {
  if (!_sharedBridge) {
    _sharedBridge = new PyodideBridge();
  }
  return _sharedBridge;
}
