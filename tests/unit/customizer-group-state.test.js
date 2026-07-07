/**
 * Tests for the F5 per-file Customizer group state helper.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadOpenGroupIds,
  saveOpenGroupIds,
  clearOpenGroupIds,
  __test,
} from '../../src/js/customizer-group-state.js';

const KEY = (id) => __test.buildKey(__test.sanitiseFileId(id));

describe('customizer-group-state (F5)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadOpenGroupIds', () => {
    it('returns null when nothing is stored', () => {
      expect(loadOpenGroupIds('keyguard.scad')).toBeNull();
    });

    it('returns null for an empty / non-string fileId', () => {
      expect(loadOpenGroupIds('')).toBeNull();
      expect(loadOpenGroupIds(null)).toBeNull();
      expect(loadOpenGroupIds(undefined)).toBeNull();
    });

    it('returns the stored set when valid JSON is present', () => {
      localStorage.setItem(
        KEY('keyguard.scad'),
        JSON.stringify({ open: ['Tablet', 'Grid Info'] })
      );
      const result = loadOpenGroupIds('keyguard.scad');
      expect(result).toBeInstanceOf(Set);
      expect([...result].sort()).toEqual(['Grid Info', 'Tablet']);
    });

    it('returns an empty set when the user has explicitly stored "all collapsed"', () => {
      localStorage.setItem(
        KEY('keyguard.scad'),
        JSON.stringify({ open: [] })
      );
      const result = loadOpenGroupIds('keyguard.scad');
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('falls back to null on corrupt JSON', () => {
      localStorage.setItem(KEY('keyguard.scad'), '{not json');
      expect(loadOpenGroupIds('keyguard.scad')).toBeNull();
    });

    it('drops non-string entries inside the stored array', () => {
      localStorage.setItem(
        KEY('keyguard.scad'),
        JSON.stringify({ open: ['Tablet', 42, null, 'Grid Info'] })
      );
      const result = loadOpenGroupIds('keyguard.scad');
      expect([...result].sort()).toEqual(['Grid Info', 'Tablet']);
    });
  });

  describe('saveOpenGroupIds', () => {
    it('persists a Set as a JSON-encoded array', () => {
      saveOpenGroupIds('keyguard.scad', new Set(['Tablet', 'Grid Info']));
      const raw = localStorage.getItem(KEY('keyguard.scad'));
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw);
      expect(parsed.open.sort()).toEqual(['Grid Info', 'Tablet']);
    });

    it('persists an empty set ("all collapsed") explicitly', () => {
      saveOpenGroupIds('keyguard.scad', new Set());
      const raw = localStorage.getItem(KEY('keyguard.scad'));
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw);
      expect(parsed.open).toEqual([]);
    });

    it('round-trips through loadOpenGroupIds', () => {
      saveOpenGroupIds('keyguard.scad', new Set(['A', 'B']));
      const result = loadOpenGroupIds('keyguard.scad');
      expect([...result].sort()).toEqual(['A', 'B']);
    });

    it('is a no-op for empty fileId', () => {
      saveOpenGroupIds('', new Set(['X']));
      expect(localStorage.length).toBe(0);
    });
  });

  describe('clearOpenGroupIds', () => {
    it('removes a previously stored entry', () => {
      saveOpenGroupIds('keyguard.scad', new Set(['Tablet']));
      clearOpenGroupIds('keyguard.scad');
      expect(loadOpenGroupIds('keyguard.scad')).toBeNull();
    });

    it('is a no-op when nothing is stored', () => {
      expect(() => clearOpenGroupIds('keyguard.scad')).not.toThrow();
    });
  });

  describe('per-file isolation', () => {
    it('keeps state separated between two files', () => {
      saveOpenGroupIds('a.scad', new Set(['Group 1']));
      saveOpenGroupIds('b.scad', new Set(['Group 2']));
      expect([...loadOpenGroupIds('a.scad')]).toEqual(['Group 1']);
      expect([...loadOpenGroupIds('b.scad')]).toEqual(['Group 2']);
    });

    it('treats path-equivalent ids as the same key', () => {
      // Both inputs should sanitise to the same key fragment.
      saveOpenGroupIds('foo/bar.scad', new Set(['G']));
      const direct = loadOpenGroupIds('foo\\bar.scad');
      expect(direct).toBeInstanceOf(Set);
      expect([...direct]).toEqual(['G']);
    });
  });
});
