import { test, expect } from '@playwright/test';

// DP-43: the Potrace wasm under the SHIPPED headers.
//
// The dev lane proves the whole path - runner, module worker, trace - against
// the dev server. This lane asks the narrower question the deployed site
// decides: is the binary served where the app looks for it, does a same-origin
// fetch survive COOP and COEP, and does the Content-Security-Policy allow the
// browser to compile it? `wasm-unsafe-eval` is already required by the OpenSCAD
// engine, so no header change was expected here - but expected is not measured,
// and D-31 and D-133 were both a header refusing something nobody had checked.
//
// It also checks the licence papers are actually reachable. Shipping GPL
// software means the notice travels with the binary, and a file nobody can
// fetch is not a notice.

const WASM = '/wasm/potrace/potrace.wasm';

test.describe('the Potrace wasm on the built site', () => {
  test('prod-potrace-csp: the binary is served, fetched and compiled', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations.push({
          directive: event.effectiveDirective || event.violatedDirective,
          blockedURI: event.blockedURI,
        });
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async (wasmUrl) => {
      const response = await fetch(wasmUrl);
      if (!response.ok) return { status: response.status };
      const bytes = await response.arrayBuffer();
      const compiled = await WebAssembly.compile(bytes);
      return {
        status: response.status,
        type: response.headers.get('content-type'),
        bytes: bytes.byteLength,
        // The exports the app actually calls, read off the compiled module.
        exports: WebAssembly.Module.exports(compiled)
          .map((e) => e.name)
          .sort(),
      };
    }, WASM);

    expect(result.status).toBe(200);
    expect(result.type).toContain('wasm');
    // The exact binary the recipe built and the README records the sum of.
    expect(result.bytes).toBe(41705);

    // Emscripten shortens export names, so the app's five functions arrive as
    // single letters. What matters is that the module compiled and carries the
    // memory and the table the loader binds to.
    expect(result.exports).toContain('b');
    expect(result.exports.length).toBeGreaterThanOrEqual(7);

    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);

    // The licence and the recipe are part of what is distributed, not notes
    // left behind in the repository.
    for (const paper of ['/wasm/potrace/COPYING.potrace', '/wasm/potrace/README.txt']) {
      const served = await page.evaluate(async (url) => {
        const r = await fetch(url);
        return { status: r.status, text: (await r.text()).slice(0, 400) };
      }, paper);
      expect(served.status).toBe(200);
      expect(served.text.length).toBeGreaterThan(100);
    }

    const copying = await page.evaluate(async () => {
      const r = await fetch('/wasm/potrace/COPYING.potrace');
      return (await r.text()).slice(0, 200);
    });
    expect(copying).toContain('GNU GENERAL PUBLIC LICENSE');
  });
});
