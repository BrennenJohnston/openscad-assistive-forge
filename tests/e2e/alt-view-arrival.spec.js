/**
 * Finding the Alt View: the key drops from the top of the screen into its
 * place beside the theme button, the buttons after it making room, wearing
 * the Alt View's own colors; then it redraws itself into the ordinary key.
 * With reduced motion it simply appears.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import {
  announcementsSince,
  recordAnnouncements,
} from './helpers/invariants.js';
import { canSound, listenForSound, probeSound } from './helpers/sound.js';
import { skipWithoutWebGL } from './helpers/webgl.js';

const SENTENCE = 'A key appeared next to the theme button.';

const SEQUENCE = [
  'cameraRotateUp',
  'cameraRotateUp',
  'cameraRotateDown',
  'cameraRotateDown',
  'cameraRotateLeft',
  'cameraRotateRight',
  'cameraRotateLeft',
  'cameraRotateRight',
  'cameraPanDown',
  'cameraPanRight',
];

async function openBox(page, theme = 'dark') {
  await page.addInitScript((theme) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', theme);
  }, theme);
  await page.goto('/?example=simple-box');
  await page.waitForFunction(() => window.previewManager?.mesh, null, {
    timeout: 180_000,
  });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 });
    await notNow.click();
  } catch {
    // No save-project prompt to dismiss.
  }
  const uiToggle = page.locator('#uiModeToggle');
  if ((await uiToggle.getAttribute('aria-checked')) !== 'true') {
    await uiToggle.click();
  }
  await page.locator('#cameraPanelToggle').click();
  await expect(page.locator('#cameraRotateUp')).toBeVisible();
}

// Every state the key passes through, with the room between the theme button
// and the button after the key (the row is right-aligned, so the buttons
// before the key are the ones that slide) and the colors the arriving key
// wore, from now on.
async function watch(page) {
  await page.evaluate(() => {
    const seen = (window.__arrival = { states: [], room: [], colors: [] });
    const theme = document.getElementById('themeToggle');
    const after = theme.nextElementSibling;
    const room = () =>
      after.getBoundingClientRect().left - theme.getBoundingClientRect().right;
    seen.roomBefore = room();
    const note = (key) => {
      const state = key.getAttribute('data-arrival');
      if (state && seen.states.at(-1) !== state) {
        seen.states.push(state);
        seen.room.push(room());
        const shown = key.querySelector('.alt-view-arrival');
        if (shown) {
          const s = getComputedStyle(shown);
          seen.colors.push([s.borderTopColor, s.color]);
        }
      }
    };
    new MutationObserver(() => {
      const key = document.getElementById('_hfmToggle');
      if (key) note(key);
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-arrival'],
    });
  });
}

// Plays the sequence; returns the page's clock just before the last press.
async function playSequence(page) {
  let before = 0;
  for (const [i, id] of SEQUENCE.entries()) {
    const box = await page.locator(`#${id}`).boundingBox();
    if (i === SEQUENCE.length - 1)
      before = await page.evaluate(() => performance.now());
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  return before;
}

const sentences = async (page) =>
  (await announcementsSince(page, 0)).filter((a) => a.text === SENTENCE);

test.describe('The key arrives', () => {
  test('it drops into its place, the buttons make room, and it becomes the ordinary key', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openBox(page);
    await watch(page);
    await playSequence(page);

    const key = page.locator('#_hfmToggle');
    await expect(key).toBeVisible();
    await expect(key).not.toHaveAttribute('data-arrival', /.+/, {
      timeout: 12_000,
    });
    await expect(page.locator('.alt-view-arrival')).toHaveCount(0);
    await expect(key).toHaveAttribute('aria-label', 'Alt View');
    await expect(key).toHaveAttribute('aria-pressed', 'false');

    const seen = await page.evaluate(() => window.__arrival);
    expect(seen.states).toEqual(['dropping', 'landed', 'settled']);
    // No room had opened when it began to fall, and a key's width had once it
    // landed.
    expect(Math.abs(seen.room[0] - seen.roomBefore)).toBeLessThanOrEqual(2);
    const width = await key.evaluate((el) => el.getBoundingClientRect().width);
    expect(seen.room[1] - seen.roomBefore).toBeGreaterThanOrEqual(width);
    // In the dark theme the arriving key wears the Alt View's green.
    expect(seen.colors[0]).toEqual(['rgb(0, 255, 0)', 'rgb(0, 255, 0)']);
  });

  test('in the light theme it wears the amber', async ({ page }) => {
    test.setTimeout(240_000);
    await openBox(page, 'light');
    await watch(page);
    await playSequence(page);
    await expect(page.locator('#_hfmToggle')).not.toHaveAttribute(
      'data-arrival',
      /.+/,
      { timeout: 12_000 }
    );
    const seen = await page.evaluate(() => window.__arrival);
    expect(seen.colors[0]).toEqual(['rgb(255, 176, 0)', 'rgb(255, 176, 0)']);
  });

  test('with reduced motion it simply appears', async ({ page }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openBox(page);
    expect(
      await page.evaluate(
        () => matchMedia('(prefers-reduced-motion: reduce)').matches
      ),
      'the setting is on'
    ).toBe(true);
    await watch(page);
    await playSequence(page);
    await expect(page.locator('#_hfmToggle')).toBeVisible();
    await page.waitForTimeout(1_000);
    const seen = await page.evaluate(() => window.__arrival);
    expect(seen.states).toEqual([]);
    await expect(page.locator('.alt-view-arrival')).toHaveCount(0);
  });
});

// The same sequence on the keyboard: Up, Up, Down, Down, Left, Right, Left,
// Right, B, A, typed anywhere outside a text field.
const KEYS = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA',
];

async function typeSequence(page) {
  for (const code of KEYS) await page.keyboard.press(code);
}

test.describe('The key arrives from the keyboard', () => {
  test('in Classic, with no camera buttons on the page, the ten keys bring it', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await recordAnnouncements(page);
    await openBox(page);
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await watch(page);
    await typeSequence(page);

    const key = page.locator('#_hfmToggle');
    await expect(key).toBeVisible({ timeout: 10_000 });
    await expect(key).not.toHaveAttribute('data-arrival', /.+/, {
      timeout: 12_000,
    });
    const seen = await page.evaluate(() => window.__arrival);
    expect(seen.states.length, 'the arrival played').toBeGreaterThan(0);
    await expect
      .poll(async () => (await sentences(page)).length, { timeout: 10_000 })
      .toBe(1);
  });

  test('in Standard, typed with the preview focused, while the arrows also turn the view', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openBox(page);
    const box = await page.locator('#previewContainer').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await typeSequence(page);
    await expect(page.locator('#_hfmToggle')).toBeVisible({ timeout: 10_000 });
  });
});

// Every finding of the code counts, kept in this browser: the second cracks
// the glass around the key, the third makes the key stay.
const UNLOCK = 'openscad-forge-alt-unlock';
const count = (state) =>
  JSON.stringify({
    entries: 0,
    permanent: false,
    pendingBreak: false,
    ...state,
  });

async function openMainPage(page, stored) {
  await page.addInitScript((stored) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', 'dark');
    for (const [name, value] of Object.entries(stored)) {
      localStorage.setItem(name, value);
    }
  }, stored);
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    timeout: 180_000,
  });
}

// The moments the key is marked with and the states of its drop, from now on.
async function watchKey(page) {
  await page.evaluate(() => {
    const seen = (window.__key = { moments: [], arrival: [] });
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.target.id !== '_hfmToggle') continue;
        const value = record.target.getAttribute(record.attributeName);
        if (value === null) continue;
        if (record.attributeName === 'data-moment') seen.moments.push(value);
        else seen.arrival.push(value);
      }
    }).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-moment', 'data-arrival'],
    });
  });
}

const keySeen = (page) => page.evaluate(() => window.__key);

test.describe('The key that stays', () => {
  test('the key is there on load when it is permanent: no drop, nothing said, the guide tab shown', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await recordAnnouncements(page);
    await openMainPage(page, {
      [UNLOCK]: count({ entries: 3, permanent: true }),
    });

    const key = page.locator('#_hfmToggle');
    await expect(key).toBeVisible();
    await expect(key).toHaveAttribute('data-alt-key', 'permanent');
    await expect(key).not.toHaveAttribute('data-arrival', /.+/);
    expect(
      await page.evaluate(() => {
        const theme = document.getElementById('themeToggle');
        return [
          theme.nextElementSibling?.id,
          theme.nextElementSibling?.nextElementSibling?.id,
        ];
      }),
      'the sounds button, then the key, after the theme button'
    ).toEqual(['_hfmSounds', '_hfmToggle']);
    expect(
      await page.evaluate(
        () =>
          document.getElementById('_hfmPanAdjust')?.previousElementSibling?.id
      )
    ).toBe('projectionToggle');
    expect(
      await page.evaluate(() => document.getElementById('tab-altview').hidden)
    ).toBe(false);
    await page.waitForTimeout(2_000);
    expect(await sentences(page)).toEqual([]);
  });

  test('a second finding, with the key showing, marks the crack', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openMainPage(page, {
      'openscad-customizer-hfm-unlock': 'true',
      [UNLOCK]: count({ entries: 1 }),
    });
    await expect(page.locator('#_hfmToggle')).toBeVisible();
    await watchKey(page);
    await typeSequence(page);

    await expect
      .poll(async () => (await keySeen(page)).moments, { timeout: 5_000 })
      .toEqual(['crack']);
    expect((await keySeen(page)).arrival).toEqual([]);
    const stored = await page.evaluate(
      (name) => localStorage.getItem(name),
      UNLOCK
    );
    expect(JSON.parse(stored)).toEqual({
      entries: 2,
      permanent: false,
      pendingBreak: false,
    });
  });

  test('on a later visit, with no key showing, the second finding brings the key with its crack and no drop', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openMainPage(page, { [UNLOCK]: count({ entries: 1 }) });
    await expect(page.locator('#_hfmToggle')).toHaveCount(0);
    await watchKey(page);
    await typeSequence(page);

    await expect(page.locator('#_hfmToggle')).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => (await keySeen(page)).moments, { timeout: 5_000 })
      .toEqual(['crack']);
    expect((await keySeen(page)).arrival).toEqual([]);
  });
});

// The second finding cracks the glass around the key: lines drawn out from
// its border, held, and receding, about 4.3 s in all; a retro crack and a
// tense melody; then a sentence.
const CRACK = 'Something cracked around the key.';
const CRACK_SECONDS = 0.6;
const THRILLER_SECONDS = 3.0;
const said = async (page, text) =>
  (await announcementsSince(page, 0)).filter((a) => a.text === text);

// When the key was marked with the crack and when the mark and its lines went,
// on the page's clock, and how many lines were drawn.
async function watchCrack(page) {
  await page.evaluate(() => {
    const seen = (window.__crack = {
      marked: null,
      cleared: null,
      lines: 0,
      drawn: false,
    });
    new MutationObserver(() => {
      const key = document.getElementById('_hfmToggle');
      if (!key) return;
      const overlay = key.querySelector('.alt-view-crack');
      if (overlay) {
        seen.drawn = true;
        seen.lines = overlay.querySelectorAll('polyline').length;
      }
      const marked = key.getAttribute('data-moment') === 'crack';
      if (marked && seen.marked === null) seen.marked = performance.now();
      if (
        !marked &&
        !overlay &&
        seen.marked !== null &&
        seen.cleared === null
      ) {
        seen.cleared = performance.now();
      }
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-moment'],
    });
  });
}

const crackSeen = (page) => page.evaluate(() => window.__crack);

// A trusted key press lets the page make sound; the probe's own sound is
// started by a click after it.
async function canSoundAfterTyping(page) {
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('click')));
  return canSound(page);
}

test.describe('The crack', () => {
  test('a second finding cracks the glass around the key for about 4.3 s, with the crack, the thriller and then the sentence', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const crackRequests = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/sounds/moments/crack.wav'))
        crackRequests.push(request.url());
    });
    await recordAnnouncements(page);
    await listenForSound(page);
    await openMainPage(page, {
      'openscad-customizer-hfm-unlock': 'true',
      [UNLOCK]: count({ entries: 1 }),
    });
    await expect(page.locator('#_hfmToggle')).toBeVisible();
    await page.waitForTimeout(1_000);
    await probeSound(page);
    await watchCrack(page);
    const before = await page.evaluate(() => window.__sounds.length);
    await typeSequence(page);
    const pressed = await page.evaluate(() => performance.now());
    const sounding = await canSoundAfterTyping(page);

    await expect
      .poll(async () => (await crackSeen(page)).cleared, { timeout: 8_000 })
      .not.toBeNull();
    const crack = await crackSeen(page);
    expect(crack.lines).toBe(7);
    const lasted = crack.cleared - crack.marked;
    expect(lasted, 'drawn 0.8 s, held 1.5 s, receding 2 s').toBeGreaterThan(
      3_800
    );
    expect(lasted, 'ended by its lines, before the 5 s fallback').toBeLessThan(
      4_900
    );
    await expect(page.locator('.alt-view-crack')).toHaveCount(0);
    expect(crackRequests, 'fetched once, ahead').toHaveLength(1);

    await expect
      .poll(async () => (await said(page, CRACK)).length, { timeout: 10_000 })
      .toBe(1);
    const [sentence] = await said(page, CRACK);
    if (sounding) {
      const heard = (await page.evaluate(() => window.__sounds)).slice(before);
      expect(
        heard.map((s) => Math.round(s.seconds * 10) / 10).sort((a, c) => a - c)
      ).toEqual([CRACK_SECONDS, THRILLER_SECONDS]);
      expect(sentence.t - pressed, 'after the thriller').toBeGreaterThanOrEqual(
        3_000
      );
    } else {
      expect(sentence.t - pressed).toBeLessThan(2_000);
    }
    await page.waitForTimeout(1_000);
    expect(await said(page, CRACK)).toHaveLength(1);
  });

  test('with reduced motion the second finding draws nothing and still sounds and speaks', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await recordAnnouncements(page);
    await listenForSound(page);
    await openMainPage(page, {
      'openscad-customizer-hfm-unlock': 'true',
      [UNLOCK]: count({ entries: 1 }),
    });
    await expect(page.locator('#_hfmToggle')).toBeVisible();
    await probeSound(page);
    await watchCrack(page);
    const before = await page.evaluate(() => window.__sounds.length);
    await typeSequence(page);
    const sounding = await canSoundAfterTyping(page);

    await expect
      .poll(async () => (await said(page, CRACK)).length, { timeout: 10_000 })
      .toBe(1);
    const crack = await crackSeen(page);
    expect(crack.drawn).toBe(false);
    expect(crack.marked).toBeNull();
    if (sounding) {
      const heard = (await page.evaluate(() => window.__sounds)).slice(before);
      expect(
        heard.map((s) => Math.round(s.seconds * 10) / 10).sort((a, c) => a - c)
      ).toEqual([CRACK_SECONDS, THRILLER_SECONDS]);
    }
  });

  test('on a later visit the crack brings the key and one sentence says both', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() =>
      localStorage.setItem('openscad-forge-sounds', 'false')
    );
    await recordAnnouncements(page);
    await openMainPage(page, { [UNLOCK]: count({ entries: 1 }) });
    await watchCrack(page);
    await typeSequence(page);

    await expect(page.locator('#_hfmToggle')).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => (await crackSeen(page)).lines).toBe(7);
    const both = `${SENTENCE} ${CRACK}`;
    await expect
      .poll(async () => (await said(page, both)).length, { timeout: 5_000 })
      .toBe(1);
    await page.waitForTimeout(1_000);
    expect(await said(page, both)).toHaveLength(1);
    expect(await sentences(page), 'never the first sentence alone').toEqual([]);
    expect(await said(page, CRACK), 'never the crack alone').toEqual([]);
  });

  test("the lines wear the look the key would turn on: green and amber in Forge, the DOS blue in Classic, the DOS yellow in Classic's DOS look", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-sounds', 'false');
      localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
    });
    await openBox(page);
    // Each check starts from one finding, so the next is a crack.
    const crackColor = async () => {
      await page.evaluate(
        ([name, value]) => localStorage.setItem(name, value),
        [UNLOCK, count({ entries: 1 })]
      );
      await typeSequence(page);
      const line = page.locator('#_hfmToggle .alt-view-crack polyline').first();
      await expect(line).toBeAttached();
      return line.evaluate((el) => getComputedStyle(el).stroke);
    };

    expect(await crackColor(), 'Forge dark').toBe('rgb(0, 255, 0)');
    await page.evaluate(() =>
      document.documentElement.setAttribute('data-theme', 'light')
    );
    expect(await crackColor(), 'Forge light').toBe('rgb(255, 176, 0)');
    await page.evaluate(() =>
      document.documentElement.setAttribute('data-theme', 'dark')
    );
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    expect(await crackColor(), 'Classic').toBe('rgb(0, 0, 204)');

    await skipWithoutWebGL(page, 'the Alt View draws from the 3D picture');
    await page.locator('#_hfmToggle').click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-ui-variant',
      'mono'
    );
    expect(await crackColor(), "Classic's DOS look").toBe('rgb(255, 255, 85)');
  });
});

// The third finding: a copy of the key grows from behind the screen, breaks
// the glass, and settles into the key's place, which keeps the look it turns
// on from then on; the shatter and a fanfare; then a sentence.
const STAY = 'The key is here to stay.';
const SHATTER_SECONDS = 0.8;
const FANFARE_SECONDS = 2.0;

// Seeded on the first load only, so a reload shows what the page kept.
async function openMainPageOnce(page, stored) {
  await page.addInitScript((stored) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', 'true');
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', 'dark');
    for (const [name, value] of Object.entries(stored)) {
      localStorage.setItem(name, value);
    }
  }, stored);
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    timeout: 180_000,
  });
}

// When the key was marked with the break-through and when the mark and its
// pieces went, on the page's clock, and how many shards flew.
async function watchBreak(page) {
  await page.evaluate(() => {
    const seen = (window.__break = {
      marked: null,
      cleared: null,
      shards: 0,
      copy: false,
      ground: null,
    });
    new MutationObserver(() => {
      const key = document.getElementById('_hfmToggle');
      if (!key) return;
      const overlay = key.querySelector('.alt-view-break');
      if (overlay) {
        seen.copy = !!overlay.querySelector('.alt-view-break-copy svg');
        seen.shards = overlay.querySelectorAll('.alt-view-break-shard').length;
      }
      const marked = key.getAttribute('data-moment') === 'break';
      if (marked && seen.marked === null) {
        seen.marked = performance.now();
        // The key's own box, which the copy grows in front of.
        seen.ground = getComputedStyle(key).backgroundColor;
      }
      if (
        !marked &&
        !overlay &&
        seen.marked !== null &&
        seen.cleared === null
      ) {
        seen.cleared = performance.now();
      }
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-moment'],
    });
  });
}

const breakSeen = (page) => page.evaluate(() => window.__break);
const keyColors = (page) =>
  page.locator('#_hfmToggle').evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      ground: s.backgroundColor,
      glyph: s.color,
      edge: s.borderTopColor,
    };
  });

test.describe('The break-through', () => {
  test('a third finding breaks through the glass, and the key stays in its look, through a reload', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await recordAnnouncements(page);
    await listenForSound(page);
    await openMainPageOnce(page, {
      'openscad-customizer-hfm-unlock': 'true',
      [UNLOCK]: count({ entries: 2 }),
    });
    await expect(page.locator('#_hfmToggle')).toBeVisible();
    await page.waitForTimeout(1_000);
    await probeSound(page);
    await watchBreak(page);
    const before = await page.evaluate(() => window.__sounds.length);
    await typeSequence(page);
    const pressed = await page.evaluate(() => performance.now());
    const sounding = await canSoundAfterTyping(page);

    await expect
      .poll(async () => (await breakSeen(page)).cleared, { timeout: 8_000 })
      .not.toBeNull();
    const seen = await breakSeen(page);
    expect(seen.copy, 'a copy of the key').toBe(true);
    expect(seen.ground, "the key's own box out of sight behind the copy").toBe(
      'rgba(0, 0, 0, 0)'
    );
    expect(seen.shards).toBe(12);
    const lasted = seen.cleared - seen.marked;
    expect(lasted, 'grown 1.6 s, then 0.8 s of shards').toBeGreaterThan(2_000);
    expect(lasted, 'ended by its shards, before the 4 s fallback').toBeLessThan(
      3_600
    );
    await expect(page.locator('.alt-view-break')).toHaveCount(0);
    await expect(page.locator('#_hfmToggle')).toHaveAttribute(
      'data-alt-key',
      'permanent'
    );
    expect(
      JSON.parse(
        await page.evaluate((name) => localStorage.getItem(name), UNLOCK)
      )
    ).toEqual({ entries: 3, permanent: true, pendingBreak: false });
    expect(await keyColors(page), 'the green look on its ground').toEqual({
      ground: 'rgb(18, 18, 18)',
      glyph: 'rgb(0, 255, 0)',
      edge: 'rgb(0, 255, 0)',
    });

    await expect
      .poll(async () => (await said(page, STAY)).length, { timeout: 10_000 })
      .toBe(1);
    const [sentence] = await said(page, STAY);
    if (sounding) {
      const heard = (await page.evaluate(() => window.__sounds)).slice(before);
      expect(
        heard.map((s) => Math.round(s.seconds * 10) / 10).sort((a, c) => a - c)
      ).toEqual([SHATTER_SECONDS, FANFARE_SECONDS]);
      expect(sentence.t - pressed, 'after the fanfare').toBeGreaterThanOrEqual(
        3_800
      );
    }

    // Without the developer's door, a reload still shows the key, in its look.
    await page.evaluate(() =>
      localStorage.removeItem('openscad-customizer-hfm-unlock')
    );
    await page.reload();
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      timeout: 180_000,
    });
    const key = page.locator('#_hfmToggle');
    await expect(key).toBeVisible();
    await expect(key).toHaveAttribute('data-alt-key', 'permanent');
    await expect(key).not.toHaveAttribute('data-arrival', /.+/);
  });

  test('found while the look is on, the key stays at once and the break-through waits until the look is off', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() =>
      localStorage.setItem('openscad-forge-sounds', 'false')
    );
    await recordAnnouncements(page);
    await openMainPage(page, {
      'openscad-customizer-hfm-unlock': 'true',
      [UNLOCK]: count({ entries: 2 }),
    });
    const key = page.locator('#_hfmToggle');
    await key.click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-ui-variant',
      'mono'
    );
    await watchBreak(page);
    await typeSequence(page);
    await page.waitForTimeout(1_500);
    await expect(key).toHaveAttribute('data-alt-key', 'permanent');
    expect(
      (await breakSeen(page)).marked,
      'nothing breaks in the look'
    ).toBeNull();
    expect(
      JSON.parse(
        await page.evaluate((name) => localStorage.getItem(name), UNLOCK)
      )
    ).toEqual({ entries: 3, permanent: true, pendingBreak: true });

    const mark = await page.evaluate(() => performance.now());
    await key.click();
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-ui-variant',
      'mono'
    );
    await expect
      .poll(async () => (await breakSeen(page)).cleared, { timeout: 8_000 })
      .not.toBeNull();
    await expect
      .poll(async () => (await said(page, STAY)).length, { timeout: 5_000 })
      .toBe(1);
    const order = (await announcementsSince(page, 0))
      .filter((a) => a.t >= mark && ['Alt View off.', STAY].includes(a.text))
      .map((a) => a.text);
    expect(order).toEqual(['Alt View off.', STAY]);
  });

  test("in Classic the permanent key is the DOS look's yellow key on its blue", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openMainPage(page, {
      [UNLOCK]: count({ entries: 3, permanent: true }),
      'openscad-forge-ui-mode': JSON.stringify({
        mode: 'classic',
        lastCustomMode: 'standard',
      }),
    });
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await expect(page.locator('#_hfmToggle')).toBeVisible();
    expect(await keyColors(page)).toEqual({
      ground: 'rgb(0, 0, 204)',
      glyph: 'rgb(255, 255, 85)',
      edge: 'rgb(255, 255, 85)',
    });
  });

  test("the permanent key is the theme buttons' size: at a fine pointer, in high contrast, and on a touch screen", async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const boxes = async (p) =>
      p.evaluate(() =>
        ['_hfmToggle', 'themeToggle'].map((id) => {
          const r = document.getElementById(id).getBoundingClientRect();
          return [Math.round(r.width), Math.round(r.height)];
        })
      );
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMainPage(page, {
      [UNLOCK]: count({ entries: 3, permanent: true }),
    });
    const [key, theme] = await boxes(page);
    expect(key, 'the theme button beside it').toEqual(theme);
    // The touch-target size: 36 px where the browser reports a fine pointer,
    // 44 where it reports none, as some test machines' browsers do.
    const target = await page.evaluate(() =>
      Math.round(
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--size-touch-target'
          )
        )
      )
    );
    expect(key, 'the touch-target size').toEqual([target, target]);
    // In the look, the sounds button beside the key is its size too.
    await page.locator('#_hfmToggle').click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-ui-variant',
      'mono'
    );
    const sounds = await page.locator('#_hfmSounds').boundingBox();
    expect(
      [Math.round(sounds.width), Math.round(sounds.height)],
      'the sounds button'
    ).toEqual(key);

    const contrast = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const contrastPage = await contrast.newPage();
    await openMainPage(contrastPage, {
      [UNLOCK]: count({ entries: 3, permanent: true }),
      'openscad-forge-high-contrast': 'true',
    });
    const [hcKey, hcTheme] = await boxes(contrastPage);
    expect(hcKey, 'in high contrast').toEqual(hcTheme);
    await contrast.close();

    const phone = await browser.newContext({
      viewport: { width: 412, height: 915 },
      hasTouch: true,
    });
    const phonePage = await phone.newPage();
    await openMainPage(phonePage, {
      [UNLOCK]: count({ entries: 3, permanent: true }),
    });
    const coarse = await phonePage.evaluate(
      () => matchMedia('(pointer: coarse)').matches
    );
    if (coarse) {
      const [phoneKey, phoneTheme] = await boxes(phonePage);
      expect(phoneKey, 'on a touch screen').toEqual(phoneTheme);
      expect(phoneKey).toEqual([44, 44]);
    }
    await phone.close();
  });
});

// A short tune plays as the key drops, unless sounds are turned off in
// Preferences; the screen reader's sentence waits until it has finished.
test.describe('The tune', () => {
  test('with sounds on, it plays as the key drops and the sentence follows it', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await recordAnnouncements(page);
    await listenForSound(page);
    await openBox(page);
    await probeSound(page);
    const pressed = await playSequence(page);
    test.skip(
      !(await canSound(page)),
      'this browser cannot start a sound here (no sound device)'
    );

    await expect
      .poll(() => page.evaluate(() => window.__sounds.length), {
        timeout: 5_000,
      })
      .toBe(1);
    const [sound] = await page.evaluate(() => window.__sounds);
    expect(sound.seconds).toBeCloseTo(3.8, 1);
    expect(sound.at - pressed).toBeLessThan(1_000);

    await expect
      .poll(async () => (await sentences(page)).length, { timeout: 10_000 })
      .toBe(1);
    const [said] = await sentences(page);
    expect(said.t - sound.at).toBeGreaterThanOrEqual(3_800);
    await page.waitForTimeout(1_000);
    expect(await sentences(page)).toHaveLength(1);
  });

  test('with sounds off, no tune, and the sentence comes at once', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-sounds', 'false');
    });
    await recordAnnouncements(page);
    await listenForSound(page);
    await openBox(page);
    const pressed = await playSequence(page);

    await expect
      .poll(async () => (await sentences(page)).length, { timeout: 5_000 })
      .toBe(1);
    const [said] = await sentences(page);
    expect(said.t - pressed).toBeLessThan(2_000);
    await page.waitForTimeout(1_000);
    expect(await page.evaluate(() => window.__sounds)).toEqual([]);
  });

  test('Preferences offers it, on to begin with', async ({ page }) => {
    test.setTimeout(240_000);
    await openBox(page);
    await page.locator('#editMenuBtn').click();
    await page
      .getByRole('menuitem', { name: /Preferences/ })
      .first()
      .click();
    await page.locator('#prefs-tab-advanced').click();
    const sounds = page.getByRole('checkbox', { name: 'Play sounds' });
    await expect(sounds).toBeVisible();
    await expect(sounds).toBeChecked();
    await sounds.uncheck();
    expect(
      await page.evaluate(() => localStorage.getItem('openscad-forge-sounds'))
    ).toBe('false');
  });
});

// The Alt View tab links to We Go Places, the game that began here, at its own
// site. The link is read as a screen reader reads it, reached by Tab, and its
// text and focus ring are measured from the pixels in each look: the standard
// themes with and without high contrast, and the Alt View's green and amber
// looks where the browser can draw them.
const LINK_ADDRESS = 'https://we-go-places.pages.dev/';
const LINK_NAME = 'Open We Go Places (opens in new tab)';
const LINK_LOOKS = [
  { name: 'dark', theme: 'dark' },
  { name: 'light', theme: 'light' },
  { name: 'high contrast dark', theme: 'dark', highContrast: true },
  { name: 'high contrast light', theme: 'light', highContrast: true },
  { name: 'Alt View green', theme: 'dark', altView: true },
  { name: 'Alt View amber', theme: 'light', altView: true },
];

/**
 * What the pixels of one box say: its ground (the most common color), the
 * color that stands out most in it (the text, taken as the middle of the six
 * strongest so one stray pixel cannot decide) with its contrast against the
 * ground, and the most common color of the outer band (a focus ring, when one
 * is drawn) with its contrast. The method of the icon-states spec.
 */
