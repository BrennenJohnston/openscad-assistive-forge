/**
 * Computational WCAG contrast verification for the 3D preview palette.
 *
 * The model is a non-text graphical object, so every theme's `model` and
 * `modelBack` must reach 3:1 against `background` (WCAG 2.2 SC 1.4.11,
 * Non-text Contrast). The `edges` overlay renders 1px lines, so per W3C
 * Low Vision Task Force guidance for thin strokes it is held to the
 * 4.5:1 text threshold against the model color it is drawn on.
 *
 * The light theme previously used the desktop Cornfield pair
 * (#f9d72c / #9dcb51), which measured 1.3:1 / 1.7:1 and failed — these
 * tests keep that regression from coming back.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  PREVIEW_COLORS,
  VIEWPORT_SCHEMES,
  DEFAULT_VIEWPORT_SCHEME,
  schemeColorsKey,
} from '../../src/js/preview.js';

/** WCAG relative luminance of a 0xRRGGBB color. */
function relativeLuminance(hex) {
  const [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(
    (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two 0xRRGGBB colors. */
function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = Object.keys(PREVIEW_COLORS);

describe('PREVIEW_COLORS non-text contrast (WCAG 2.2 SC 1.4.11)', () => {
  const APP_THEMES = [
    'light',
    'dark',
    'light-hc',
    'dark-hc',
    'mono',
    'mono-light',
    'mono-hc',
    'mono-light-hc',
    'classic',
  ];

  // The nine desktop schemes that are not `classic`. Cornfield maps onto
  // `classic`, so PREVIEW_COLORS holds nine app themes plus nine additions.
  const SCHEME_KEYS = VIEWPORT_SCHEMES.map((s) => s.colors).filter(
    (k) => k !== 'classic'
  );

  it('covers the nine app themes and the nine added viewport schemes', () => {
    expect(THEMES.sort()).toEqual([...APP_THEMES, ...SCHEME_KEYS].sort());
  });

  it.each(THEMES)('%s: model vs background >= 3:1', (theme) => {
    const { model, background } = PREVIEW_COLORS[theme];
    expect(contrastRatio(model, background)).toBeGreaterThanOrEqual(3);
  });

  it.each(THEMES)('%s: modelBack vs background >= 3:1', (theme) => {
    const { modelBack, background } = PREVIEW_COLORS[theme];
    expect(contrastRatio(modelBack, background)).toBeGreaterThanOrEqual(3);
  });

  it.each(THEMES)('%s: edges vs model >= 4.5:1 (thin 1px strokes)', (theme) => {
    const { edges, model } = PREVIEW_COLORS[theme];
    expect(edges).toBeTypeOf('number');
    expect(contrastRatio(edges, model)).toBeGreaterThanOrEqual(4.5);
  });

  it('light theme no longer uses the failing Cornfield pair', () => {
    // #f9d72c (1.3:1) and #9dcb51 (1.7:1) fail SC 1.4.11 on #f5f5f5.
    expect(PREVIEW_COLORS.light.model).not.toBe(0xf9d72c);
    expect(PREVIEW_COLORS.light.modelBack).not.toBe(0x9dcb51);
  });

  it('classic uses the desktop Cornfield background without regressing the model', () => {
    // Classic buys desktop fidelity on the background only; the model pair
    // stays the accessibility-tuned one and gains contrast on cornfield.
    expect(PREVIEW_COLORS.classic.background).toBe(0xffffe5);
    expect(PREVIEW_COLORS.classic.model).toBe(PREVIEW_COLORS.light.model);
    expect(PREVIEW_COLORS.classic.modelBack).toBe(
      PREVIEW_COLORS.light.modelBack
    );
    expect(
      contrastRatio(
        PREVIEW_COLORS.classic.model,
        PREVIEW_COLORS.classic.background
      )
    ).toBeGreaterThan(
      contrastRatio(PREVIEW_COLORS.light.model, PREVIEW_COLORS.light.background)
    );
  });
});

/**
 * The desktop viewport schemes (Preferences ▸ 3D View), per owner decision
 * Q-10: ten schemes, backgrounds verbatim from upstream, model and edge
 * colours tuned the minimum distance needed to pass.
 *
 * The suite above already holds every one of them to 3:1 and 4.5:1 because
 * it iterates PREVIEW_COLORS. What is asserted here is the part that
 * iteration cannot see: that the list is the desktop's ten, that no
 * background drifted off its upstream value, and that the schemes upstream
 * already got right were left alone rather than "tuned" for the sake of it.
 */
describe('desktop viewport colour schemes', () => {
  it('offers the desktop ten, in the desktop order', () => {
    expect(VIEWPORT_SCHEMES.map((s) => s.label)).toEqual([
      'Cornfield',
      'Metallic',
      'Sunset',
      'Starnight',
      'BeforeDawn',
      'Nature',
      'DeepOcean',
      'Solarized',
      'Tomorrow',
      'Tomorrow Night',
    ]);
  });

  it('opens on Cornfield, which paints with the classic palette', () => {
    expect(DEFAULT_VIEWPORT_SCHEME).toBe('cornfield');
    expect(schemeColorsKey('cornfield')).toBe('classic');
    expect(schemeColorsKey('nonsense-id')).toBe('classic');
  });

  it('every scheme resolves to a palette that exists', () => {
    for (const scheme of VIEWPORT_SCHEMES) {
      expect(PREVIEW_COLORS[scheme.colors]).toBeDefined();
    }
  });

  // Verbatim from OpenSCAD tag openscad-2021.01: Cornfield from
  // src/colormap.cc line 39, the rest from color-schemes/render/*.json.
  // A background is the one value Q-10 says must NOT be tuned.
  const UPSTREAM_BACKGROUNDS = {
    cornfield: 0xffffe5,
    metallic: 0xaaaaff,
    sunset: 0xaa4444,
    starnight: 0x000000,
    beforedawn: 0x333333,
    nature: 0xfafafa,
    deepocean: 0x333333,
    solarized: 0xfdf6e3,
    tomorrow: 0xf8f8f8,
    'tomorrow-night': 0x1d1f21,
  };

  it.each(Object.entries(UPSTREAM_BACKGROUNDS))(
    '%s keeps the upstream background verbatim',
    (id, background) => {
      expect(PREVIEW_COLORS[schemeColorsKey(id)].background).toBe(background);
    }
  );

  // Verbatim from the same upstream files (U-13): Cornfield's AXES_COLOR
  // from src/colormap.cc line 40, the rest from each scheme JSON's
  // "axes-color". All ten already pass SC 1.4.11 against their own
  // backgrounds (sunset is the narrowest at 3.20:1), so unlike the model
  // and edge pairs none needed tuning — a value drifting off upstream
  // here is a transcription error, not a tune.
  const UPSTREAM_AXES = {
    cornfield: 0x000000,
    metallic: 0x222233,
    sunset: 0x220d0d,
    starnight: 0xe5e5e5,
    beforedawn: 0xc1c1c1,
    nature: 0x323232,
    deepocean: 0xc1c1c1,
    solarized: 0x191816,
    tomorrow: 0x181818,
    'tomorrow-night': 0xe8e8e8,
  };

  it.each(Object.entries(UPSTREAM_AXES))(
    '%s keeps the upstream axes color verbatim',
    (id, axes) => {
      expect(PREVIEW_COLORS[schemeColorsKey(id)].axes).toBe(axes);
    }
  );

  it.each(VIEWPORT_SCHEMES.map((s) => s.colors))(
    '%s: axes vs background >= 3:1 (SC 1.4.11)',
    (key) => {
      const { axes, background } = PREVIEW_COLORS[key];
      expect(axes).toBeTypeOf('number');
      expect(contrastRatio(axes, background)).toBeGreaterThanOrEqual(3);
    }
  );

  it('leaves Starnight and DeepOcean exactly as upstream drew them', () => {
    // MEASURED: these two are the only schemes that already pass all three
    // thresholds untouched, so tuning them would have been a change with no
    // accessibility justification.
    expect(PREVIEW_COLORS.starnight.model).toBe(0xffffe0);
    expect(PREVIEW_COLORS.starnight.modelBack).toBe(0x00ffff);
    expect(PREVIEW_COLORS.starnight.edges).toBe(0x0000ff);
    expect(PREVIEW_COLORS.deepocean.model).toBe(0xeeeeee);
    expect(PREVIEW_COLORS.deepocean.modelBack).toBe(0x0babc8);
    expect(PREVIEW_COLORS.deepocean.edges).toBe(0x0000ff);
  });

  it('does not ship upstream Cornfield, which fails 1.4.11 badly', () => {
    // Upstream #f9d72c/#9dcb51 on #ffffe5 measure 1.40:1 and 1.86:1.
    const cornfield = PREVIEW_COLORS[schemeColorsKey('cornfield')];
    expect(cornfield.model).not.toBe(0xf9d72c);
    expect(cornfield.modelBack).not.toBe(0x9dcb51);
  });

  it('has no -hc sibling for any scheme', () => {
    // Classic ignores high contrast, and updateTheme must never suffix these:
    // a lookup for a key that does not exist falls back to the light theme
    // and the user's chosen scheme would silently disappear.
    for (const scheme of VIEWPORT_SCHEMES) {
      expect(PREVIEW_COLORS[`${scheme.colors}-hc`]).toBeUndefined();
    }
  });
});
