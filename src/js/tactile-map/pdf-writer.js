/**
 * A small PDF writer: pages in millimeters, the standard Helvetica fonts,
 * lines, boxes, dots and text. Enough for the tactile map's print pages, and
 * nothing more: no dependency, no font embedded, no compression.
 *
 * Coordinates are given as on paper, in millimeters from the page's top
 * left; the writer turns them into points from the bottom left. Text is
 * spelled in WinAnsi, the encoding the standard fonts carry; a character
 * outside it becomes a question mark and the text is reported, so the
 * README can name what the PDF could not spell.
 *
 * The file is PDF 1.4: a catalog, a page tree, two font objects, and a page
 * object with a content stream per page, closed by a cross-reference table
 * whose offsets are counted as the bytes are laid down.
 *
 * @license GPL-3.0-or-later
 */

/** Points per millimeter: 72 to the inch. */
export const PT_PER_MM = 72 / 25.4;

/** Helvetica's average advance as a share of the size, for fitting text. */
const ADVANCE = 0.55;
const ADVANCE_BOLD = 0.58;
/** A circle from four curves. */
const KAPPA = 0.5523;

/** WinAnsi's places for the characters Latin-1 does not hold. */
const CP1252 = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/**
 * A text as WinAnsi bytes; a character the encoding lacks becomes `?`.
 *
 * @param {string} text
 * @returns {{ bytes: number[], lost: boolean }}
 */
export function encodeWinAnsi(text) {
  const bytes = [];
  let lost = false;
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) bytes.push(c);
    else if (CP1252[c]) bytes.push(CP1252[c]);
    else {
      bytes.push(0x3f);
      lost = true;
    }
  }
  return { bytes, lost };
}

/**
 * About how wide a text runs, for centering and fitting.
 *
 * @param {string} text
 * @param {number} sizePt
 * @param {boolean} [bold]
 * @returns {number} mm
 */
export function textWidthMm(text, sizePt, bold = false) {
  return (
    (String(text).length * sizePt * (bold ? ADVANCE_BOLD : ADVANCE)) / PT_PER_MM
  );
}

const num = (v) => {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
};
const rgb = ([r, g, b]) => `${num(r)} ${num(g)} ${num(b)}`;

/** The bytes of a PDF literal string, escaped. */
function literal(bytes) {
  const out = [0x28];
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c, b);
    else if (b < 0x20) {
      for (const d of `\\${b.toString(8).padStart(3, '0')}`)
        out.push(d.charCodeAt(0));
    } else out.push(b);
  }
  out.push(0x29);
  return out;
}

export class PdfWriter {
  constructor() {
    /** @type {Array<{w: number, h: number, parts: number[][]}>} */
    this.pages = [];
    this.lost = [];
  }

  /** Start a page of this size (mm); drawing goes to it until the next. */
  page(wMm, hMm) {
    this.pages.push({ w: wMm, h: hMm, parts: [] });
    return this;
  }

  pageCount() {
    return this.pages.length;
  }

  /** The texts the fonts could not spell in full, in the order met. */
  unspelled() {
    return [...this.lost];
  }

  _current() {
    if (!this.pages.length) throw new Error('No page started.');
    return this.pages[this.pages.length - 1];
  }

  _ascii(text) {
    const page = this._current();
    const bytes = [];
    for (let i = 0; i < text.length; i += 1) bytes.push(text.charCodeAt(i));
    page.parts.push(bytes);
  }

  _x(mm) {
    return num(mm * PT_PER_MM);
  }

  _y(mm) {
    return num((this._current().h - mm) * PT_PER_MM);
  }

  /**
   * Text with its baseline at (x, y).
   *
   * @param {number} xMm
   * @param {number} yMm
   * @param {number} sizePt
   * @param {string} text
   * @param {{ bold?: boolean, align?: 'left'|'center'|'right', color?: number[] }} [options]
   */
  text(xMm, yMm, sizePt, text, { bold = false, align = 'left', color } = {}) {
    const str = String(text);
    if (!str) return;
    const { bytes, lost } = encodeWinAnsi(str);
    if (lost && !this.lost.includes(str)) this.lost.push(str);
    let x = xMm;
    if (align !== 'left') {
      const width = textWidthMm(str, sizePt, bold);
      x = align === 'center' ? xMm - width / 2 : xMm - width;
    }
    this._ascii(
      `BT ${color ? `${rgb(color)} rg ` : ''}/${bold ? 'F2' : 'F1'} ${num(sizePt)} Tf ${this._x(x)} ${this._y(yMm)} Td `
    );
    this._current().parts.push(literal(bytes));
    this._ascii(` Tj ET\n`);
  }

  /**
   * A box, its top left at (x, y).
   *
   * @param {{ stroke?: number[]|null, fill?: number[]|null, widthMm?: number }} [options]
   */
  rect(
    xMm,
    yMm,
    wMm,
    hMm,
    { stroke = [0, 0, 0], fill = null, widthMm = 0.3 } = {}
  ) {
    const op = fill && stroke ? 'B' : fill ? 'f' : 'S';
    this._ascii(
      `${fill ? `${rgb(fill)} rg ` : ''}${stroke ? `${rgb(stroke)} RG ${num(widthMm * PT_PER_MM)} w ` : ''}${this._x(xMm)} ${this._y(yMm + hMm)} ${num(wMm * PT_PER_MM)} ${num(hMm * PT_PER_MM)} re ${op}\n`
    );
  }

