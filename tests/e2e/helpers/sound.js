/**
 * Sound in a browser test: what the page starts, and whether this browser
 * can start a sound at all.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Every sound the page starts from now on: which file it is (`url`, the
 * path under /sounds/ its bytes were fetched from), when it was started
 * (`at`, ms on the page's clock), how far ahead it was scheduled to play
 * (`delay`, s), and how long it lasts (`seconds`). Read them back from
 * `window.__sounds`. A sound is known by its URL, never by its length: two
 * files can share a length. The URL rides with the bytes from the fetch
 * through the copy the page decodes to the decoded buffer.
 * @param {import('@playwright/test').Page} page
 */
export async function listenForSound(page) {
  await page.addInitScript(() => {
    window.__sounds = [];
    const arrayBuffer = Response.prototype.arrayBuffer;
    Response.prototype.arrayBuffer = async function () {
      const bytes = await arrayBuffer.call(this);
      if (this.url && this.url.includes('/sounds/')) {
        const url = new URL(this.url).pathname;
        bytes.__url = url;
        const slice = bytes.slice.bind(bytes);
        bytes.slice = (...args) => {
          const copy = slice(...args);
          copy.__url = url;
          return copy;
        };
      }
      return bytes;
    };
    const Context = window.AudioContext || window.webkitAudioContext;
    const decode = Context.prototype.decodeAudioData;
    Context.prototype.decodeAudioData = function (bytes, ...rest) {
      const decoded = decode.call(this, bytes, ...rest);
      if (bytes?.__url && decoded?.then) {
        decoded.then((audio) => {
          audio.__url = bytes.__url;
        });
      }
      return decoded;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.__sounds.push({
        url: this.buffer?.__url ?? null,
        at: performance.now(),
        delay: Math.max(0, (args[0] ?? 0) - this.context.currentTime),
        seconds: this.buffer?.duration ?? null,
      });
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
