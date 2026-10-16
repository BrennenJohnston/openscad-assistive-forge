/**
 * The Alt View's switch sounds: three recordings played whole, each fetched
 * and decoded once, one at a time, the newest asked for winning.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SOUNDS_DIR = resolve(__dirname, '../../public/sounds');
const FILES = ['crt-on.wav', 'crt-look.wav', 'crt-off.wav'];
const DURATIONS = {
  '/sounds/crt-on.wav': 2.21,
  '/sounds/crt-look.wav': 0.8,
  '/sounds/crt-off.wav': 2.17,
};

function wavHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at) => String.fromCharCode(...bytes.subarray(at, at + 4));
  let dataBytes = 0;
  for (let at = 12; at + 8 <= bytes.length; at += 8 + view.getUint32(at + 4, true)) {
    if (tag(at) === 'data') dataBytes = view.getUint32(at + 4, true);
  }
  return {
    riff: tag(0),
    wave: tag(8),
    channels: view.getUint16(22, true),
    rate: view.getUint32(24, true),
    bits: view.getUint16(34, true),
    dataBytes,
  };
}

describe('the switch sound files', () => {
  it.each(FILES)('%s is a 32 kHz mono 16-bit WAV under 3 s', (file) => {
    const header = wavHeader(readFileSync(join(SOUNDS_DIR, file)));
    expect(header.riff).toBe('RIFF');
    expect(header.wave).toBe('WAVE');
    expect(header.channels).toBe(1);
    expect(header.rate).toBe(32000);
    expect(header.bits).toBe(16);
    expect(header.dataBytes / 2 / 32000).toBeLessThan(3);
  });

  it('the three weigh under 340 KB together', () => {
    const total = FILES.reduce((n, file) => n + statSync(join(SOUNDS_DIR, file)).size, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(340_000);
  });
});

// The key sounds: the phosphor look's Model M keys by band (a press and a
// release each, up to three takes), the DOS look's two keys.
const KEYS_DIR = join(SOUNDS_DIR, 'keys');
const PHOSPHOR_FILES = [
  'p1a', 'p1b', 'p1c', 'p2a', 'p2b', 'p2c', 'p3a', 'p3b', 'p3c', 'p4a', 'p5a', 'p6a', 'p6b', 'p7a',
].flatMap((k) => [`${k}-down.wav`, `${k}-up.wav`]);
const DOS_FILES = ['d1.wav', 'd2.wav'];

describe('the key sound files', () => {
  it.each([...PHOSPHOR_FILES, ...DOS_FILES])(
    '%s is a 32 kHz mono 16-bit WAV under 0.4 s with its peak at or under -1 dBFS',
    (file) => {
      const bytes = readFileSync(join(KEYS_DIR, file));
      const header = wavHeader(bytes);
      expect(header.riff).toBe('RIFF');
      expect(header.channels).toBe(1);
      expect(header.rate).toBe(32000);
      expect(header.bits).toBe(16);
      expect(header.dataBytes / 2 / 32000).toBeLessThan(0.4);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let peak = 0;
      for (let at = 44; at + 1 < bytes.length; at += 2) peak = Math.max(peak, Math.abs(view.getInt16(at, true)));
      expect(peak / 32768).toBeLessThanOrEqual(10 ** (-1 / 20));
    }
  );

  it('the thirty files weigh under 340 KB together', () => {
    const total = [...PHOSPHOR_FILES, ...DOS_FILES].reduce((n, f) => n + statSync(join(KEYS_DIR, f)).size, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(340_000);
  });
});

describe('playing a switch sound', () => {
  let context;
  let sources;
  let decodeGate;
  let hadAudioContext;
  let hadFetch;

  beforeEach(() => {
    vi.resetModules();
    sources = [];
    decodeGate = {};
    context = {
      state: 'running',
      destination: { node: 'destination' },
      resume: vi.fn(() => Promise.resolve()),
      decodeAudioData: vi.fn(async ({ url }) => {
        if (decodeGate[url]) await decodeGate[url];
        // The key files all run about 0.16 s.
        return { duration: DURATIONS[url] ?? 0.16 };
      }),
      createBufferSource: vi.fn(() => {
        const source = {
          buffer: null,
          connectedTo: null,
          started: false,
          stopped: false,
          addEventListener: vi.fn(),
        };
        source.connect = vi.fn((node) => {
          source.connectedTo = node;
          return node;
        });
        source.start = vi.fn(() => {
          source.started = true;
        });
        source.stop = vi.fn(() => {
          source.stopped = true;
        });
        sources.push(source);
        return source;
      }),
    };
    hadAudioContext = window.AudioContext;
    hadFetch = globalThis.fetch;
    window.AudioContext = vi.fn(function FakeAudioContext() {
      return context;
    });
    globalThis.fetch = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/wav' }),
      // Stands in for the bytes; decoding is given a copy, so it reads them.
      arrayBuffer: async () => ({ url, slice: () => ({ url }) }),
    }));
  });

  afterEach(() => {
    window.AudioContext = hadAudioContext;
    globalThis.fetch = hadFetch;
    vi.useRealTimers();
  });

  const load = () => import('../../src/js/crt-sounds.js');

  it('plays the on sound whole, fetched and decoded once however often it is asked for', async () => {
    const { playCrtSound } = await load();
    await expect(playCrtSound('on')).resolves.toBeCloseTo(2.21, 6);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith('/sounds/crt-on.wav');
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(context.resume).toHaveBeenCalled();
    expect(sources).toHaveLength(1);
    expect(sources[0].buffer.duration).toBe(2.21);
    expect(sources[0].connectedTo).toBe(context.destination);
    expect(sources[0].started).toBe(true);

    await expect(playCrtSound('on')).resolves.toBeCloseTo(2.21, 6);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(2);
    expect(sources[0].stopped, 'the first one ended when the second began').toBe(true);
    expect(sources[1].started).toBe(true);
  });

  it('plays one at a time: the next sound ends the one still playing', async () => {
    const { playCrtSound, stopCrtSound } = await load();
    await playCrtSound('on');
    await playCrtSound('look');
    expect(sources.map((s) => [s.buffer.duration, s.stopped])).toEqual([
      [2.21, true],
      [0.8, false],
    ]);
    stopCrtSound();
    expect(sources[1].stopped).toBe(true);
    stopCrtSound();
    expect(sources[1].stop).toHaveBeenCalledTimes(1);
  });

  it('the newest one asked for is the one heard, when the first is still decoding', async () => {
    let releaseOn;
    decodeGate['/sounds/crt-on.wav'] = new Promise((resolve) => {
      releaseOn = resolve;
    });
    const { playCrtSound } = await load();
    const on = playCrtSound('on');
    await expect(playCrtSound('look')).resolves.toBeCloseTo(0.8, 6);
    releaseOn();
    await expect(on, 'nothing played for the superseded one').resolves.toBe(0);
    expect(sources).toHaveLength(1);
    expect(sources[0].buffer.duration).toBe(0.8);
    expect(sources[0].stopped).toBe(false);
  });

  it('refuses a file the server answered with a page, and asks for it again next time', async () => {
    globalThis.fetch.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      arrayBuffer: async () => ({ url: 'page' }),
    }));
    const { playCrtSound } = await load();
    await expect(playCrtSound('look')).rejects.toThrow(/crt-look\.wav.*text\/html/);
    expect(sources).toHaveLength(0);
    await expect(playCrtSound('look')).resolves.toBeCloseTo(0.8, 6);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('says so where there is no Web Audio, and knows only the three sounds', async () => {
    const { playCrtSound } = await load();
    await expect(playCrtSound('hum')).rejects.toThrow('No such sound: hum');
    delete window.AudioContext;
    await expect(playCrtSound('on')).rejects.toThrow('Web Audio is not available');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fetches the three files ahead, makes the context at the first press, and then plays at once', async () => {
    const { preloadCrtSounds, playCrtSound } = await load();
    preloadCrtSounds();
    expect(globalThis.fetch.mock.calls.map(([url]) => url).sort()).toEqual([
      '/sounds/crt-look.wav',
      '/sounds/crt-off.wav',
      '/sounds/crt-on.wav',
    ]);
    expect(window.AudioContext, 'no context before a press').not.toHaveBeenCalled();
    preloadCrtSounds();
    expect(globalThis.fetch, 'asked once').toHaveBeenCalledTimes(3);

    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(window.AudioContext).toHaveBeenCalledTimes(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(window.AudioContext, 'one context').toHaveBeenCalledTimes(1);

    await expect(playCrtSound('look')).resolves.toBeCloseTo(0.8, 6);
    expect(globalThis.fetch, 'nothing fetched again').toHaveBeenCalledTimes(3);
    expect(window.AudioContext).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(1);
  });

  it('plays a key by its band: the phosphor look a press then its release, the DOS look one stroke, takes in turn', async () => {
    const { playKeySound } = await load();
    const urls = () => globalThis.fetch.mock.calls.map(([url]) => url);
    await expect(playKeySound('p', 2, 'down')).resolves.toBeGreaterThan(0);
    await expect(playKeySound('p', 2, 'up')).resolves.toBeGreaterThan(0);
    expect(urls()).toEqual(['/sounds/keys/p2a-down.wav', '/sounds/keys/p2a-up.wav']);
    expect(sources, 'both play; a key does not cut a key').toHaveLength(2);
    expect(sources.every((s) => !s.stopped)).toBe(true);

    await playKeySound('p', 2, 'down');
    await playKeySound('p', 2, 'down');
    await playKeySound('p', 2, 'down');
    expect(urls().slice(2), 'the next takes, then round again').toEqual([
      '/sounds/keys/p2b-down.wav',
      '/sounds/keys/p2c-down.wav',
    ]);
    expect(sources).toHaveLength(5);

    await playKeySound('p', 7, 'down');
    expect(urls().at(-1)).toBe('/sounds/keys/p7a-down.wav');
    await expect(playKeySound('d', 3, 'down')).resolves.toBeGreaterThan(0);
    expect(urls().at(-1)).toBe('/sounds/keys/d1.wav');
    await expect(playKeySound('d', 6, 'down'), 'the big key from band 5 up').resolves.toBeGreaterThan(0);
    expect(urls().at(-1)).toBe('/sounds/keys/d2.wav');
    await expect(playKeySound('d', 6, 'up'), 'the DOS look has no release sound').resolves.toBe(0);
    expect(urls().at(-1)).toBe('/sounds/keys/d2.wav');
    await expect(playKeySound('x', 1, 'down')).rejects.toThrow('No such key set: x');
  });

  it('fetches a look\'s key files ahead, once', async () => {
    const { preloadKeySounds } = await load();
    preloadKeySounds('p');
    preloadKeySounds('p');
    const urls = globalThis.fetch.mock.calls.map(([url]) => url);
    expect(urls.length).toBe(28);
    expect(new Set(urls).size).toBe(28);
    expect(urls).toContain('/sounds/keys/p1a-down.wav');
    expect(urls).toContain('/sounds/keys/p7a-up.wav');
    preloadKeySounds('d');
    expect(globalThis.fetch).toHaveBeenCalledTimes(30);
  });

  it('gives up after a second when the browser will not start sound', async () => {
    vi.useFakeTimers();
    context.state = 'suspended';
    context.resume = vi.fn(() => new Promise(() => {}));
    const { playCrtSound } = await load();
    const play = playCrtSound('off');
    const outcome = play.then(
      () => 'played',
      (error) => error.message
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await outcome).toBe('The browser did not let the sound start');
    expect(sources).toHaveLength(0);
  });
});
