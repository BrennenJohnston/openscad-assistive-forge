/**
 * Charm-mode behavior tests for the braille translation panel:
 * per-character charm splitting, the generate-all toggle (ON by default),
 * the charm pager, the Charm_N / charm_layout parameter writes, and the
 * friendly download names (getBrailleDownloadName + resolveDownloadFilename).
 *
 * The liblouis worker and the parameter UI are mocked; parameter writes
 * land in the real stateManager so the panel's read-back paths run.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/js/braille-translator.js', () => {
  // Fake per-character translator: one braille cell per letter, plus a
  // capital indicator cell (U+2820) when preserveCaps is on. Deterministic
  // and offline — the real engine is covered by braille-liblouis.test.js.
  const charCell = (ch) =>
    String.fromCharCode(0x2801 + ((ch.toLowerCase().charCodeAt(0) - 97) % 26));
  return {
    translateText: vi.fn(async (text, _table, { preserveCaps } = {}) => {
      let braille = '';
      let hadUntranslatable = false;
      for (const ch of text) {
        if (/\s/u.test(ch)) {
          braille += '\u2800';
        } else if (/[a-z]/i.test(ch)) {
          if (preserveCaps && /\p{Lu}/u.test(ch)) braille += '\u2820';
          braille += charCell(ch);
        } else {
          hadUntranslatable = true;
        }
      }
      return { braille, hadUntranslatable };
    }),
    backTranslateText: vi.fn(async () => ''),
    getTables: vi.fn(async () => ({
      tables: [{ file: 'en-ueb-g1.ctb', label: 'English (UEB) Grade 1' }],
      defaultTable: 'en-ueb-g1.ctb',
    })),
    disposeTranslator: vi.fn(),
  };
});

vi.mock('../../src/js/ui-generator.js', async () => {
  const { stateManager } = await import('../../src/js/state.js');
  return {
    setParameterValue: vi.fn((name, value) => {
      const params = {
        ...(stateManager.getState().parameters || {}),
        [name]: String(value),
      };
      stateManager.setState({ parameters: params });
      return true;
    }),
  };
});

import {
  initBraillePanel,
  destroyBraillePanel,
  getBrailleDownloadName,
} from '../../src/js/braille-panel.js';
import {
  resolveDownloadFilename,
  sanitizeFilename,
} from '../../src/js/download.js';
import { stateManager } from '../../src/js/state.js';

const CHARM_PARAMS = Array.from({ length: 12 }, (_, i) => `Charm_${i + 1}`);

const CHARM_CONFIG = {
  mode: 'charm',
  charParam: 'braille_chars',
  maxCells: 2,
  tablesCatalog: '/liblouis/tables.json',
  defaultTable: 'en-ueb-g1.ctb',
  multiCharmParams: {
    charmParams: CHARM_PARAMS,
    charmLayout: 'charm_layout',
    charmGap: 'charm_gap_mm',
  },
};

/** Braille the fake translator produces for one lowercase letter. */
const cell = (ch) =>
  String.fromCharCode(0x2801 + ((ch.toLowerCase().charCodeAt(0) - 97) % 26));

const params = () => stateManager.getState().parameters || {};

/** Type into the panel's text input and wait for the layout to settle. */
async function typeText(text, expectSettled) {
  const input = document.getElementById('brailleTextInput');
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await vi.waitFor(expectSettled, { timeout: 3000, interval: 25 });
}

