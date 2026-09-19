/**
 * The ink panel's words follow the host's purpose (DP-57, D-156).
 *
 * One panel is built for two hosts: a charm (relief) and the stencil tile.
 * The words were the stencil's on both, so a charm's file control described
 * "a plate for each" color and "the surface behind the stencil" where no
 * stencil is possible. The relief host gets relief words; the stencil keeps
 * its own.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  createInkControls,
  colourSentence,
  filamentSentence,
} from '../../src/js/ink-controls.js';

const STENCIL_WORDS = /stencil|plate|paint/i;

const colours = [
  { name: 'Navy blue', hex: '#4b2e83', share: 0.86, isBackground: true },
  { name: 'White', hex: '#fffeff', share: 0.14, isBackground: false },
];

describe('ink controls: the words follow the purpose (D-156)', () => {
  it('a relief panel never says stencil, plate or paint', () => {
    const panel = createInkControls({
      idPrefix: 'relief',
      onChange: () => {},
      purpose: 'relief',
    });
    const text = panel.element.textContent;
    expect(text).not.toMatch(STENCIL_WORDS);
    expect(
      panel.element.querySelector('#relief-mode-colours-desc').textContent
    ).toMatch(/the wall, which is left out/);
    expect(panel.element.querySelector('#relief-wall-help').textContent).toMatch(
      /left out/i
    );
  });

  it('relief is the default purpose', () => {
    const panel = createInkControls({ idPrefix: 'plain', onChange: () => {} });
    expect(panel.element.textContent).not.toMatch(STENCIL_WORDS);
  });

  it('a stencil panel keeps the stencil words', () => {
    const panel = createInkControls({
      idPrefix: 'stencil',
      onChange: () => {},
      purpose: 'stencil',
    });
    const text = panel.element.textContent;
    expect(text).toMatch(/plate/);
    expect(text).toMatch(/stencil/);
  });

  it('the color sentence counts artwork colors on a charm and paint on a stencil', () => {
    expect(colourSentence(colours, {}, 'relief')).toBe(
      '1 color in the artwork, and the wall: Navy blue 86% (the wall), White 14%.'
    );
    expect(colourSentence(colours, {}, 'stencil')).toBe(
      '1 color to paint, and the wall: Navy blue 86% (the wall), White 14%.'
    );
  });

  it('the filament hint names the color for both, a plate on a stencil and the piece on a charm', () => {
    const summary = {
      rejectedColor: { r: 75, g: 46, b: 131, coherence: 0.9, share: 0.5 },
    };
    expect(filamentSentence(summary, 0.6, 0.05, 'stencil')).toMatch(
      /#4b2e83\. Printing this plate/
    );
    expect(filamentSentence(summary, 0.6, 0.05, 'relief')).toBe(
      'The color behind the lines was about #4b2e83. Printing the piece in a filament near that color keeps the symbol recognizable.'
    );
  });

  it('the Colors choice describes what a charm gets when it is announced', () => {
    const said = [];
    const panel = createInkControls({
      idPrefix: 'say',
      onChange: () => {},
      announce: (s) => said.push(s),
      purpose: 'relief',
    });
    const radio = panel.element.querySelector('#say-mode-colours');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(said.join(' ')).toMatch(/^Colors\./);
    expect(said.join(' ')).not.toMatch(STENCIL_WORDS);
  });
});

describe('ink controls: a change that waits for a press says so (D-157)', () => {
  const build = (runsBySelf, startLabel) => {
    const said = [];
    const panel = createInkControls({
      idPrefix: 'wait',
      onChange: () => {},
      announce: (s) => said.push(s),
      purpose: 'relief',
      runsBySelf,
      ...(startLabel ? { startLabel } : {}),
    });
    return { panel, said };
  };

  it('a mode change ends with the waiting sentence when the run will not start itself', () => {
    const { panel, said } = build(() => false);
    const radio = panel.element.querySelector('#wait-mode-colours');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/^Colors\. .* Press Convert again when you are ready\.$/);
  });

  it('before anything has run, the waiting sentence names Start conversion', () => {
    const { panel, said } = build(
      () => false,
      () => 'Start conversion'
    );
    const radio = panel.element.querySelector('#wait-mode-colours');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(said[0]).toMatch(/ Press Start conversion when you are ready\.$/);
  });

  it('a slider change ends with it too, and neither does when the run starts itself', () => {
    const { panel, said } = build(() => false);
    const range = panel.element.querySelector('#wait-colours');
    range.value = '5';
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(said.at(-1)).toBe(
      'How many colors: 5. Press Convert again when you are ready.'
    );

    const quick = build(() => true);
    const radio = quick.panel.element.querySelector('#wait-mode-colours');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(quick.said[0]).not.toMatch(/Convert again/);
  });
});
