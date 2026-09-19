import { test } from '@playwright/test';

/**
 * Ask the browser under test whether it can create a WebGL context at all.
 *
 * The CI Firefox and WebKit runners have none. PreviewManager then initialises
 * headless, creates no canvas, and shows its "3D preview unavailable" notice
 * instead, so a case that needs a rendered model has no precondition rather
 * than a wrong behaviour.
 *
 * Probing the capability directly, instead of counting canvases, matters for
 * cases that WAIT for the canvas to arrive: a canvas count taken too early
 * cannot tell "this browser will never draw" from "this browser has not drawn
 * yet", and would skip a slow-but-working browser.
 *
 * Skip on the missing capability, never on a browser name — Firefox and
 * WebKit locally do have WebGL, and these cases run and count there.
 */
export async function hasWebGL(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  });
}

/** Skip the running test when the browser cannot draw. Reason is required. */
export async function skipWithoutWebGL(page, reason) {
  test.skip(!(await hasWebGL(page)), reason);
}
