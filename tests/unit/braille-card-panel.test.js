/**
 * Card- and sign-mode behavior tests for the braille translation panel:
 *
 * - Braille editor (Unicode): verbatim generation (U+2800–U+28FF
 *   validation, line-capacity checks, multi-card chunking), the
 *   dirty-state lock, and the Translate to braille / Translate to text
 *   buttons. On a sign the editor drives the braille plate only, so the
 *   raised letters must keep translating from the text box.
 * - grid_rows two-way sync with "Max rows per card", sticky user intent,
 *   and the announced rows clamp (no more silent grid_rows resets).
 * - Friendly download names for card and sign modes, including the
 *   back-translation fallback for braille-only input.
 *
 * The liblouis worker and the parameter UI are mocked; parameter writes
 * land in the real stateManager so the panel's read-back paths run.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
      const leftOutChars = [];
      for (const ch of text) {
        if (/\s/u.test(ch)) {
          braille += '\u2800';
        } else if (/[a-z]/i.test(ch)) {
          if (preserveCaps && /\p{Lu}/u.test(ch)) braille += '\u2820';
          braille += charCell(ch);
        } else {
          hadUntranslatable = true;
          leftOutChars.push(ch);
        }
      }
      return { braille, hadUntranslatable, leftOutChars };
    }),
    backTranslateText: vi.fn(async () => 'hello back'),
    getTables: vi.fn(async () => ({
      tables: [
        { file: 'en-ueb-g1.ctb', label: 'English (UEB) Grade 1' },
        { file: 'en-ueb-g2.ctb', label: 'English (UEB) Grade 2' },
      ],
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

vi.mock('../../src/js/announcer.js', () => ({
  announce: vi.fn(),
  announceImmediate: vi.fn(),
}));

import {
  initBraillePanel,
  destroyBraillePanel,
  getBrailleDownloadName,
} from '../../src/js/braille-panel.js';
import {
  backTranslateText,
  getTables,
  translateText,
} from '../../src/js/braille-translator.js';
import { announce, announceImmediate } from '../../src/js/announcer.js';
import { stateManager } from '../../src/js/state.js';
import { extractParameters } from '../../src/js/parser.js';

const LINE_PARAMS = Array.from({ length: 20 }, (_, i) => `Line_${i + 1}`);

// Mirrors public/examples/braille-wedge-card/manifest.json
const CARD_CONFIG = {
  mode: 'card',
  lineParams: LINE_PARAMS,
  tablesCatalog: '/liblouis/tables.json',
  defaultTable: 'en-ueb-g2.ctb',
  capacityParams: {
    cardWidth: 'card_face_width_mm',
    cardHeight: 'card_face_height_mm',
    cellSpacing: 'cell_spacing',
    lineSpacing: 'line_spacing',
    gridColumns: 'grid_columns',
    gridRows: 'grid_rows',
    autoSize: 'auto_size_card',
    autoSizeMargin: 'auto_size_margin_mm',
  },
  multiCardParams: {
    cardLayout: 'card_layout',
    rowsPerCard: 'rows_per_card',
  },
};

/** Braille the fake translator produces for one lowercase letter. */
const cell = (ch) =>
  String.fromCharCode(0x2801 + ((ch.toLowerCase().charCodeAt(0) - 97) % 26));

/** Braille of a whole lowercase word under the fake translator. */
const word = (w) => [...w].map(cell).join('');

/** h>ry@a" (braille ASCII from the Braille Authority's card guidelines) as cells. */
const HARRY = '\u2813\u281C\u2817\u283D\u2808\u2801\u2810';

const params = () => stateManager.getState().parameters || {};

// The panel lays out 400 ms after the last input. A loaded machine can hold
// a test worker for seconds, so every wait here allows 8 s (a test in this
// file times out at 10 s) and still returns the moment the layout lands.
const SETTLE = { timeout: 8000, interval: 25 };

/** Type into the panel's text input and wait for the layout to settle. */
async function typeText(text, expectSettled) {
  const input = document.getElementById('brailleTextInput');
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await vi.waitFor(expectSettled, SETTLE);
}

/** Type into the braille editor and wait for the layout to settle. */
async function typeBraille(text, expectSettled) {
  const field = document.getElementById('brailleFieldInput');
  field.value = text;
  field.dispatchEvent(new Event('input'));
  await vi.waitFor(expectSettled, SETTLE);
}

function mountCardPanel(extra = {}) {
  document.body.innerHTML =
    '<div id="app"><div id="parametersContainer"></div></div>';
  // Mirror the SCAD defaults the parameter UI would expose. With the
  // default geometry the capacity is 26 cells x 8 rows.
  const defaults = {
    card_face_width_mm: '200',
    card_face_height_mm: '100',
    cell_spacing: '7',
    line_spacing: '10',
    grid_columns: '26',
    grid_rows: '8',
    auto_size_card: 'On',
    auto_size_margin_mm: '6',
    card_layout: 'Single',
    rows_per_card: '8',
    ...Object.fromEntries(LINE_PARAMS.map((name) => [name, ''])),
  };
  stateManager.setState({ parameters: { ...defaults }, defaults });
  initBraillePanel({ ...CARD_CONFIG, ...extra });
}

