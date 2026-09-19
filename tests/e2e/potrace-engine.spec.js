import { test, expect } from '@playwright/test';

// DP-43 P2: the Potrace engine, in a real browser, through the real worker.
//
// The unit tests run the wasm in node, which proves it traces. They cannot
// prove the thing that actually breaks here: a module worker importing a wasm
// module off the same origin, under this app's COOP and COEP headers. D-31 and
// D-133 were both exactly that failure, in that place, and neither showed up
// anywhere but a browser.
//
// So this drives `createTraceRunner` - the same runner the file control uses -
// and asks for each engine in turn on the same picture.

test.describe('the Potrace engine in the browser', () => {
  test('traces through a module worker, on either engine', async ({ page }) => {
    test.setTimeout(120_000);

    const refusals = [];
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations.push({
          directive: event.effectiveDirective || event.violatedDirective,
          blockedURI: event.blockedURI,
        });
      });
    });
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (
        /Cross-Origin-Embedder-Policy|Content Security Policy|Refused to/i.test(
          text
        )
      ) {
        refusals.push(text);
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async () => {
      const { createTraceRunner } = await import('/src/js/trace-runner.js');

      // A ring: a black square with a square hole cut out of it. Its ink covers
      // about a third of the picture, well clear of the half-coverage line
      // where Line art decides a drawing was made light-on-dark and flips it.
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000000';
      ctx.fillRect(12, 12, 40, 40);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(28, 28, 16, 16);
      const picture = ctx.getImageData(0, 0, size, size);

      const traceWith = async (engine) => {
        const runner = createTraceRunner();
        const stages = [];
        try {
          const out = await runner.start(
            picture,
            { mode: 'lineart' },
            { engine, onStage: (s) => stages.push(s.stage) }
          );
          return { engine: out.engine, svg: out.svg, stages };
        } finally {
          runner.destroy();
        }
      };

      return {
        imagetracer: await traceWith('imagetracer'),
        potrace: await traceWith('potrace'),
      };
    });

    // Both engines answer, and both say which one answered.
    expect(result.imagetracer.engine).toBe('imagetracer');
    expect(result.potrace.engine).toBe('potrace');
    expect(result.imagetracer.stages).toEqual(['reading', 'ink', 'tracing']);
    expect(result.potrace.stages).toEqual(['reading', 'ink', 'tracing']);
    expect(result.imagetracer.svg).toContain('<path');

    // Potrace draws one path, filled even-odd, holding two closed shapes: the
    // outer boundary and the square that was cut out of it. One shape would
    // mean the hole was lost, and the charm would print solid.
    expect(result.potrace.svg).toContain('fill-rule="evenodd"');
    expect(result.potrace.svg).toContain('width="64" height="64"');
    const d = result.potrace.svg.match(/ d="([^"]+)"/)?.[1] ?? '';
    expect(d.match(/M/g) ?? []).toHaveLength(2);

    // And the drawing is where the square was. Orientation is settled by the
    // single-pixel test in tests/unit/potrace-trace.test.js; this is about the
    // picture surviving the trip through a worker intact.
    const numbers = d
      .replace(/[MCLZ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map(Number);
    const xs = numbers.filter((_, i) => i % 2 === 0);
    const ys = numbers.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(11);
    expect(Math.max(...xs)).toBeLessThanOrEqual(53);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(11);
    expect(Math.max(...ys)).toBeLessThanOrEqual(53);

    // ★ Nothing was refused on the way. This is the measurement D-31 and D-133
    // would each have failed.
    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
    expect(refusals).toEqual([]);
  });
});
