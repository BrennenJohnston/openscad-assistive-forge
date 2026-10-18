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
  '/sounds/drawers/latch-open.wav': 0.172,
  '/sounds/drawers/slide-open.wav': 0.4,
  '/sounds/drawers/stop-open.wav': 0.295,
  '/sounds/drawers/slide-close.wav': 0.45,
  '/sounds/drawers/stop-close.wav': 0.325,
  '/sounds/drawers/latch-close.wav': 0.115,
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

// The dial clicks: one click per look at seven speeds, 1 the lowest tone.
const DIALS_DIR = join(SOUNDS_DIR, 'dials');
const DIAL_FILES = ['p', 'd'].flatMap((set) => [1, 2, 3, 4, 5, 6, 7].map((v) => `${set}${v}.wav`));

describe('the dial click files', () => {
  it.each(DIAL_FILES)(
    '%s is a 32 kHz mono 16-bit WAV under 0.25 s with its peak at or under -1 dBFS',
    (file) => {
      const bytes = readFileSync(join(DIALS_DIR, file));
      const header = wavHeader(bytes);
      expect(header.riff).toBe('RIFF');
      expect(header.channels).toBe(1);
      expect(header.rate).toBe(32000);
      expect(header.bits).toBe(16);
      expect(header.dataBytes / 2 / 32000).toBeLessThan(0.25);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let peak = 0;
      for (let at = 44; at + 1 < bytes.length; at += 2) peak = Math.max(peak, Math.abs(view.getInt16(at, true)));
      expect(peak / 32768).toBeLessThanOrEqual(10 ** (-1 / 20));
    }
  );

  it('each look\'s seven run from the longest, the lowest tone, to the shortest, the highest', () => {
    for (const set of ['p', 'd']) {
      const seconds = [1, 2, 3, 4, 5, 6, 7].map(
        (v) => wavHeader(readFileSync(join(DIALS_DIR, `${set}${v}.wav`))).dataBytes / 2 / 32000
      );
      for (let v = 1; v < seconds.length; v++) expect(seconds[v], `${set}${v + 1} shorter than ${set}${v}`).toBeLessThan(seconds[v - 1]);
    }
  });

  it('the fourteen files weigh under 120 KB together', () => {
    const total = DIAL_FILES.reduce((n, f) => n + statSync(join(DIALS_DIR, f)).size, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(120_000);
  });
});

// A gain's level over time, as the code scheduled it: every call kept in
// order, the value set at once where a call sets it.
function fakeParam(value) {
  const param = { value, calls: [] };
  param.cancelScheduledValues = vi.fn((at) => param.calls.push(['cancel', at]));
  param.setValueAtTime = vi.fn((level, at) => {
    param.calls.push(['set', level, at]);
    param.value = level;
  });
  param.linearRampToValueAtTime = vi.fn((level, at) => param.calls.push(['ramp', level, at]));
  return param;
}

// The 3D view's ticks: a lens detent, a bearing and a ratchet, one file each.
const CAMERA_DIR = join(SOUNDS_DIR, 'camera');
const CAMERA_FILES = ['zoom.wav', 'turn.wav', 'tilt.wav'];

describe('the camera tick files', () => {
  it.each(CAMERA_FILES)(
    '%s is a 32 kHz mono 16-bit WAV under 0.3 s with its peak at or under -1 dBFS',
    (file) => {
      const bytes = readFileSync(join(CAMERA_DIR, file));
      const header = wavHeader(bytes);
      expect(header.riff).toBe('RIFF');
      expect(header.channels).toBe(1);
      expect(header.rate).toBe(32000);
      expect(header.bits).toBe(16);
      expect(header.dataBytes / 2 / 32000).toBeLessThan(0.3);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let peak = 0;
      for (let at = 44; at + 1 < bytes.length; at += 2) peak = Math.max(peak, Math.abs(view.getInt16(at, true)));
      expect(peak / 32768).toBeLessThanOrEqual(10 ** (-1 / 20));
    }
  );

  it('the three weigh under 40 KB together', () => {
    const total = CAMERA_FILES.reduce((n, f) => n + statSync(join(CAMERA_DIR, f)).size, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(40_000);
  });
});

// A WAV's samples' loudest, 0 to 1.
function peakOf(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let peak = 0;
  for (let at = 44; at + 1 < bytes.length; at += 2) peak = Math.max(peak, Math.abs(view.getInt16(at, true)));
  return peak / 32768;
}

// The drawer, the same in every look, in six parts at the recordings' own
// rate: a latch, the roll out (as long as the way to the stop, 400 ms), the
// stop; the roll shut (as long as the way shut, 450 ms), the stop, the latch.
const DRAWERS_DIR = join(SOUNDS_DIR, 'drawers');
const DRAWER_PARTS = {
  'latch-open.wav': [0.05, 0.4],
  'slide-open.wav': [0.4, 0.4],
  'stop-open.wav': [0.1, 0.4],
  'slide-close.wav': [0.45, 0.45],
  'stop-close.wav': [0.1, 0.4],
  'latch-close.wav': [0.05, 0.4],
};

describe('the drawer sound files', () => {
  it.each(Object.entries(DRAWER_PARTS))(
    '%s is a 48 kHz mono 16-bit WAV of its length, its peak at or under -1 dBFS',
    (file, [shortest, longest]) => {
      const bytes = readFileSync(join(DRAWERS_DIR, file));
      const header = wavHeader(bytes);
      expect(header.riff).toBe('RIFF');
      expect(header.channels).toBe(1);
      expect(header.rate).toBe(48000);
      expect(header.bits).toBe(16);
      const seconds = header.dataBytes / 2 / 48000;
      expect(seconds).toBeGreaterThanOrEqual(shortest - 0.001);
      expect(seconds).toBeLessThanOrEqual(longest + 0.001);
      expect(peakOf(bytes)).toBeLessThanOrEqual(10 ** (-1 / 20));
    }
  );

  it('the six weigh under 200 KB together', () => {
    const total = Object.keys(DRAWER_PARTS).reduce(
      (n, f) => n + statSync(join(DRAWERS_DIR, f)).size,
      0
    );
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(200_000);
  });
});

// A switch's snaps, a selector's clicks and a latch's.
const SWITCHES_DIR = join(SOUNDS_DIR, 'switches');
const SWITCH_FILES = [
  'snap-on.wav',
  'snap-off.wav',
  'select-open.wav',
  'select-choose.wav',
  'latch-open.wav',
  'latch-close.wav',
];

describe('the switch, selector and latch files', () => {
  it.each(SWITCH_FILES)(
    '%s is a 32 kHz mono 16-bit WAV under 0.25 s with its peak at or under -1 dBFS',
    (file) => {
      const bytes = readFileSync(join(SWITCHES_DIR, file));
      const header = wavHeader(bytes);
      expect(header.riff).toBe('RIFF');
      expect(header.channels).toBe(1);
      expect(header.rate).toBe(32000);
      expect(header.bits).toBe(16);
      expect(header.dataBytes / 2 / 32000).toBeLessThan(0.25);
      expect(peakOf(bytes)).toBeLessThanOrEqual(10 ** (-1 / 20));
    }
  );

  it('the six weigh under 40 KB together', () => {
    const total = SWITCH_FILES.reduce((n, f) => n + statSync(join(SWITCHES_DIR, f)).size, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(40_000);
  });
});

describe('playing a switch sound', () => {
  let context;
  let sources;
  let gains;
  let decodeGate;
  let hadAudioContext;
  let hadFetch;

  beforeEach(() => {
    vi.resetModules();
    sources = [];
    gains = [];
    decodeGate = {};
    context = {
      state: 'running',
      currentTime: 10,
      destination: { node: 'destination' },
      createGain: vi.fn(() => {
        const node = { connectedTo: null, gain: fakeParam(1) };
        node.connect = vi.fn((target) => {
          node.connectedTo = target;
          return target;
        });
        gains.push(node);
        return node;
      }),
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

  it('plays a dial click by its look and variant, over whatever else plays', async () => {
    const { playDialSound, playCrtSound } = await load();
    const urls = () => globalThis.fetch.mock.calls.map(([url]) => url);
    await playCrtSound('on');
    await expect(playDialSound('p', 4)).resolves.toBeGreaterThan(0);
    expect(urls().at(-1)).toBe('/sounds/dials/p4.wav');
    expect(sources[1].started).toBe(true);
    expect(sources[0].stopped, 'a click does not cut the switch sound').toBe(false);
    await playDialSound('p', 4);
    expect(sources[2].started).toBe(true);
    expect(globalThis.fetch, 'one fetch for the two').toHaveBeenCalledTimes(2);
    await playDialSound('d', 7);
    expect(urls().at(-1)).toBe('/sounds/dials/d7.wav');
    await playDialSound('d', 0);
    expect(urls().at(-1), 'a variant under 1 is 1').toBe('/sounds/dials/d1.wav');
    await playDialSound('d', 12);
    expect(globalThis.fetch, 'a variant past 7 is 7, already fetched').toHaveBeenCalledTimes(4);
    expect(sources).toHaveLength(6);
    expect(sources.slice(1).every((s) => s.started && !s.stopped)).toBe(true);
    await expect(playDialSound('x', 1)).rejects.toThrow('No such dial set: x');
  });

  it('fetches a look\'s seven clicks ahead, once', async () => {
    const { preloadDialSounds } = await load();
    preloadDialSounds('d');
    preloadDialSounds('d');
    const urls = globalThis.fetch.mock.calls.map(([url]) => url);
    expect(urls).toEqual([1, 2, 3, 4, 5, 6, 7].map((v) => `/sounds/dials/d${v}.wav`));
    preloadDialSounds('p');
    expect(globalThis.fetch).toHaveBeenCalledTimes(14);
    expect(() => preloadDialSounds('q')).toThrow('No such dial set: q');
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

  const db = (n) => 10 ** (n / 20);
  const rounded = (calls) =>
    calls.map(([what, ...numbers]) => [what, ...numbers.map((n) => Math.round(n * 1000) / 1000)]);

  it('sends every sound through its own group and one master to the output', async () => {
    const { playCrtSound, playKeySound, playDialSound, soundGroup } = await load();
    expect(soundGroup('keys'), 'no mixer before the first sound').toBeNull();
    await playCrtSound('on');
    expect(soundGroup('keys').gain.value).toBe(1);
    expect(soundGroup('camera').gain.value, 'the camera 12 dB under the keys').toBeCloseTo(db(-12), 6);
    expect(soundGroup('typing').gain.value, 'typing a quiet key').toBeCloseTo(db(-12), 6);
    expect(soundGroup('drawers').gain.value, 'the drawers 10 dB under the keys').toBeCloseTo(db(-10), 6);
    await playKeySound('p', 2, 'down');
    await playDialSound('p', 4);
    const masters = gains.filter((node) => node.connectedTo === context.destination);
    expect(masters, 'one gain reaches the output').toHaveLength(1);
    expect(sources.map((s) => s.connectedTo)).toEqual([
      soundGroup('switch'),
      soundGroup('keys'),
      soundGroup('dials'),
    ]);
    for (const name of [
      'switch',
      'keys',
      'dials',
      'camera',
      'drawers',
      'typing',
      'snaps',
      'selectors',
      'latches',
    ]) {
      expect(soundGroup(name).connectedTo, `${name} into the master`).toBe(masters[0]);
    }
    expect(() => soundGroup('hum')).toThrow('No such sound group: hum');
  });

  it('a key or a dial click lowers the camera group 8 dB for 150 ms, with 60 ms ramps', async () => {
    const { playKeySound, playDialSound, soundGroup, duck } = await load();
    await playKeySound('p', 1, 'down');
    const camera = soundGroup('camera');
    const level = db(-12);
    const low = level * db(-8);
    expect(rounded(camera.gain.calls)).toEqual(
      rounded([
        ['cancel', 10],
        ['set', level, 10],
        ['ramp', low, 10.06],
        ['set', low, 10.15],
        ['ramp', level, 10.21],
      ])
    );
    camera.gain.calls.length = 0;
    camera.gain.value = level;
    await playDialSound('d', 3);
    expect(rounded(camera.gain.calls).map(([what]) => what)).toEqual([
      'cancel',
      'set',
      'ramp',
      'set',
      'ramp',
    ]);
    expect(soundGroup('keys').gain.calls, 'a key lowers nothing else').toEqual([]);
    expect(() => duck('hum', 8, 150)).toThrow('No such sound group: hum');
  });

  it('plays a camera tick by its kind in the camera group, which it does not lower itself; the turn 3 dB under the tilt and the zoom', async () => {
    const { playCameraSound, preloadCameraSounds, soundGroup } = await load();
    const urls = () => globalThis.fetch.mock.calls.map(([url]) => url);
    await expect(playCameraSound('turn')).resolves.toBeGreaterThan(0);
    expect(urls()).toEqual(['/sounds/camera/turn.wav']);
    await playCameraSound('tilt');
    await playCameraSound('zoom');
    expect(urls().slice(1)).toEqual(['/sounds/camera/tilt.wav', '/sounds/camera/zoom.wav']);
    for (const [n, level] of [db(-3), db(0), db(0)].entries()) {
      expect(sources[n].connectedTo.connectedTo, 'its level, then the group').toBe(
        soundGroup('camera')
      );
      expect(sources[n].connectedTo.gain.value, `tick ${n}'s level`).toBeCloseTo(level, 6);
    }
    expect(soundGroup('camera').gain.calls, 'a tick does not duck its own group').toEqual([]);
    await expect(playCameraSound('pan')).rejects.toThrow('No such camera sound: pan');
    preloadCameraSounds();
    expect(globalThis.fetch, 'the three fetched once').toHaveBeenCalledTimes(3);
  });

  // When each part starts, `[when, offset]`, and its own level.
  const timed = (list) => list.map((s) => [...s.start.mock.calls[0]].map((n) => Math.round(n * 1000) / 1000));
  const levels = (list) => list.map((s) => Math.round(s.level.gain.value * 1000) / 1000);

  it('plays a drawer opening from shut in time with its slide: the latch and the roll at once, the roll ending at the stop, the thump as it meets it, each through its own level into the drawers group', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { playDrawerSound, preloadDrawerSounds, soundGroup } = await load();
    const urls = () => globalThis.fetch.mock.calls.map(([url]) => url);
    const seconds = await playDrawerSound('camera', 'open', { stopAt: 0.4, whole: true });
    expect(urls()).toEqual([
      '/sounds/drawers/latch-open.wav',
      '/sounds/drawers/slide-open.wav',
      '/sounds/drawers/stop-open.wav',
    ]);
    // The roll is as long as the way to the stop, so it ends where the thump
    // begins.
    expect(timed(sources)).toEqual([
      [10, 0],
      [10, 0],
      [10.4, 0],
    ]);
    expect(levels(sources)).toEqual([db(-3), db(-6), db(-1)].map((n) => Math.round(n * 1000) / 1000));
    for (const source of sources) {
      expect(source.connectedTo.connectedTo, 'its level, then the group').toBe(soundGroup('drawers'));
    }
    expect(seconds, 'until the thump has rung out').toBeCloseTo(0.695, 6);
    await expect(playDrawerSound('camera', 'slam')).rejects.toThrow('No such drawer phase: slam');
    globalThis.fetch.mockClear();
    preloadDrawerSounds();
    expect(urls(), 'the other three, the three played already kept').toEqual([
      '/sounds/drawers/slide-close.wav',
      '/sounds/drawers/stop-close.wav',
      '/sounds/drawers/latch-close.wav',
    ]);
    vi.restoreAllMocks();
  });

  it('plays a drawer shutting: the faintest roll ending at the closed stop, the thump as it meets it, then the latch catching; without a slide, the thump at once', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { playDrawerSound } = await load();
    const seconds = await playDrawerSound('customizer', 'close', { stopAt: 0.45, whole: true });
    expect(timed(sources)).toEqual([
      [10, 0],
      [10.45, 0],
      [10.53, 0],
    ]);
    expect(levels(sources)).toEqual([db(-9), db(-1), db(-3)].map((n) => Math.round(n * 1000) / 1000));
    expect(seconds, 'until the thump has rung out').toBeCloseTo(0.775, 6);

    // Reduced motion: no roll; opening, the latch and the thump just after;
    // shutting, the thump and the latch.
    sources.length = 0;
    await playDrawerSound('preview-settings', 'open', { stopAt: 0, whole: true });
    await playDrawerSound('phone-ascii', 'close', { stopAt: 0, whole: true });
    expect(sources.map((s) => s.buffer.duration)).toEqual([0.172, 0.295, 0.325, 0.115]);
    expect(timed(sources)).toEqual([
      [10, 0],
      [10.06, 0],
      [10, 0],
      [10.08, 0],
    ]);
    vi.restoreAllMocks();
  });

  it('a drawer turned round calls off the parts still to come, fades the roll it is in over 40 ms and lets a latch already sounding ring; the new roll plays only its end, rising over 15 ms', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { playDrawerSound } = await load();
    await playDrawerSound('camera', 'open', { stopAt: 0.4, whole: true });
    const [latch, roll, thump] = sources;
    context.currentTime = 10.2;
    const seconds = await playDrawerSound('camera', 'close', { stopAt: 0.18, whole: false });
    expect(latch.stop, 'the latch rings out').not.toHaveBeenCalled();
    expect(thump.stop, 'the thump still to come is called off').toHaveBeenCalledWith();
    expect(rounded(roll.level.gain.calls)).toEqual(
      rounded([
        ['cancel', 10.2],
        ['set', db(-6), 10.2],
        ['ramp', 0, 10.24],
      ])
    );
    expect(roll.stop.mock.calls[0][0]).toBeCloseTo(10.24, 6);
    const [shutRoll, shutThump, shutLatch] = sources.slice(3);
    expect(timed([shutRoll, shutThump, shutLatch])).toEqual([
      [10.2, 0.27],
      [10.38, 0],
      [10.46, 0],
    ]);
    expect(rounded(shutRoll.level.gain.calls)).toEqual(
      rounded([
        ['set', 0, 10.2],
        ['ramp', db(-9), 10.215],
      ])
    );
    expect(seconds, 'until the thump has rung out').toBeCloseTo(0.505, 6);

    // A drawer opened again part of the way has no latch to let go.
    context.currentTime = 10.3;
    sources.length = 0;
    await playDrawerSound('camera', 'open', { stopAt: 0.1, whole: false });
    expect(sources.map((s) => s.buffer.duration)).toEqual([0.4, 0.295]);
    await playDrawerSound('phone-ascii', 'open', { stopAt: 0.4, whole: true });
    expect(sources[0].stopped, 'another drawer does not cut it short').toBe(false);
    vi.restoreAllMocks();
  });

  it('plays a switch, a selector and a latch in their own groups, lowering the camera; typing the smallest key, its takes in turn, quieter', async () => {
    const { playControlSound, playTypingSound, preloadControlSounds, soundGroup } = await load();
    const urls = () => globalThis.fetch.mock.calls.map(([url]) => url);
    await playControlSound('snap-on');
    await playControlSound('select-open');
    await playControlSound('latch-close');
    expect(urls()).toEqual([
      '/sounds/switches/snap-on.wav',
      '/sounds/switches/select-open.wav',
      '/sounds/switches/latch-close.wav',
    ]);
    expect(sources.map((s) => s.connectedTo)).toEqual([
      soundGroup('snaps'),
      soundGroup('selectors'),
      soundGroup('latches'),
    ]);
    expect(soundGroup('camera').gain.calls.length, 'each lowers the camera').toBeGreaterThan(0);
    expect(soundGroup('latches').gain.value, 'a latch 3 dB under its key').toBeCloseTo(db(-3), 6);
    await expect(playControlSound('slam')).rejects.toThrow('No such control sound: slam');

    globalThis.fetch.mockClear();
    for (let n = 0; n < 4; n++) await playTypingSound('p');
    await playTypingSound('d');
    expect(urls()).toEqual([
      '/sounds/keys/p1a-down.wav',
      '/sounds/keys/p1b-down.wav',
      '/sounds/keys/p1c-down.wav',
      '/sounds/keys/d1.wav',
    ]);
    expect(sources.slice(3).map((s) => s.connectedTo)).toEqual(
      Array(5).fill(soundGroup('typing'))
    );
    expect(soundGroup('typing').gain.value, '12 dB under the keys').toBeCloseTo(db(-12), 6);
    await expect(playTypingSound('x')).rejects.toThrow('No such key set: x');

    globalThis.fetch.mockClear();
    preloadControlSounds();
    expect(urls(), 'the six, the three played already kept').toEqual([
      '/sounds/switches/snap-off.wav',
      '/sounds/switches/select-choose.wav',
      '/sounds/switches/latch-open.wav',
    ]);
  });

  it('mutes through the master: silent within 20 ms, before or after the first sound', async () => {
    const { setMuted, playKeySound } = await load();
    setMuted(true);
    expect(window.AudioContext, 'muting makes no context of its own').not.toHaveBeenCalled();
    await playKeySound('p', 1, 'down');
    const master = gains.find((node) => node.connectedTo === context.destination);
    expect(master.gain.value, 'a mixer made while muted starts silent').toBe(0);
    setMuted(false);
    expect(rounded(master.gain.calls).at(-1)).toEqual(['ramp', 1, 10.02]);
    setMuted(true);
    expect(rounded(master.gain.calls).at(-1)).toEqual(['ramp', 0, 10.02]);
  });
});
