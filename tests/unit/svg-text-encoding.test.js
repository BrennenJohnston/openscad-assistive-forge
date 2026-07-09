/**
 * SVG text encoding — Unit tests
 *
 * Unicode-safe base64 data URL round-trips (btoa/atob replacement).
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  svgToDataUrl,
  dataUrlToText,
} from '../../src/js/svg-text-encoding.js';

describe('svgToDataUrl / dataUrlToText', () => {
  it('round-trips plain ASCII SVG text', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0,0"/></svg>';
    expect(dataUrlToText(svgToDataUrl(svg))).toBe(svg);
  });

  it('produces a data:image/svg+xml;base64 URL', () => {
    const url = svgToDataUrl('<svg/>');
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('round-trips unicode SVG text that would break btoa()', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<title>Cr\u00e9\u00e9 par \u2702\ufe0f</title>' +
      '<path d="M0,0 L10,10"/></svg>';
    expect(() => btoa(svg)).toThrow();
    expect(dataUrlToText(svgToDataUrl(svg))).toBe(svg);
  });

  it('round-trips emoji and CJK content', () => {
    const svg = '<svg><desc>\u5fc3\u5f62 \ud83d\udc96</desc></svg>';
    expect(dataUrlToText(svgToDataUrl(svg))).toBe(svg);
  });

  it('handles large inputs beyond the 32k chunk boundary', () => {
    const svg = '<svg>' + '\u00e9'.repeat(100000) + '</svg>';
    expect(dataUrlToText(svgToDataUrl(svg))).toBe(svg);
  });

  it('dataUrlToText decodes legacy btoa()-encoded ASCII data URLs', () => {
    const svg = '<svg><path d="M1,1"/></svg>';
    const legacy = 'data:image/svg+xml;base64,' + btoa(svg);
    expect(dataUrlToText(legacy)).toBe(svg);
  });
});
