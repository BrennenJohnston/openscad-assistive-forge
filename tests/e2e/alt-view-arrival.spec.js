/**
 * Finding the Alt View: the key drops from the top of the screen into its
 * place beside the theme button, the buttons after it making room, wearing
 * the Alt View's own colors; then it redraws itself into the ordinary key.
 * With reduced motion it simply appears.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import { announcementsSince, recordAnnouncements } from './helpers/invariants.js';

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
    if (i === SEQUENCE.length - 1) before = await page.evaluate(() => performance.now());
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  return before;
}

// Every sound the page starts: when, and how long it lasts.
async function listenForSound(page) {
  await page.addInitScript(() => {
    window.__sounds = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.__sounds.push({ at: performance.now(), seconds: this.buffer?.duration ?? null });
      return start.apply(this, args);
    };
  });
}

const sentences = async (page) =>
  (await announcementsSince(page, 0)).filter((a) => a.text === SENTENCE);

// Whether this browser can start a sound at all: some test machines have no
// sound device, and an audio context there never starts. The next press on
// the page tries one of its own; read the answer after it.
async function probeSound(page) {
  await page.evaluate(() => {
    window.__canSound = new Promise((resolve) => {
      document.addEventListener(
        'click',
        () => {
          const Context = window.AudioContext || window.webkitAudioContext;
          if (!Context) return resolve(false);
          const context = new Context();
          const timer = setTimeout(() => resolve(false), 1_000);
          context.resume().then(() => {
            clearTimeout(timer);
            resolve(context.state === 'running');
          });
        },
        { capture: true, once: true }
      );
    });
  });
}

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
    await expect(key).not.toHaveAttribute('data-arrival', /.+/, { timeout: 12_000 });
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
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
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
      !(await page.evaluate(() => window.__canSound)),
      'this browser cannot start a sound here (no sound device)'
    );

    await expect
      .poll(() => page.evaluate(() => window.__sounds.length), { timeout: 5_000 })
      .toBe(1);
    const [sound] = await page.evaluate(() => window.__sounds);
    expect(sound.seconds).toBeCloseTo(3.8, 1);
    expect(sound.at - pressed).toBeLessThan(1_000);

    await expect.poll(async () => (await sentences(page)).length, { timeout: 10_000 }).toBe(1);
    const [said] = await sentences(page);
    expect(said.t - sound.at).toBeGreaterThanOrEqual(3_800);
    await page.waitForTimeout(1_000);
    expect(await sentences(page)).toHaveLength(1);
  });

  test('with sounds off, no tune, and the sentence comes at once', async ({ page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-sounds', 'false');
    });
    await recordAnnouncements(page);
    await listenForSound(page);
    await openBox(page);
    const pressed = await playSequence(page);

    await expect.poll(async () => (await sentences(page)).length, { timeout: 5_000 }).toBe(1);
    const [said] = await sentences(page);
    expect(said.t - pressed).toBeLessThan(2_000);
    await page.waitForTimeout(1_000);
    expect(await page.evaluate(() => window.__sounds)).toEqual([]);
  });

  test('Preferences offers it, on to begin with', async ({ page }) => {
    test.setTimeout(240_000);
    await openBox(page);
    await page.locator('#editMenuBtn').click();
    await page.getByRole('menuitem', { name: /Preferences/ }).first().click();
    await page.locator('#prefs-tab-advanced').click();
    const sounds = page.getByRole('checkbox', { name: 'Play sounds' });
    await expect(sounds).toBeVisible();
    await expect(sounds).toBeChecked();
    await sounds.uncheck();
    expect(await page.evaluate(() => localStorage.getItem('openscad-forge-sounds'))).toBe(
      'false'
    );
  });
});
