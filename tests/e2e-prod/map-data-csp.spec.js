import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// The map data hosts under the SHIPPED headers.
//
// A map from an address reaches the hosts the browser must be allowed to
// contact: Nominatim for the address, OpenStreetMap US's map tiles for the
// map data and two Overpass servers when the tiles fail (the main one first,
// VK Maps' when the main one refuses the site), the terrain tiles on S3 for
// the slopes, and Transitous for a route map's journeys. The dev server serves no
// Content-Security-Policy, so only this lane can say the deployed site lets
// those requests leave the browser, and that nothing else in the policy
// moved when the hosts were added.

const HOSTS = [
  'https://tiles.openstreetmap.us',
  'https://overpass-api.de',
  'https://maps.mail.ru',
  'https://nominatim.openstreetmap.org',
  'https://s3.amazonaws.com',
  'https://api.transitous.org',
];

/** The CSP line of public/_headers' global block, as the preview server reads it. */
function committedPolicy() {
  const raw = readFileSync('public/_headers', 'utf8');
  let inGlobal = false;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inGlobal = line.trim() === '/*';
      continue;
    }
    if (!inGlobal) continue;
    const at = line.indexOf(':');
    if (line.slice(0, at).trim() === 'Content-Security-Policy') {
      return line.slice(at + 1).trim();
    }
  }
  throw new Error(
    'public/_headers has no Content-Security-Policy in its /* block'
  );
}

test.describe('the map data hosts under the shipped CSP', () => {
  test('prod-map-data-csp: connect-src names the map hosts, and the served policy is the committed line', async ({
    page,
  }) => {
    const response = await page.goto('/');
    const served = response.headers()['content-security-policy'];
    expect(
      served,
      'the preview server must serve the production CSP, or this lane proves nothing'
    ).toContain('connect-src');
    expect(served).toBe(committedPolicy());

    const connect = served
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('connect-src'));
    for (const host of HOSTS) {
      expect(connect.split(/\s+/), `${host} in connect-src`).toContain(host);
    }

    // The policy around the map hosts is the one the app shipped with.
    expect(served).toContain("default-src 'self'");
    expect(served).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(served).not.toContain('unsafe-inline');
    expect(served).not.toContain("'unsafe-eval'");
    expect(served).toContain("frame-ancestors 'none'");
  });
});
