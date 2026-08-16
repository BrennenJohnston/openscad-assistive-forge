/**
 * The editor's colour schemes must stay readable (U-37 ¶2, Q-60a).
 *
 * Modelled on tests/unit/preview-colors-contrast.test.js, which does the same
 * job for the 3D viewport. The policy signed as Q-60(a): the desktop's schemes
 * go in, but any value that measurably fails WCAG 1.4.3 is moved along its own
 * hue until it passes. This is what stops a later edit quietly putting the
 * failing original back.
 *
 * Every foreground is checked against BOTH the paper and the active-line
 * background. Checking only paper is what made the plan's own arithmetic
 * optimistic: `highlightActiveLine` defaults on, so any token can end up on
 * the caret line, and the caret line is always the worse of the two.
 */

import { describe, it, expect } from 'vitest';
import {
  EDITOR_SCHEMES,
  LIGHT_SCHEME,
  DARK_SCHEME,
  textBackgroundsOf,
} from '../../src/js/editor-color-scheme.js';

/** WCAG relative luminance of a 0xRRGGBB colour. */
function relativeLuminance(hex) {
  const [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two 0xRRGGBB colours. */
function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const hex = (s) => {
  expect(s, `not a #rrggbb colour: ${s}`).toMatch(/^#[0-9a-f]{6}$/);
  return parseInt(s.slice(1), 16);
};
const ratio = (fg, bg) => contrastRatio(hex(fg), hex(bg));

/**
 * Code is normal-size text at every font size this editor offers (8-32px, and
 * WCAG's "large" threshold is 18.66px BOLD or 24px), so 4.5:1 is the bar for
 * anything made of characters.
 */
const AA_TEXT = 4.5;

const SCHEMES = Object.keys(EDITOR_SCHEMES);

describe('editor colour schemes', () => {
  it.each(SCHEMES)('%s: every syntax colour is readable on both backgrounds', (name) => {
    const scheme = EDITOR_SCHEMES[name];
    const backgrounds = textBackgroundsOf(scheme);
    for (const [token, colour] of Object.entries(scheme.tokens)) {
      for (const bg of backgrounds) {
        expect(
          ratio(colour, bg),
          `${name} ${token} ${colour} on ${bg}`
        ).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });

  it.each(SCHEMES)('%s: the default text colour is readable', (name) => {
    const scheme = EDITOR_SCHEMES[name];
    for (const bg of textBackgroundsOf(scheme)) {
      expect(ratio(scheme.text, bg), `${name} text on ${bg}`).toBeGreaterThanOrEqual(
        AA_TEXT
      );
    }
  });

  it.each(SCHEMES)('%s: line numbers are readable (they are text too)', (name) => {
    const scheme = EDITOR_SCHEMES[name];
    expect(
      ratio(scheme.marginForeground, scheme.marginBackground),
      `${name} line numbers`
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(SCHEMES)('%s: selected code stays readable', (name) => {
    const scheme = EDITOR_SCHEMES[name];
    expect(
      ratio(scheme.selectionForeground, scheme.selectionBackground),
      `${name} selection`
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(SCHEMES)('%s: both brace highlights stay readable', (name) => {
    const scheme = EDITOR_SCHEMES[name];
    expect(
      ratio(scheme.matchedBraceForeground, scheme.matchedBraceBackground),
      `${name} matched brace`
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      ratio(scheme.unmatchedBraceForeground, scheme.unmatchedBraceBackground),
      `${name} unmatched brace`
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('what was taken from the desktop verbatim', () => {
  // These are the values the desktop ships that already pass. If one of them
  // ever changes, it is a transcription error rather than a tuning decision,
  // and this is where it shows up.
  it('light keeps the desktop paper, text and the colours that passed', () => {
    expect(LIGHT_SCHEME.paper).toBe('#ffffff');
    expect(LIGHT_SCHEME.text).toBe('#272822');
    expect(LIGHT_SCHEME.caretLine).toBe('#f8f8f8');
    expect(LIGHT_SCHEME.tokens.keyword1).toBe('#008000'); // Green
    expect(LIGHT_SCHEME.tokens.keyword3).toBe('#00008b'); // DarkBlue
    expect(LIGHT_SCHEME.tokens.number).toBe('#8b0000'); // DarkRed
    expect(LIGHT_SCHEME.tokens.string).toBe('#8b008b'); // DarkMagenta
    expect(LIGHT_SCHEME.tokens.operator).toBe('#0000ff'); // Blue
  });

  it('dark keeps the desktop paper and text, which are NOT the old #1E1E1E', () => {
    expect(DARK_SCHEME.paper).toBe('#222222');
    expect(DARK_SCHEME.text).toBe('#e0e0e0');
    expect(DARK_SCHEME.caretLine).toBe('#303030');
    expect(DARK_SCHEME.tokens.keyword1).toBe('#90ee90');
    expect(DARK_SCHEME.tokens.string).toBe('#e6db74');
    expect(DARK_SCHEME.tokens.operator).toBe('#e8b609');
  });
});

describe('what had to be tuned, and by how little', () => {
  // Each of these replaced a desktop value that measured below 4.5:1. The
  // original is recorded here so the size of the deviation stays visible: if
  // someone later asks "how far did we move from the desktop", this answers it.
  const TUNED = [
    ['light comment', '#008b8b', LIGHT_SCHEME.tokens.comment, LIGHT_SCHEME.caretLine],
    [
      'light line numbers',
      '#808080',
      LIGHT_SCHEME.marginForeground,
      LIGHT_SCHEME.marginBackground,
    ],
    ['dark comment', '#808080', DARK_SCHEME.tokens.comment, DARK_SCHEME.caretLine],
    ['dark number', '#ff0000', DARK_SCHEME.tokens.number, DARK_SCHEME.caretLine],
    [
      'dark line numbers',
      '#808080',
      DARK_SCHEME.marginForeground,
      DARK_SCHEME.marginBackground,
    ],
  ];

  it.each(TUNED)(
    '%s: the desktop original really did fail, and ours really does pass',
    (_name, original, tuned, background) => {
      expect(ratio(original, background)).toBeLessThan(AA_TEXT);
      expect(ratio(tuned, background)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  );

  it('the selection background was darkened in both schemes, not per scheme', () => {
    expect(ratio('#4a90d9', '#ffffff')).toBeLessThan(AA_TEXT);
    expect(LIGHT_SCHEME.selectionBackground).toBe(DARK_SCHEME.selectionBackground);
  });
});
