/**
 * A drawing sent by a link (DP-62): the link is read into what to fetch and
 * what to call it, refused with a sentence when it cannot be, fetched with a
 * ceiling and a timeout, aimed at the first design parameter that takes its
 * kind, and delivered with the two flags the file control reads.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseDrawingLink,
  fetchDrawingFile,
  drawingTargetFor,
  deliverDrawing,
  hostAllowed,
  acceptedOf,
  fileExtensionOf,
  MAX_DRAWING_BYTES,
} from '../../src/js/linked-drawing.js';

const RAW = 'https://raw.githubusercontent.com/you/repo/main/logo.svg';

describe('reading the link', () => {
  it('takes a drawing from an allowed host, by name and kind', () => {
    const link = parseDrawingLink(RAW);
    expect(link).toEqual({
      url: RAW,
      name: 'logo.svg',
      ext: 'svg',
      inline: false,
    });
  });

  it('takes every kind the editor takes, and refuses the rest', () => {
    for (const ext of ['svg', 'dxf', 'png', 'jpg', 'jpeg', 'bmp', 'gif']) {
      expect(
        parseDrawingLink(`https://you.github.io/art/cat.${ext}`).ext
      ).toBe(ext);
    }
    expect(() => parseDrawingLink('https://you.github.io/art/cat.pdf')).toThrow(
      /not a drawing Forge can take/
    );
  });

  it('refuses a host the site may not fetch from, with a sentence', () => {
    expect(() =>
      parseDrawingLink('https://example.com/cat.svg')
    ).toThrow(/example\.com is not a host Forge may fetch from/);
    expect(() =>
      parseDrawingLink('https://github.com/you/repo/releases/download/v1/cat.svg')
    ).toThrow(/github\.com is not a host/);
  });

  it('allows the page’s own origin, and https only elsewhere', () => {
    expect(
      parseDrawingLink('http://localhost:5472/fixtures/cat.svg', {
        origin: 'http://localhost:5472',
      }).name
    ).toBe('cat.svg');
    expect(() =>
      parseDrawingLink('http://raw.githubusercontent.com/you/repo/main/cat.svg')
    ).toThrow(/https/);
  });

  it('refuses nothing, and nonsense', () => {
    expect(() => parseDrawingLink('')).toThrow(/names no drawing/);
    expect(() => parseDrawingLink('not a url')).toThrow(/not a web address/);
  });

  it('reads an inline drawing and its name after the hash', () => {
    const link = parseDrawingLink(
      'data:image/svg+xml;base64,PHN2Zy8+#my%20logo.svg'
    );
    expect(link.inline).toBe(true);
    expect(link.name).toBe('my logo.svg');
    expect(link.ext).toBe('svg');
    expect(link.url).toBe('data:image/svg+xml;base64,PHN2Zy8+');
  });

  it('names an inline drawing from its type when the link gives no name', () => {
    expect(parseDrawingLink('data:image/png;base64,iVBORw0KGgo=').name).toBe(
      'drawing.png'
    );
    expect(() => parseDrawingLink('data:text/plain;base64,aGk=')).toThrow(
      /needs its name on the end/
    );
  });

  it('knows the hosts', () => {
    expect(hostAllowed('raw.githubusercontent.com')).toBe(true);
    expect(hostAllowed('you.github.io')).toBe(true);
    expect(hostAllowed('you.gitlab.io')).toBe(true);
    expect(hostAllowed('forge.pages.dev')).toBe(true);
    expect(hostAllowed('github.com')).toBe(false);
    expect(hostAllowed('evil.github.io.example.com')).toBe(false);
    expect(hostAllowed('localhost', 'http://localhost:5472')).toBe(true);
    expect(hostAllowed('', 'http://localhost:5472')).toBe(false);
  });

  it('reads an extension the way the editor does', () => {
    expect(fileExtensionOf('a/b/Cat.SVG')).toBe('svg');
    expect(fileExtensionOf('noext')).toBe('');
  });
});

describe('fetching the drawing', () => {
  const link = { url: RAW, name: 'logo.svg', ext: 'svg' };
  const okResponse = (body, size) => ({
    ok: true,
    status: 200,
    blob: async () => new Blob([body]),
    size,
  });

  it('returns a File named after the link, typed by its kind', async () => {
    const fetchImpl = vi.fn(async () => okResponse('<svg/>'));
    const file = await fetchDrawingFile(link, { fetchImpl });
    expect(file.name).toBe('logo.svg');
    expect(file.type).toBe('image/svg+xml');
    expect(file.size).toBe(6);
    expect(fetchImpl).toHaveBeenCalledWith(RAW, expect.any(Object));
  });

  it('says what the server answered', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 }));
    await expect(fetchDrawingFile(link, { fetchImpl })).rejects.toThrow(
      /answered 404 for logo\.svg/
    );
  });

  it('refuses an empty file and one past the ceiling', async () => {
    await expect(
      fetchDrawingFile(link, { fetchImpl: async () => okResponse('') })
    ).rejects.toThrow(/is empty/);
    const big = {
      ok: true,
      blob: async () => ({ size: MAX_DRAWING_BYTES + 1 }),
    };
    await expect(
      fetchDrawingFile(link, { fetchImpl: async () => big })
    ).rejects.toThrow(/larger than 20 MB/);
  });

  it('turns a network refusal into a sentence', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchDrawingFile(link, { fetchImpl })).rejects.toThrow(
      /Couldn't reach the server for logo\.svg/
    );
  });

  it('gives up after the timeout', async () => {
    const fetchImpl = vi.fn(
      (url, { signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );
    await expect(
      fetchDrawingFile(link, { fetchImpl, timeoutMs: 20 })
    ).rejects.toThrow(/took longer than 0 seconds/);
  });
});

describe('aiming at a design parameter', () => {
  const input = (id, accept) => {
    const el = document.createElement('input');
    el.type = 'file';
    el.id = id;
    if (accept) el.setAttribute('accept', accept);
    return el;
  };

  it('reads the accept list without dots or case', () => {
    expect(acceptedOf(input('a', '.SVG, .png,.jpg'))).toEqual([
      'svg',
      'png',
      'jpg',
    ]);
    expect(acceptedOf(input('a'))).toEqual([]);
  });

  it('picks the first input that names the kind', () => {
    const tex = input('param-texture', '.png');
    const design = input('param-design_file', '.svg,.png,.jpg');
    expect(drawingTargetFor([tex, design], 'png')).toBe(tex);
    expect(drawingTargetFor([tex, design], 'svg')).toBe(design);
  });

  it('sends a kind that arrives as SVG to an input that takes SVG', () => {
    const design = input('param-logo_file', '.svg,.png,.jpg');
    expect(drawingTargetFor([design], 'dxf')).toBe(design);
    expect(drawingTargetFor([input('param-scad', '.scad')], 'dxf')).toBe(
      null
    );
  });

  it('delivers the file with the two flags and a change event', () => {
    const el = input('param-logo_file', '.svg');
    const seen = [];
    el.addEventListener('change', (e) => seen.push(e.type));
    deliverDrawing(el, new File(['<svg/>'], 'logo.svg'));
    expect(el.dataset.forgeStartConversion).toBe('1');
    expect(el.dataset.forgeOpenEditor).toBe('1');
    expect(seen).toEqual(['change']);
  });

  it('can deliver without the flags', () => {
    const el = input('param-logo_file', '.svg');
    deliverDrawing(el, new File(['<svg/>'], 'logo.svg'), {
      startConversion: false,
      openEditor: false,
    });
    expect(el.dataset.forgeStartConversion).toBeUndefined();
    expect(el.dataset.forgeOpenEditor).toBeUndefined();
  });
});
