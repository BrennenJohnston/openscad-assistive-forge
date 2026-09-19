/**
 * Persistent Tutorial Registry Unit Tests (UF-16)
 *
 * The registry is the app's only durable answer to "was this tutorial ever
 * opened or completed?" — sessionStorage step progress is erased on
 * completion by design. These tests pin the storage shape under
 * STORAGE_KEY_TUTORIAL_STATE, the one-family rule for mode variants
 * ('classic-intro' records as 'intro'), and tolerance of corrupt values.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getTutorialFamilyId,
  getTutorialFamilyState,
  recordTutorialOpened,
  recordTutorialCompleted,
  recordTutorialSpotlightDismissed,
  TUTORIAL_STATE_EVENT,
} from '../../src/js/tutorial-sandbox.js';
import { STORAGE_KEY_TUTORIAL_STATE } from '../../src/js/storage-keys.js';

const readRaw = () =>
  JSON.parse(localStorage.getItem(STORAGE_KEY_TUTORIAL_STATE));

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY_TUTORIAL_STATE);
});

describe('getTutorialFamilyId', () => {
  it("maps the classic variant to its family ('classic-intro' -> 'intro')", () => {
    expect(getTutorialFamilyId('classic-intro')).toBe('intro');
  });

  it('returns non-variant ids unchanged', () => {
    expect(getTutorialFamilyId('intro')).toBe('intro');
    expect(getTutorialFamilyId('makers')).toBe('makers');
    expect(getTutorialFamilyId('never-heard-of-it')).toBe('never-heard-of-it');
  });
});

describe('registry writes', () => {
  it('records an open-only state with a timestamp', () => {
    recordTutorialOpened('intro');

    const state = getTutorialFamilyState('intro');
    expect(state.opened).toBeTypeOf('number');
    expect(state.completed).toBeUndefined();
    expect(state.dismissed).toBeUndefined();
    expect(readRaw()).toEqual({ intro: { opened: state.opened } });
  });

  it('records completion alongside an earlier open', () => {
    recordTutorialOpened('intro');
    recordTutorialCompleted('intro');

    const state = getTutorialFamilyState('intro');
    expect(state.opened).toBeTypeOf('number');
    expect(state.completed).toBeTypeOf('number');
  });

  it('both variants write ONE family record (the U-23 family rule)', () => {
    recordTutorialOpened('classic-intro');
    recordTutorialCompleted('intro');

    expect(Object.keys(readRaw())).toEqual(['intro']);
    const state = getTutorialFamilyState('classic-intro');
    expect(state.opened).toBeTypeOf('number');
    expect(state.completed).toBeTypeOf('number');
  });

  it('records the Q-43a permanent dismissal', () => {
    recordTutorialSpotlightDismissed('intro');

    expect(getTutorialFamilyState('intro').dismissed).toBeTypeOf('number');
  });

  it('families do not bleed into each other', () => {
    recordTutorialOpened('intro');
    recordTutorialOpened('makers');

    expect(Object.keys(readRaw()).sort()).toEqual(['intro', 'makers']);
    expect(getTutorialFamilyState('makers').completed).toBeUndefined();
  });

  it('dispatches TUTORIAL_STATE_EVENT with the family and field', () => {
    const seen = [];
    const listener = (e) => seen.push(e.detail);
    document.addEventListener(TUTORIAL_STATE_EVENT, listener);

    recordTutorialOpened('classic-intro');
    document.removeEventListener(TUTORIAL_STATE_EVENT, listener);

    expect(seen).toEqual([{ familyId: 'intro', field: 'opened' }]);
  });
});

describe('corrupt-value tolerance', () => {
  it('treats unparseable JSON as an empty registry and recovers on write', () => {
    localStorage.setItem(STORAGE_KEY_TUTORIAL_STATE, 'not-json{{');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(getTutorialFamilyState('intro')).toEqual({});
    recordTutorialOpened('intro');

    expect(readRaw().intro.opened).toBeTypeOf('number');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('treats a non-object value (array, string, number) as empty', () => {
    for (const bad of ['[1,2]', '"hello"', '42', 'null']) {
      localStorage.setItem(STORAGE_KEY_TUTORIAL_STATE, bad);
      expect(getTutorialFamilyState('intro')).toEqual({});
    }
  });

  it('replaces a corrupt family entry instead of crashing', () => {
    localStorage.setItem(
      STORAGE_KEY_TUTORIAL_STATE,
      JSON.stringify({ intro: 5, makers: { opened: 111 } })
    );

    expect(getTutorialFamilyState('intro')).toEqual({});
    recordTutorialOpened('intro');

    expect(readRaw().intro.opened).toBeTypeOf('number');
    expect(readRaw().makers).toEqual({ opened: 111 });
  });
});