describe('braille panel card mode — braille editor (Unicode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountCardPanel();
  });

  afterEach(() => {
    destroyBraillePanel();
    document.body.innerHTML = '';
  });

  it('mounts the editor collapsed with both translate buttons', () => {
    const editor = document.getElementById('brailleFieldEditor');
    expect(editor).not.toBeNull();
    expect(editor.open).toBe(false);
    expect(document.getElementById('brailleFieldFromText')).not.toBeNull();
    expect(document.getElementById('brailleFieldToText')).not.toBeNull();
    expect(
      document.getElementById('brailleFieldStatus').getAttribute('role')
    ).toBe('status');
  });

  it('uses editor content verbatim for the Line_N params (no translation)', async () => {
    // ⠿⠿⠿ is not something the fake translator can produce — if it lands
    // in Line_1 it must have bypassed translation.
    await typeBraille('\u283F\u283F\u283F', () => {
      expect(params().Line_1).toBe('\u283F\u283F\u283F');
    });
    expect(params().Line_2).toBe('');
    // The panel flags that the editor is the authority.
    const warnings = document.getElementById('brailleWarnings');
    expect(warnings.textContent).not.toBe('');
    expect(warnings.textContent).toContain('exactly as written');
    // The editor opens so the active authority stays visible.
    expect(document.getElementById('brailleFieldEditor').open).toBe(true);
  });

  it('a panel taken down before its tables load writes nothing afterwards', async () => {
    let finishLoading;
    getTables.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLoading = () =>
            resolve({
              tables: [{ file: 'en-ueb-g1.ctb', label: 'English (UEB) Grade 1' }],
              defaultTable: 'en-ueb-g1.ctb',
            });
        })
    );
    mountCardPanel(); // its table list is still loading
    mountCardPanel(); // the next one replaces it

    await typeBraille('⠿⠿⠿', () => {
      expect(params().Line_1).toBe('⠿⠿⠿');
    });
    finishLoading();
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(params().Line_1).toBe('⠿⠿⠿');
  });

  it('maps ASCII spaces to blank cells and trims trailing blanks', async () => {
    await typeBraille('\u2813 \u2811  ', () => {
      expect(params().Line_1).toBe('\u2813\u2800\u2811');
    });
  });

  it('rejects non-braille characters with an error and blocks the write', async () => {
    await typeBraille('\u2813abc', () => {
      const errors = document.getElementById('brailleErrors');
      expect(errors.textContent).not.toBe('');
    });
    const errors = document.getElementById('brailleErrors');
    expect(errors.textContent).toContain('"a"');
    expect(errors.textContent).toContain('not a braille character');
    // Invalid content never reaches the model parameters
    expect(params().Line_1).not.toBe('\u2813abc');
  });

  it('flags editor lines longer than the line capacity', async () => {
    // 30 cells > 26-cell capacity of the default 200 mm card
    await typeBraille('\u2813'.repeat(30), () => {
      const errors = document.getElementById('brailleErrors');
      expect(errors.textContent).not.toBe('');
    });
    expect(document.getElementById('brailleErrors').textContent).toContain(
      '30 cells'
    );
  });

  it('chunks editor overflow into additional cards (pager + render-all)', async () => {
    const lines = Array.from({ length: 10 }, () => '\u2813\u2811');
    await typeBraille(lines.join('\n'), () => {
      expect(params().Line_1).toBe('\u2813\u2811');
    });

    // 10 lines / 8 rows per card = 2 cards
    const notice = document.getElementById('brailleMultiCardNotice');
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain('spans 2 cards');
    expect(document.getElementById('brailleCardPager').hidden).toBe(false);
    // Card 1 fills Line_1..8; Line_9 stays empty in Single layout
    expect(params().Line_8).toBe('\u2813\u2811');
    expect(params().Line_9).toBe('');

    // Render-all writes every line and the All cards layout
    const renderAll = document.getElementById('brailleRenderAll');
    renderAll.checked = true;
    renderAll.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      expect(params().card_layout).toBe('All cards');
    }, SETTLE);
    expect(params().Line_9).toBe('\u2813\u2811');
    expect(params().Line_10).toBe('\u2813\u2811');
  });

  it('"Translate to braille" fills the editor from the text (pristine state)', async () => {
    await typeText('hi', () => {
      expect(params().Line_1).toBe(word('hi'));
    });

    document.getElementById('brailleFieldFromText').click();
    await vi.waitFor(() => {
      expect(document.getElementById('brailleFieldInput').value).toBe(
        word('hi')
      );
    }, SETTLE);
    expect(
      document.getElementById('brailleFieldStatus').textContent
    ).toContain('Filled from your text');
  });

  it('clears a pristine (translation-mirroring) editor when the text changes', async () => {
    await typeText('hi', () => {
      expect(params().Line_1).toBe(word('hi'));
    });
    document.getElementById('brailleFieldFromText').click();
    await vi.waitFor(() => {
      expect(document.getElementById('brailleFieldInput').value).toBe(
        word('hi')
      );
    }, SETTLE);

    // Editing the text clears the pristine editor (nothing typed is lost)
    await typeText('bye', () => {
      expect(params().Line_1).toBe(word('bye'));
    });
    expect(document.getElementById('brailleFieldInput').value).toBe('');
    expect(
      document.getElementById('brailleFieldStatus').textContent
    ).toContain('cleared because the text changed');
  });

  it('keeps hand-edited braille as the authority when the text changes', async () => {
    await typeBraille('\u283F', () => {
      expect(params().Line_1).toBe('\u283F');
    });

    // Editing the text does not clear a dirty editor; the braille wins.
    await typeText('bye', () => {
      // Layout re-runs but the editor still drives the params
      expect(params().Line_1).toBe('\u283F');
    });
    expect(document.getElementById('brailleFieldInput').value).toBe('\u283F');
  });

  it('"Translate to text" back-translates each editor line into the text box', async () => {
    await typeBraille('\u2813\u2811\n\u2801', () => {
      expect(params().Line_1).toBe('\u2813\u2811');
    });

    document.getElementById('brailleFieldToText').click();
    await vi.waitFor(() => {
      expect(document.getElementById('brailleTextInput').value).toBe(
        'hello back\nhello back'
      );
    }, SETTLE);
    // The braille stays authoritative (editor untouched)
    expect(document.getElementById('brailleFieldInput').value).toBe(
      '\u2813\u2811\n\u2801'
    );
    expect(backTranslateText).toHaveBeenCalledWith(
      '\u2813\u2811',
      'en-ueb-g2.ctb'
    );
  });

  it('"Convert braille ASCII" turns pasted braille ASCII into the cells the card uses', async () => {
    // Typed as keyboard characters, it is not braille yet
    await typeBraille('h>ry@a"', () => {
      expect(document.getElementById('brailleErrors').textContent).toContain(
        'not a braille character'
      );
    });
    document.getElementById('brailleFieldFromAscii').click();
    await vi.waitFor(() => {
      expect(params().Line_1).toBe(HARRY);
    }, SETTLE);
    expect(document.getElementById('brailleFieldInput').value).toBe(HARRY);
    expect(document.getElementById('brailleFieldStatus').textContent).toBe(
      'Converted 1 line of braille ASCII to braille cells.'
    );
    expect(document.getElementById('brailleErrors').textContent).toBe('');
  });

  it('counts the lines it converts, and keeps them as hand-edited braille', async () => {
    await typeBraille('h>ry@a"\nhogw>ts4$u', () => {
      expect(document.getElementById('brailleErrors').textContent).not.toBe('');
    });
    document.getElementById('brailleFieldFromAscii').click();
    await vi.waitFor(() => {
      expect(params().Line_1).toBe(HARRY);
    }, SETTLE);
    expect(params().Line_2).not.toBe('');
    expect(document.getElementById('brailleFieldStatus').textContent).toBe(
      'Converted 2 lines of braille ASCII to braille cells.'
    );
    // A change to the text does not clear braille the person put there
    await typeText('bye', () => {
      expect(params().Line_1).toBe(HARRY);
    });
    expect(document.getElementById('brailleFieldInput').value).toContain(HARRY);
  });

  it('leaves the editor as it was and names a character that is not braille ASCII', async () => {
    await typeBraille('ab{', () => {
      expect(document.getElementById('brailleErrors').textContent).not.toBe('');
    });
    document.getElementById('brailleFieldFromAscii').click();
    await vi.waitFor(() => {
      expect(document.getElementById('brailleErrors').textContent).toContain(
        'Line 1 contains "{", which is not a braille ASCII character.'
      );
    }, SETTLE);
    expect(document.getElementById('brailleFieldInput').value).toBe('ab{');
    expect(params().Line_1).toBe('');
  });

  it('names both buttons when the editor holds a character that is not braille', async () => {
    await typeBraille('\u2813abc', () => {
      expect(document.getElementById('brailleErrors').textContent).toContain(
        'Line 1 of the braille editor contains "a", which is not a braille ' +
          'character. Press "Translate to braille" to convert text, or ' +
          '"Convert braille ASCII" if you pasted braille typed as keyboard ' +
          'characters.'
      );
    });
  });

  it('places the button after the editor, whose content it converts, and explains it', () => {
    const field = document.getElementById('brailleFieldInput');
    const convert = document.getElementById('brailleFieldFromAscii');
    expect(convert.tagName).toBe('BUTTON');
    expect(convert.type).toBe('button');
    expect(
      field.compareDocumentPosition(convert) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(document.getElementById('brailleFieldHelp').textContent).toBe(
      'One line per card row. Press "Translate to braille" to fill this ' +
        'editor from your text, then change any cell. You can also paste ' +
        'braille, type it with six-key entry, or paste braille ASCII and ' +
        'press "Convert braille ASCII". Press "Translate to text" to read ' +
        'the braille back. Whenever this editor has content the card uses ' +
        'it exactly as written. Clear it to go back to translating the ' +
        'text above.'
    );
  });

  /** Press or release keys in the braille editor; the events dispatched. */
  const keys = (type, codes, extra = {}) =>
    codes.map((code) => {
      const event = new KeyboardEvent(type, {
        code,
        bubbles: true,
        cancelable: true,
        ...extra,
      });
      document.getElementById('brailleFieldInput').dispatchEvent(event);
      return event;
    });

  /** Hold the keys together, then let go. */
  const chord = (codes) => {
    keys('keydown', codes);
    keys('keyup', codes);
  };

  it('offers six-key entry before the editor, off by default', () => {
    const toggle = document.getElementById('brailleSixKeyToggle');
    expect(toggle.type).toBe('checkbox');
    expect(toggle.checked).toBe(false);
    expect(
      document.querySelector('label[for="brailleSixKeyToggle"]').textContent
    ).toBe('Six-key entry');
    const field = document.getElementById('brailleFieldInput');
    expect(
      toggle.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(document.getElementById('brailleSixKeyHelp').textContent).toBe(
      'Type a cell by holding its keys together and letting go: f, d, s ' +
        'are dots 1, 2, 3 and j, k, l are dots 4, 5, 6. Space makes a blank ' +
        'cell. Every other key works as usual.'
    );
  });

  it('says in the editor status when six-key entry turns on and off', () => {
    const toggle = document.getElementById('brailleSixKeyToggle');
    toggle.click();
    expect(document.getElementById('brailleFieldStatus').textContent).toBe(
      'Six-key entry is on.'
    );
    toggle.click();
    expect(document.getElementById('brailleFieldStatus').textContent).toBe(
      'Six-key entry is off.'
    );
  });

  it('with six-key entry on, a chord of f, d and k puts one cell at the caret, says its dots, and the card uses it', async () => {
    document.getElementById('brailleSixKeyToggle').click();
    const field = document.getElementById('brailleFieldInput');
    field.value = '\u2801\u2803';
    field.setSelectionRange(1, 1);
    const downs = keys('keydown', ['KeyF', 'KeyD', 'KeyK']);
    expect(downs.every((event) => event.defaultPrevented)).toBe(true);
    keys('keyup', ['KeyF', 'KeyD', 'KeyK']);
    expect(field.value).toBe('\u2801\u2813\u2803');
    expect(field.selectionStart).toBe(2);
    // At once, so neither the next cell nor a render message can cancel it
    expect(announceImmediate).toHaveBeenCalledWith('dots 1 2 5');
    expect(announce).not.toHaveBeenCalledWith('dots 1 2 5');
    await vi.waitFor(() => {
      expect(params().Line_1).toBe('\u2801\u2813\u2803');
    }, SETTLE);
  });

  it('with six-key entry on, leaves Tab and a key with Ctrl to the browser', () => {
    document.getElementById('brailleSixKeyToggle').click();
    const [tab] = keys('keydown', ['Tab'], { key: 'Tab' });
    expect(tab.defaultPrevented).toBe(false);
    const [find] = keys('keydown', ['KeyF'], { key: 'f', ctrlKey: true });
    expect(find.defaultPrevented).toBe(false);
  });

  it('with six-key entry off, leaves the keys to type as usual', () => {
    const [f] = keys('keydown', ['KeyF'], { key: 'f' });
    expect(f.defaultPrevented).toBe(false);
  });

  it('writes the editor status once, not again for each cell', async () => {
    document.getElementById('brailleSixKeyToggle').click();
    chord(['KeyF']);
    const status = document.getElementById('brailleFieldStatus');
    const writes = [];
    new MutationObserver((records) => writes.push(...records)).observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    chord(['KeyD']);
    chord(['KeyK']);
    await Promise.resolve();
    expect(document.getElementById('brailleFieldInput').value).toBe(
      '\u2801\u2802\u2810'
    );
    expect(writes).toHaveLength(0);
  });
});