describe('braille panel charm mode (multi-charm)', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="app"><div id="parametersContainer"></div></div>';
    // Mirror the SCAD defaults the parameter UI would expose
    const defaults = {
      braille_chars: '\u2820\u2801',
      charm_layout: 'Single',
      charm_gap_mm: '5',
      ...Object.fromEntries(CHARM_PARAMS.map((name) => [name, ''])),
    };
    stateManager.setState({ parameters: { ...defaults }, defaults });
    initBraillePanel(CHARM_CONFIG);
  });

  afterEach(() => {
    destroyBraillePanel();
    document.body.innerHTML = '';
  });

  it('splits multi-character input into one charm per character (generate-all on by default)', async () => {
    await typeText('hi', () => {
      expect(params().charm_layout).toBe('All charms');
    });

    expect(params().Charm_1).toBe(cell('h'));
    expect(params().Charm_2).toBe(cell('i'));
    expect(params().Charm_3).toBe('');
    // braille_chars stays in sync with the first charm
    expect(params().braille_chars).toBe(cell('h'));

    // Notice visible with the toggle checked; pager hidden
    const notice = document.getElementById('brailleMultiCardNotice');
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain('2 charms');
    expect(document.getElementById('brailleRenderAll').checked).toBe(true);
    expect(document.getElementById('brailleCardPager').hidden).toBe(true);
  });

  it('skips whitespace when splitting characters', async () => {
    await typeText('a b', () => {
      expect(params().charm_layout).toBe('All charms');
    });
    expect(params().Charm_1).toBe(cell('a'));
    expect(params().Charm_2).toBe(cell('b'));
    expect(params().Charm_3).toBe('');
  });

  it('translates each character individually (capital indicator per charm)', async () => {
    await typeText('Hi', () => {
      expect(params().charm_layout).toBe('All charms');
    });
    expect(params().Charm_1).toBe('\u2820' + cell('h'));
    expect(params().Charm_2).toBe(cell('i'));
  });

  it('keeps single-character input as a single charm', async () => {
    await typeText('b', () => {
      expect(params().braille_chars).toBe(cell('b'));
    });
    expect(params().charm_layout).toBe('Single');
    expect(params().Charm_1).toBe('');
    expect(document.getElementById('brailleMultiCardNotice').hidden).toBe(
      true
    );
    expect(document.getElementById('brailleCardPager').hidden).toBe(true);
  });

  it('turning generate-all off shows the pager and writes one charm at a time', async () => {
    await typeText('hi', () => {
      expect(params().charm_layout).toBe('All charms');
    });

    const toggle = document.getElementById('brailleRenderAll');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));

    expect(params().charm_layout).toBe('Single');
    expect(params().braille_chars).toBe(cell('h'));
    // Charm_N slots are cleared in Single mode
    expect(params().Charm_1).toBe('');

    const pager = document.getElementById('brailleCardPager');
    expect(pager.hidden).toBe(false);
    expect(document.getElementById('braillePagerStatus').textContent).toBe(
      'Charm 1 of 2 — h'
    );
    expect(document.getElementById('braillePrevCard').disabled).toBe(true);

    document.getElementById('brailleNextCard').click();
    expect(params().braille_chars).toBe(cell('i'));
    expect(document.getElementById('braillePagerStatus').textContent).toBe(
      'Charm 2 of 2 — i'
    );
    expect(document.getElementById('brailleNextCard').disabled).toBe(true);
  });

  it('warns when more characters than Charm_N slots are entered', async () => {
    await typeText('abcdefghijklmn', () => {
      expect(params().charm_layout).toBe('All charms');
    });
    // 14 characters, 12 slots: the last slot holds the 12th character
    expect(params().Charm_12).toBe(cell('l'));
    const warnings = document.getElementById('brailleWarnings');
    expect(warnings.hidden).toBe(false);
    expect(warnings.textContent).toContain('first 12 charms');
  });

  describe('friendly download names', () => {
    it('names the generate-all download after the input word', async () => {
      await typeText('Hi', () => {
        expect(params().charm_layout).toBe('All charms');
      });
      expect(getBrailleDownloadName()).toBe('Braille Charms Hi');
    });

    it('names a single charm after its character as typed', async () => {
      await typeText('B', () => {
        expect(params().braille_chars).toBe('\u2820' + cell('b'));
      });
      expect(getBrailleDownloadName()).toBe('Braille Charm B');
    });

    it('names the paged charm after the character being shown', async () => {
      await typeText('hi', () => {
        expect(params().charm_layout).toBe('All charms');
      });
      const toggle = document.getElementById('brailleRenderAll');
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
      expect(getBrailleDownloadName()).toBe('Braille Charm h');

      document.getElementById('brailleNextCard').click();
      expect(getBrailleDownloadName()).toBe('Braille Charm i');
    });

    it('returns null when there is nothing to name', async () => {
      await typeText('', () => {
        expect(params().braille_chars).toBe('');
      });
      expect(getBrailleDownloadName()).toBe(null);
    });
  });
});

describe('getBrailleDownloadName outside charm mode', () => {
  it('returns null when no panel is mounted', () => {
    destroyBraillePanel();
    expect(getBrailleDownloadName()).toBe(null);
  });
});

describe('resolveDownloadFilename', () => {
  it('uses the override name verbatim (sanitized) with the format extension', () => {
    expect(
      resolveDownloadFilename('braille_charm.scad', {}, 'stl', 'Braille Charm B')
    ).toBe('Braille Charm B.stl');
    expect(
      resolveDownloadFilename(
        'braille_charm.scad',
        {},
        '3mf',
        'Braille Charms Brennen'
      )
    ).toBe('Braille Charms Brennen.3mf');
  });

  it('strips filesystem-unsafe characters from the override', () => {
    const name = resolveDownloadFilename(
      'braille_charm.scad',
      {},
      'stl',
      'Braille Charm <:>'
    );
    expect(name).toBe(`${sanitizeFilename('Braille Charm <:>')}.stl`);
    expect(name).not.toMatch(/[<>:]/);
  });

  it('falls back to the hashed name without an override', () => {
    const name = resolveDownloadFilename(
      'braille_charm.scad',
      { a: 1 },
      'stl',
      null
    );
    expect(name).toMatch(/^braille_charm-[a-z0-9]+-\d{8}\.stl$/);
  });
});
