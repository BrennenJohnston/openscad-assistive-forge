/**
 * Cropping a reference image (DP-5).
 *
 * A photograph of a page is mostly page. Tracing from it means the useful part
 * is a small rectangle in the middle, and everything else is competing with
 * the model for the same screen. So: choose a rectangle, and get a copy.
 *
 * A COPY, always. The original stays in the store untouched, because a crop is
 * a decision someone may want to take back, and because the same photograph is
 * often the source for more than one design.
 *
 * The geometry here is deliberately pure and separately testable: a wrong
 * rectangle is not something a screenshot reveals, it just quietly traces the
 * wrong part of the picture.
 *
 * @license GPL-3.0-or-later
 */

/**
 * The name a cropped copy is filed under.
 *
 * Provenance matters more than brevity: someone looking at a list of images a
 * week later has to be able to tell which one this came from.
 *
 * @param {string} name - The source image's name
 * @returns {string}
 */
export function croppedName(name) {
  const safe = String(name || 'image');
  const dot = safe.lastIndexOf('.');
  if (dot <= 0) return `${safe}-crop`;
  return `${safe.slice(0, dot)}-crop${safe.slice(dot)}`;
}

/**
 * Pull a rectangle back inside the image, keeping at least one pixel.
 *
 * Every field in the dialog is a number someone can type, so every one of them
 * can be nonsense: negative, past the edge, or a width of zero. Clamping here
 * rather than validating in the UI means the preview and the crop can never
 * disagree about what the rectangle is.
 *
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function clampCropRect(rect, imageWidth, imageHeight) {
  const iw = Math.max(1, Math.floor(imageWidth) || 1);
  const ih = Math.max(1, Math.floor(imageHeight) || 1);
  const num = (v, fallback) => (Number.isFinite(v) ? Math.round(v) : fallback);

  const x = Math.min(Math.max(num(rect?.x, 0), 0), iw - 1);
  const y = Math.min(Math.max(num(rect?.y, 0), 0), ih - 1);
  let width = Math.max(1, num(rect?.width, iw));
  let height = Math.max(1, num(rect?.height, ih));

  if (x + width > iw) width = iw - x;
  if (y + height > ih) height = ih - y;

  return { x, y, width: Math.max(1, width), height: Math.max(1, height) };
}

/**
 * A sensible rectangle to open the dialog on: the whole picture.
 *
 * Starting from the full image rather than an arbitrary inset means the first
 * thing someone sees is what they already have, and every edit from there is
 * a decision they made.
 *
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function fullImageRect(imageWidth, imageHeight) {
  return clampCropRect(
    { x: 0, y: 0, width: imageWidth, height: imageHeight },
    imageWidth,
    imageHeight
  );
}

/**
 * Cut a rectangle out of an image and hand back a new data URL.
 *
 * PNG regardless of the source format: a crop of a photograph is going to be
 * traced or laid under a model, and a second lossy round would add artefacts
 * to the very edges someone is trying to follow.
 *
 * @param {string} dataUrl - The source image
 * @param {{x: number, y: number, width: number, height: number}} rect - In SOURCE pixels
 * @returns {Promise<{dataUrl: string, width: number, height: number}>}
 */
export async function cropImageDataUrl(dataUrl, rect) {
  const image = await loadImage(dataUrl);
  const box = clampCropRect(rect, image.naturalWidth, image.naturalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = box.width;
  canvas.height = box.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(
    image,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    box.width,
    box.height
  );
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: box.width,
    height: box.height,
  };
}

/**
 * @param {string} dataUrl
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = dataUrl;
  });
}