describe('braille panel card mode — grid_rows sync and clamp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountCardPanel();
  });

  afterEach(() => {
    destroyBraillePanel();
    document.body.innerHTML = '';
  });

  it('a direct grid_rows parameter edit updates "Max rows per card"', async () => {
    await typeText('hi', () => {
      expect(params().Line_1).toBe(word('hi'));
    });

    // Simulate the user editing the raw grid_rows control
    stateManager.setState({
      parameters: { ...params(), grid_rows: '4' },
    });

    await vi.waitFor(() => {
      expect(document.getElementById('brailleMaxRows').value).toBe('4');
    }, SETTLE);
    // The next layout writes the (unclamped) requested value back
    await vi.waitFor(() => {
      expect(params().grid_rows).toBe('4');
    }, SETTLE);
  });

  it('announces and warns when the card height clamps the requested rows', async () => {
    await typeText('hi', () => {
      expect(params().Line_1).toBe(word('hi'));
    });

    // Business-card height: floor((51 - 2*6) / 10) = 3 rows < requested 8
    stateManager.setState({
      parameters: { ...params(), card_face_height_mm: '51' },
    });

    await vi.waitFor(() => {
      expect(params().grid_rows).toBe('3');
    }, SETTLE);

    // Warning tier (role=status), not a silent reset
    const warnings = document.getElementById('brailleWarnings');
    expect(warnings.textContent).not.toBe('');
    expect(warnings.textContent).toContain('only');
    expect(warnings.textContent).toContain('fits 3 rows');

    // Announced via the shared live region
    expect(announceImmediate).toHaveBeenCalledWith(
      'Rows per card limited to 3 by the card height.'
    );

    // Sticky intent: the input keeps the user's requested value
    expect(document.getElementById('brailleMaxRows').value).toBe('8');
  });

  it('the requested rows take effect again when the card grows back', async () => {
    await typeText('hi', () => {
      expect(params().Line_1).toBe(word('hi'));
    });
    stateManager.setState({
      parameters: { ...params(), card_face_height_mm: '51' },
    });
    await vi.waitFor(() => {
      expect(params().grid_rows).toBe('3');
    }, SETTLE);

    stateManager.setState({
      parameters: { ...params(), card_face_height_mm: '100' },
    });
    await vi.waitFor(() => {
      expect(params().grid_rows).toBe('8');
    }, SETTLE);
    expect(document.getElementById('brailleMaxRows').value).toBe('8');
  });
});

