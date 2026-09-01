/**
 * Per-project reference-overlay settings (DP-5).
 *
 * WHY A PROJECT FILE, and not a preference. The overlay's app-level keys
 * (`overlay-*`, the UF-14 facade) are deliberately shared across projects:
 * opacity and colour are how a person likes to work, not facts about a
 * design. Where the image SITS is the opposite - it is measured against one
 * particular model, and carrying it to the next project would place someone
 * else's tracing over your charm. So this layer sits ABOVE the preferences
 * and never migrates them: a project with no settings file falls back to the
 * app-level values exactly as before.
 *
 * The shape follows `svg-prep-metadata`'s precedent: one additive JSON in the
 * project's own file store, written through addProjectFile, ignored by any
 * build that does not know about it.
 *
 * @license GPL-3.0-or-later
 */

/** Where the settings live inside a project's file store. */
export const OVERLAY_SETTINGS_PATH = 'overlay-settings.json';

/** Bumped only if a field's MEANING changes; new fields are additive. */
export const OVERLAY_SETTINGS_VERSION = 1;

/** How long to wait after a change before writing. */
const SAVE_DEBOUNCE_MS = 800;

let saveTimer = null;
let host = null;

/**
 * Everything worth remembering about where an overlay sits.
 *
 * `calibrationMmPerPx` is a SNAPSHOT, not an instruction. unit-sync owns the
 * live px/mm scale and it is shared with Image Measurement, so restoring a
 * project must never silently move it - someone could be mid-measurement on
 * another design. It is stored so the sizes here can be explained later, and
 * read back for display only.
 *
 * @param {Object} config - previewManager.getOverlayConfig()
 * @param {number|null} [calibrationMmPerPx]
 * @returns {Object} A plain, JSON-safe record
 */
export function serializeOverlaySettings(config, calibrationMmPerPx = null) {
  if (!config) return null;
  return {
    version: OVERLAY_SETTINGS_VERSION,
    sourceFileName: config.sourceFileName ?? null,
    enabled: Boolean(config.enabled),
    opacity: numberOr(config.opacity, 1),
    offsetX: numberOr(config.offsetX, 0),
    offsetY: numberOr(config.offsetY, 0),
    rotationDeg: numberOr(config.rotationDeg, 0),
    width: numberOr(config.width, 0),
    height: numberOr(config.height, 0),
    lockAspect: config.lockAspect !== false,
    zPreset:
      typeof config.zPreset === 'string' ? config.zPreset : 'under-plate',
    zCustomMm: numberOr(config.zCustomMm, 0),
    svgColor: config.svgColor ?? null,
    calibrationMmPerPx: Number.isFinite(calibrationMmPerPx)
      ? calibrationMmPerPx
      : null,
  };
}

function numberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Put a saved record back onto a preview manager.
 *
 * Deliberately does NOT switch the overlay's image: choosing the source is
 * the person's act and the file may not be in this project at all. Sizes and
 * placement are restored; the picture is whatever they pick.
 *
 * @param {Object} previewManager
 * @param {Object|null} settings
 * @returns {boolean} Whether anything was applied
 */
export function applyOverlaySettings(previewManager, settings) {
  if (!previewManager || !settings || typeof settings !== 'object')
    return false;
  if (settings.version !== OVERLAY_SETTINGS_VERSION) return false;

  // The aspect lock goes back FIRST. setOverlaySize recomputes the other
  // dimension from the lock, so restoring a size while the lock is in the
  // wrong state re-derives one of the two numbers and quietly loses the
  // placement the person saved.
  previewManager.setOverlayAspectLock?.(settings.lockAspect !== false);
  previewManager.setOverlaySize?.({
    width: numberOr(settings.width, undefined),
    height: numberOr(settings.height, undefined),
  });
  previewManager.setOverlayTransform?.({
    offsetX: numberOr(settings.offsetX, 0),
    offsetY: numberOr(settings.offsetY, 0),
    rotationDeg: numberOr(settings.rotationDeg, 0),
  });
  previewManager.setOverlayZ?.({
    preset: settings.zPreset,
    customMm: numberOr(settings.zCustomMm, 0),
  });
  if (Number.isFinite(settings.opacity)) {
    previewManager.setOverlayOpacity?.(settings.opacity);
  }
  return true;
}

/**
 * Find and parse the settings out of a project's file list.
 * @param {Array<{path: string, textContent?: string}>} files
 * @returns {Object|null}
 */
export function readOverlaySettings(files) {
  if (!Array.isArray(files)) return null;
  const entry = files.find((f) => f && f.path === OVERLAY_SETTINGS_PATH);
  if (!entry || !entry.textContent) return null;
  try {
    return JSON.parse(entry.textContent);
  } catch (err) {
    // A corrupt settings file must not stop a project opening: the overlay
    // simply falls back to the app-level preferences, which is the same
    // behaviour as a project that never had one.
    console.warn('[Overlay settings] Could not read saved settings:', err);
    return null;
  }
}

/**
 * Tell this module how to reach the project store and the live config.
 * Wired once at boot by file-handler, which is the layer that knows which
 * project is open. Keeping it here rather than importing file-handler from
 * the overlay controller avoids a cycle between the two.
 *
 * @param {Object} deps
 * @param {() => string|null} deps.getProjectId
 * @param {() => Object|null} deps.getConfig
 * @param {() => number|null} [deps.getCalibration]
 * @param {(args: {projectId: string, path: string, kind: string, textContent: string, mimeType: string}) => Promise<any>} deps.writeFile
 */
export function registerOverlaySettingsHost(deps) {
  host = deps || null;
}

/** Forget the host. Used by tests so one case cannot leak into the next. */
export function resetOverlaySettingsHost() {
  host = null;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

/**
 * Note that the overlay moved, and write it out shortly.
 *
 * Debounced because a drag on the opacity slider is dozens of changes and the
 * project store is a 2 MB localStorage lane - writing per event would spend
 * the budget on keystrokes.
 */
export function noteOverlayChanged() {
  if (!host) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveOverlaySettingsNow();
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Write the current overlay settings into the open project, now.
 * @returns {Promise<boolean>} Whether anything was written
 */
export async function saveOverlaySettingsNow() {
  if (!host) return false;
  const projectId = host.getProjectId?.();
  if (!projectId) return false;
  const record = serializeOverlaySettings(
    host.getConfig?.(),
    host.getCalibration?.() ?? null
  );
  if (!record) return false;
  try {
    await host.writeFile({
      projectId,
      path: OVERLAY_SETTINGS_PATH,
      kind: 'json',
      textContent: JSON.stringify(record),
      mimeType: 'application/json',
    });
    return true;
  } catch (err) {
    console.warn('[Overlay settings] Could not save:', err);
    return false;
  }
}
