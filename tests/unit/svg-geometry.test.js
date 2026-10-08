/**
 * The drawing geometry loads on demand.
 *
 * The preparer, the editor workspace, the nesting tree and the clipping
 * library under them are the largest part of the app that most models never
 * use, so they are not in the first download: svg-geometry.js loads them the
 * first time a picture needs them. These tests pin the loader's promises and
 * the rule that keeps the chunk out of the core: the parameter UI, the file
 * handler and the app's entry never import the geometry statically.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('the drawing geometry loader', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('../../src/js/hole-placement.js');
  });

  it('refuses to hand out the geometry before a load has resolved', async () => {
    const geo = await import('../../src/js/svg-geometry.js');
    expect(geo.isSvgGeometryLoaded()).toBe(false);
    expect(() => geo.svgGeometry()).toThrow(/before it loaded/);
  });

  it('loads the modules once and hands the same ones out after', async () => {
    const geo = await import('../../src/js/svg-geometry.js');
    const first = await geo.loadSvgGeometry();
    expect(typeof first.preparer.analyzeSvg).toBe('function');
    expect(typeof first.workspace.createSvgPrepWorkspace).toBe('function');
    expect(typeof first.nesting.buildNestingTree).toBe('function');
    expect(typeof first.creditLine.removeCreditLineAsync).toBe('function');
    expect(typeof first.holes.checkHolePlacement).toBe('function');
    expect(typeof first.bridges.buildBridges).toBe('function');
    expect(geo.isSvgGeometryLoaded()).toBe(true);
    expect(geo.svgGeometry()).toBe(first);
    expect(await geo.loadSvgGeometry()).toBe(first);
  });

  it('two callers before the load lands share one load', async () => {
    const geo = await import('../../src/js/svg-geometry.js');
    const [a, b] = await Promise.all([
      geo.loadSvgGeometry(),
      geo.loadSvgGeometry(),
    ]);
    expect(a).toBe(b);
  });

  it('does not keep a failed load, so the next picture tries again', async () => {
    let fail = true;
    vi.doMock('../../src/js/hole-placement.js', async (importOriginal) => {
      if (fail) throw new Error('offline');
      return importOriginal();
    });
    const geo = await import('../../src/js/svg-geometry.js');
    // The test runner wraps the factory's error in its own message.
    await expect(geo.loadSvgGeometry()).rejects.toThrow();
    expect(geo.isSvgGeometryLoaded()).toBe(false);
    expect(() => geo.svgGeometry()).toThrow(/before it loaded/);

    fail = false;
    const geometry = await geo.loadSvgGeometry();
    expect(typeof geometry.holes.checkHolePlacement).toBe('function');
    expect(geo.isSvgGeometryLoaded()).toBe(true);
  });
});

describe('the geometry stays out of the first download', () => {
  const GEOMETRY = [
    'svg-preparer',
    'svg-preparer-workspace',
    'svg-nesting',
    'credit-line',
    'hole-placement',
    'stencil-bridges',
  ];

  for (const file of [
    'src/main.js',
    'src/js/ui-generator.js',
    'src/js/file-handler.js',
  ]) {
    it(`${file} does not import the drawing geometry statically`, () => {
      const code = readFileSync(resolve(process.cwd(), file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      const imports = code.match(/^import[\s\S]*?from\s+'[^']+';/gm) || [];
      expect(imports.length).toBeGreaterThan(0);
      for (const line of imports) {
        for (const name of GEOMETRY) {
          expect(line).not.toMatch(new RegExp(`/${name}\\.js'`));
        }
      }
    });
  }
});

describe('the numbers the customizer reads while it renders', () => {
  it('are the ones the geometry modules use', async () => {
    const limits = await import('../../src/js/svg-limits.js');
    const preparer = await import('../../src/js/svg-preparer.js');
    const nesting = await import('../../src/js/svg-nesting.js');
    const workspace = await import('../../src/js/svg-preparer-workspace.js');
    expect(preparer.LAYER_EMIT_CAP).toBe(limits.LAYER_EMIT_CAP);
    expect(nesting.LAYER_CAP).toBe(limits.LAYER_CAP);
    expect(workspace.DEFAULT_DESIGN_WIDTH_MM).toBe(
      limits.DEFAULT_DESIGN_WIDTH_MM
    );
  });
});