describe('braille panel card mode — friendly download names', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountCardPanel();
  });

  afterEach(() => {
    destroyBraillePanel();
    document.body.innerHTML = '';
  });

  it('names a single card after the first word of the text', async () => {
    await typeText('hello world', () => {
      expect(params().Line_1).toBe(word('hello') + '\u2800' + word('world'));
    });
    expect(getBrailleDownloadName()).toBe('Braille Card hello');
  });

  it('names paged and render-all multi-card downloads', async () => {
    // 10 hard lines with 8 rows per card -> 2 cards (letters only: the
    // fake translator drops digits as untranslatable)
    const lines = Array.from({ length: 10 }, () => 'hello');
    await typeText(lines.join('\n'), () => {
      expect(params().card_layout).toBe('Single');
      expect(params().Line_8).toBe(word('hello'));
    });

    expect(getBrailleDownloadName()).toBe('Braille Card 1 of 2 hello');
    // The pager hint shows the real export name
    expect(document.getElementById('braillePagerHint').textContent).toContain(
      'Braille Card 1 of 2 hello.stl'
    );

    document.getElementById('brailleNextCard').click();
    expect(getBrailleDownloadName()).toBe('Braille Card 2 of 2 hello');

    const renderAll = document.getElementById('brailleRenderAll');
    renderAll.checked = true;
    renderAll.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      expect(params().card_layout).toBe('All cards');
    }, SETTLE);
    expect(getBrailleDownloadName()).toBe('Braille Cards hello');
  });

  it('back-translates braille-only input for the name', async () => {
    await typeText('', () => {
      expect(params().Line_1).toBe('');
    });
    await typeBraille('\u2813\u2811', () => {
      expect(params().Line_1).toBe('\u2813\u2811');
    });

    // The fallback word arrives asynchronously from backTranslateText
    // (mocked to 'hello back'; the name takes the first word).
    await vi.waitFor(() => {
      expect(getBrailleDownloadName()).toBe('Braille Card hello');
    }, SETTLE);
  });

  it('returns null when there is nothing to name', async () => {
    await typeText('', () => {
      expect(params().Line_1).toBe('');
    });
    expect(getBrailleDownloadName()).toBe(null);
  });
});

