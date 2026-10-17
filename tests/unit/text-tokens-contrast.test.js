/**
 * Text drawn in the quieter colours stays readable.
 *
 * The tertiary and muted text colours, and the rules that write a label in
 * the info teal, are resolved from the stylesheets and the installed Radix
 * scales, light and dark, and held to WCAG 1.4.3's 4.5:1 on the panels they
 * sit on. Modelled on tests/unit/editor-colors-contrast.test.js.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const TOKENS = read('src/styles/semantic-tokens.css');
const COMPONENTS = read('src/styles/components.css');
const AA_TEXT = 4.5;

function radixScale(file) {
  const css = read(path.join('node_modules', '@radix-ui', 'colors', file));
  const scale = {};
  for (const m of css.matchAll(/--([a-z]+-\d+):\s*(#[0-9a-fA-F]{6})/g)) {
    scale[m[1]] = m[2].toLowerCase();
  }
  return scale;
}
const SCALES = {
  light: { ...radixScale('slate.css'), ...radixScale('teal.css') },
  dark: { ...radixScale('slate-dark.css'), ...radixScale('teal-dark.css') },
};

/** The body of the first block that opens with this selector. */
function blockOf(css, selector) {
  const start = css.indexOf(selector);
  expect(start, `no block for ${selector}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(start, i);
  }
  throw new Error(`unclosed block ${selector}`);
}

/** Each look's token block, and the scale its var(--slate-N) resolve to. */
const LOOKS = [
  { name: 'light (default)', scale: 'light', body: blockOf(TOKENS, ':root {') },
  { name: 'dark', scale: 'dark', body: blockOf(TOKENS, ":root[data-theme='dark'] {") },
  {
    name: 'dark (system)',
    scale: 'dark',
    body: blockOf(TOKENS, "@media (prefers-color-scheme: dark) {"),
  },
  { name: 'light (chosen)', scale: 'light', body: blockOf(TOKENS, ":root[data-theme='light'] {") },
];

/** A custom property's value, followed through var() to a scale step. */
function resolve(look, value, seen = new Set()) {
  const m = /var\(--([a-z0-9-]+)/.exec(value);
  if (!m) return value.trim();
  const name = m[1];
  const scale = SCALES[look.scale];
  if (scale[name]) return scale[name];
  if (seen.has(name)) throw new Error(`var loop at --${name}`);
  seen.add(name);
  const decl = new RegExp(`--${name}:\\s*([^;]+);`).exec(look.body) ||
    new RegExp(`--${name}:\\s*([^;]+);`).exec(LOOKS[0].body);
  expect(decl, `--${name} is not declared for ${look.name}`).not.toBeNull();
  return resolve(look, decl[1], seen);
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const PANELS = ['--color-bg-primary', '--color-bg-secondary', '--color-bg-tertiary'];

/** The colour a rule writes its text in, as written in the stylesheet. */
function textColourOf(selector) {
  const start = COMPONENTS.indexOf(`${selector} {`);
  expect(start, `no rule ${selector}`).toBeGreaterThanOrEqual(0);
  const body = COMPONENTS.slice(start, COMPONENTS.indexOf('}', start));
  const m = /(?:^|[\s;{])color:\s*([^;]+);/.exec(body);
  expect(m, `${selector} sets no text colour`).not.toBeNull();
  return m[1];
}

describe('quiet text colours', () => {
  for (const look of LOOKS) {
    it.each(['--color-text-tertiary', '--color-text-muted'])(
      `${look.name}: %s is readable on every panel`,
      (token) => {
        const fg = resolve(look, `var(${token})`);
        for (const panel of PANELS) {
          const bg = resolve(look, `var(${panel})`);
          expect(
            contrast(fg, bg),
            `${token} ${fg} on ${panel} ${bg}`
          ).toBeGreaterThanOrEqual(AA_TEXT);
        }
      }
    );
  }
});

describe('labels written in the info teal', () => {
  const RULES = [
    { selector: '.console-entry--echo .console-type', on: PANELS },
    { selector: '.console-entry--deprecated .console-type', on: PANELS },
    { selector: '.error-log-type-badge--deprecated', on: ['--color-info-bg'] },
  ];
  for (const look of LOOKS) {
    it.each(RULES)(`${look.name}: $selector is readable`, ({ selector, on }) => {
      const fg = resolve(look, textColourOf(selector));
      for (const panel of on) {
        const bg = resolve(look, `var(${panel})`);
        expect(
          contrast(fg, bg),
          `${selector} ${fg} on ${panel} ${bg}`
        ).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
  }
});
