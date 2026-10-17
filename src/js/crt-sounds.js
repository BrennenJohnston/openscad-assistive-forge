/**
 * The Alt View's sounds: a screen coming on, a look changing and a screen
 * going off, each a short recording played whole; the keys, a keyboard's
 * press and release for every button of the look, chosen by the button's
 * size; and the dial clicks a slider makes step by step, one click per look
 * at seven speeds (the recordings and their makers are named in
 * THIRD_PARTY_NOTICES.md). A file is fetched ahead or the first time it is
 * wanted, decoded once and kept. The switch sounds play one at a time, the
 * newest one asked for winning; the keys and the clicks play as pressed,
 * over each other if need be. Every sound passes through its group's level
 * and one master, which the sounds setting silences.
 * @license GPL-3.0-or-later
 */

const FILES = {
  on: '/sounds/crt-on.wav',
  look: '/sounds/crt-look.wav',
  off: '/sounds/crt-off.wav',
};
// The key sets, by the look: p (the phosphor looks) holds a press and a
// release per key, up to three keys per size band; d (the DOS look) one
// stroke per key, two keys. Band 1 is the smallest button, 7 the widest.
const KEY_SETS = {
  p: {
    phases: true,
    bands: {
      1: ['p1a', 'p1b', 'p1c'],
      2: ['p2a', 'p2b', 'p2c'],
      3: ['p3a', 'p3b', 'p3c'],
      4: ['p4a'],
      5: ['p5a'],
      6: ['p6a', 'p6b'],
      7: ['p7a'],
    },
  },
  d: {
    phases: false,
    bands: {
      1: ['d1'],
      2: ['d1'],
      3: ['d1'],
      4: ['d1'],
      5: ['d2'],
      6: ['d2'],
      7: ['d2'],
    },
  },
};
// The dial clicks, by the look: one recording each, rendered at seven speeds
// into seven files, variant 1 the lowest tone (a slider of few steps) to 7
// the highest (one of many).
const DIAL_SETS = ['p', 'd'];
const DIAL_VARIANTS = 7;
// A browser that has not let the page make sound yet leaves the audio
// context waiting; past this the sound is given up.
const START_TIMEOUT_MS = 1000;

// The groups a sound plays in, each at its own level under the master: the
// camera's sounds 6 dB under the keys, typing a quiet key 12 dB under.
const GROUP_LEVELS_DB = {
  switch: 0,
  keys: 0,
  dials: 0,
  camera: -6,
  drawers: 0,
  typing: -12,
};
// Muting fades the master out over this, so a sound stops without a click.
const MUTE_RAMP_S = 0.02;
// A key or a dial click lowers the camera group this far, for this long, so
// a press is never muddied by a movement sound.
const DUCK_DB = 8;
const DUCK_MS = 150;
const DUCK_RAMP_S = 0.06;

let _context = null;
let _mixer = null;
let _muted = false;
const _bytes = new Map();
const _buffers = new Map();
let _playing = null;
let _asked = 0;
let _armed = false;
const _turn = new Map();

function _contextClass() {
  return window.AudioContext || window.webkitAudioContext;
}

function _audioContext() {
  const Context = _contextClass();
  if (!Context) throw new Error('Web Audio is not available');
  if (!_context || _context.state === 'closed') _context = new Context();
  return _context;
}

async function _fetchBytes(url) {
  const response = await fetch(url);
  const type = response.headers.get('content-type') || '';
  // The dev server answers a missing file with the page itself, status 200.
  if (!response.ok || !type.startsWith('audio/')) {
    throw new Error(
      `${url} is not a sound (${response.status}, ${type || 'no type'})`
    );
  }
  return response.arrayBuffer();
}

function _bytesFor(url) {
  if (!_bytes.has(url)) {
    const loading = _fetchBytes(url).catch((error) => {
      _bytes.delete(url);
      throw error;
    });
    _bytes.set(url, loading);
  }
  return _bytes.get(url);
}

function _bufferFor(url, context) {
  if (!_buffers.has(url)) {
    // Decoding takes its bytes away, so it is given a copy and the bytes stay.
    const decoding = _bytesFor(url)
      .then((bytes) => context.decodeAudioData(bytes.slice(0)))
      .catch((error) => {
        _buffers.delete(url);
        throw error;
      });
    _buffers.set(url, decoding);
  }
  return _buffers.get(url);
}

