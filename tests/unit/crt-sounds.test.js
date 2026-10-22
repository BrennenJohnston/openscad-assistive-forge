/**
 * The Alt View's switch sounds: three recordings played whole, each fetched
 * and decoded once, one at a time, the newest asked for winning. Every
 * family comes in two sets, p for the phosphor looks and d for the DOS
 * look; the files both sets name are checked here, and the set door.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SOUNDS_DIR = resolve(__dirname, '../../public/sounds');
// The files each set names, as crt-sounds.js's tables do. The DOS look's
// own recordings replace the d entries one family at a time; until a
// family has its own, its d table names the p files.
const both = (p, d) => [...new Set([...p, ...d])];
const SWITCH_SETS = {
  p: ['crt-on.wav', 'crt-look.wav', 'crt-off.wav'],
  d: ['d-on.wav', 'd-look.wav', 'd-off.wav'],
};
const FILES = both(SWITCH_SETS.p, SWITCH_SETS.d);
// The phosphor set is at 32 kHz; the DOS set is cut at its recordings' 48.
const RATE_OF = (file) => (file.startsWith('d-') ? 48000 : 32000);
const DURATIONS = {
  '/sounds/camera/pan.wav': 0.12,
  '/sounds/camera/pan-run.wav': 0.7,
  '/sounds/camera/pan-stop.wav': 0.42,
  '/sounds/crt-on.wav': 2.21,
  '/sounds/crt-look.wav': 0.8,
  '/sounds/crt-off.wav': 2.17,
  '/sounds/drawers/latch-open.wav': 0.172,
  '/sounds/drawers/slide-open.wav': 0.4,
  '/sounds/drawers/stop-open.wav': 0.26,
  '/sounds/drawers/grip-close.wav': 0.285,
  '/sounds/drawers/slide-close.wav': 0.45,
  '/sounds/drawers/stop-close.wav': 0.24,
  '/sounds/drawers/latch-close.wav': 0.3,
  '/sounds/switches/lever-on-1.wav': 0.13,
  '/sounds/switches/lever-on-2.wav': 0.131,
  '/sounds/moments/crack.wav': 0.6,
  '/sounds/moments/shatter.wav': 0.8,
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
  it.each(FILES)("%s is a mono 16-bit WAV at its set's rate, under 3 s", (file) => {
    const header = wavHeader(readFileSync(join(SOUNDS_DIR, file)));
    expect(header.riff).toBe('RIFF');
    expect(header.wave).toBe('WAVE');
    expect(header.channels).toBe(1);
    expect(header.rate).toBe(RATE_OF(file));
    expect(header.bits).toBe(16);
    expect(header.dataBytes / 2 / header.rate).toBeLessThan(3);
  });

  it('both sets weigh under 740 KB together (the phosphor three 332 KB, the DOS three 375 KB)', () => {
    const total = FILES.reduce((n, file) => n + statSync(join(SOUNDS_DIR, file)).size, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(740_000);
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
// The ticks, each under 0.3 s; the pan's run (a loop) and its run-down are
// longer, as a motor's run and its coasting to a stop are.
const CAMERA_SETS = {
  p: {
    'zoom.wav': 0.3,
    'turn.wav': 0.3,
    'tilt.wav': 0.3,
    'pan.wav': 0.3,
    'pan-run.wav': 0.8,
    'pan-stop.wav': 0.5,
  },
  // The DOS look's: a servo step, the hub's tick, a tripod head's click;
  // the tape transport's run-up (longer than the lead screw's), its run and
  // its wind-down.
  d: {
    'd-zoom.wav': 0.3,
    'd-turn.wav': 0.3,
    'd-tilt.wav': 0.3,
    'd-pan.wav': 0.35,
    'd-pan-run.wav': 0.8,
    'd-pan-stop.wav': 0.5,
  },
};
const CAMERA_FILES = { ...CAMERA_SETS.p, ...CAMERA_SETS.d };

describe('the camera tick files', () => {
  it.each(Object.entries(CAMERA_FILES))(
    "%s is a mono 16-bit WAV at its set's rate, under %d s, with its peak at or under -1 dBFS",
    (file, longest) => {
      const bytes = readFileSync(join(CAMERA_DIR, file));
      const header = wavHeader(bytes);
      expect(header.riff).toBe('RIFF');
      expect(header.channels).toBe(1);
      expect(header.rate).toBe(RATE_OF(file));
      expect(header.bits).toBe(16);
      expect(header.dataBytes / 2 / header.rate).toBeLessThan(longest);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let peak = 0;
      for (let at = 44; at + 1 < bytes.length; at += 2) peak = Math.max(peak, Math.abs(view.getInt16(at, true)));
      expect(peak / 32768).toBeLessThanOrEqual(10 ** (-1 / 20));
    }
  );

  it('both sets weigh under 280 KB together (the phosphor six 89 KB, the DOS six 163 KB)', () => {
    const total = Object.keys(CAMERA_FILES).reduce((n, f) => n + statSync(join(CAMERA_DIR, f)).size, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(280_000);
  });
});

// A WAV's samples' loudest, 0 to 1.
function peakOf(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let peak = 0;
  for (let at = 44; at + 1 < bytes.length; at += 2) peak = Math.max(peak, Math.abs(view.getInt16(at, true)));
  return peak / 32768;
}

// The drawer, the same in every look, in seven parts at the recordings' own
// rate: the latch let go, the glide out (as long as the way to the stop,
// 400 ms), the stop; the latch gripped, the glide shut (as long as the way
// shut, 450 ms), the muffled stop, the latch released.
const DRAWERS_DIR = join(SOUNDS_DIR, 'drawers');
const DRAWER_SETS = {
  p: {
    'latch-open.wav': [0.05, 0.4],
    'slide-open.wav': [0.4, 0.4],
    'stop-open.wav': [0.1, 0.4],
    'grip-close.wav': [0.05, 0.4],
    'slide-close.wav': [0.45, 0.45],
    'stop-close.wav': [0.1, 0.4],
    'latch-close.wav': [0.05, 0.4],
  },
  // The DOS look's cassette door, cut to the same lengths.
  d: {
    'd-latch-open.wav': [0.05, 0.4],
    'd-slide-open.wav': [0.4, 0.4],
    'd-stop-open.wav': [0.1, 0.4],
    'd-grip-close.wav': [0.05, 0.4],
    'd-slide-close.wav': [0.45, 0.45],
    'd-stop-close.wav': [0.1, 0.4],
    'd-latch-close.wav': [0.05, 0.4],
  },
};
const DRAWER_PARTS = { ...DRAWER_SETS.p, ...DRAWER_SETS.d };

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

  it('both sets weigh under 500 KB together (the phosphor seven 203 KB, the DOS seven 183 KB)', () => {
    const total = Object.keys(DRAWER_PARTS).reduce(
      (n, f) => n + statSync(join(DRAWERS_DIR, f)).size,
      0
    );
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(500_000);
  });
});

// A switch's snaps, a selector's clicks and a latch's.
const SWITCHES_DIR = join(SOUNDS_DIR, 'switches');
const CONTROL_SETS = {
  p: ['snap-on.wav', 'select-open.wav', 'select-choose.wav', 'latch-open.wav', 'latch-close.wav'],
  d: ['d-snap-on.wav', 'd-select-open.wav', 'd-select-choose.wav', 'd-latch-open.wav', 'd-latch-close.wav'],
};
const SWITCH_FILES = both(CONTROL_SETS.p, CONTROL_SETS.d);

// The lever a checkbox or a switch flips, two takes each way, and the
// typewriter platen's ticks a scroll makes, four takes and the end of the
// list: 48 kHz, as cut from the recordings.
const LEVER_SETS = {
  p: ['lever-on-1.wav', 'lever-on-2.wav', 'lever-off-1.wav', 'lever-off-2.wav'],
  d: ['d-lever-on-1.wav', 'd-lever-on-2.wav', 'd-lever-off-1.wav', 'd-lever-off-2.wav'],
};
const LEVER_FILES = both(LEVER_SETS.p, LEVER_SETS.d);
const SCROLL_DIR = join(SOUNDS_DIR, 'scroll');
const SCROLL_SETS = {
  p: ['platen-1.wav', 'platen-2.wav', 'platen-3.wav', 'platen-4.wav', 'platen-end.wav'],
  d: ['d-platen-1.wav', 'd-platen-2.wav', 'd-platen-3.wav', 'd-platen-4.wav', 'd-platen-end.wav'],
};
const SCROLL_FILES = both(SCROLL_SETS.p, SCROLL_SETS.d);

describe('the lever and scroll files', () => {
  it.each([
    ...LEVER_FILES.map((f) => [join(SWITCHES_DIR, f), 0.2]),
    ...SCROLL_FILES.map((f) => [join(SCROLL_DIR, f), 0.1]),
  ])('%s is a 48 kHz mono 16-bit WAV under %d s, its peak at or under -1 dBFS', (path, longest) => {
    const bytes = readFileSync(path);
    const header = wavHeader(bytes);
    expect(header.riff).toBe('RIFF');
    expect(header.channels).toBe(1);
    expect(header.rate).toBe(48000);
    expect(header.bits).toBe(16);
    expect(header.dataBytes / 2 / 48000).toBeLessThan(longest);
    expect(peakOf(bytes)).toBeLessThanOrEqual(10 ** (-1 / 20));
  });
});

describe('the switch, selector and latch files', () => {
  it.each(SWITCH_FILES)(
    "%s is a mono 16-bit WAV at its set's rate, under 0.25 s, with its peak at or under -1 dBFS",
    (file) => {
      const bytes = readFileSync(join(SWITCHES_DIR, file));
      const header = wavHeader(bytes);
      expect(header.riff).toBe('RIFF');
      expect(header.channels).toBe(1);
      expect(header.rate).toBe(RATE_OF(file));
      expect(header.bits).toBe(16);
      expect(header.dataBytes / 2 / header.rate).toBeLessThan(0.25);
      expect(peakOf(bytes)).toBeLessThanOrEqual(10 ** (-1 / 20));
    }
  );

  it('both sets weigh under 120 KB together (the phosphor five 32 KB, the DOS five 60 KB)', () => {
    const total = SWITCH_FILES.reduce((n, f) => n + statSync(join(SWITCHES_DIR, f)).size, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(120_000);
  });
});

// The key's moments: retro samples of a crack and, later, of glass breaking.
const MOMENTS_DIR = join(SOUNDS_DIR, 'moments');

describe("the key's moment files", () => {
  it.each(['crack.wav', 'shatter.wav'])(
    '%s is a 32 kHz mono 16-bit WAV under 1 s with its peak at or under -1 dBFS',
    (file) => {
      const bytes = readFileSync(join(MOMENTS_DIR, file));
      const header = wavHeader(bytes);
      expect(header.riff).toBe('RIFF');
      expect(header.channels).toBe(1);
      expect(header.rate).toBe(32000);
      expect(header.bits).toBe(16);
      expect(header.dataBytes / 2 / 32000).toBeLessThan(1);
      expect(peakOf(bytes)).toBeLessThanOrEqual(10 ** (-1 / 20));
    }
  );
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
          playbackRate: { value: 1 },
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
    expect(soundGroup('camera').gain.value, 'the camera 9 dB under the keys').toBeCloseTo(db(-9), 6);
    expect(soundGroup('typing').gain.value, 'typing a quiet key').toBeCloseTo(db(-12), 6);
    expect(soundGroup('drawers').gain.value, 'the drawers 6 dB under the keys').toBeCloseTo(db(-6), 6);
    // Levelled as the ear weighs them against a key press: the power sound
    // 7 dB down in its group (its long files still play a few dB over a
    // key), the dials 8, the lists 5, the latches 9 (under the key that
    // opens a menu), the snaps 2, and a scroll's ticks 16, in the background.
    expect(soundGroup('switch').gain.value).toBeCloseTo(db(-7), 6);
    expect(soundGroup('dials').gain.value).toBeCloseTo(db(-8), 6);
    expect(soundGroup('selectors').gain.value).toBeCloseTo(db(-5), 6);
    expect(soundGroup('latches').gain.value).toBeCloseTo(db(-9), 6);
    expect(soundGroup('snaps').gain.value).toBeCloseTo(db(-2), 6);
    expect(soundGroup('scroll').gain.value).toBeCloseTo(db(-16), 6);
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
      'scroll',
      'moments',
    ]) {
      expect(soundGroup(name).connectedTo, `${name} into the master`).toBe(masters[0]);
    }
    expect(() => soundGroup('hum')).toThrow('No such sound group: hum');
  });

  it("plays the key's crack and shatter whole in the moments group, 7.2 and 9.5 dB down on levels of their own, fetched ahead once", async () => {
    const { playMomentSound, preloadMomentSounds, soundGroup } = await load();
    const urls = () => globalThis.fetch.mock.calls.map(([url]) => url);
    preloadMomentSounds();
    expect(urls()).toEqual(['/sounds/moments/crack.wav', '/sounds/moments/shatter.wav']);
    await expect(playMomentSound('crack')).resolves.toBeCloseTo(0.6, 6);
    expect(urls(), 'fetched once').toHaveLength(2);
    const [source] = sources;
    expect(source.started).toBe(true);
    expect(source.connectedTo).toBe(source.level);
    expect(source.level.gain.value).toBeCloseTo(db(-7.2), 6);
    expect(source.level.connectedTo).toBe(soundGroup('moments'));
    expect(soundGroup('moments').gain.value, 'the group itself at 0 dB').toBe(1);
    await expect(playMomentSound('shatter')).resolves.toBeCloseTo(0.8, 6);
    expect(sources[1].level.gain.value, 'the shatter 9.5 dB down').toBeCloseTo(db(-9.5), 6);
    expect(sources[1].level.connectedTo).toBe(soundGroup('moments'));
    await expect(playMomentSound('thud')).rejects.toThrow('No such moment: thud');
  });

  it('a key or a dial click lowers the camera group 8 dB for 150 ms, with 60 ms ramps', async () => {
    const { playKeySound, playDialSound, soundGroup, duck } = await load();
    await playKeySound('p', 1, 'down');
    const camera = soundGroup('camera');
    const level = db(-9);
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

  it('plays a camera tick by its kind in the camera group, which it does not lower itself; the turn 12 dB under the zoom, the tilt 7, the pan 17', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { playCameraSound, preloadCameraSounds, soundGroup } = await load();
    const urls = () => globalThis.fetch.mock.calls.map(([url]) => url);
    await expect(playCameraSound('turn')).resolves.toBeGreaterThan(0);
    expect(urls()).toEqual(['/sounds/camera/turn.wav']);
    await playCameraSound('tilt');
    await playCameraSound('zoom');
    await playCameraSound('pan');
    expect(urls().slice(1)).toEqual([
      '/sounds/camera/tilt.wav',
      '/sounds/camera/zoom.wav',
      '/sounds/camera/pan.wav',
    ]);
    for (const [n, level] of [db(-12), db(-7), db(0), db(-17)].entries()) {
      expect(sources[n].connectedTo.connectedTo, 'its level, then the group').toBe(
        soundGroup('camera')
      );
      expect(sources[n].connectedTo.gain.value, `tick ${n}'s level`).toBeCloseTo(level, 6);
    }
    expect(soundGroup('camera').gain.calls, 'a tick does not duck its own group').toEqual([]);
    await expect(playCameraSound('dolly')).rejects.toThrow('No such camera sound: dolly');
    preloadCameraSounds();
    expect(globalThis.fetch, 'the four ticks and the pan\'s two parts fetched once').toHaveBeenCalledTimes(6);
    vi.restoreAllMocks();
  });

  it("a pan is one motion of the stage: the run-up at once, the run looping under it from the run-up's end until the stage rests, then the wind-down; a press over before the run-up ends skips the run and winds down from its end", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { startPanMotion, soundGroup } = await load();
    const cents = (s) => Math.round(1200 * Math.log2(s.playbackRate.value));
    const level = (s) => s.connectedTo.gain.value;
    const rate = 2 ** (70 / 1200);

    // A press: the run-up, right's way, at the pan's level; the run is
    // scheduled to take over 30 ms before the run-up ends.
    const press = await startPanMotion({ way: 1 });
    expect(sources).toHaveLength(2);
    expect(cents(sources[0])).toBe(70);
    expect(level(sources[0])).toBeCloseTo(db(-17), 6);
    expect(sources[0].connectedTo.connectedTo).toBe(soundGroup('camera'));
    expect(sources[1].loop, 'the run loops').toBe(true);
    expect(cents(sources[1]), 'at the same pitch').toBe(70);
    expect(level(sources[1]), 'the run under the run-up').toBeCloseTo(db(-30), 6);
    expect(sources[1].start.mock.calls[0][0]).toBeCloseTo(10 + 0.12 / rate - 0.03, 6);
    // Over before the run-up ends: the run is called off, the wind-down
    // starts where the run-up ends, the same way.
    press.stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(sources[1].stop, 'the run called off').toHaveBeenCalled();
    expect(sources).toHaveLength(3);
    expect(sources[2].start.mock.calls[0][0]).toBeCloseTo(10 + 0.12 / rate, 6);
    expect(cents(sources[2])).toBe(70);
    expect(level(sources[2]), "the wind-down at the run-up's place").toBeCloseTo(db(-23), 6);
    expect(sources[2].connectedTo.connectedTo).toBe(soundGroup('camera'));
    press.stop();
    expect(sources, 'stopped once').toHaveLength(3);

    // A drag: the run has begun when the stage rests; it fades over 40 ms
    // as the wind-down starts, left's way.
    const drag = await startPanMotion({ way: -1 });
    expect(sources).toHaveLength(5);
    context.currentTime = 11;
    drag.stop();
    await Promise.resolve();
    await Promise.resolve();
    const run = sources[4];
    const faded = 11 + 0.04;
    expect(run.connectedTo.gain.calls).toEqual([
      ['cancel', 11],
      ['set', run.connectedTo.gain.value, 11],
      ['ramp', 0, faded],
    ]);
    expect(run.stop).toHaveBeenCalledWith(faded);
    expect(sources).toHaveLength(6);
    expect(sources[5].start.mock.calls[0][0]).toBe(11);
    expect(cents(sources[5])).toBe(-70);
    vi.restoreAllMocks();
  });

  it('each tick tells its way, 70 cents lower turning left, tilting down and zooming out, 70 higher the other way, and strays up to 15 cents and 1 dB', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { playCameraSound } = await load();
    const cents = (s) => Math.round(1200 * Math.log2(s.playbackRate.value));
    await playCameraSound('turn', { way: -1 });
    await playCameraSound('turn', { way: 1 });
    await playCameraSound('turn');
    expect(sources.map(cents)).toEqual([-70, 70, 0]);
    // Its length played is its length at that speed.
    await expect(playCameraSound('turn', { way: -1 })).resolves.toBeCloseTo(0.16 / 2 ** (-70 / 1200), 6);
    random.mockReturnValue(1);
    await playCameraSound('turn', { way: 1 });
    const last = sources.at(-1);
    expect(cents(last), 'strayed up').toBe(85);
    expect(last.connectedTo.gain.value, 'and a decibel louder').toBeCloseTo(db(-11), 6);
    random.mockReturnValue(0.5);
    await playCameraSound('tilt', { way: 1 });
    await playCameraSound('zoom', { way: -1 });
    expect(sources.slice(-2).map(cents), 'up higher, out lower').toEqual([70, -70]);
    expect(sources.at(-2).connectedTo.gain.value, 'the tilt 7 dB under').toBeCloseTo(db(-7), 6);
    expect(sources.at(-1).connectedTo.gain.value).toBeCloseTo(db(0), 6);
    vi.restoreAllMocks();
  });

  it('a dial click strays up to 10 cents in pitch, so a fast drag does not repeat itself exactly', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(1);
    const { playDialSound } = await load();
    const cents = (s) => Math.round(1200 * Math.log2(s.playbackRate.value));
    await playDialSound('p', 3);
    random.mockReturnValue(0);
    await expect(playDialSound('p', 3)).resolves.toBeCloseTo(0.16 / 2 ** (-10 / 1200), 6);
    expect(sources.map(cents)).toEqual([10, -10]);
    vi.restoreAllMocks();
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
    // The stop well under the latch and the glide.
    expect(levels(sources)).toEqual([db(-3), db(-5), db(-11)].map((n) => Math.round(n * 1000) / 1000));
    for (const source of sources) {
      expect(source.connectedTo.connectedTo, 'its level, then the group').toBe(soundGroup('drawers'));
    }
    expect(seconds, 'until the thump has rung out').toBeCloseTo(0.66, 6);
    await expect(playDrawerSound('camera', 'slam')).rejects.toThrow('No such drawer phase: slam');
    globalThis.fetch.mockClear();
    context.decodeAudioData.mockClear();
    preloadDrawerSounds();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      context.decodeAudioData.mock.calls.map(([bytes]) => bytes.url),
      'the four not played yet decoded ahead, the page having its context'
    ).toEqual([
      '/sounds/drawers/grip-close.wav',
      '/sounds/drawers/slide-close.wav',
      '/sounds/drawers/stop-close.wav',
      '/sounds/drawers/latch-close.wav',
    ]);
    expect(urls(), 'the other four, the three played already kept').toEqual([
      '/sounds/drawers/grip-close.wav',
      '/sounds/drawers/slide-close.wav',
      '/sounds/drawers/stop-close.wav',
      '/sounds/drawers/latch-close.wav',
    ]);
    vi.restoreAllMocks();
  });

  it('plays a drawer shutting: the latch gripped and the glide at once, the muffled thump as it meets the closed stop, the latch released 120 ms after; without a slide, no glide', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { playDrawerSound } = await load();
    const seconds = await playDrawerSound('customizer', 'close', { stopAt: 0.45, whole: true });
    expect(sources.map((s) => s.buffer.duration)).toEqual([0.285, 0.45, 0.24, 0.3]);
    expect(timed(sources)).toEqual([
      [10, 0],
      [10, 0],
      [10.45, 0],
      [10.57, 0],
    ]);
    // A gentle grip, a softer glide, the stop quieter still, the release.
    expect(levels(sources)).toEqual([db(-7), db(-8), db(-15), db(-7)].map((n) => Math.round(n * 1000) / 1000));
    expect(seconds, 'until the release has rung out').toBeCloseTo(0.87, 6);

    // Reduced motion: no glide; opening, the latch and the thump just after;
    // shutting, the grip, the thump just after, the release.
    sources.length = 0;
    await playDrawerSound('preview-settings', 'open', { stopAt: 0, whole: true });
    await playDrawerSound('phone-ascii', 'close', { stopAt: 0, whole: true });
    expect(sources.map((s) => s.buffer.duration)).toEqual([0.172, 0.26, 0.285, 0.24, 0.3]);
    expect(timed(sources)).toEqual([
      [10, 0],
      [10.06, 0],
      [10, 0],
      [10.06, 0],
      [10.18, 0],
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
        ['set', db(-5), 10.2],
        ['ramp', 0, 10.24],
      ])
    );
    expect(roll.stop.mock.calls[0][0]).toBeCloseTo(10.24, 6);
    const [shutRoll, shutThump, shutLatch] = sources.slice(3);
    // Turned round, no grip: the hand is on the drawer already.
    expect(sources.slice(3).map((s) => s.buffer.duration)).toEqual([0.45, 0.24, 0.3]);
    expect(timed([shutRoll, shutThump, shutLatch])).toEqual([
      [10.2, 0.27],
      [10.38, 0],
      [10.5, 0],
    ]);
    expect(rounded(shutRoll.level.gain.calls)).toEqual(
      rounded([
        ['set', 0, 10.2],
        ['ramp', db(-8), 10.215],
      ])
    );
    expect(seconds, 'until the release has rung out').toBeCloseTo(0.6, 6);

    // A drawer opened again part of the way has no latch to let go.
    context.currentTime = 10.3;
    sources.length = 0;
    await playDrawerSound('camera', 'open', { stopAt: 0.1, whole: false });
    expect(sources.map((s) => s.buffer.duration)).toEqual([0.4, 0.26]);
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
    expect(soundGroup('latches').gain.value, 'a latch under the key that opened its menu').toBeCloseTo(db(-9), 6);
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
    expect(urls(), 'the rest, the three played already kept').toEqual([
      '/sounds/switches/select-choose.wav',
      '/sounds/switches/latch-open.wav',
      '/sounds/switches/lever-on-1.wav',
      '/sounds/switches/lever-on-2.wav',
      '/sounds/switches/lever-off-1.wav',
      '/sounds/switches/lever-off-2.wav',
    ]);
  });

  it('a lever flips up for on and down for off, its takes in turn, in the snaps group 5 dB further down, each flip straying up to 15 cents and 1 dB', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { playControlSound, soundGroup } = await load();
    const urls = () => globalThis.fetch.mock.calls.map(([url]) => url);
    const cents = (s) => Math.round(1200 * Math.log2(s.playbackRate.value));
    await playControlSound('lever-on');
    await playControlSound('lever-off');
    await playControlSound('lever-on');
    await playControlSound('lever-off');
    expect(urls()).toEqual([
      '/sounds/switches/lever-on-1.wav',
      '/sounds/switches/lever-off-1.wav',
      '/sounds/switches/lever-on-2.wav',
      '/sounds/switches/lever-off-2.wav',
    ]);
    for (const source of sources) {
      expect(source.connectedTo.connectedTo).toBe(soundGroup('snaps'));
      expect(source.connectedTo.gain.value).toBeCloseTo(db(-5), 6);
    }
    expect(sources.map(cents)).toEqual([0, 0, 0, 0]);
    random.mockReturnValue(0);
    await playControlSound('lever-on');
    expect(sources.at(-1).buffer.duration, 'round again to the first take').toBe(0.13);
    expect(cents(sources.at(-1))).toBe(-15);
    expect(sources.at(-1).connectedTo.gain.value).toBeCloseTo(db(-6), 6);
    vi.restoreAllMocks();
  });

  it('a scroll ticks a typewriter platen\'s line, its takes in turn: down 70 cents lower, up 70 higher, straying a little; the end of the list a tick of its own', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { playScrollSound, preloadScrollSounds, soundGroup } = await load();
    const urls = () => globalThis.fetch.mock.calls.map(([url]) => url);
    const cents = (s) => Math.round(1200 * Math.log2(s.playbackRate.value));
    for (let n = 0; n < 5; n++) await playScrollSound({ way: n < 3 ? -1 : 1 });
    expect(urls()).toEqual([
      '/sounds/scroll/platen-1.wav',
      '/sounds/scroll/platen-2.wav',
      '/sounds/scroll/platen-3.wav',
      '/sounds/scroll/platen-4.wav',
    ]);
    expect(sources.map(cents)).toEqual([-70, -70, -70, 70, 70]);
    for (const source of sources) {
      expect(source.connectedTo.connectedTo).toBe(soundGroup('scroll'));
      expect(source.connectedTo.gain.value).toBeCloseTo(db(0), 6);
    }
    await playScrollSound({ end: true });
    expect(urls().at(-1)).toBe('/sounds/scroll/platen-end.wav');
    expect(cents(sources.at(-1)), 'the end as it is').toBe(0);
    expect(sources.at(-1).connectedTo.gain.value).toBeCloseTo(db(-2), 6);
    globalThis.fetch.mockClear();
    preloadScrollSounds();
    expect(globalThis.fetch, 'all five fetched already').not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('one sound set is chosen for every family that takes none as an argument: p to start, d for the DOS look, nothing else', async () => {
    const { setSoundSet, soundSet } = await load();
    expect(soundSet(), 'the phosphor looks to start').toBe('p');
    setSoundSet('d');
    expect(soundSet()).toBe('d');
    setSoundSet('p');
    expect(soundSet()).toBe('p');
    expect(() => setSoundSet('x')).toThrow('No such sound set: x');
    expect(() => setSoundSet(undefined)).toThrow('No such sound set: undefined');
    expect(soundSet(), 'a refused set changes nothing').toBe('p');
  });

  it("with the DOS set chosen, every player asks for the DOS table's file: the switch sounds, the ticks and the pan, the drawer, the controls and the scroll", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const {
      setSoundSet,
      playCrtSound,
      playCameraSound,
      startPanMotion,
      playDrawerSound,
      playControlSound,
      playScrollSound,
      soundGroup,
    } = await load();
    const urls = () => globalThis.fetch.mock.calls.map(([url]) => url);
    setSoundSet('d');
    // The DOS tables' files, as crt-sounds.js names them today: the DOS
    // look's own recordings replace them one family at a time.
    await playCrtSound('on');
    expect(urls()).toEqual(['/sounds/d-on.wav']);
    expect(sources[0].connectedTo, 'the screen coming on, straight into its group').toBe(
      soundGroup('switch')
    );
    await playCrtSound('look');
    expect(urls().at(-1)).toBe('/sounds/d-look.wav');
    expect(sources[1].connectedTo.connectedTo, 'the knob click through a level of its own').toBe(
      soundGroup('switch')
    );
    expect(sources[1].connectedTo.gain.value, 'the click 2.5 dB up').toBeCloseTo(db(2.5), 6);
    await playCameraSound('turn');
    expect(urls().at(-1)).toBe('/sounds/camera/d-turn.wav');
    await playCameraSound('tilt');
    expect(sources.at(-1).connectedTo.gain.value, 'the tripod head at -5.6 dB').toBeCloseTo(
      db(-5.6),
      6
    );
    const motion = await startPanMotion();
    motion.stop();
    expect(urls().slice(-3)).toEqual([
      '/sounds/camera/d-pan.wav',
      '/sounds/camera/d-pan-run.wav',
      '/sounds/camera/d-pan-stop.wav',
    ]);
    expect(sources.at(-2).connectedTo.gain.value, 'the run at -24.9 dB').toBeCloseTo(db(-24.9), 6);
    expect(sources.at(-1).connectedTo.gain.value, 'the wind-down at -19.2 dB').toBeCloseTo(
      db(-19.2),
      6
    );
    await playDrawerSound('a drawer', 'open', { stopAt: 0.4, whole: true });
    expect(urls().slice(-3)).toEqual([
      '/sounds/drawers/d-latch-open.wav',
      '/sounds/drawers/d-slide-open.wav',
      '/sounds/drawers/d-stop-open.wav',
    ]);
    await playDrawerSound('a drawer', 'close', { stopAt: 0.45, whole: true });
    expect(urls().slice(-4)).toEqual([
      '/sounds/drawers/d-grip-close.wav',
      '/sounds/drawers/d-slide-close.wav',
      '/sounds/drawers/d-stop-close.wav',
      '/sounds/drawers/d-latch-close.wav',
    ]);
    expect(sources.at(-1).connectedTo.gain.value, 'the latch released at -4.4 dB').toBeCloseTo(
      db(-4.4),
      6
    );
    await playControlSound('snap-on');
    await playControlSound('select-open');
    await playControlSound('latch-close');
    await playControlSound('lever-on');
    await playControlSound('lever-on');
    await playControlSound('lever-off');
    expect(urls().slice(-6)).toEqual([
      '/sounds/switches/d-snap-on.wav',
      '/sounds/switches/d-select-open.wav',
      '/sounds/switches/d-latch-close.wav',
      '/sounds/switches/d-lever-on-1.wav',
      '/sounds/switches/d-lever-on-2.wav',
      '/sounds/switches/d-lever-off-1.wav',
    ]);
    await playScrollSound();
    await playScrollSound();
    await playScrollSound({ end: true });
    expect(urls().slice(-3)).toEqual([
      '/sounds/scroll/d-platen-1.wav',
      '/sounds/scroll/d-platen-2.wav',
      '/sounds/scroll/d-platen-end.wav',
    ]);
    expect(sources.at(-1).connectedTo.gain.value, 'the auto-stop at -2 dB').toBeCloseTo(db(-2), 6);
    // The keys and the dials take their set as an argument, as before.
    setSoundSet('p');
    await playCrtSound('look');
    expect(urls().at(-1), 'back to the phosphor set').toBe('/sounds/crt-look.wav');
    vi.restoreAllMocks();
  });

  it('fetches every sound of the look ahead for the set chosen, each file once: 39 for the DOS look, 44 more for a phosphor look after it', async () => {
    const { setSoundSet, preloadLookSounds } = await load();
    const distinct = () => new Set(globalThis.fetch.mock.calls.map(([url]) => url)).size;
    setSoundSet('d');
    preloadLookSounds();
    expect(distinct(), 'the DOS set: 3 switch, 2 keys, 7 dials, 6 camera, 7 drawer, 9 control, 5 scroll').toBe(39);
    preloadLookSounds();
    expect(globalThis.fetch, 'asked again, nothing fetched twice').toHaveBeenCalledTimes(39);
    setSoundSet('p');
    preloadLookSounds();
    expect(
      distinct(),
      'the phosphor set adds its 3 switch sounds, 28 keys, 7 dials, 6 camera, 7 drawer, 9 control and 5 scroll files to the 39'
    ).toBe(104);
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
