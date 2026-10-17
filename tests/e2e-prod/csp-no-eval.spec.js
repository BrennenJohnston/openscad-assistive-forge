import { test, expect } from '@playwright/test';

// The page runs no text as code: under the shipped Content-Security-Policy,
// which allows no 'unsafe-eval', the Main Page and an example load with no
// policy violation and the engine ready. (WebAssembly still compiles under
// 'wasm-unsafe-eval'.)

const WASM_READY_TIMEOUT = 180_000;

test.describe('No code compiled from text', () => {
  test('the Main Page and an example load with no CSP violation', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations.push(
          `${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`
        );
      });
    });

    const response = await page.goto('/');
    const csp = response.headers()['content-security-policy'] || '';
    expect(csp, 'the shipped policy is served').toContain('script-src');
    expect(csp).not.toContain("'unsafe-eval'");
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });

    await page.goto('/?example=simple-box');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await page
      .locator('.param-control')
      .first()
      .waitFor({ state: 'attached', timeout: 60_000 });
    await page.waitForTimeout(2000);

    const violations = await page.evaluate(() => window.__cspViolations);
    expect(violations).toEqual([]);
  });
});