describe('braille panel sign mode — friendly download names', () => {
  const SIGN_LINES = Array.from({ length: 6 }, (_, i) => `Line_${i + 1}`);
  const SIGN_TEXTS = Array.from({ length: 6 }, (_, i) => `sign_text_${i + 1}`);

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML =
      '<div id="app"><div id="parametersContainer"></div></div>';
    const defaults = {
      ...Object.fromEntries(SIGN_LINES.map((name) => [name, ''])),
      ...Object.fromEntries(SIGN_TEXTS.map((name) => [name, ''])),
    };
    stateManager.setState({ parameters: { ...defaults }, defaults });
    initBraillePanel({
      mode: 'sign',
      lineParams: SIGN_LINES,
      textParams: SIGN_TEXTS,
      tablesCatalog: '/liblouis/tables.json',
      defaultTable: 'en-ueb-g2.ctb',
    });
  });

  afterEach(() => {
    destroyBraillePanel();
    document.body.innerHTML = '';
  });

  it('names the sign after the first word of the text', async () => {
    await typeText('Exit now', () => {
      expect(params().sign_text_1).toBe('Exit now');
    });
    expect(getBrailleDownloadName()).toBe('Braille Sign Exit');
  });

  it('returns null when the sign has no usable word', async () => {
    await typeText('', () => {
      expect(params().sign_text_1).toBe('');
    });
    expect(getBrailleDownloadName()).toBe(null);
  });
});

