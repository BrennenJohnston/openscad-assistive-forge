import { test, expect } from '@playwright/test';

// The braille engine under the SHIPPED headers.
//
// The dev lane proves translation against the dev server. This lane asks what
// the deployed site decides: is the binary served where the engine looks for
// it, does the Content-Security-Policy let the browser compile it, does the
// braille worker, a module worker since liblouis was rebuilt, start and
// translate under COOP and COEP, and are the license papers reachable beside
// the binary.

const WASM = '/wasm/liblouis/liblouis.wasm';

/** The same dismissal as tests/e2e/braille-card.spec.js: the prompt that
 * follows an example load takes clicks until it is closed. */
async function dismissSavePrompt(page) {
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 5000 });
    await notNow.click();
    await notNow.waitFor({ state: 'hidden', timeout: 5000 });
  } catch {
    // Prompt didn't appear
  }
}

test.describe('the liblouis wasm on the built site', () => {
  test('prod-liblouis-csp: the binary is served and compiled, and the worker translates', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations.push({
          directive: event.effectiveDirective || event.violatedDirective,
          blockedURI: event.blockedURI,
        });
      });
    });

    await page.goto('/?example=braille-sign');
    await expect(page.locator('#braillePanel')).toBeVisible({ timeout: 60_000 });
    await dismissSavePrompt(page);

    const result = await page.evaluate(async (wasmUrl) => {
      const response = await fetch(wasmUrl);
      if (!response.ok) return { status: response.status };
      const bytes = await response.arrayBuffer();
      await WebAssembly.compile(bytes);
      return {
        status: response.status,
        type: response.headers.get('content-type'),
        bytes: bytes.byteLength,
      };
    }, WASM);
    expect(result.status).toBe(200);
    expect(result.type).toContain('wasm');
    // The exact binary the recipe built and the README beside it describes.
    expect(result.bytes).toBe(164567);

    // The worker loads the engine and the shipped tables, then translates.
    const caps = page.locator('#brailleCapsToggle');
    if (!(await caps.isChecked())) await caps.check();
    await page.locator('#brailleTextInput').fill('Tee3D');
    await expect(
      page.locator('#braillePreview .braille-preview-braille').first()
    ).toHaveText('\u2820\u281E\u2811\u2811\u283C\u2809\u2820\u2819', {
      timeout: 60_000,
    });
    await expect(page.locator('#brailleErrors')).toBeEmpty();

    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);

    // The license and the recipe are part of what is distributed.
    for (const paper of [
      '/wasm/liblouis/COPYING.LESSER.liblouis',
      '/wasm/liblouis/README.txt',
      '/liblouis/NOTICE.txt',
    ]) {
      const served = await page.evaluate(async (url) => {
        const r = await fetch(url);
        return { status: r.status, text: (await r.text()).slice(0, 400) };
      }, paper);
      expect(served.status, paper).toBe(200);
      expect(served.text.length, paper).toBeGreaterThan(100);
    }
    const copying = await page.evaluate(async () => {
      const r = await fetch('/wasm/liblouis/COPYING.LESSER.liblouis');
      return (await r.text()).slice(0, 200);
    });
    expect(copying).toContain('GNU LESSER GENERAL PUBLIC LICENSE');
  });
});
