/**
 * DP-79: the photo defaults inside the trace worker (D-173, D-176). The same
 * harness as trace-worker.test.js: a stood-in `self`, the real stages on real
 * pixels, Potrace stood in for so what it is HANDED can be read.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const posted = [];
const fakeSelf = {
  onmessage: null,
  postMessage: (message) => posted.push(message),
};
vi.stubGlobal('self', fakeSelf);

const potraceTrace = vi.fn(async () => 'M0 0L1 0L1 1Z');
vi.mock('../../src/js/potrace-trace.js', async (importActual) => {
  const actual = await importActual();
  return { ...actual, trace: (...args) => potraceTrace(...args) };
});

await import('../../src/js/trace-worker.js');

/**
 * A white picture with a big block and a five-pixel speck, at any size. Five,
 * not two: worked at the print's cell (2.5 times smaller here) a two-pixel
 * speck is a faint smudge the ink threshold may not keep, and the floor can
 * only count what the mask still holds.
 */
function speckled(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  const ink = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  };
  ink(
    Math.floor(width * 0.2),
    Math.floor(height * 0.2),
    Math.floor(width * 0.4),
    Math.floor(height * 0.4)
  );
  ink(Math.floor(width * 0.8), Math.floor(height * 0.1), 5, 5);
  return { width, height, buffer: data.buffer };
}

/**
 * A long bar with forty seven-pixel specks around it: the shape of D-176.
 * Worked 2.5 times smaller each speck is about three pixels square, nine
 * ridge pixels of width one against the bar's five hundred or so, so the
 * tenth percentile of the line widths IS the specks until the floor takes
 * them (49 source pixels is 8 worked ones, far under the 160-pixel floor).
 */
function barAndSpecks(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  const ink = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  };
  ink(
    Math.floor(width * 0.1),
    Math.floor(height * 0.45),
    Math.floor(width * 0.8),
    Math.floor(height * 0.04)
  );
  for (let k = 0; k < 40; k++) {
    ink(
      Math.floor(width * (0.1 + (k % 8) * 0.1)),
      Math.floor(height * (k < 20 ? 0.1 + Math.floor(k / 8) * 0.08 : 0.7 + Math.floor((k - 20) / 8) * 0.08)),
      7,
      7
    );
  }
  return { width, height, buffer: data.buffer };
}

/** One job's messages, as a COPY: a later run clears the shared array. */
async function run(message) {
  posted.length = 0;
  await fakeSelf.onmessage({ data: message });
  return posted.slice();
}
const done = (messages) => messages.find((m) => m.type === 'done');

const camera = { camera: true, mmPerPixel: 14 / 1400 };

