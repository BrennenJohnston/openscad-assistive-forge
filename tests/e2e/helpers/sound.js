/**
 * Sound in a browser test: what the page starts, and whether this browser
 * can start a sound at all.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Every sound the page starts from now on: when, and how long it lasts.
 * Read them back from `window.__sounds`.
 * @param {import('@playwright/test').Page} page
 */
export async function listenForSound(page) {
  await page.addInitScript(() => {
    window.__sounds = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.__sounds.push({ at: performance.now(), seconds: this.buffer?.duration ?? null });
      return start.apply(this, args);
    };
  });
}

/**
 * Whether this browser can start a sound at all: some test machines have no
 * sound device, and an audio context there never starts. The next press on
 * the page tries one of its own; read the answer with `canSound` after it.
 * @param {import('@playwright/test').Page} page
 */
export async function probeSound(page) {
  await page.evaluate(() => {
    window.__canSound = new Promise((resolve) => {
      document.addEventListener(
        'click',
        () => {
          const Context = window.AudioContext || window.webkitAudioContext;
          if (!Context) return resolve(false);
          const context = new Context();
          const timer = setTimeout(() => resolve(false), 1_000);
          context.resume().then(() => {
            clearTimeout(timer);
            resolve(context.state === 'running');
          });
        },
        { capture: true, once: true }
      );
    });
  });
}

/** @returns {Promise<boolean>} The probe's answer, once a press has been made */
export const canSound = (page) => page.evaluate(() => window.__canSound);