async function readLinkBox(page, png, box, band) {
  return page.evaluate(
    async ({ b64, box, band }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: 'image/png' })
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const { data, width } = ctx.getImageData(
        0,
        0,
        bitmap.width,
        bitmap.height
      );
      const lin = (v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const lum = ([r, g, b]) =>
        0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const mostCommon = (list) => {
        const buckets = new Map();
        for (const [r, g, b] of list) {
          const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
          const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
          e.n += 1;
          e.r += r;
          e.g += g;
          e.b += b;
          buckets.set(key, e);
        }
        const most = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
        return [most.r, most.g, most.b].map((v) => Math.round(v / most.n));
      };
      const inner = [];
      const outer = [];
      for (let y = box.top; y < box.bottom; y += 1) {
        for (let x = box.left; x < box.right; x += 1) {
          const i = (y * width + x) * 4;
          const p = [data[i], data[i + 1], data[i + 2]];
          const edge =
            x < box.left + band ||
            x >= box.right - band ||
            y < box.top + band ||
            y >= box.bottom - band;
          (edge ? outer : inner).push(p);
        }
      }
      const ground = mostCommon(inner);
      const g = lum(ground);
      const strongest = inner
        .map((p) => ({ p, c: ratio(lum(p), g) }))
        .sort((a, b) => b.c - a.c)
        .slice(0, 6);
      const text = strongest[Math.floor(strongest.length / 2)];
      const ring = mostCommon(outer);
      return {
        ground,
        text: text.p,
        textContrast: Math.round(text.c * 100) / 100,
        ring,
        ringContrast: Math.round(ratio(lum(ring), g) * 100) / 100,
      };
    },
    { b64: png.toString('base64'), box, band }
  );
}