describe('the photo defaults (DP-79, D-173, D-176)', () => {
  beforeEach(() => {
    posted.length = 0;
    potraceTrace.mockClear();
  });

  it("★ a camera picture with a printed width is worked at the print's cell, and the summary says so", async () => {
    const out = await run({
      id: 1,
      image: speckled(1400, 1000),
      ink: { mode: 'lineart', ...camera },
      engine: 'potrace',
    });
    const reply = done(out);
    expect(reply.summary.working).toEqual({
      from: 1400,
      width: 560,
      height: 400,
      factor: 2.5,
      printedWidthMm: 14,
    });
    expect(reply.summary.printedWidthMm).toBe(14);
    // Potrace was handed the worked mask, not the source.
    expect(potraceTrace.mock.calls[0][1]).toBe(560);
    expect(potraceTrace.mock.calls[0][2]).toBe(400);
    expect(reply.svg).toContain('width="560" height="400"');
  });

  it("★ a picture over the cap keeps its printed width: the cap's factor rescales the millimeters per pixel", async () => {
    // 2000 x 1500 is 3 MP: the cap halves it first. The host's mmPerPixel is
    // for the 2000 source pixels; carried across the cap it is twice that,
    // and the working resolution and the floor follow the PRINT (14 mm, 560
    // px, 160 px) and not the cap. MEASURED before this on the sharpie
    // photograph (capped by four): "the size a 1.9 mm design can use" for a
    // 7.6 mm print, and a floor sixteen times too strict.
    const out = await run({
      id: 11,
      image: speckled(2000, 1500),
      ink: { mode: 'lineart', camera: true, mmPerPixel: 14 / 2000, speckFloor: true },
      engine: 'potrace',
    });
    const reply = done(out);
    expect(reply.summary.downscale.factor).toBe(2);
    expect(reply.summary.working).toMatchObject({
      from: 1000,
      width: 560,
      printedWidthMm: 14,
    });
    expect(reply.summary.printedWidthMm).toBe(14);
    expect(potraceTrace.mock.calls[0][3].turdsize).toBe(160);
  });

  it('a file is left at its own pixels, whatever the host knows about its width', async () => {
    const out = await run({
      id: 2,
      image: speckled(1400, 1000),
      ink: { mode: 'lineart', camera: false, mmPerPixel: 14 / 1400 },
      engine: 'potrace',
    });
    expect(done(out).summary.working).toBeUndefined();
    expect(potraceTrace.mock.calls[0][1]).toBe(1400);
  });

  it("★ the speck floor drops what is under 0.1 mm² and sets Potrace's floor to match", async () => {
    const out = await run({
      id: 3,
      image: speckled(1400, 1000),
      ink: { mode: 'lineart', ...camera, speckFloor: true },
      engine: 'potrace',
    });
    const reply = done(out);
    expect(reply.summary.specksDropped).toBeGreaterThanOrEqual(1);
    expect(reply.summary.speckFloorMm2).toBe(0.1);
    // At 0.025 mm per pixel the floor is 160 px (asked at DP-Q73 (a)).
    expect(potraceTrace.mock.calls[0][3].turdsize).toBe(160);
    expect(potraceTrace.mock.calls[0][3].opttolerance).toBe(1.0);
  });

  it('with the switches off the trace is the trace it was, at the worked size', async () => {
    const out = await run({
      id: 4,
      image: speckled(1400, 1000),
      ink: { mode: 'lineart', ...camera, speckFloor: false, smooth: false },
      engine: 'potrace',
    });
    const reply = done(out);
    expect(reply.summary.specksDropped).toBe(0);
    expect(reply.summary.denoised).toBe(false);
    expect(potraceTrace.mock.calls[0][3]).toEqual({ opttolerance: 1.0 });
  });

  it('★ the line widths are measured after the floor (D-176)', async () => {
    const raw = await run({
      id: 5,
      image: barAndSpecks(1400, 1000),
      ink: { mode: 'lineart', ...camera, speckFloor: false },
      engine: 'potrace',
    });
    const floored = await run({
      id: 6,
      image: barAndSpecks(1400, 1000),
      ink: { mode: 'lineart', ...camera, speckFloor: true },
      engine: 'potrace',
    });
    // Before the floor the thinnest things in the mask were the specks, and
    // the advisory would have called a 16-pixel bar a couple of pixels wide
    // (the sharpie photograph: 0.01 mm said, 0.28 mm drawn).
    expect(done(floored).summary.specksDropped).toBeGreaterThanOrEqual(30);
    expect(done(raw).summary.lineWidthPx.p10).toBeLessThan(5);
    expect(done(floored).summary.lineWidthPx.p10).toBeGreaterThan(10);
  });

  it('Colors takes the floor at the printed size only with its switch on', async () => {
    const on = await run({
      id: 7,
      image: speckled(1400, 1000),
      ink: { mode: 'colours', colourCount: 2, ...camera, speckFloor: true },
    });
    expect(done(on).summary.speckFloorMm2).toBe(0.1);
    expect(done(on).summary.working.width).toBe(560);
    const off = await run({
      id: 8,
      image: speckled(1400, 1000),
      ink: { mode: 'colours', colourCount: 2, ...camera, speckFloor: false },
    });
    expect(done(off).summary.speckFloorMm2).toBeNull();
    expect(done(off).summary.specksDropped).toBe(0);
  });

  it('Light and dark on a camera picture is worked and smoothed, and says so', async () => {
    const out = await run({
      id: 9,
      image: speckled(1400, 1000),
      ink: { mode: 'standard', ...camera, smooth: true },
    });
    const reply = done(out);
    expect(reply.engine).toBe('imagetracer');
    expect(reply.summary.working.width).toBe(560);
    expect(reply.summary.smoothed).toBe(true);
  });

  it('a picture the host says nothing about is untouched: no working, no floor, no median', async () => {
    const out = await run({
      id: 10,
      image: speckled(600, 400),
      ink: { mode: 'lineart' },
      engine: 'potrace',
    });
    const reply = done(out);
    expect(reply.summary.working).toBeUndefined();
    expect(reply.summary.specksDropped).toBe(0);
    expect(reply.summary.denoised).toBe(false);
    expect(potraceTrace.mock.calls[0][3]).toEqual({ opttolerance: 1.0 });
  });
});
