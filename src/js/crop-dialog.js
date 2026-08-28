/**
 * The crop dialog for a reference image (DP-5).
 *
 * The four numeric fields are the PRIMARY control, not a fallback beside a
 * drag handle. A handle cannot be operated from a keyboard or described to a
 * screen reader, and the numbers are what the person is actually deciding -
 * "keep the middle 400 pixels" is a sentence; a drag is not. The picture
 * beside the fields draws the rectangle so a sighted user can see the same
 * decision.
 *
 * The geometry lives in image-crop.js and is tested apart from this.
 *
 * @license GPL-3.0-or-later
 */

import { createFocusTrap } from './focus-trap.js';
import { announceImmediate } from './announcer.js';
import {
  clampCropRect,
  cropImageDataUrl,
  croppedName,
  fullImageRect,
} from './image-crop.js';

/**
 * Wire the crop dialog.
 *
 * @param {Object} deps
 * @param {(name: string, dataUrl: string) => Promise<Object>} deps.saveCopy -
 *   Puts the cropped copy in the shared image store
 * @param {(record: Object) => void} [deps.onCropped] - Told about the new copy
 * @returns {{open: Function, isOpen: () => boolean}}
 */
export function createCropDialog({ saveCopy, onCropped } = {}) {
  const modal = document.getElementById('cropImageModal');
  if (!modal) return { open: () => {}, isOpen: () => false };

  const refs = {
    overlay: document.getElementById('cropModalOverlay'),
    close: document.getElementById('cropModalClose'),
    cancel: document.getElementById('cropCancelBtn'),
    apply: document.getElementById('cropApplyBtn'),
    selectAll: document.getElementById('cropSelectAllBtn'),
    image: document.getElementById('cropPreviewImage'),
    rect: document.getElementById('cropPreviewRect'),
    preview: document.getElementById('cropPreview'),
    note: document.getElementById('cropSizeNote'),
    x: document.getElementById('cropX'),
    y: document.getElementById('cropY'),
    width: document.getElementById('cropWidth'),
    height: document.getElementById('cropHeight'),
  };

  let trap = null;
  let source = null; // { name, dataUrl, width, height }
  let openerEl = null;

  /** Read the four fields, pulled back inside the picture. */
  function readRect() {
    return clampCropRect(
      {
        x: parseFloat(refs.x.value),
        y: parseFloat(refs.y.value),
        width: parseFloat(refs.width.value),
        height: parseFloat(refs.height.value),
      },
      source?.width ?? 1,
      source?.height ?? 1
    );
  }

  /**
   * Put a rectangle into the fields and onto the picture.
   *
   * The fields are written back from the CLAMPED value, so what is shown and
   * what would be cropped can never disagree - typing 9999 leaves the field
   * saying what will actually happen.
   */
  function showRect(rect) {
    const r = clampCropRect(rect, source?.width ?? 1, source?.height ?? 1);
    refs.x.value = r.x;
    refs.y.value = r.y;
    refs.width.value = r.width;
    refs.height.value = r.height;

    if (source) {
      refs.rect.style.left = `${(r.x / source.width) * 100}%`;
      refs.rect.style.top = `${(r.y / source.height) * 100}%`;
      refs.rect.style.width = `${(r.width / source.width) * 100}%`;
      refs.rect.style.height = `${(r.height / source.height) * 100}%`;
      refs.note.textContent = `Keeping ${r.width} by ${r.height} pixels of ${source.width} by ${source.height}.`;
    }
    return r;
  }

  function onFieldInput() {
    showRect(readRect());
  }

  function close(reason) {
    if (modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    if (trap) {
      trap.deactivate();
      trap = null;
    }
    for (const el of [refs.x, refs.y, refs.width, refs.height]) {
      el.removeEventListener('input', onFieldInput);
    }
    refs.overlay?.removeEventListener('click', onCancel);
    refs.close?.removeEventListener('click', onCancel);
    refs.cancel?.removeEventListener('click', onCancel);
    refs.apply?.removeEventListener('click', onApply);
    refs.selectAll?.removeEventListener('click', onSelectAll);
    source = null;
    // Focus goes back where it came from, or the dialog leaves the keyboard
    // user on <body> with no idea what happened - the failure tour-nudge.js
    // has its own rule against. MEASURED landing on BODY when this ran
    // inline: hiding the modal blurs whatever was focused inside it, and the
    // callers that run straight after a crop rebuild the very control focus
    // is going back to. A frame later, everything has settled. This is the
    // same idiom createFocusTrap uses to take focus in the first place.
    const returnTo = openerEl;
    openerEl = null;
    if (returnTo?.isConnected) {
      requestAnimationFrame(() => {
        if (returnTo.isConnected && !returnTo.disabled) returnTo.focus();
      });
    }
    if (reason) announceImmediate(reason);
  }

  function onCancel() {
    close('Cropping cancelled. Your image is unchanged.');
  }

  function onSelectAll() {
    showRect(fullImageRect(source?.width ?? 1, source?.height ?? 1));
    announceImmediate('The whole picture is selected.');
  }

  async function onApply() {
    if (!source) return;
    const rect = showRect(readRect());
    refs.apply.disabled = true;
    try {
      const { dataUrl, width, height } = await cropImageDataUrl(
        source.dataUrl,
        rect
      );
      const name = croppedName(source.name);
      const record = await saveCopy?.(name, dataUrl);
      // The message names the COPY, because the next thing the person does is
      // look for it in the image list.
      close(
        `Cropped to ${width} by ${height} pixels. Saved as ${name}. Your original is unchanged.`
      );
      if (onCropped) onCropped(record || { name, dataUrl, width, height });
    } catch (err) {
      console.error('[Crop] Failed:', err);
      announceImmediate(`Could not crop that image. ${err.message}`);
    } finally {
      refs.apply.disabled = false;
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  }

  /**
   * Open on one image.
   * @param {{name: string, dataUrl: string, width: number, height: number}} image
   * @param {HTMLElement} [opener] - Where focus goes back to
   */
  async function open(image, opener) {
    if (!image?.dataUrl) return;
    // An image can arrive from two places: the shared store, which knows its
    // size, and the overlay panel's own upload, which only has the data URL.
    // Measuring here rather than making every caller do it keeps the dialog
    // the one thing that has to be right about the picture's real pixels.
    let { width, height } = image;
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      try {
        const measured = await measureImage(image.dataUrl);
        width = measured.width;
        height = measured.height;
      } catch (err) {
        console.error('[Crop] Could not measure that image:', err);
        announceImmediate(
          'Could not read that image, so it cannot be cropped.'
        );
        return;
      }
    }
    source = {
      name: image.name || 'image',
      dataUrl: image.dataUrl,
      width: Math.max(1, width || 1),
      height: Math.max(1, height || 1),
    };
    openerEl = opener || document.activeElement;

    refs.image.src = source.dataUrl;
    refs.x.max = String(source.width - 1);
    refs.y.max = String(source.height - 1);
    refs.width.max = String(source.width);
    refs.height.max = String(source.height);
    showRect(fullImageRect(source.width, source.height));

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    for (const el of [refs.x, refs.y, refs.width, refs.height]) {
      el.addEventListener('input', onFieldInput);
    }
    refs.overlay?.addEventListener('click', onCancel);
    refs.close?.addEventListener('click', onCancel);
    refs.cancel?.addEventListener('click', onCancel);
    refs.apply?.addEventListener('click', onApply);
    refs.selectAll?.addEventListener('click', onSelectAll);

    trap = createFocusTrap(modal, { onEscape: onCancel });
    trap.activate({ initialFocus: refs.x });
    modal.addEventListener('keydown', onKeydown, { once: false });
  }

  return {
    open,
    isOpen: () => !modal.classList.contains('hidden'),
  };
}

/**
 * The real pixel size of an image behind a data URL.
 * @param {string} dataUrl
 * @returns {Promise<{width: number, height: number}>}
 */
function measureImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = dataUrl;
  });
}