  /**
   * Closed rings, filled by the nonzero rule (or even-odd), stroked or both.
   *
   * @param {Array<Array<{x: number, y: number}>>} rings - mm, y from the top
   * @param {{ fill?: number[]|null, stroke?: number[]|null, widthMm?: number, evenOdd?: boolean }} [options]
   */
  polygons(
    rings,
    { fill = [0, 0, 0], stroke = null, widthMm = 0.3, evenOdd = false } = {}
  ) {
    const list = (rings || []).filter((r) => r && r.length > 2);
    if (!list.length) return;
    let s = `${fill ? `${rgb(fill)} rg ` : ''}${stroke ? `${rgb(stroke)} RG ${num(widthMm * PT_PER_MM)} w ` : ''}`;
    for (const ring of list) {
      ring.forEach((p, i) => {
        s += `${this._x(p.x)} ${this._y(p.y)} ${i ? 'l' : 'm'} `;
      });
      s += 'h ';
    }
    const op =
      fill && stroke
        ? evenOdd
          ? 'B*'
          : 'B'
        : fill
          ? evenOdd
            ? 'f*'
            : 'f'
          : 'S';
    this._ascii(`${s}${op}\n`);
  }

  /** A dot: a circle of radius r about (cx, cy), filled. */
  circle(cxMm, cyMm, rMm, { fill = [0, 0, 0] } = {}) {
    const k = KAPPA * rMm;
    const x = (mm) => this._x(mm);
    const y = (mm) => this._y(mm);
    this._ascii(
      `${rgb(fill)} rg ${x(cxMm + rMm)} ${y(cyMm)} m\n` +
        `${x(cxMm + rMm)} ${y(cyMm - k)} ${x(cxMm + k)} ${y(cyMm - rMm)} ${x(cxMm)} ${y(cyMm - rMm)} c\n` +
        `${x(cxMm - k)} ${y(cyMm - rMm)} ${x(cxMm - rMm)} ${y(cyMm - k)} ${x(cxMm - rMm)} ${y(cyMm)} c\n` +
        `${x(cxMm - rMm)} ${y(cyMm + k)} ${x(cxMm - k)} ${y(cyMm + rMm)} ${x(cxMm)} ${y(cyMm + rMm)} c\n` +
        `${x(cxMm + k)} ${y(cyMm + rMm)} ${x(cxMm + rMm)} ${y(cyMm + k)} ${x(cxMm + rMm)} ${y(cyMm)} c\n` +
        'f\n'
    );
  }

  /** A straight line, dashed when `dash` gives the dash and the gap (mm). */
  line(
    x1,
    y1,
    x2,
    y2,
    { stroke = [0, 0, 0], widthMm = 0.3, dash = null } = {}
  ) {
    const d = dash
      ? `[${num(dash[0] * PT_PER_MM)} ${num(dash[1] * PT_PER_MM)}] 0 d `
      : '';
    this._ascii(
      `${rgb(stroke)} RG ${num(widthMm * PT_PER_MM)} w ${d}${this._x(x1)} ${this._y(y1)} m ${this._x(x2)} ${this._y(y2)} l S${dash ? ' [] 0 d' : ''}\n`
    );
  }

  /**
   * The file.
   *
   * @returns {Uint8Array}
   */
  save() {
    const chunks = [];
    let length = 0;
    const put = (bytes) => {
      chunks.push(bytes);
      length += bytes.length;
    };
    const ascii = (text) => {
      const bytes = [];
      for (let i = 0; i < text.length; i += 1) bytes.push(text.charCodeAt(i));
      put(bytes);
    };
    const offsets = [];
    const object = (id, body) => {
      offsets[id] = length;
      ascii(`${id} 0 obj\n${body}\nendobj\n`);
    };

    ascii('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    const n = this.pages.length;
    const pageIds = this.pages.map((_, i) => 5 + i * 2);
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    object(
      2,
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${n} >>`
    );
    object(
      3,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    );
    object(
      4,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    );
    this.pages.forEach((page, i) => {
      const id = pageIds[i];
      object(
        id,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.w * PT_PER_MM)} ${num(page.h * PT_PER_MM)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`
      );
      const content = page.parts.flat();
      offsets[id + 1] = length;
      ascii(`${id + 1} 0 obj\n<< /Length ${content.length} >>\nstream\n`);
      put(content);
      ascii('\nendstream\nendobj\n');
    });
    const count = 5 + n * 2;
    const xrefAt = length;
    ascii(`xref\n0 ${count}\n0000000000 65535 f \n`);
    for (let id = 1; id < count; id += 1) {
      ascii(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    }
    ascii(
      `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
    );

    const out = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  }
}
