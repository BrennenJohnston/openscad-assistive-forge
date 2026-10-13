/**
 * The tune that plays when the Alt View is found: three phrases end to end,
 * played at three quarters of their first speed with their pitch kept, so
 * every time is four thirds of the original and every frequency is the same.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { jingleSchedule, noteFrequency } from '../../src/js/unlock-jingle.js';

describe('the unlock tune', () => {
  const { phrases, seconds } = jingleSchedule();

  it('is the three phrases end to end, 3.8 s in all', () => {
    expect(phrases).toHaveLength(3);
    expect(phrases.map((p) => Number(p.start.toFixed(3)))).toEqual([0, 1.133, 2.267]);
    expect(seconds).toBeCloseTo(3.8, 6);
  });

  it('stretches every time by four thirds and keeps every pitch', () => {
    const [first] = phrases;
    const top = first.notes.find((n) => n.note === 'D6');
    expect(top.t).toBeCloseTo(0.3 / 0.75, 9);
    expect(top.dur).toBeCloseTo(0.5 / 0.75, 9);
    expect(top.release).toBeCloseTo(0.3 / 0.75, 9);
    expect(top.attack).toBeCloseTo(0.004 / 0.75, 9);
    expect(top.freq).toBeCloseTo(noteFrequency('D6'), 9);
  });

  it('tunes A4 to 440 Hz', () => {
    expect(noteFrequency('A4')).toBe(440);
    expect(noteFrequency('A5')).toBe(880);
    expect(noteFrequency('C4')).toBeCloseTo(261.626, 3);
    expect(noteFrequency('F#5')).toBeCloseTo(739.989, 3);
  });

  it('opens with the triumph motif, rises, and ends on the fanfare', () => {
    expect(phrases[0].notes.filter((n) => n.type === 'pulse').map((n) => n.note)).toEqual([
      'G5',
      'G5',
      'G5',
      'D6',
    ]);
    expect(phrases[1].notes.filter((n) => n.duty === 0.25).map((n) => n.note)).toEqual([
      'C5',
      'E5',
      'G5',
      'C6',
      'E6',
    ]);
    expect(phrases[2].notes.at(-1)).toMatchObject({ note: 'D4', type: 'triangle' });
  });
});
