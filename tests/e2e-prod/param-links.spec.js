import { test, expect } from '@playwright/test';

// Production-parity proof for the shared parameter link (IR-1).
//
// The restore path reaches its validator through a dynamic
// `import('./validation-schemas.js')` inside state.js. Every other test of this
// feature runs against the dev server, which serves modules unbundled and sends
// no Content-Security-Policy; neither the built chunk graph nor the shipped
// `script-src` has ever carried that import. This lane makes both part of what
// green means.

const WASM_READY_TIMEOUT = 180_000;

test.describe('Shared parameter links behind the shipped CSP', () => {
  test('prod-param-link: a link restores its values in the built app, with no CSP violation', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations.push({
          directive: event.effectiveDirective || event.violatedDirective,
          blockedURI: event.blockedURI,
          sample: (event.sample || '').slice(0, 120),
        });
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });

    const fragment = `#v=1&params=${encodeURIComponent(
      JSON.stringify({ width: 77 })
    )}&big=keep-me-please`;

    const response = await page.goto(`/?example=simple-box${fragment}`);
    const servedCsp = response.headers()['content-security-policy'];
    expect(
      servedCsp,
      'the preview server must serve the production CSP, or this lane proves nothing'
    ).toContain("script-src 'self'");

    await page.waitForSelector('body[data-wasm-ready="true"]', {
      timeout: WASM_READY_TIMEOUT,
    });
    await page
      .locator('.param-control')
      .first()
      .waitFor({ state: 'attached', timeout: 60_000 });

    await expect(page.locator('#param-width')).toHaveValue('77', {
      timeout: 60_000,
    });

    const hash = await page.evaluate(() => window.location.hash);
    console.log('[prod-param-link] fragment after load:', hash);
    expect(
      hash,
      'the deep-link cleanup dropped a fragment key it did not write'
    ).toContain('big=keep-me-please');

    const violations = await page.evaluate(() => window.__cspViolations);
    console.log(
      '[prod-param-link] CSP violations:',
      JSON.stringify(violations)
    );
    expect(
      violations.filter((v) => v.directive !== 'style-src-elem'),
      'restoring a shared link violated the shipped CSP'
    ).toEqual([]);
  });
});
