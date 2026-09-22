/**
 * DP-79: the two photo defaults on the ink panel, and the sentences that say
 * what the worker did with a camera picture (DP-R6 text pack rows 3 to 11,
 * 27, 28).
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import {
  createInkControls,
  workedSentence,
  specksSentence,
  colourSentence,
  INK_MODE_CHOICES,
} from '../../src/js/ink-controls.js';

const colours = [
  { name: 'Navy blue', hex: '#4b2e83', share: 0.86, isBackground: true },
  { name: 'White', hex: '#fffeff', share: 0.14, isBackground: false },
];

const build = () => {
  const said = [];
  const panel = createInkControls({
    idPrefix: 'p',
    onChange: () => {},
    announce: (s) => said.push(s),
    purpose: 'relief',
    runsBySelf: () => false,
    startLabel: () => 'Convert again',
  });
  return { panel, said };
};

describe('the two switches (DP-79)', () => {
  it('are checkboxes with visible names and help, off for a file', () => {
    const { panel } = build();
    const smooth = panel.element.querySelector('#p-smooth');
    const specks = panel.element.querySelector('#p-specks');
    expect(smooth.type).toBe('checkbox');
    expect(specks.type).toBe('checkbox');
    expect(smooth.checked).toBe(false);
    expect(specks.checked).toBe(false);
    expect(smooth.closest('label').textContent).toContain(
      'Smooth the picture first'
    );
    expect(specks.closest('label').textContent).toContain(
      'Leave out specks under 0.1 mm²'
    );
    const help = (input) =>
      panel.element.querySelector(`#${input.getAttribute('aria-describedby')}`)
        .textContent;
    expect(help(smooth)).toBe(
      'A photo has grain a print cannot show. On for a picture from a camera, off for an icon file.'
    );
    expect(help(specks)).toBe(
      'Pieces smaller than a tenth of a square millimeter at the printed size cannot print. Turn this off if the small pieces are letters.'
    );
    expect(panel.getSettings()).toMatchObject({
      smooth: false,
      speckFloor: false,
    });
  });

  it('★ a camera picture starts with both on, and the settings say so', () => {
    const { panel, said } = build();
    panel.setPictureClass({ camera: true });
    expect(panel.element.querySelector('#p-smooth').checked).toBe(true);
    expect(panel.element.querySelector('#p-specks').checked).toBe(true);
    expect(panel.getSettings()).toMatchObject({
      smooth: true,
      speckFloor: true,
    });
    // The defaults are the picture's, not an act of the person: nothing said.
    expect(said).toEqual([]);
    panel.setPictureClass({ camera: false });
    expect(panel.getSettings()).toMatchObject({
      smooth: false,
      speckFloor: false,
    });
  });

  it('a change is announced with the press that runs it (rows 27, 28)', () => {
    const { panel, said } = build();
    panel.setPictureClass({ camera: true });
    // The way the other cases on this panel press a control: set, then say so.
    const flip = (selector) => {
      const input = panel.element.querySelector(selector);
      input.checked = !input.checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    flip('#p-specks');
    expect(panel.getSettings().speckFloor).toBe(false);
    expect(said).toEqual([
      'Leave out specks under 0.1 mm²: off. Press Convert again when you are ready.',
    ]);
    flip('#p-smooth');
    expect(panel.getSettings().smooth).toBe(false);
    expect(said[1]).toBe(
      'Smooth the picture first: off. Press Convert again when you are ready.'
    );
    flip('#p-smooth');
    expect(said[2]).toBe(
      'Smooth the picture first: on. Press Convert again when you are ready.'
    );
  });

  it('Light and dark disables the speck switch: there is no mask to floor', () => {
    const { panel } = build();
    const specks = panel.element.querySelector('#p-specks');
    const standard = panel.element.querySelector('#p-mode-standard');
    standard.checked = true;
    standard.dispatchEvent(new Event('change', { bubbles: true }));
    expect(specks.disabled).toBe(true);
    const lineart = panel.element.querySelector('#p-mode-lineart');
    lineart.checked = true;
    lineart.dispatchEvent(new Event('change', { bubbles: true }));
    expect(specks.disabled).toBe(false);
  });
});

describe('what the panel says about a camera picture (rows 7 to 9)', () => {
  it('the worked size', () => {
    expect(workedSentence({ width: 560, printedWidthMm: 14 })).toBe(
      'Worked at 560 px wide, the size a 14 mm design can use.'
    );
    expect(workedSentence({ width: 479, printedWidthMm: 11.97 })).toBe(
      'Worked at 479 px wide, the size a 12 mm design can use.'
    );
    expect(workedSentence(null)).toBe('');
    expect(workedSentence(undefined)).toBe('');
  });

  it('the specks left out, plural and singular, and nothing when none', () => {
    expect(specksSentence({ specksDropped: 207, printedWidthMm: 11.97 })).toBe(
      '207 specks smaller than 0.1 mm² at 12 mm wide were left out.'
    );
    expect(specksSentence({ specksDropped: 1, printedWidthMm: 14 })).toBe(
      '1 speck smaller than 0.1 mm² at 14 mm wide was left out.'
    );
    expect(specksSentence({ specksDropped: 0 })).toBe('');
    expect(specksSentence(null)).toBe('');
  });

  it('★ the summary carries both, once, in its one announcement', () => {
    const { panel, said } = build();
    panel.setSummary(
      {
        mode: 'lineart',
        applied: true,
        inkCoverage: 0.12,
        warnings: [],
        working: { width: 560, printedWidthMm: 14 },
        specksDropped: 207,
        printedWidthMm: 14,
      },
      25
    );
    const text = panel.element.querySelector('.ink-controls-summary')
      .textContent;
    expect(text).toContain('25 shapes traced, 12% of the picture is ink.');
    expect(text).toContain('Worked at 560 px wide, the size a 14 mm design can use.');
    expect(text).toContain('207 specks smaller than 0.1 mm² at 14 mm wide were left out.');
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('Worked at 560 px wide');
    expect(said[0]).toContain('207 specks');
  });

  it('the Colors sentence says the worked size in place of the cap clause', () => {
    const worked = colourSentence(colours, {
      factor: 2,
      working: { width: 560, printedWidthMm: 14 },
      specks: 5,
      printedWidthMm: 14,
    });
    expect(worked).toContain('Worked at 560 px wide, the size a 14 mm design can use.');
    expect(worked).not.toContain('times too big');
    expect(worked).toContain('5 specks smaller than 0.1 mm² at 14 mm wide were left out.');
    // A file that was only capped keeps the cap's clause, as it was.
    const capped = colourSentence(colours, { factor: 2 });
    expect(capped).toContain('2 times too big to trace');
    expect(capped).not.toContain('Worked at');
  });
});

describe('the mode descriptions name photos (rows 10 and 11)', () => {
  it('Line art and Solid shape', () => {
    const by = Object.fromEntries(INK_MODE_CHOICES.map((c) => [c.value, c.description]));
    expect(by.lineart).toBe(
      'Keep the drawn lines, drop the color behind them. Best for symbols, line drawings and photos of a printed symbol.'
    );
    expect(by.silhouette).toBe(
      'Keep the outline of the whole picture, filled in. Best for small charms, and for a photo where the shapes matter more than the lines.'
    );
  });
});
