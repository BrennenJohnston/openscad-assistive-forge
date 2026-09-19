import { test, expect } from '@playwright/test';

// The zero-hosting lane, behind the shipped CSP (IR-3).
//
// `?manifest=data:application/json;base64,…` lets someone share a project with
// no repository and no account. It was measured against the dev server, which
// sends no Content-Security-Policy at all; the deployed site's `connect-src`
// lists `data:` by its text, and this lane is what turns that reading into a
// measurement. The contract documents the lane, so the contract needs a test.

const SCAD = 'width = 30; // [10:100]\ncube([width, 20, 10]);\n';

const dataUrl = (mime, text) =>
  `data:${mime};base64,${Buffer.from(text).toString('base64')}`;

test.describe('The data: manifest lane behind the shipped CSP', () => {
  test('prod-data-lane: a project carried inside the link loads, with its settings', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations.push({
          directive: event.effectiveDirective || event.violatedDirective,
          blockedURI: event.blockedURI,
        });
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });

    // A data: file URL needs its name on the end: files.main must still end in
    // .scad, and the fragment is where the name can live.
    const manifest = {
      forgeManifest: '1.0',
      name: 'Data Lane Box',
      author: 'Contract test',
      files: { main: `${dataUrl('text/plain', SCAD)}#box.scad` },
      defaults: { autoPreview: false },
    };
    const manifestUrl = dataUrl(
      'application/json',
      JSON.stringify(manifest)
    );
    const fragment = `#v=1&params=${encodeURIComponent(
      JSON.stringify({ width: 77 })
    )}`;
    const target = `/?manifest=${encodeURIComponent(manifestUrl)}${fragment}`;

    // The contract promises this lane under about 8 KB of whole URL. A probe
    // that has quietly grown past that would be testing something the contract
    // does not promise.
    console.log('[prod-data-lane] URL length:', target.length);
    expect(target.length).toBeLessThan(8 * 1024);

    const response = await page.goto(target);
    expect(
      response.headers()['content-security-policy'],
      'the preview server must serve the production CSP, or this lane proves nothing'
    ).toContain('connect-src');

    await page.waitForSelector('body[data-wasm-ready="true"]', {
      timeout: 180_000,
    });
    await page
      .locator('.param-control')
      .first()
      .waitFor({ state: 'attached', timeout: 60_000 });

    // The manifest loaded from inside the link, and the settings fragment
    // survived beside it.
    await expect(page.locator('#param-width')).toHaveValue('77', {
      timeout: 60_000,
    });

    const violations = await page.evaluate(() => window.__cspViolations);
    console.log(
      '[prod-data-lane] violations:',
      JSON.stringify(violations.filter((v) => v.directive === 'connect-src'))
    );
    expect(
      violations.filter((v) => v.directive === 'connect-src'),
      'the data: manifest lane is blocked by the shipped CSP'
    ).toEqual([]);
  });
});
