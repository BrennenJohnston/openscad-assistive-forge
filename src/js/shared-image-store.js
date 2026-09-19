/**
 * Shared Screenshot Image Store
 *
 * Virtual "Screenshots" folder within project state, accessible from both
 * Image Measurement and Reference Overlay tools.
 *
 * Storage: in-memory Map with objectURLs for efficient rendering.
 * Persistence: dataUrl stored to stateManager projectFiles under
 * Screenshots/{name}. Large images may exceed localStorage limits --
 * in that case the image is session-only (available until page reload).
 *
 * @license GPL-3.0-or-later
 */

let nextId = 1;
const images = new Map(); // id -> { id, name, dataUrl, objectUrl, width, height }
const subscribers = new Set();

function notify() {
  document.dispatchEvent(
    new CustomEvent('forge:images-change', {
      detail: { count: images.size },
    })
  );
  for (const cb of subscribers) {
    try {
      cb(images);
    } catch {
      /* subscriber error */
    }
  }
}

function resolveNameConflict(name) {
  if (![...images.values()].some((r) => r.name === name)) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let n = 2;
  while ([...images.values()].some((r) => r.name === `${base}_${n}${ext}`)) n++;
  return `${base}_${n}${ext}`;
}

function dimensionsFromDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}

/**
 * Add an image file to the shared store.
 * @param {File} file
 * @returns {Promise<{id:number, name:string, dataUrl:string, objectUrl:string, width:number, height:number}>}
 */
export async function addImage(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

  const { width, height } = await dimensionsFromDataUrl(dataUrl);
  const name = resolveNameConflict(file.name);
  const objectUrl = URL.createObjectURL(file);
  const id = nextId++;
  const record = { id, name, dataUrl, objectUrl, width, height };
  images.set(id, record);
  notify();
  return record;
}

/**
 * Add an image from an already-read data URL (e.g. from project restore).
 * @param {string} name
 * @param {string} dataUrl
 * @returns {Promise<{id:number, name:string, dataUrl:string, objectUrl:string, width:number, height:number}>}
 */
export async function addImageFromDataUrl(name, dataUrl) {
  const { width, height } = await dimensionsFromDataUrl(dataUrl);
  const safeName = resolveNameConflict(name);
  const blob = await fetch(dataUrl).then((r) => r.blob());
  const objectUrl = URL.createObjectURL(blob);
  const id = nextId++;
  const record = { id, name: safeName, dataUrl, objectUrl, width, height };
  images.set(id, record);
  notify();
  return record;
}

/** @returns {Map<number, {id:number, name:string, dataUrl:string, objectUrl:string, width:number, height:number}>} */
export function getImages() {
  return images;
}

export function getImageByName(name) {
  for (const r of images.values()) {
    if (r.name === name) return r;
  }
  return null;
}

export function removeImage(id) {
  const rec = images.get(id);
  if (!rec) return;
  if (rec.objectUrl) URL.revokeObjectURL(rec.objectUrl);
  images.delete(id);
  notify();
}

export function clear() {
  for (const rec of images.values()) {
    if (rec.objectUrl) URL.revokeObjectURL(rec.objectUrl);
  }
  images.clear();
  nextId = 1;
  notify();
}

/**
 * Subscribe to image store changes.
 * @param {Function} callback
 * @returns {Function} unsubscribe
 */
export function onImagesChange(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}
