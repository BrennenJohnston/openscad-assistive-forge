/**
 * Copy-preset-name helper (F30).
 *
 * Encapsulates the clipboard fallback chain so the main.js wiring stays
 * a thin event listener and the behaviour is unit-testable without
 * having to spin up the entire app.
 *
 * Strategy:
 *   1. Prefer `navigator.clipboard.writeText()` (async, secure-context).
 *   2. Fall back to a hidden textarea + `document.execCommand('copy')`
 *      so the feature still works on older browsers and in non-secure
 *      contexts (file://, http://localhost served as http).
 *   3. Surface a clear success/failure result so the caller can drive
 *      announcements and toast messages.
 *
 * @license GPL-3.0-or-later
 */

/**
 * @typedef {Object} CopyResult
 * @property {boolean} ok           True when the text reached the clipboard.
 * @property {'clipboard-api'|'exec-command'|null} method
 *                                  Which path succeeded; null on failure.
 * @property {Error|null} error     Underlying error if `ok === false`.
 */

/**
 * Copy a preset name to the clipboard using the best available API.
 *
 * @param {string} name             The preset name to copy verbatim.
 * @param {Object} [deps]           Injectable seams for tests.
 * @param {Navigator} [deps.navigator]
 * @param {Document}  [deps.document]
 * @returns {Promise<CopyResult>}
 */
export async function copyPresetName(name, deps = {}) {
  const navRef = deps.navigator ?? globalThis.navigator;
  const docRef = deps.document ?? globalThis.document;

  if (typeof name !== 'string' || name.length === 0) {
    return {
      ok: false,
      method: null,
      error: new Error('Empty preset name'),
    };
  }

  // Path 1: modern async Clipboard API.
  if (navRef?.clipboard?.writeText) {
    try {
      await navRef.clipboard.writeText(name);
      return { ok: true, method: 'clipboard-api', error: null };
    } catch (error) {
      // Fall through to the textarea path below; some browsers reject
      // when not in a secure context or when the document is unfocused.
      // We deliberately do NOT log here — the caller decides UX.
      const apiError = /** @type {Error} */ (error);
      const fallback = _legacyCopy(name, docRef);
      if (fallback.ok) return fallback;
      return { ok: false, method: null, error: apiError };
    }
  }

  // Path 2: textarea + execCommand for legacy browsers.
  return _legacyCopy(name, docRef);
}

/**
 * @param {string} text
 * @param {Document|undefined} docRef
 * @returns {CopyResult}
 */
function _legacyCopy(text, docRef) {
  if (!docRef?.createElement || !docRef.body) {
    return {
      ok: false,
      method: null,
      error: new Error('No document available for legacy copy fallback'),
    };
  }

  const ta = docRef.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.opacity = '0';
  ta.style.pointerEvents = 'none';

  docRef.body.appendChild(ta);
  try {
    ta.select();
    const ok = !!docRef.execCommand && docRef.execCommand('copy');
    return ok
      ? { ok: true, method: 'exec-command', error: null }
      : {
          ok: false,
          method: null,
          error: new Error('execCommand("copy") returned false'),
        };
  } catch (error) {
    return { ok: false, method: null, error: /** @type {Error} */ (error) };
  } finally {
    docRef.body.removeChild(ta);
  }
}
