/**
 * Font List panel (F3) — Classic's equivalent of desktop OpenSCAD's Font List
 * dock, transcribed from upstream FontList.ui (Appendix U7).
 *
 * It lists the fonts text() can really use — the four in font-manifest.js, the
 * same four the worker mounts — with upstream's Filter and Selection groups
 * around them. Nothing here is sample data.
 *
 * Two deliberate adaptations of upstream, both because the desktop original
 * depends on something a browser does not give us:
 *
 *   Chars [All/Any]   DISABLED. Upstream filters by whether a font covers the
 *                     characters in the sample text; that needs glyph-coverage
 *                     parsing of the TTF, which we do not do. Shown, disabled,
 *                     with the reason in words rather than quietly dropped.
 *   Drag a font       REPLACED by "Copy font name". Upstream lets you drag a
 *                     row into the editor. A drag has no keyboard equivalent,
 *                     so the panel offers the same result — the exact string
 *                     to paste into text(font = "...") — on a button.
 *
 * Sample text uses the FontFace API rather than a stylesheet of @font-face
 * rules: the pages's CSP sets style-src 'self' with no 'unsafe-inline', so
 * injecting CSS text would be blocked, while a scripted FontFace load is not
 * CSS at all. The fetch itself is same-origin, which font-src 'self' allows.
 *
 * The panel lives in a dock field the user can move, merge and hide (B6-B9),
 * so every listener is attached to an element inside the panel's own subtree —
 * re-parenting by appendChild carries those with it, ancestor listeners would
 * not survive.
 *
 * @license GPL-3.0-or-later
 */

import {
  FONT_ASSET_DIR,
  FONT_MANIFEST,
  fontScadName,
} from './font-manifest.js';
import { announceImmediate } from './announcer.js';

/** Filter modes, in the order upstream's combobox lists them. */
export const FILTER_MODES = Object.freeze(['fixed', 'wildcard', 'regexp']);

/**
 * Turn a filter string into a predicate over font names.
 *
 * Fixed is a plain case-insensitive substring, which is what Qt calls a fixed
 * string. Wildcard supports `*` and `?`. RegExp is the user's own pattern, and
 * an unfinished one — typing `[` on the way to `[abc]` — must not blank the
 * table or throw; it reports a hint and leaves the list alone.
 *
 * @param {string} text
 * @param {string} mode - one of FILTER_MODES
 * @returns {{match: (name: string) => boolean, error: string|null}}
 */
export function buildFontFilter(text, mode) {
  const needle = String(text ?? '').trim();
  if (!needle) return { match: () => true, error: null };

  if (mode === 'regexp') {
    try {
      const re = new RegExp(needle, 'i');
      return { match: (name) => re.test(name), error: null };
    } catch (error) {
      // Not a failure to swallow: the caller shows this to the user and keeps
      // the previous list on screen rather than emptying it.
      return { match: () => true, error: error.message };
    }
  }

  if (mode === 'wildcard') {
    const escaped = needle
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const re = new RegExp(`^${escaped}$`, 'i');
    return { match: (name) => re.test(name), error: null };
  }

  const lower = needle.toLowerCase();
  return { match: (name) => name.toLowerCase().includes(lower), error: null };
}

/**
 * Which manifest entries a filter keeps. Matching runs over the family name
 * and the full OpenSCAD name, so both "mono" and "style=Bold" find something.
 * @param {ReadonlyArray<Object>} fonts
 * @param {string} text
 * @param {string} mode
 * @returns {{rows: Array<Object>, error: string|null}}
 */
export function filterFonts(fonts, text, mode) {
  const { match, error } = buildFontFilter(text, mode);
  if (error) return { rows: [...fonts], error };
  const rows = fonts.filter(
    (f) => match(f.family) || match(fontScadName(f)) || match(f.style)
  );
  return { rows, error: null };
}

export class FontListPanel {
  /**
   * @param {Object} [options]
   * @param {Element|null} [options.root] - the panel element
   * @param {ReadonlyArray<Object>} [options.fonts] - manifest entries
   * @param {string} [options.assetBaseUrl] - where /fonts/ is served from
   * @param {(text: string) => Promise<void>} [options.copyText] - clipboard write
   */
  constructor(options = {}) {
    this.root = options.root || document.getElementById('fontListPanel');
    this.fonts = options.fonts || FONT_MANIFEST;
    this.assetBaseUrl = options.assetBaseUrl ?? '';
    this.copyText =
      options.copyText ||
      ((text) =>
        navigator.clipboard?.writeText(text) ??
        Promise.reject(new Error('Clipboard is not available')));

    /** @type {string|null} the selected font's file, which is unique */
    this.selected = null;
    /** @type {boolean} sample faces are fetched once, on first display */
    this._facesRequested = false;

    if (this.root) this._bind();
  }

  /** @private */
  _bind() {
    const $ = (id) => this.root.querySelector(`#${id}`);
    this.rowsBody = $('fontListRows');
    this.emptyNote = $('fontListEmpty');
    this.filterText = $('fontListFilterText');
    this.filterMode = $('fontListFilterMode');
    this.filterHint = $('fontListFilterHint');
    this.sampleText = $('fontListSample');
    this.sampleSize = $('fontListSampleSize');
    this.selName = $('fontListSelName');
    this.selPath = $('fontListSelPath');
    this.selStyle = $('fontListSelStyle');
    this.copyBtn = $('fontListCopyBtn');

    this.filterText?.addEventListener('input', () => this.render());
    this.filterMode?.addEventListener('change', () => this.render());
    this.sampleText?.addEventListener('input', () => this._applySamples());
    this.sampleSize?.addEventListener('input', () => this._applySamples());
    this.copyBtn?.addEventListener('click', () => this._copySelection());

    this.render();
  }

