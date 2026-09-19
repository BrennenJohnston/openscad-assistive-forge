/**
 * A drawing sent by a link (DP-62).
 *
 * `?drawing=<url>` names a PNG, JPG, SVG or DXF. Forge fetches it from one of
 * the hosts a project may come from, hands it to the design parameter of
 * whatever the link opened as if the person had chosen it, starts the
 * conversion behind the dialog and its Cancel, and opens the drawing editor
 * on the result. A tool that makes drawings for people composes the link;
 * the person edits, applies, and takes the STL or the edited drawing back.
 *
 * Nothing here talks to the model or the editor directly: the file lands in
 * the same `<input type="file">` a hand-picked file lands in, carrying two
 * flags the file control already reads, so there is one path in, not two.
 *
 * @license GPL-3.0-or-later
 */

export const DRAWING_PARAM = 'drawing';

/** What a link may send, by extension. */
export const DRAWING_EXTENSIONS = [
  'svg',
  'dxf',
  'png',
  'jpg',
  'jpeg',
  'bmp',
  'gif',
];

/** The kinds that arrive as SVG after a conversion, so the parameter must take SVG. */
export const CONVERTED_EXTENSIONS = ['dxf', 'png', 'jpg', 'jpeg', 'bmp', 'gif'];

/**
 * The hosts the site's connect-src allows, and nothing else: the policy is
 * enforced by the browser before any request is sent, so this list only
 * decides whether the person gets a sentence or a silent refusal.
 */
export const ALLOWED_HOSTS = [
  'raw.githubusercontent.com',
  'media.githubusercontent.com',
];
export const ALLOWED_HOST_SUFFIXES = ['.github.io', '.gitlab.io', '.pages.dev'];

/** The standalone door's own ceiling, kept the same here. */
export const MAX_DRAWING_BYTES = 20 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 30_000;

const MIME_BY_EXTENSION = {
  svg: 'image/svg+xml',
  dxf: 'application/dxf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  bmp: 'image/bmp',
  gif: 'image/gif',
};

const EXTENSION_BY_MIME = {
  'image/svg+xml': 'svg',
  'application/dxf': 'dxf',
  'image/vnd.dxf': 'dxf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
};

/**
 * The extension of a file name, lowercased, without the dot.
 * @param {string} name
 * @returns {string}
 */