test.describe('The Alt View tab links to We Go Places', () => {
  for (const look of LINK_LOOKS) {
    test(`the link is read, reached by Tab, and legible in the ${look.name} look`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const stored = {
        'openscad-customizer-hfm-unlock': 'true',
        'openscad-forge-theme': look.theme,
        'openscad-forge-sounds': 'false',
      };
      if (look.highContrast) stored['openscad-forge-high-contrast'] = 'true';
      await openMainPage(page, stored);
      if (look.altView) {
        await skipWithoutWebGL(page, 'the Alt View draws from the 3D picture');
        await page.locator('#_hfmToggle').click();
        await page.waitForFunction(
          () => document.documentElement.dataset.uiVariant === 'mono'
        );
      }

      // No new tab is opened by this test: a popup would be closed at once.
      page.context().on('page', (popup) => popup.close());

      await page.locator('#featuresGuideBtn').click();
      await expect(page.locator('#featuresGuideModal')).not.toHaveClass(
        /hidden/
      );
      const tab = page.locator('#tab-altview');
      await expect(tab).toBeVisible();
      await tab.click();
      const panel = page.locator('#featuresPanelAltView');
      await expect(panel).toBeVisible();

      const link = panel.getByRole('link', { name: LINK_NAME });
      await expect(link).toHaveAttribute('href', LINK_ADDRESS);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
      await expect(link).toHaveAttribute('rel', /noreferrer/);
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeVisible();

      // Reached by the keyboard: from the tab, Tab steps into the panel and on
      // to the link, and the keyboard's focus is what draws the ring.
      await tab.focus();
      let reached = false;
      for (let i = 0; i < 12 && !reached; i += 1) {
        await page.keyboard.press('Tab');
        reached = await link.evaluate((el) => el === document.activeElement);
      }
      expect(reached, 'Tab reaches the link from the tab').toBe(true);
      await page.waitForTimeout(300);

      // The link wraps across lines where the panel is narrow, and the ring is
      // drawn around each line's own box: each line is measured on its own,
      // and the weakest line is the answer.
      const measure = async () => {
        const dpr = await page.evaluate(() => window.devicePixelRatio);
        const rects = await link.evaluate((el) =>
          [...el.getClientRects()].map((r) => ({
            x: r.left,
            y: r.top,
            width: r.width,
            height: r.height,
          }))
        );
        const pad = 6;
        const lines = [];
        for (const r of rects) {
          const png = await page.screenshot({
            clip: {
              x: Math.max(0, r.x - pad),
              y: Math.max(0, r.y - pad),
              width: r.width + 2 * pad,
              height: r.height + 2 * pad,
            },
            scale: 'device',
          });
          const w = Math.round((r.width + 2 * pad) * dpr);
          const h = Math.round((r.height + 2 * pad) * dpr);
          lines.push(
            await readLinkBox(
              page,
              png,
              { left: 0, top: 0, right: w, bottom: h },
              Math.round(3 * dpr)
            )
          );
        }
        const weakest = (key) => Math.min(...lines.map((l) => l[key]));
        return {
          lines: lines.length,
          textContrast: weakest('textContrast'),
          ringContrast: weakest('ringContrast'),
          detail: lines,
        };
      };
      const focused = await measure();
      expect(
        focused.ringContrast,
        `${look.name}: the focus ring against the panel: ${JSON.stringify(focused)}`
      ).toBeGreaterThanOrEqual(3);

      // At rest: the text itself against the panel, as text is held to.
      await page.keyboard.press('Shift+Tab');
      await page.mouse.move(1, 1);
      await page.waitForTimeout(300);
      const rest = await measure();
      expect(
        rest.textContrast,
        `${look.name}: the link's text against the panel: ${JSON.stringify(rest)}`
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});