describe('braille panel sign mode — braille editor (Unicode)', () => {
  const SIGN_LINES = Array.from({ length: 6 }, (_, i) => `Line_${i + 1}`);
  const SIGN_TEXTS = Array.from({ length: 6 }, (_, i) => `sign_text_${i + 1}`);

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML =
      '<div id="app"><div id="parametersContainer"></div></div>';
    // Mirrors public/examples/braille-sign/manifest.json plus the SCAD
    // geometry defaults the parameter UI would expose.
    const defaults = {
      sign_width_mm: '160',
      braille_plate_height_mm: '40',
      cell_spacing: '6.2',
      line_spacing: '10',
      char_height_mm: '16',
      letter_spacing: '1.1',
      ...Object.fromEntries(SIGN_LINES.map((name) => [name, ''])),
      ...Object.fromEntries(SIGN_TEXTS.map((name) => [name, ''])),
    };
    stateManager.setState({ parameters: { ...defaults }, defaults });
    initBraillePanel({
      mode: 'sign',
      lineParams: SIGN_LINES,
      textParams: SIGN_TEXTS,
      tablesCatalog: '/liblouis/tables.json',
      defaultTable: 'en-ueb-g2.ctb',
      capacityParams: {
        cardWidth: 'sign_width_mm',
        cardHeight: 'braille_plate_height_mm',
        cellSpacing: 'cell_spacing',
        lineSpacing: 'line_spacing',
        charHeight: 'char_height_mm',
        letterSpacing: 'letter_spacing',
      },
    });
  });

  afterEach(() => {
    destroyBraillePanel();
    document.body.innerHTML = '';
  });

  it('mounts the editor collapsed, with sign-specific wording', () => {
    const editor = document.getElementById('brailleFieldEditor');
    expect(editor).not.toBeNull();
    expect(editor.open).toBe(false);
    expect(document.getElementById('brailleFieldFromText')).not.toBeNull();
    expect(document.getElementById('brailleFieldToText')).not.toBeNull();
    // The card copy talks about "card rows", which would be wrong here.
    const help = document.getElementById('brailleFieldHelp').textContent;
    expect(help).toContain('braille row');
    expect(help).not.toContain('card');
  });

  it('uses editor content verbatim for the Line_N params (no translation)', async () => {
    // ⠿ is not something the fake translator can produce, so finding it in
    // Line_1 proves the editor bypassed liblouis.
    await typeBraille('\u283F\u283F\u283F', () => {
      expect(params().Line_1).toBe('\u283F\u283F\u283F');
    });
    expect(params().Line_2).toBe('');
    const warnings = document.getElementById('brailleWarnings');
    expect(warnings.textContent).not.toBe('');
    expect(warnings.textContent).toContain('exactly as written');
    expect(document.getElementById('brailleFieldEditor').open).toBe(true);
  });

  it('leaves the raised letters translating from the text box', async () => {
    await typeText('Exit now', () => {
      expect(params().sign_text_1).toBe('Exit now');
    });
    // Hand-correcting the braille plate must not rewrite the printed word.
    await typeBraille('\u283F\u283F', () => {
      expect(params().Line_1).toBe('\u283F\u283F');
    });
    expect(params().sign_text_1).toBe('Exit now');
  });

  it('"Translate to text" moves the raised letters to the new text', async () => {
    await typeText('Exit', () => {
      expect(params().sign_text_1).toBe('Exit');
    });
    await typeBraille('\u281B', () => {
      expect(params().Line_1).toBe('\u281B');
    });

    backTranslateText.mockResolvedValueOnce('go');
    document.getElementById('brailleFieldToText').click();
    await vi.waitFor(() => {
      expect(params().sign_text_1).toBe('go');
    }, SETTLE);
    // The plate keeps the editor's braille
    expect(params().Line_1).toBe('\u281B');
  });

  it('rejects non-braille characters with an error and blocks the write', async () => {
    await typeBraille('\u2813\u2811', () => {
      expect(params().Line_1).toBe('\u2813\u2811');
    });
    await typeBraille('hello', () => {
      expect(document.getElementById('brailleErrors').textContent).toContain(
        'not a braille character'
      );
    });
    // The previous good braille survives rather than being overwritten
    // with garbage cells.
    expect(params().Line_1).toBe('\u2813\u2811');
  });

  it('drops rows past the sign\u2019s line count and says so', async () => {
    // Truncation is a blocking problem, so it belongs in the error tier.
    await typeBraille(
      '\u2801\n\u2803\n\u2809\n\u2819\n\u2811\n\u280B\n\u281B',
      () => {
        expect(document.getElementById('brailleErrors').textContent).toContain(
          'holds 6'
        );
      }
    );
    expect(params().Line_6).toBe('\u280B');
  });

  it('fills the editor from the text, then uses it verbatim', async () => {
    await typeText('hello', () => {
      expect(params().Line_1).toBe(word('hello'));
    });

    document.getElementById('brailleFieldFromText').click();
    await vi.waitFor(
      () => {
        expect(document.getElementById('brailleFieldInput').value).toBe(
          word('hello')
        );
      },
      SETTLE
    );

    // Editing one cell must reach the model untouched by translation.
    await typeBraille(`${word('hello')}\u283F`, () => {
      expect(params().Line_1).toBe(`${word('hello')}\u283F`);
    });
  });

  it('clears the editor when the text changes while it is pristine', async () => {
    document.getElementById('brailleFieldFromText').click();
    await vi.waitFor(
      () => {
        expect(document.getElementById('brailleFieldInput').value).not.toBe('');
      },
      SETTLE
    );

    await typeText('exit', () => {
      expect(document.getElementById('brailleFieldInput').value).toBe('');
    });
    // Back to translating the text box.
    await vi.waitFor(
      () => {
        expect(params().Line_1).toBe(word('exit'));
      },
      SETTLE
    );
  });

  it('"Convert braille ASCII" puts the cells on the braille plate only', async () => {
    await typeText('Exit', () => {
      expect(params().sign_text_1).toBe('Exit');
    });
    await typeBraille('h>ry@a"', () => {
      expect(document.getElementById('brailleErrors').textContent).not.toBe('');
    });
    document.getElementById('brailleFieldFromAscii').click();
    await vi.waitFor(() => {
      expect(params().Line_1).toBe(HARRY);
    }, SETTLE);
    expect(params().sign_text_1).toBe('Exit');
    expect(document.getElementById('brailleFieldHelp').textContent).toBe(
      'One line per braille row on the sign. Press "Translate to braille" ' +
        'to fill this editor from your text, then change any cell. You can ' +
        'also paste braille, type it with six-key entry, or paste braille ' +
        'ASCII and press "Convert braille ASCII". Press "Translate to text" ' +
        'to read the braille back. Whenever this editor has content the ' +
        'braille plate uses it exactly as written, and the raised letters ' +
        'still come from the text above. Clear it to go back to translating.'
    );
  });
});

describe('braille panel — when the engine fails', () => {
  beforeEach(() => mountCardPanel());
  afterEach(() => destroyBraillePanel());

  it('shows no braille for text it could not translate', async () => {
    const rows = () =>
      document.querySelectorAll('#braillePreview .braille-preview-braille');
    await typeText('hello', () => expect(rows()[0]?.textContent).toBe(word('hello')));

    translateText.mockRejectedValueOnce(
      new Error('liblouis could not translate this text with en-ueb-g1.ctb (test)')
    );
    await typeText('world', () =>
      expect(document.getElementById('brailleErrors').textContent).toContain(
        'Braille translation is unavailable'
      )
    );
    // The previous text's braille must not stand in for this text's.
    expect(rows()).toHaveLength(0);
  });
});

describe('braille panel — characters with no braille', () => {
  beforeEach(() => mountCardPanel());
  afterEach(() => destroyBraillePanel());

  it('says the characters are left out of the braille', async () => {
    const warnings = () => document.getElementById('brailleWarnings');
    await typeText('ab \u2603', () => expect(warnings().textContent).not.toBe(''));
    expect(warnings().textContent).toContain(
      'Some characters could not be translated to braille (in: "\u2603"). ' +
        'They are left out of the braille.'
    );
  });
});