  /**
   * Load the real font files so the Sample column shows each font in itself.
   * Deferred until the panel is actually displayed: the four files are about
   * 1.5 MB, and a panel that is off by default should not spend that.
   */
  loadSampleFaces() {
    if (this._facesRequested || typeof FontFace === 'undefined') return;
    this._facesRequested = true;

    for (const entry of this.fonts) {
      const url = `${this.assetBaseUrl}/${FONT_ASSET_DIR}/${entry.file}`;
      const face = new FontFace(entry.family, `url(${url})`, {
        style: entry.style === 'Italic' ? 'italic' : 'normal',
        weight: entry.style === 'Bold' ? '700' : '400',
      });
      face
        .load()
        .then((loaded) => document.fonts.add(loaded))
        .catch((error) => {
          // Surfaced, not swallowed: the sample column silently falling back
          // to the UI font would otherwise look like a rendering quirk.
          console.warn(
            `[FontList] Could not load ${entry.file} for the sample column:`,
            error
          );
        });
    }
  }

  /** Rebuild the table from the manifest and the current filter. */
  render() {
    if (!this.rowsBody) return;

    const { rows, error } = filterFonts(
      this.fonts,
      this.filterText?.value ?? '',
      this.filterMode?.value ?? 'fixed'
    );

    if (this.filterHint) {
      // A half-typed pattern is not an error state — the hint appears, the
      // table keeps showing what it showed.
      this.filterHint.textContent = error
        ? `Not a complete pattern yet, so the list is unfiltered (${error})`
        : '';
      this.filterHint.hidden = !error;
    }

    this.rowsBody.replaceChildren();
    for (const entry of rows) this.rowsBody.appendChild(this._buildRow(entry));

    if (this.emptyNote) this.emptyNote.hidden = rows.length > 0;

    // A filter that hides the selected font leaves the Selection group showing
    // something no longer on screen, so the selection follows the list.
    if (this.selected && !rows.some((f) => f.file === this.selected)) {
      this._select(null);
    }
    this._applySamples();
  }

  /**
   * @param {Object} entry
   * @returns {HTMLTableRowElement}
   * @private
   */
  _buildRow(entry) {
    const tr = document.createElement('tr');
    tr.dataset.fontFile = entry.file;

    const pick = document.createElement('td');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'fontListSelection';
    radio.id = `fontListPick-${entry.file.replace(/\W+/g, '-')}`;
    radio.value = entry.file;
    radio.checked = this.selected === entry.file;
    radio.addEventListener('change', () => this._select(entry.file));
    pick.appendChild(radio);

    const name = document.createElement('td');
    // The radio's accessible name comes from the label, so a screen reader
    // announces the font rather than an unnamed radio button.
    const label = document.createElement('label');
    label.setAttribute('for', radio.id);
    label.textContent = entry.family;
    name.appendChild(label);

    const style = document.createElement('td');
    style.textContent = entry.style;

    const sample = document.createElement('td');
    sample.className = 'classic-font-sample';
    sample.dataset.fontFamily = entry.family;
    sample.dataset.fontStyle = entry.style;

    tr.append(pick, name, style, sample);
    return tr;
  }

  /**
   * Paint the Sample column in each row's own font, at the chosen size. Styles
   * are set through the CSSOM, which the page's CSP allows — a <style> block
   * built from a string would not be.
   * @private
   */
  _applySamples() {
    const text = this.sampleText?.value || '';
    const size = Number(this.sampleSize?.value) || 16;
    for (const cell of this.root.querySelectorAll('.classic-font-sample')) {
      cell.textContent = text;
      cell.style.fontFamily = `"${cell.dataset.fontFamily}"`;
      cell.style.fontStyle =
        cell.dataset.fontStyle === 'Italic' ? 'italic' : 'normal';
      cell.style.fontWeight = cell.dataset.fontStyle === 'Bold' ? '700' : '400';
      cell.style.fontSize = `${size}px`;
    }
  }

  /**
   * @param {string|null} file
   * @private
   */
  _select(file) {
    this.selected = file;
    const entry = this.fonts.find((f) => f.file === file) || null;

    if (this.selName)
      this.selName.textContent = entry ? fontScadName(entry) : '—';
    if (this.selPath) this.selPath.textContent = entry ? entry.mountPath : '—';
    if (this.selStyle) this.selStyle.textContent = entry ? entry.style : '—';
    if (this.copyBtn) this.copyBtn.disabled = !entry;
  }

  /** @private */
  async _copySelection() {
    const entry = this.fonts.find((f) => f.file === this.selected);
    if (!entry) return;
    const name = fontScadName(entry);
    try {
      await this.copyText(name);
      announceImmediate(`Copied ${name}`);
    } catch (error) {
      console.warn('[FontList] Copy failed:', error);
      announceImmediate(`Could not copy ${name}`);
    }
  }
}

/** @type {FontListPanel|null} */
let instance = null;

/**
 * @param {Object} [options]
 * @returns {FontListPanel}
 */
export function initFontListPanel(options = {}) {
  if (!instance) instance = new FontListPanel(options);
  return instance;
}

/** @returns {FontListPanel|null} */
export function getFontListPanel() {
  return instance;
}

/** Reset the singleton. Used in unit tests. */
export function resetFontListPanel() {
  instance = null;
}
