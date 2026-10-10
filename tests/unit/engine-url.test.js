import { describe, expect, it } from 'vitest';
import { engineFileUrl } from '../../src/worker/engine-url.js';

const BASE = 'https://example.test/wasm/openscad-official';
const SHA = 'f71f40d457a9cb9710aa76a053881663ec267291381f5709f4809f98c3c6eff5';

describe('the engine file address', () => {
  it('names the build from INTEGRITY.json, so an old copy under the plain address is never used', () => {
    expect(
      engineFileUrl(BASE, { files: { 'openscad.wasm': { sha256: SHA } } })
    ).toBe(`${BASE}/openscad.wasm?v=f71f40d457a9cb97`);
  });

  it('falls back to the plain address when INTEGRITY.json could not be read', () => {
    expect(engineFileUrl(BASE, null)).toBe(`${BASE}/openscad.wasm`);
  });

  it('falls back to the plain address when the manifest gives no usable digest', () => {
    expect(engineFileUrl(BASE, { files: {} })).toBe(`${BASE}/openscad.wasm`);
    expect(
      engineFileUrl(BASE, { files: { 'openscad.wasm': { sha256: 'not a digest' } } })
    ).toBe(`${BASE}/openscad.wasm`);
  });

  it('versions any engine file the manifest lists', () => {
    expect(
      engineFileUrl(BASE, { files: { 'openscad.js': { sha256: SHA } } }, 'openscad.js')
    ).toBe(`${BASE}/openscad.js?v=f71f40d457a9cb97`);
  });
});