// The audio context is made at the first press on the page, when a browser
// lets it start, so the first sound is not waiting on it.
function _armContext() {
  if (_armed) return;
  _armed = true;
  const arm = () => {
    _audioContext().resume();
  };
  for (const type of ['pointerdown', 'keydown']) {
    document.addEventListener(type, arm, {
      capture: true,
      once: true,
      passive: true,
    });
  }
}

function _fetchAhead(urls, what) {
  if (!_contextClass()) return;
  for (const url of urls) {
    _bytesFor(url).catch((error) => {
      console.warn(
        `[Alt View] The ${what} sound was not fetched ahead:`,
        error
      );
    });
  }
  _armContext();
}

const _gainOf = (db) => 10 ** (db / 20);

function _checkGroup(name) {
  if (!Object.prototype.hasOwnProperty.call(GROUP_LEVELS_DB, name)) {
    throw new Error(`No such sound group: ${name}`);
  }
}

// The master and the groups, made with the context's first sound.
function _mixerFor(context) {
  if (_mixer?.context === context) return _mixer;
  const master = context.createGain();
  master.gain.value = _muted ? 0 : 1;
  master.connect(context.destination);
  const groups = {};
  for (const [name, db] of Object.entries(GROUP_LEVELS_DB)) {
    const node = context.createGain();
    node.gain.value = _gainOf(db);
    node.connect(master);
    groups[name] = node;
  }
  _mixer = { context, master, groups };
  return _mixer;
}

// A level moves on from where it stands, so a change arriving in the middle
// of another does not jump.
function _holdFrom(param, at) {
  param.cancelScheduledValues(at);
  param.setValueAtTime(param.value, at);
}

// Waits for the context to run, a second at most, then starts the buffer in
// its group.
async function _start(context, running, buffer, group) {
  let timer = null;
  await Promise.race([
    running,
    new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('The browser did not let the sound start')),
        START_TIMEOUT_MS
      );
    }),
  ]).finally(() => clearTimeout(timer));
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(_mixerFor(context).groups[group]);
  source.start();
  return source;
}

/**
 * The gain a group's sounds pass through, or null before the first sound.
 * @param {'switch'|'keys'|'dials'|'camera'|'drawers'|'typing'} name
 * @returns {GainNode|null}
 */
export function soundGroup(name) {
  _checkGroup(name);
  return _mixer ? _mixer.groups[name] : null;
}

/**
 * Silence every sound, or let them be heard again: the master fades over
 * 20 ms. Kept in step with the sounds setting; a mixer made later starts as
 * this left it.
 * @param {boolean} on
 */
export function setMuted(on) {
  _muted = Boolean(on);
  if (!_mixer) return;
  const { context, master } = _mixer;
  const now = context.currentTime;
  _holdFrom(master.gain, now);
  master.gain.linearRampToValueAtTime(_muted ? 0 : 1, now + MUTE_RAMP_S);
}

/**
 * Lower a group for a moment and bring it back, ramping 60 ms each way.
 * @param {string} name - The group
 * @param {number} [byDb=8]
 * @param {number} [forMs=150] - From now until the group starts back up
 */
export function duck(name, byDb = DUCK_DB, forMs = DUCK_MS) {
  _checkGroup(name);
  if (!_mixer) return;
  const { context, groups } = _mixer;
  const param = groups[name].gain;
  const level = _gainOf(GROUP_LEVELS_DB[name]);
  const low = level * _gainOf(-byDb);
  const now = context.currentTime;
  const down = now + DUCK_RAMP_S;
  const up = Math.max(down, now + forMs / 1000);
  _holdFrom(param, now);
  param.linearRampToValueAtTime(low, down);
  param.setValueAtTime(low, up);
  param.linearRampToValueAtTime(level, up + DUCK_RAMP_S);
}

/**
 * Fetch the three switch sounds now and make the audio context at the first
 * press, so a later play starts at once instead of after a download. Safe
 * to call more than once; nothing happens where there is no Web Audio.
 */
export function preloadCrtSounds() {
  _fetchAhead(Object.values(FILES), 'switch');
}

/**
 * Fetch a look's key files now, once, so the first press is not waiting.
 * @param {'p'|'d'} set
 */
