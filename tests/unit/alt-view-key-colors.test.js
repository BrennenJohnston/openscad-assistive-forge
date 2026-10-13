/**
 * The key arrives wearing the Alt View it would turn on before that look is
 * on, so its colors live outside the variant. They must stay the look's own:
 * the accent and the key's ground of the green, the amber and Classic's DOS
 * look, read from the same stylesheet.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve as resolvePath, dirname } from 'path';
import { fileURLToPath } from 'url';

const variantCss = readFileSync(
  resolvePath(dirname(fileURLToPath(import.meta.url)), '../../src/styles/variant.css'),
  'utf-8'
);

/** The custom properties of the first rule whose selector is exactly this. */
function tokensOf(selector) {
  const at = variantCss.search(
    new RegExp(`(^|\\n)${selector.replace(/[[\]()*.]/g, '\\$&')}\\s*\\{`)
  );
  if (at === -1) throw new Error(`No rule for ${selector}`);
  const open = variantCss.indexOf('{', at);
  const close = variantCss.indexOf('}', open);
  const tokens = {};
  for (const m of variantCss.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

describe('the arriving key wears the look it would turn on', () => {
  const green = tokensOf(":root[data-ui-variant='mono']");
  const amber = tokensOf(":root[data-ui-variant='mono'][data-theme='light']");
  const dos = tokensOf(
    ":root[data-ui-variant='mono'][data-classic-retro='dos']\n  body[data-ui-mode='classic']"
  );

  it('in the dark theme, the green', () => {
    expect(tokensOf(':root')).toEqual({
      '--alt-view-key-accent': green['--color-accent'],
      '--alt-view-key-ground': green['--color-bg-tertiary'],
    });
  });

  it('in the light theme, the amber', () => {
    expect(tokensOf(":root[data-theme='light']")).toEqual({
      '--alt-view-key-accent': amber['--color-accent'],
      '--alt-view-key-ground': amber['--color-bg-tertiary'],
    });
  });

  it("in Classic, the DOS look's yellow on its blue", () => {
    expect(tokensOf("body[data-ui-mode='classic']")).toEqual({
      '--alt-view-key-accent': dos['--retro-accent'],
      '--alt-view-key-ground': dos['--retro-raised'],
    });
  });
});
