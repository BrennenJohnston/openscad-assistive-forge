import { test, expect } from '@playwright/test';

// Which hosts a manifest may actually point at (IR-2 / D-96).
//
// The sharing guide told authors to put absolute `https://github.com/...`
// release URLs and Cloudflare R2 / S3 URLs in `files.bundle`. `connect-src`
// (public/_headers) lists raw.githubusercontent.com, media.githubusercontent.com,
// *.github.io, *.gitlab.io and *.pages.dev - not github.com, not any object
// store. On the deployed site those fetches never leave the browser.
//
// This lane measures that rather than reading the header text back. Requests
// are routed to a local fulfilment, so an ALLOWED host proves itself by the
// route being reached and a BLOCKED host proves itself by never getting there:
// CSP stops the request in the renderer, before the network stack.

const ALLOWED = 'https://raw.githubusercontent.com/u/r/main/forge-manifest.json';
const BLOCKED = 'https://github.com/u/r/releases/download/v1/project.zip';
const BLOCKED_R2 = 'https://example-bucket.r2.cloudflarestorage.com/project.zip';

test.describe('Manifest hosting under the shipped CSP', () => {
  test('prod-hosting-csp: connect-src decides which hosts a manifest can name', async ({
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

    const reached = [];
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === ALLOWED || url === BLOCKED || url === BLOCKED_R2) {
        reached.push(url);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{}',
        });
        return;
      }
      await route.continue();
    });

    const response = await page.goto('/');
    expect(
      response.headers()['content-security-policy'],
      'the preview server must serve the production CSP, or this lane proves nothing'
    ).toContain('connect-src');

    const results = await page.evaluate(
      async ([allowed, blocked, blockedR2]) => {
        const attempt = async (url) => {
          try {
            await fetch(url, { mode: 'cors' });
            return 'fetched';
          } catch (error) {
            return `refused: ${error.name}`;
          }
        };
        return {
          allowed: await attempt(allowed),
          blocked: await attempt(blocked),
          blockedR2: await attempt(blockedR2),
        };
      },
      [ALLOWED, BLOCKED, BLOCKED_R2]
    );

    const violations = await page.evaluate(() => window.__cspViolations);
    console.log('[prod-hosting-csp] fetch results:', JSON.stringify(results));
    console.log('[prod-hosting-csp] reached the network layer:', reached);
    console.log(
      '[prod-hosting-csp] violations:',
      JSON.stringify(violations.filter((v) => v.directive === 'connect-src'))
    );

    expect(
      reached,
      'raw.githubusercontent.com is on the allowlist and must reach the network layer'
    ).toContain(ALLOWED);
    expect(
      reached,
      'a github.com release asset URL must never leave the renderer'
    ).not.toContain(BLOCKED);
    expect(
      reached,
      'an object-storage URL must never leave the renderer'
    ).not.toContain(BLOCKED_R2);

    const blockedUris = violations
      .filter((v) => v.directive === 'connect-src')
      .map((v) => v.blockedURI);
    expect(blockedUris.some((u) => u.includes('github.com'))).toBe(true);
    expect(blockedUris.some((u) => u.includes('r2.cloudflarestorage.com'))).toBe(
      true
    );
  });
});