export function preloadKeySounds(set) {
  const keys = KEY_SETS[set];
  if (!keys) throw new Error(`No such key set: ${set}`);
  const urls = new Set();
  for (const takes of Object.values(keys.bands)) {
    for (const take of takes) {
      if (keys.phases) {
        urls.add(_keyUrl(set, take, 'down'));
        urls.add(_keyUrl(set, take, 'up'));
      } else {
        urls.add(_keyUrl(set, take, 'down'));
      }
    }
  }
  _fetchAhead([...urls], 'key');
}

function _keyUrl(set, take, phase) {
  return KEY_SETS[set].phases
    ? `/sounds/keys/${take}-${phase}.wav`
    : `/sounds/keys/${take}.wav`;
}

/**
 * Fetch a look's seven dial clicks now, once, so the first step is not
 * waiting.
 * @param {'p'|'d'} set
 */
export function preloadDialSounds(set) {
  if (!DIAL_SETS.includes(set)) throw new Error(`No such dial set: ${set}`);
  const urls = [];
  for (let variant = 1; variant <= DIAL_VARIANTS; variant++) {
    urls.push(_dialUrl(set, variant));
  }
  _fetchAhead(urls, 'dial');
}

function _dialUrl(set, variant) {
  return `/sounds/dials/${set}${variant}.wav`;
}

/** Ends the switch sound playing now, if any. */
export function stopCrtSound() {
  if (!_playing) return;
  _playing.stop();
  _playing = null;
}

/**
 * Play one of the three switch sounds. Call it from the press that switched
 * the look, so the browser lets the sound start.
 * @param {'on'|'look'|'off'} name
 * @returns {Promise<number>} The sound's length in seconds once it has begun;
 *   0 when a later sound was asked for before this one could start
 */
export async function playCrtSound(name) {
  if (!FILES[name]) throw new Error(`No such sound: ${name}`);
  const context = _audioContext();
  const running = context.resume();
  const asked = ++_asked;
  const buffer = await _bufferFor(FILES[name], context);
  if (asked !== _asked) return 0;
  // Checked again past the wait for the context: a newer ask may have come.
  const source = await _start(context, running, buffer, 'switch');
  if (asked !== _asked) {
    source.stop();
    return 0;
  }
  stopCrtSound();
  source.addEventListener('ended', () => {
    if (_playing === source) _playing = null;
  });
  _playing = source;
  return buffer.duration;
}

/**
 * Play a key for a button: the band's keys take turns, so a repeated press
 * does not stutter on one recording.
 * @param {'p'|'d'} set - The look's key set
 * @param {number} band - The button's size band, 1 (smallest) to 7 (widest)
 * @param {'down'|'up'} phase - The press or the release
 * @returns {Promise<number>} The sound's length in seconds once it has begun;
 *   0 where the set has no sound for that phase
 */
export async function playKeySound(set, band, phase) {
  const keys = KEY_SETS[set];
  if (!keys) throw new Error(`No such key set: ${set}`);
  if (!keys.phases && phase !== 'down') return 0;
  const takes = keys.bands[Math.max(1, Math.min(7, band))];
  const slot = `${set}${band}`;
  const turn = _turn.get(slot) ?? 0;
  if (phase === 'down') _turn.set(slot, (turn + 1) % takes.length);
  // The release follows the press's take.
  const take =
    takes[phase === 'down' ? turn : (turn + takes.length - 1) % takes.length];
  const context = _audioContext();
  const running = context.resume();
  const buffer = await _bufferFor(_keyUrl(set, take, phase), context);
  await _start(context, running, buffer, 'keys');
  duck('camera');
  return buffer.duration;
}

/**
 * Play a dial click for a slider's step: the look's one click, at the
 * speed of the variant.
 * @param {'p'|'d'} set - The look's dial set
 * @param {number} variant - The tone, 1 (lowest) to 7 (highest)
 * @returns {Promise<number>} The click's length in seconds once it has begun
 */
export async function playDialSound(set, variant) {
  if (!DIAL_SETS.includes(set)) throw new Error(`No such dial set: ${set}`);
  const tone = Math.max(1, Math.min(DIAL_VARIANTS, Math.round(variant)));
  const context = _audioContext();
  const running = context.resume();
  const buffer = await _bufferFor(_dialUrl(set, tone), context);
  await _start(context, running, buffer, 'dials');
  duck('camera');
  return buffer.duration;
}
