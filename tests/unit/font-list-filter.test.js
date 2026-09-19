import { describe, it, expect } from 'vitest';
import {
  FILTER_MODES,
  buildFontFilter,
  filterFonts,
} from '../../src/js/font-list-panel.js';
import { FONT_MANIFEST } from '../../src/js/font-manifest.js';

describe('Font List filter (F3)', () => {
  it('offers upstream’s three modes in upstream’s order', () => {
    expect(FILTER_MODES).toEqual(['fixed', 'wildcard', 'regexp']);
  });

  describe('fixed', () => {
    it('matches a case-insensitive substring', () => {
      const { match } = buildFontFilter('mono', 'fixed');
      expect(match('Liberation Mono')).toBe(true);
      expect(match('Liberation Sans')).toBe(false);
    });

    it('treats regex metacharacters literally', () => {
      const { match } = buildFontFilter('.*', 'fixed');
      expect(match('Liberation Sans')).toBe(false);
      expect(match('weird.*name')).toBe(true);
    });

    it('keeps everything when the box is empty', () => {
      const { match } = buildFontFilter('   ', 'fixed');
      expect(match('anything at all')).toBe(true);
    });
  });

  describe('wildcard', () => {
    it('anchors the pattern and expands *', () => {
      const { match } = buildFontFilter('Liberation*', 'wildcard');
      expect(match('Liberation Mono')).toBe(true);
      expect(match('Deja Liberation')).toBe(false);
    });

    it('expands ? to exactly one character', () => {
      const { match } = buildFontFilter('Liberation Mon?', 'wildcard');
      expect(match('Liberation Mono')).toBe(true);
      expect(match('Liberation Mon')).toBe(false);
    });
  });

  describe('regexp', () => {
    it('uses the pattern as written, case-insensitively', () => {
      const { match, error } = buildFontFilter(
        '^Liberation (Sans|Mono)$',
        'regexp'
      );
      expect(error).toBeNull();
      expect(match('Liberation Sans')).toBe(true);
      expect(match('Liberation Serif')).toBe(false);
    });

    it('reports a half-typed pattern instead of throwing', () => {
      const { match, error } = buildFontFilter('[abc', 'regexp');
      expect(error).toBeTruthy();
      // Non-blocking: an unfinished pattern must not empty the table.
      expect(match('Liberation Sans')).toBe(true);
    });
  });

  describe('over the real manifest', () => {
    it('narrows "mono" to exactly one font', () => {
      const { rows, error } = filterFonts(FONT_MANIFEST, 'mono', 'fixed');
      expect(error).toBeNull();
      expect(rows).toHaveLength(1);
      expect(rows[0].family).toBe('Liberation Mono');
    });

    it('finds a face by its style as well as its family', () => {
      const { rows } = filterFonts(FONT_MANIFEST, 'Italic', 'fixed');
      expect(rows).toHaveLength(1);
      expect(rows[0].style).toBe('Italic');
    });

    it('finds a face by the name you would paste into text()', () => {
      const { rows } = filterFonts(FONT_MANIFEST, 'style=Bold', 'fixed');
      expect(rows).toHaveLength(1);
      expect(rows[0].style).toBe('Bold');
    });

    it('shows every font when the filter is empty', () => {
      const { rows } = filterFonts(FONT_MANIFEST, '', 'fixed');
      expect(rows).toHaveLength(FONT_MANIFEST.length);
    });

    it('shows nothing when nothing matches', () => {
      const { rows } = filterFonts(FONT_MANIFEST, 'Comic Sans', 'fixed');
      expect(rows).toHaveLength(0);
    });

    it('leaves the list intact while a regexp is still being typed', () => {
      const { rows, error } = filterFonts(FONT_MANIFEST, '(', 'regexp');
      expect(error).toBeTruthy();
      expect(rows).toHaveLength(FONT_MANIFEST.length);
    });
  });
});
