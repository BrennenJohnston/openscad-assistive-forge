/**
 * "Open with Forge": files handed to an installed app by the operating system.
 *
 * When a PWA is installed, the browser reads `file_handlers` from the web app
 * manifest and registers the app with the OS for those file types. Opening one
 * of those files then launches the app, and the files arrive here through
 * `window.launchQueue`.
 *
 * Three things this module is careful about:
 *
 *   1. **It routes into the paths a normal upload takes.** A file that arrives
 *      from the OS is not a special kind of file, and giving it its own loading
 *      path is how the two drift apart.
 *   2. **It waits for the engine.** A launched file can arrive before the WASM
 *      engine has finished starting - earlier than any upload ever could, since
 *      the launch IS the page load. Handing it to the app early is the same
 *      trap the deep-link lifecycle already guards against.
 *   3. **It does nothing at all where launchQueue does not exist.** That is
 *      most browsers: file handling is a Chromium-family feature, is not
 *      Baseline, and only works for an INSTALLED app. Feature-detected, so a
 *      visitor in Firefox or Safari is unaffected.
 *
 * @license GPL-3.0-or-later
 */

/** Extensions the drawing editor should open rather than the model loader. */
export const DRAWING_EXTENSIONS = ['.svg', '.dxf'];

/** Extensions that are a design or a project. */
export const DESIGN_EXTENSIONS = ['.scad', '.zip'];

/**
 * Where should a launched file go?
 *
 * @param {string} fileName
 * @returns {'design'|'drawing'|null} null when it is not something we handle
 */
export function routeForFile(fileName) {
  const name = String(fileName || '').toLowerCase();
  if (DESIGN_EXTENSIONS.some((ext) => name.endsWith(ext))) return 'design';
  if (DRAWING_EXTENSIONS.some((ext) => name.endsWith(ext))) return 'drawing';
  return null;
}

/**
 * Is OS file handling available in this browser?
 *
 * @param {Window} [win]
 * @returns {boolean}
 */
export function canReceiveLaunchedFiles(win = globalThis) {
  return Boolean(win && 'launchQueue' in win && win.launchQueue);
}

/**
 * Wire the launch queue up to the app.
 *
 * @param {Object} deps
 * @param {(file: File) => Promise<void>|void} deps.openDesign   Load a .scad or .zip
 * @param {(file: File) => Promise<void>|void} [deps.openDrawing] Open a drawing
 * @param {() => Promise<void>} [deps.waitUntilReady]  Resolves when the engine can accept work
 * @param {(message: string) => void} [deps.onUnsupported] Told about a file we do not handle
 * @param {Window} [deps.win]
 * @returns {boolean} whether a consumer was installed
 */
export function initLaunchFiles({
  openDesign,
  openDrawing = null,
  waitUntilReady = null,
  onUnsupported = null,
  win = globalThis,
} = {}) {
  if (!canReceiveLaunchedFiles(win)) return false;
  if (typeof openDesign !== 'function') return false;

  win.launchQueue.setConsumer(async (launchParams) => {
    const handles = launchParams?.files || [];
    if (handles.length === 0) return;

    // One file. Opening several at once would mean deciding which is the
    // project, and the OS does not tell us.
    const handle = handles[0];
    let file;
    try {
      file =
        typeof handle.getFile === 'function' ? await handle.getFile() : handle;
    } catch (error) {
      console.error(
        '[Launch] Could not read the file the system handed us:',
        error
      );
      return;
    }

    const route = routeForFile(file?.name);
    if (!route) {
      if (onUnsupported) onUnsupported(file?.name || '');
      return;
    }

    if (waitUntilReady) await waitUntilReady();

    if (route === 'drawing' && openDrawing) {
      await openDrawing(file);
      return;
    }
    await openDesign(file);
  });

  return true;
}
