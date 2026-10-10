/**
 * What the dialog says when the OpenSCAD engine cannot start.
 *
 * The app's own Clear Cache reaches only the app's storage. A copy of the
 * engine that the browser itself kept can only be removed from the browser's
 * settings, so the advice names that setting.
 *
 * @license GPL-3.0-or-later
 */

/**
 * @param {string} [code] - The worker's error code
 * @returns {{message: string, suggestion: string}}
 */
export function engineStartFailureNotice(code) {
  if (code === 'ENGINE_COPY_MISMATCH') {
    return {
      message:
        'This browser kept an older or damaged copy of the OpenSCAD engine, and the engine could not start from it.',
      suggestion:
        "Delete this browser's cached files, then reload the page. In Chrome, Edge or Firefox, delete browsing data and choose cached images and files; in Safari, clear history and website data. The app's Clear Cache button cannot reach these files.",
    };
  }
  return {
    message:
      'Failed to initialize the OpenSCAD engine. Some features may not work.',
    suggestion:
      "Reload the page. If the engine fails again, delete this browser's cached images and files and reload, or try another browser.",
  };
}