describe('braille panel sign mode — the ADA capitals rule by default', () => {
  const CAP = String.fromCodePoint(0x2820);
  const BLANK = String.fromCodePoint(0x2800);
  const signRows = () =>
    document.querySelectorAll('#braillePreview .braille-preview-braille');
  const SIGN_LINES = Array.from({ length: 6 }, (_, i) => `Line_${i + 1}`);
  const SIGN_TEXTS = Array.from({ length: 6 }, (_, i) => `sign_text_${i + 1}`);

  function mountSign(extra = {}) {
    document.body.innerHTML =
      '<div id="app"><div id="parametersContainer"></div></div>';
    const defaults = {
      sign_width_mm: '160',
      braille_plate_height_mm: '40',
      cell_spacing: '6.2',
      line_spacing: '10',
      char_height_mm: '16',
      letter_spacing: '1.1',
      ...Object.fromEntries(SIGN_LINES.map((name) => [name, ''])),
      ...Object.fromEntries(SIGN_TEXTS.map((name) => [name, ''])),
    };
    stateManager.setState({ parameters: { ...defaults }, defaults });
    initBraillePanel({
      mode: 'sign',
      lineParams: SIGN_LINES,
      textParams: SIGN_TEXTS,
      tablesCatalog: '/liblouis/tables.json',
      defaultTable: 'en-ueb-g2.ctb',
      capacityParams: {
        cardWidth: 'sign_width_mm',
        cardHeight: 'braille_plate_height_mm',
        cellSpacing: 'cell_spacing',
        lineSpacing: 'line_spacing',
        charHeight: 'char_height_mm',
        letterSpacing: 'letter_spacing',
      },
      ...extra,
    });
  }

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    destroyBraillePanel();
    document.body.innerHTML = '';
  });

  it('starts on the ADA sign rule when the sign asks for it, and says nothing about capitals', async () => {
    mountSign({ capitals: 'off' });
    expect(document.getElementById('brailleCapsAda').checked).toBe(true);
    expect(document.getElementById('brailleCapsTyped').checked).toBe(false);
    await typeText('Exit now', () => {
      expect(params().sign_text_1).toBe('Exit now');
    });
    expect(translateText).toHaveBeenCalledWith('exit now', 'en-ueb-g2.ctb', {
      preserveCaps: true,
    });
    expect(document.getElementById('brailleWarnings').textContent).toBe('');
  });

  it('offers the two capitals choices as one named group, with no checkbox', () => {
    mountSign({ capitals: 'off' });
    expect(document.getElementById('brailleCapsToggle')).toBeNull();
    const group = document.getElementById('brailleCapsChoice');
    expect(group.tagName).toBe('FIELDSET');
    expect(group.querySelector('legend').textContent).toBe('Braille capitals');
    const radios = [...group.querySelectorAll('input[type="radio"]')];
    expect(radios.map((radio) => radio.id)).toEqual([
      'brailleCapsAda',
      'brailleCapsTyped',
    ]);
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
    expect(
      radios.map(
        (radio) =>
          document.querySelector(`label[for="${radio.id}"]`).textContent
      )
    ).toEqual([
      'ADA sign rule: lowercase, except single letters (the B in 3B)',
      'Exactly as typed (UEB capital signs)',
    ]);
  });

  it('on the ADA sign rule, only a letter standing alone keeps its capital', async () => {
    mountSign({ capitals: 'off' });
    await typeText('Wing C', () =>
      expect(signRows()[0]?.textContent).toBe(
        word('wing') + BLANK + CAP + cell('c')
      )
    );
    expect(params().sign_text_1).toBe('Wing C');
  });

  it('exactly as typed keeps every capital you type', async () => {
    mountSign({ capitals: 'off' });
    const typed = document.getElementById('brailleCapsTyped');
    typed.click();
    expect(typed.checked).toBe(true);
    expect(document.getElementById('brailleCapsAda').checked).toBe(false);
    await typeText('Wing C', () =>
      expect(signRows()[0]?.textContent).toBe(
        CAP + word('wing') + BLANK + CAP + cell('c')
      )
    );
  });

  it('starts exactly as typed when the configuration does not ask for the rule; cards keep their checkbox', () => {
    mountSign();
    expect(document.getElementById('brailleCapsTyped').checked).toBe(true);
    expect(document.getElementById('brailleCapsAda').checked).toBe(false);
    destroyBraillePanel();
    mountCardPanel();
    expect(document.getElementById('brailleCapsToggle').checked).toBe(true);
    expect(document.getElementById('brailleCapsChoice')).toBeNull();
  });

  it('explains the sign defaults under the capitals choice, the text box and the table list', () => {
    mountSign({ capitals: 'off' });
    expect(document.getElementById('brailleCapsHelp').textContent).toBe(
      'For a name, an acronym or a sentence, choose Exactly as typed and ' +
        'type capitals only on those words. The raised letters are always ' +
        'uppercase. In braille, ADA 703.3.1 gives capitals only to names, ' +
        "single letters, initials, acronyms and a sentence's first word."
    );
    // Only the first sentence is the group's description (15-word target,
    // 25-word ceiling; SCREEN_READER_LESSONS.md rule 1)
    const lead = document.getElementById('brailleCapsHelpLead');
    expect(
      document
        .getElementById('brailleCapsChoice')
        .getAttribute('aria-describedby')
    ).toBe('brailleCapsHelpLead');
    expect(lead.textContent.trim().split(/\s+/)).toHaveLength(19);
    expect(document.getElementById('brailleTextHelp').textContent).toBe(
      'Translation runs on your device. Each line you type is translated ' +
        'on its own. Long lines wrap onto new rows of raised letters, and ' +
        'the braille below packs its own rows to fill the sign width (ADA ' +
        'places braille in one block below the text). Each plate holds up ' +
        'to 6 rows, and the sign grows to fit.'
    );
    expect(document.getElementById('brailleTableHelp').textContent).toBe(
      'ADA 703.3 requires contracted (Grade 2) braille on signs. ' +
        'Uncontracted (Grade 1) spells every word letter by letter.'
    );
  });
});