export function fileExtensionOf(name) {
  const match = String(name || '').match(/\.([^.\\/]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * @param {string} ext
 * @returns {string}
 */
export function mimeFor(ext) {
  return MIME_BY_EXTENSION[ext] || 'application/octet-stream';
}

/**
 * Whether a host is one Forge may fetch a drawing from: the page's own
 * origin, or one of the allowed hosts.
 * @param {string} hostname
 * @param {string} [origin] - The page's origin, e.g. https://forge.example
 * @returns {boolean}
 */
export function hostAllowed(hostname, origin = '') {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  if (origin) {
    try {
      if (new URL(origin).hostname.toLowerCase() === host) return true;
    } catch {
      // An origin that is not a URL allows nothing extra.
    }
  }
  if (ALLOWED_HOSTS.includes(host)) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Read the link's value into what to fetch and what to call it, or throw a
 * sentence the person can act on.
 *
 * A `data:` drawing carries its name after `#`, the same convention the
 * manifest lane uses for inline files, because the extension is what decides
 * how the drawing is read.
 *
 * @param {string} value - The raw `?drawing=` value
 * @param {{origin?: string}} [options]
 * @returns {{url: string, name: string, ext: string, inline: boolean}}
 */
export function parseDrawingLink(value, { origin = '' } = {}) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('The link names no drawing.');

  if (raw.toLowerCase().startsWith('data:')) {
    const hash = raw.indexOf('#');
    const body = hash >= 0 ? raw.slice(0, hash) : raw;
    let name = hash >= 0 ? raw.slice(hash + 1) : '';
    try {
      name = decodeURIComponent(name);
    } catch {
      // A name that does not decode is used as it is.
    }
    const mime = (/^data:([^;,]+)/i.exec(body)?.[1] || '').toLowerCase();
    const ext = fileExtensionOf(name) || EXTENSION_BY_MIME[mime] || '';
    if (!DRAWING_EXTENSIONS.includes(ext)) {
      throw new Error(
        'An inline drawing needs its name on the end of the link, such as #logo.svg, so Forge knows how to read it.'
      );
    }
    return { url: body, name: name || `drawing.${ext}`, ext, inline: true };
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`"${raw}" is not a web address.`);
  }
  const sameOrigin = origin && url.origin === origin;
  if (url.protocol !== 'https:' && !sameOrigin) {
    throw new Error('The drawing has to be served over https.');
  }
  if (!hostAllowed(url.hostname, origin)) {
    throw new Error(
      `${url.hostname} is not a host Forge may fetch from. Host the drawing on GitHub, GitLab Pages or Cloudflare Pages.`
    );
  }
  let name = url.pathname.split('/').pop() || '';
  try {
    name = decodeURIComponent(name);
  } catch {
    // Used as it is.
  }
  const ext = fileExtensionOf(name);
  if (!DRAWING_EXTENSIONS.includes(ext)) {
    throw new Error(
      `${name || 'The file'} is not a drawing Forge can take. Send an .svg, .dxf, .png or .jpg.`
    );
  }
  return { url: url.href, name, ext, inline: false };
}

/**
 * Fetch the drawing as a File, with the loader's timeout and the door's size
 * ceiling. Errors are sentences.
 *
 * @param {{url: string, name: string, ext: string}} link
 * @param {{fetchImpl?: Function, timeoutMs?: number}} [options]
 * @returns {Promise<File>}
 */
export async function fetchDrawingFile(
  link,
  { fetchImpl = globalThis.fetch, timeoutMs = FETCH_TIMEOUT_MS } = {}
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(link.url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(
        `The server answered ${response.status} for ${link.name}.`
      );
    }
    const blob = await response.blob();
    if (blob.size === 0) throw new Error(`${link.name} is empty.`);
    if (blob.size > MAX_DRAWING_BYTES) {
      throw new Error(
        `${link.name} is larger than ${Math.round(MAX_DRAWING_BYTES / 1024 / 1024)} MB.`
      );
    }
    return new File([blob], link.name, { type: mimeFor(link.ext) });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(
        `${link.name} took longer than ${Math.round(timeoutMs / 1000)} seconds to arrive.`
      );
    }
    if (err instanceof TypeError) {
      throw new Error(
        `Couldn't reach the server for ${link.name}. The file may not be public, or the host may not allow it.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The extensions a file input's accept attribute names, without dots.
 * @param {Element} input
 * @returns {string[]}
 */
export function acceptedOf(input) {
  return String(input?.getAttribute?.('accept') || '')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim().replace(/^\./, ''))
    .filter(Boolean);
}

/**
 * The first design parameter's input that can take this kind of drawing: one
 * that names the extension, or, for a kind that arrives as SVG after a
 * conversion, one that takes SVG.
 *
 * @param {Iterable<Element>} inputs - The model's file inputs, in order
 * @param {string} ext
 * @returns {Element|null}
 */
export function drawingTargetFor(inputs, ext) {
  for (const input of inputs) {
    const accept = acceptedOf(input);
    if (accept.includes(ext)) return input;
    if (CONVERTED_EXTENSIONS.includes(ext) && accept.includes('svg')) {
      return input;
    }
  }
  return null;
}

/**
 * Wait for the model's controls to exist and pick the input for this kind of
 * drawing. The example and project lanes hand back before the customizer is
 * built, so the first input to appear is the signal.
 *
 * @param {string} ext
 * @param {{document?: Document, timeoutMs?: number, intervalMs?: number}} [options]
 * @returns {Promise<Element|null>} null when no control takes the kind, or none appeared in time
 */
export function waitForDrawingTarget(
  ext,
  {
    document: doc = globalThis.document,
    timeoutMs = 30_000,
    intervalMs = 150,
  } = {}
) {
  const started = Date.now();
  return new Promise((resolve) => {
    const look = () => {
      const inputs = doc.querySelectorAll('input[type="file"][id^="param-"]');
      if (inputs.length > 0) {
        resolve(drawingTargetFor(inputs, ext));
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(look, intervalMs);
    };
    look();
  });
}

/**
 * Hand the file to a design parameter's input as if it had been chosen, with
 * the two flags the file control reads once and clears: start the conversion
 * without a press, and open the editor on the result.
 *
 * @param {HTMLInputElement} input
 * @param {File} file
 * @param {{startConversion?: boolean, openEditor?: boolean}} [options]
 */
export function deliverDrawing(
  input,
  file,
  { startConversion = true, openEditor = true } = {}
) {
  if (startConversion) input.dataset.forgeStartConversion = '1';
  if (openEditor) input.dataset.forgeOpenEditor = '1';
  if (typeof DataTransfer !== 'undefined') {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
  }
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Whether a modal dialog stands in front of the page right now.
 * @param {Document} doc
 * @returns {boolean}
 */
export function modalOpen(doc = globalThis.document) {
  // The modal manager makes the app inert while one of its dialogs is up.
  const app = doc.getElementById('app');
  if (app && app.inert) return true;
  // Dialogs the page keeps in the DOM but hides by style are not open: a
  // hidden element has no client rectangles.
  return Array.from(
    doc.querySelectorAll('[role="dialog"][aria-modal="true"]')
  ).some((el) => {
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    if (typeof el.getClientRects === 'function') {
      return el.getClientRects().length > 0;
    }
    return true;
  });
}

/**
 * Wait until no modal dialog is open, and has been closed for a moment. An
 * example opened from a link raises "Save this file for quick access?" right
 * after it loads; a drawing delivered under that prompt would open the editor
 * behind an inert page, where it can neither take focus nor say it opened.
 * The settle time covers the gap between the controls appearing and the
 * prompt following them.
 *
 * @param {{document?: Document, settleMs?: number, timeoutMs?: number, intervalMs?: number}} [options]
 * @returns {Promise<boolean>} true when the page is clear, false on timeout
 */
export function waitForNoModal({
  document: doc = globalThis.document,
  settleMs = 600,
  timeoutMs = 600_000,
  intervalMs = 150,
} = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    let clearSince = null;
    const look = () => {
      const now = Date.now();
      if (modalOpen(doc)) {
        clearSince = null;
      } else if (clearSince === null) {
        clearSince = now;
      } else if (now - clearSince >= settleMs) {
        resolve(true);
        return;
      }
      if (now - started >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(look, intervalMs);
    };
    look();
  });
}

/**
 * Wait for the standalone door's listener, which main.js registers late in
 * its start-up and marks on the body when it has.
 *
 * @param {{document?: Document, timeoutMs?: number, intervalMs?: number}} [options]
 * @returns {Promise<boolean>}
 */
export function waitForDoorReady({
  document: doc = globalThis.document,
  timeoutMs = 30_000,
  intervalMs = 150,
} = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    const look = () => {
      if (doc.body && doc.body.dataset.drawingDoorReady === '1') {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(look, intervalMs);
    };
    look();
  });
}
