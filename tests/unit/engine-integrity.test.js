import { describe, expect, it, vi } from 'vitest';
import {
  engineFileMismatch,
  fetchAndCheckEngineFile,
} from '../../src/worker/engine-integrity.js';

const bytes = (text) => new TextEncoder().encode(text).buffer;
const sha256 = async (buffer) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)),
    (b) => b.toString(16).padStart(2, '0')
  ).join('');
const response = (buffer) => ({
  ok: true,
  arrayBuffer: async () => buffer.slice(0),
});

describe('checking an engine file against INTEGRITY.json', () => {
  it('passes the file the manifest describes', async () => {
    const file = bytes('the engine');
    const expected = { size: file.byteLength, sha256: await sha256(file) };
    expect(await engineFileMismatch('openscad.wasm', file, expected)).toBeNull();
  });

  it('names a size that differs', async () => {
    expect(
      await engineFileMismatch('openscad.wasm', bytes('short'), { size: 99 })
    ).toBe('openscad.wasm: expected 99 bytes, got 5');
  });

  it('names a digest that differs when the size is the same', async () => {
    const file = bytes('an older engine');
    const other = bytes('a newer engine!');
    const expected = { size: file.byteLength, sha256: await sha256(other) };
    expect(await engineFileMismatch('openscad.wasm', file, expected)).toMatch(
      /^openscad\.wasm: SHA-256 mismatch \(expected [0-9a-f]{16}…, got [0-9a-f]{16}…\)$/
    );
  });

  it('checks the size alone when the page has no crypto.subtle', async () => {
    const file = bytes('the engine');
    const expected = { size: file.byteLength, sha256: 'f'.repeat(64) };
    expect(
      await engineFileMismatch('openscad.wasm', file, expected, null)
    ).toBeNull();
  });
});

describe('fetching an engine file that a cache got wrong', () => {
  const real = bytes('the engine the app was built with');
  const stale = bytes('an engine some cache kept from before');

  it('asks again past every cache and keeps that copy when it checks out', async () => {
    const expected = { size: real.byteLength, sha256: await sha256(real) };
    const fetchImpl = vi.fn(async (_url, init) =>
      response(init?.cache === 'reload' ? real : stale)
    );
    const result = await fetchAndCheckEngineFile(
      'openscad.wasm',
      '/wasm/openscad-official/openscad.wasm?v=1',
      expected,
      { refetch: true, fetchImpl }
    );
    expect(fetchImpl).toHaveBeenLastCalledWith(
      '/wasm/openscad-official/openscad.wasm?v=1',
      { cache: 'reload' }
    );
    expect(result.mismatch).toBeNull();
    expect(new Uint8Array(result.verified)).toEqual(new Uint8Array(real));
    expect(result.replaced).toMatch(/^openscad\.wasm: expected \d+ bytes/);
  });

  it('reports the mismatch when the fresh copy is wrong too', async () => {
    const expected = { size: real.byteLength, sha256: await sha256(real) };
    const fetchImpl = vi.fn(async () => response(stale));
    const result = await fetchAndCheckEngineFile('openscad.wasm', '/e', expected, {
      refetch: true,
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.verified).toBeNull();
    expect(result.mismatch).toMatch(/^openscad\.wasm: expected/);
  });

  it('fetches once when the first copy is right, or when asked not to refetch', async () => {
    const expected = { size: real.byteLength, sha256: await sha256(real) };
    const right = vi.fn(async () => response(real));
    expect(
      await fetchAndCheckEngineFile('openscad.wasm', '/e', expected, {
        refetch: true,
        fetchImpl: right,
      })
    ).toEqual({ mismatch: null, verified: null });
    expect(right).toHaveBeenCalledTimes(1);

    const wrong = vi.fn(async () => response(stale));
    const result = await fetchAndCheckEngineFile('openscad.js', '/e', expected, {
      fetchImpl: wrong,
    });
    expect(wrong).toHaveBeenCalledTimes(1);
    expect(result.mismatch).toMatch(/^openscad\.js: expected/);
  });
});