describe('braille panel card mode — contracted braille by default', () => {
  afterEach(() => destroyBraillePanel());

  it('starts on Grade 2 with its prefilled text, and says why under the table list', async () => {
    mountCardPanel();
    // The card model's Line_1 and Line_2 defaults are this text in Grade 2
    expect(document.getElementById('brailleTextInput').value).toBe(
      'hello\nworld'
    );
    const select = document.getElementById('brailleTableSelect');
    await vi.waitFor(() => expect(select.value).toBe('en-ueb-g2.ctb'), SETTLE);
    expect(document.getElementById('brailleTableHelp').textContent).toBe(
      'Contracted (Grade 2) fits more on a card; the Braille Authority of ' +
        'North America uses it in its business card examples. Uncontracted ' +
        '(Grade 1) spells every word letter by letter.'
    );
  });
});

describe('braille panel — the table list without its catalog', () => {
  const shippedCatalog = JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../../public/liblouis/tables.json'
      ),
      'utf-8'
    )
  );

  afterEach(() => destroyBraillePanel());

  for (const { file, label } of shippedCatalog.tables) {
    it(`names ${file} with its own label`, async () => {
      getTables.mockRejectedValueOnce(new Error('Failed to fetch'));
      mountCardPanel({ defaultTable: file });
      const select = document.getElementById('brailleTableSelect');
      await vi.waitFor(() => expect(select.value).toBe(file), SETTLE);
      expect(select.options).toHaveLength(1);
      expect(select.options[0].textContent).toBe(label);
    });
  }
});

describe('braille panel sign mode — rows by real letter widths', () => {
  const SIGN_DIR = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../public/examples/braille-sign'
  );
  // Mounted as the app mounts it: the sign's manifest and the model's own
  // defaults
  const signConfig = JSON.parse(
    readFileSync(join(SIGN_DIR, 'manifest.json'), 'utf-8')
  ).brailleTranslation;
  const signDefaults = Object.fromEntries(
    Object.entries(
      extractParameters(
        readFileSync(join(SIGN_DIR, 'braille_sign.scad'), 'utf-8')
      ).parameters
    ).map(([name, param]) => [name, String(param.default)])
  );

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML =
      '<div id="app"><div id="parametersContainer"></div></div>';
    stateManager.setState({
      parameters: { ...signDefaults },
      defaults: { ...signDefaults },
    });
    initBraillePanel(signConfig);
  });

  afterEach(() => {
    destroyBraillePanel();
    document.body.innerHTML = '';
  });

  /** Lay out a text, from a different one so the layout has surely run. */
  async function layOut(text) {
    await typeText('EXIT', () => expect(params().sign_text_1).toBe('EXIT'));
    await typeText(text, () => expect(params().sign_text_1).not.toBe('EXIT'));
    return signConfig.textParams.map((name) => params()[name]).filter(Boolean);
  }

  it('keeps a fresh sign\'s "Room 101" on one row', async () => {
    expect(await layOut('Room 101')).toEqual(['Room 101']);
  });

  it('fits a row of narrow letters that counting characters would break', async () => {
    expect(await layOut('III III III III')).toEqual(['III III III III']);
  });

  it('breaks a row of wide letters that counting characters would keep', async () => {
    expect(await layOut('WWW MMM')).toEqual(['WWW', 'MMM']);
  });

  it('puts "CONFERENCE ROOM" on two rows and gives the long word\'s real width', async () => {
    expect(await layOut('CONFERENCE ROOM')).toEqual(['CONFERENCE', 'ROOM']);
    expect(document.getElementById('brailleWarnings').textContent).toContain(
      '"CONFERENCE" needs about 198 mm of raised letters'
    );
  });
});

describe('braille panel — the message boxes', () => {
  beforeEach(() => mountCardPanel());
  afterEach(() => destroyBraillePanel());

  // A box revealed together with its first message is not announced
  // (NVDA said only "alert"), so an empty box is never hidden; CSS keeps it
  // out of sight while it stays in the accessibility tree.
  it('never hides an empty message box', async () => {
    const errors = document.getElementById('brailleErrors');
    const warnings = document.getElementById('brailleWarnings');
    expect(errors.hidden).toBe(false);
    expect(warnings.hidden).toBe(false);
    await typeBraille('ab{', () =>
      expect(errors.textContent).toContain('not a braille character')
    );
    await typeBraille('', () => expect(errors.textContent).toBe(''));
    expect(errors.hidden).toBe(false);
  });

  // A live region says its whole text again whenever it is rewritten, so an
  // unchanged editor warning must not be rewritten after every layout.
  it('leaves a message box alone while its messages stay the same', async () => {
    const warnings = document.getElementById('brailleWarnings');
    await typeBraille(cell('a'), () =>
      expect(warnings.textContent).toContain('The braille editor has content')
    );
    const writes = [];
    const observer = new MutationObserver((records) => writes.push(...records));
    observer.observe(warnings, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
    await typeBraille(cell('a') + cell('b'), () =>
      expect(params().Line_1).toBe(cell('a') + cell('b'))
    );
    writes.push(...observer.takeRecords());
    observer.disconnect();
    expect(writes).toHaveLength(0);
  });
});
