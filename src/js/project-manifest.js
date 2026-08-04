/**
 * Per-project configuration manifest (forge.project.json).
 *
 * Moves model-family-specific behavior out of hardcoded application code
 * and into data that ships WITH the project. A project may include a
 * `forge.project.json` alongside its main .scad:
 *
 * {
 *   "version": 1,
 *   "previewOverrides": {
 *     "auto-fast": {
 *       "set":      { "render_quality": "Low" },
 *       "clampInt": { "cone_segments": [8, 12] }
 *     }
 *   },
 *   "export2D": {
 *     "rules": [
 *       { "param": "type_of_keyguard", "toValueMatching": "laser" },
 *       { "paramMatching": "laser.*(cut|cutting).*(best|pract)", "toValue": "yes" }
 *     ]
 *   }
 * }
 *
 * - previewOverrides: keyed by quality-key prefix (e.g. 'auto-fast' matches
 *   'auto-fast-preview'); each entry may `set` values and/or `clampInt`
 *   numeric params to [min, max]. A rule only applies when the parameter is
 *   actually present in the current parameter set.
 * - export2D: consumed by the 2D export flow to PROPOSE parameter changes
 *   (never applied silently — see render-intent.js).
 *
 * When a project has no manifest, getBuiltinPreviewOverrides() supplies the
 * historical hardcoded behavior (keyguard/braille family), preserving
 * existing projects' preview performance unchanged.
 *
 * @license GPL-3.0-or-later
 */

export const PROJECT_MANIFEST_FILENAME = 'forge.project.json';
export const PROJECT_MANIFEST_VERSION = 1;

/**
 * Historical hardcoded behavior, previously inlined in application code:
 * - previewOverrides: during fast auto-preview, force render_quality to
 *   'Low' and clamp cone_segments into [8, 12].
 * - export2D: the keyguard-family heuristics (switch type_of_keyguard to
 *   its laser entry; set laser-cutting best-practices toggles to yes).
 *
 * Every rule is inert for models that do not declare the named parameters,
 * so supplying this as the fallback for manifest-less projects preserves
 * existing behavior exactly.
 *
 * @returns {Object} A builtin manifest object
 */
export function getBuiltinManifest() {
  return {
    version: PROJECT_MANIFEST_VERSION,
    source: 'builtin',
    previewOverrides: {
      'auto-fast': {
        set: { render_quality: 'Low' },
        clampInt: { cone_segments: [8, 12] },
      },
    },
    export2D: {
      rules: [
        { param: 'type_of_keyguard', toValueMatching: 'laser' },
        {
          paramMatching: 'laser.*(cut|cutting).*(best|pract)',
          toValue: 'yes',
        },
      ],
    },
  };
}

// Manifest parse results are memoized per projectFiles Map identity so the
// hot preview path doesn't re-parse JSON on every parameter change.
const manifestCache = new WeakMap();

/**
 * Load and validate forge.project.json from a project's file map.
 *
 * @param {Map<string, *>|null|undefined} projectFiles - path → content
 * @returns {Object|null} Parsed manifest, or null when absent/invalid
 */
export function loadProjectManifest(projectFiles) {
  if (!projectFiles || typeof projectFiles.get !== 'function') return null;

  if (manifestCache.has(projectFiles)) {
    return manifestCache.get(projectFiles);
  }

  let manifest = null;
  const raw = findManifestContent(projectFiles);
  if (raw != null) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.version === PROJECT_MANIFEST_VERSION) {
        manifest = parsed;
      } else {
        console.warn(
          `[ProjectManifest] Ignoring ${PROJECT_MANIFEST_FILENAME}: ` +
            `unsupported version ${parsed?.version} (expected ${PROJECT_MANIFEST_VERSION})`
        );
      }
    } catch (err) {
      console.warn(
        `[ProjectManifest] Ignoring malformed ${PROJECT_MANIFEST_FILENAME}: ${err.message}`
      );
    }
  }

  manifestCache.set(projectFiles, manifest);
  return manifest;
}

function findManifestContent(projectFiles) {
  const direct = projectFiles.get(PROJECT_MANIFEST_FILENAME);
  if (direct != null) return contentToString(direct);
  // Also accept the manifest one level deep (zip roots often nest a folder).
  for (const [key, value] of projectFiles.entries()) {
    if (
      key === PROJECT_MANIFEST_FILENAME ||
      key.endsWith(`/${PROJECT_MANIFEST_FILENAME}`)
    ) {
      return contentToString(value);
    }
  }
  return null;
}

function contentToString(content) {
  if (typeof content === 'string') return content;
  // ArrayBuffer.isView is cross-realm safe (instanceof is not under jsdom).
  if (ArrayBuffer.isView(content) || content instanceof ArrayBuffer) {
    return new TextDecoder().decode(content);
  }
  return null;
}

/**
 * Apply a manifest's preview overrides to a parameter set.
 *
 * Pure: returns the input object untouched when nothing applies, otherwise
 * a shallow-copied adjusted object. A rule only fires when the parameter
 * exists in `parameters` (matching the historical hasOwnProperty guards).
 *
 * @param {Object|null} manifest - From loadProjectManifest()/builtin
 * @param {Object} parameters - Current parameter values
 * @param {string} qualityKey - Active preview quality key (e.g. 'auto-fast-preview')
 * @returns {Object} Adjusted parameters (or the original reference)
 */
export function applyPreviewOverrides(manifest, parameters, qualityKey) {
  const overrides = manifest?.previewOverrides;
  if (!overrides || !parameters || typeof qualityKey !== 'string') {
    return parameters;
  }

  const entry = Object.entries(overrides).find(([prefix]) =>
    qualityKey.startsWith(prefix)
  )?.[1];
  if (!entry) return parameters;

  const has = (name) =>
    Object.prototype.hasOwnProperty.call(parameters, name);

  let adjusted = null;
  const ensureCopy = () => adjusted ?? (adjusted = { ...parameters });

  for (const [name, value] of Object.entries(entry.set || {})) {
    if (has(name)) ensureCopy()[name] = value;
  }
  for (const [name, range] of Object.entries(entry.clampInt || {})) {
    if (!has(name) || !Array.isArray(range) || range.length !== 2) continue;
    const [min, max] = range;
    const raw = Number(parameters[name]);
    ensureCopy()[name] = Number.isFinite(raw)
      ? Math.max(min, Math.min(max, raw))
      : max;
  }

  return adjusted ?? parameters;
}
