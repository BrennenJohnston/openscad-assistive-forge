import { test, expect } from '@playwright/test';
import path from 'path';

// Rendering through a bundled library, in the built app (UF-24, U-33, D-40).
//
// This lane is the only one that has the libraries at all. The four bundles
// are gitignored and fetched by the `prebuild` hook, which runs before
// `npm run build` and nowhere else; the dev-server lanes start with
// `npm run dev`, so public/libraries/ is empty there and a library case
// would fail for reasons that have nothing to do with the code. This lane
// builds, so its dist/ carries them.
//
// What it guards: mountLibraries used to lose every file after the first in
// any folder, because the guard meant to swallow "directory already exists"
// looked for a Node-style `code` property that Emscripten's FS.ErrnoError
// does not carry. MCAD lost 5 of 42 files, dotSCAD 692 of 695. The unit test
// in tests/unit/library-fs.test.js pins the mechanism on a required lane;
// this case pins the user-visible end of it.
//
// 268 is desktop OpenSCAD 2026.01.03's own count for this file at these
// parameters, rendering against the same pinned MCAD commit.

const WASM_READY_TIMEOUT = 180_000;
const DESKTOP_TRIANGLES = 268;

// A module three folders deep inside its bundle: NopSCADlib kept only 9 of
// its 389 files, and this include resolved to nothing.
const NESTED_FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'library-nested-include.scad'
);
const NESTED_DESKTOP_TRIANGLES = 140;

/** Wait for a full render and return the triangle count the status area prints. */
const renderAndCountTriangles = async (page) => {
  await page.locator('#primaryActionBtn').click();
  await expect
    .poll(
      () =>
        page.evaluate(() => document.getElementById('stats')?.innerText || ''),
      // Generous against a cold WASM start, but not so generous that a
      // regression costs the lane three minutes per case: the render itself
      // is measured in hundreds of milliseconds once the bundle is mounted.
      { timeout: 90_000 }
    )
    .toMatch(/Triangles:\s*[\d,]+/);

  const stats = await page.evaluate(
    () => document.getElementById('stats').innerText
  );
  return Number(/Triangles:\s*([\d,]+)/.exec(stats)[1].replace(/,/g, ''));
};

test.describe('Rendering through a library bundle', () => {
  test('prod-library-render: MCAD resolves and produces desktop geometry', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const mountWarnings = [];
    page.on('console', (message) => {
      if (/Failed to mount/.test(message.text())) {
        mountWarnings.push(message.text());
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      localStorage.removeItem('openscad-forge-libraries');
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
      );
    });

    // The premise, asserted rather than assumed: without the bundle on the
    // server this lane would prove nothing, and a silent pass would be worse
    // than a failure.
    const manifest = await page.request.get('/libraries/MCAD/manifest.json');
    expect(
      manifest.ok(),
      'the built site must serve the MCAD bundle, or this lane proves nothing'
    ).toBe(true);

    await page.goto('/?example=library-test');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });

    // The example is detected as needing MCAD and enables it without asking.
    await expect
      .poll(
        () => page.evaluate(() => window.libraryManager.getEnabled().length),
        { timeout: 30_000 }
      )
      .toBe(1);

    // Its default style is the library-free branch, so the library only has
    // to resolve once "Rounded" is chosen.
    await page.evaluate(() => {
      let node = document.querySelector('#param-style')?.parentElement;
      while (node) {
        if (node.tagName === 'DETAILS') node.open = true;
        node = node.parentElement;
      }
    });
    await page.locator('#param-style').selectOption('Rounded');

    const triangles = await renderAndCountTriangles(page);

    expect(
      triangles,
      `desktop OpenSCAD renders this file at ${DESKTOP_TRIANGLES} triangles`
    ).toBe(DESKTOP_TRIANGLES);

    expect(
      mountWarnings,
      'every file of an enabled bundle must reach the virtual filesystem'
    ).toEqual([]);
  });

  test('prod-library-off: switching a needed library off says so (D-42)', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      localStorage.removeItem('openscad-forge-libraries');
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
      );
    });

    await page.goto('/?example=library-test');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });

    // The parameter panel is built after the file loads; wait for the control
    // itself rather than for a fixed time, then open the group it sits in.
    await page
      .locator('#param-style')
      .waitFor({ state: 'attached', timeout: 60_000 });
    await page.evaluate(() => {
      let node = document.querySelector('#param-style')?.parentElement;
      while (node) {
        if (node.tagName === 'DETAILS') node.open = true;
        node = node.parentElement;
      }
    });
    await page.locator('#param-style').selectOption('Rounded');
    await expect(page.locator('#library-MCAD')).toBeChecked();

    // Switch off the library the model needs.
    await page.locator('#library-MCAD').uncheck();

    // The cause must be named. Before this release the user was told
    // "Something Went Wrong ... try resetting parameters to defaults", and
    // then "This selection produces no geometry with the current settings" —
    // both pointing at parameters, which is not where the answer is.
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.getElementById('statusArea')?.textContent || ''
          ),
        { timeout: 90_000 }
      )
      .toContain('MCAD library, which is switched off');

    const status = await page.evaluate(
      () => document.getElementById('statusArea').textContent
    );
    expect(status).toContain('Libraries panel');
    expect(status).not.toContain('resetting parameters');
    expect(status).not.toContain('current settings');
  });

  test('prod-library-nested: a module three folders deep inside a bundle resolves', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      localStorage.removeItem('openscad-forge-libraries');
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
      );
    });

    await page.goto('/');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });

    await page.locator('#fileInput').setInputFiles(NESTED_FIXTURE);
    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 60_000,
    });
    const notNow = page.locator('#saveProjectNotNow');
    try {
      await notNow.waitFor({ state: 'visible', timeout: 4_000 });
      await notNow.click();
    } catch {
      // No save-project modal to dismiss.
    }

    const triangles = await renderAndCountTriangles(page);

    expect(
      triangles,
      `desktop OpenSCAD renders this file at ${NESTED_DESKTOP_TRIANGLES} triangles`
    ).toBe(NESTED_DESKTOP_TRIANGLES);
  });
});
