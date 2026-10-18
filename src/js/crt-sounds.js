/**
 * The Alt View's sounds: a screen coming on, a look changing and a screen
 * going off, each a short recording played whole; the keys, a keyboard's
 * press and release for every button of the look, chosen by the button's
 * size; the dial clicks a slider makes step by step, one click per look at
 * seven speeds; the 3D view's ticks as it is turned, tilted or zoomed; a
 * drawer's latch, roll and stop in time with its slide; a switch's snap, a
 * selector's click, a latch, and a quiet key for typing (the recordings and their
 * makers are named in THIRD_PARTY_NOTICES.md). A file is fetched ahead or
 * the first time it is wanted, decoded once and kept. The switch sounds
 * play one at a time, the newest one asked for winning, and so does each
 * drawer; the keys and the clicks play as pressed, over each other if need
 * be. Every sound passes through its group's level and one master, which
 * the sounds setting silences.
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
// The 3D view's ticks, the same in every look: a lens detent for a zoom
// step, a bearing for a turn, a ratchet for a tilt.
const CAMERA_FILES = {
  zoom: '/sounds/camera/zoom.wav',
  turn: '/sounds/camera/turn.wav',
  tilt: '/sounds/camera/tilt.wav',
};
// Each tick's level in the camera group: the turn, the one heard most as a
// drag goes round, sits well under the other two.
const CAMERA_LEVELS_DB = { zoom: 0, turn: -8, tilt: 0 };
// The turn tells its way, left a little lower and right a little higher (in
// cents), and each tick strays a little in pitch and level, so a run of
// them does not wear.
const TURN_WAY_CENTS = 70;
const TURN_STRAY_CENTS = 15;
const TURN_STRAY_DB = 1;
// A drawer, the same in every look, in parts played in time with its slide:
// opening, the latch let go at the press, the glide out on its rollers, the
// thump of the stop it meets; shutting, the latch gripped open at the press,
// the glide, the closed stop's thump muffled by the cabinet round it, the
// latch released as the hand lets go. A glide is as long as the way it
// covers (400 ms out to the stop, 450 ms shut). Each part has its level in
// the drawers group, the stops under the latch and the glide.
const DRAWER_PARTS = {
  open: { press: 'latch-open', roll: 'slide-open', stop: 'stop-open' },
  close: {
    press: 'grip-close',
    roll: 'slide-close',
    stop: 'stop-close',
    after: 'latch-close',
  },
};
const DRAWER_LEVELS_DB = {
  'latch-open': -3,
  'slide-open': -5,
  'stop-open': -11,
  'grip-close': -7,
  'slide-close': -8,
  'stop-close': -15,
  'latch-close': -7,
};
// Shutting, the latch is released this long after the stop. A drawer that
// changes at once (less motion asked for) meets its stop this long after
// the press.
const DRAWER_LATCH_LAG_S = 0.12;
const DRAWER_STILL_STOP_S = 0.06;
// A roll turned round in mid-slide fades out over this; a roll begun part of
// the way in rises over the other, so neither starts or ends with a click.
const DRAWER_ROLL_FADE_S = 0.04;
const DRAWER_ROLL_RISE_S = 0.015;
// The other controls' sounds, the same in every look, each in its group: a
// switch's snap on and off, a selector's click as a list opens and as a
// choice is made, a latch as a menu or a dialog opens and closes.
const CONTROL_FILES = {
  'snap-on': ['/sounds/switches/snap-on.wav', 'snaps'],
  'snap-off': ['/sounds/switches/snap-off.wav', 'snaps'],
  'select-open': ['/sounds/switches/select-open.wav', 'selectors'],
  'select-choose': ['/sounds/switches/select-choose.wav', 'selectors'],
  'latch-open': ['/sounds/switches/latch-open.wav', 'latches'],
  'latch-close': ['/sounds/switches/latch-close.wav', 'latches'],
};
// A browser that has not let the page make sound yet leaves the audio
// context waiting; past this the sound is given up.
const START_TIMEOUT_MS = 1000;

// The groups a sound plays in, each at its own level under the master: the
// camera's sounds 12 dB under the keys, a drawer 10 dB under them, typing a quiet key 12 dB under, a latch under the key that
// opened its menu.
const GROUP_LEVELS_DB = {
  switch: 0,
  keys: 0,
  dials: 0,
  camera: -12,
  drawers: -10,
  typing: -12,
  snaps: 0,
  selectors: 0,
  latches: -3,
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
/** The sound each drawer is making now, by drawer: its parts. */
const _drawerPlaying = new Map();

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

// Waits for the context to run, a second at most.
async function _whenRunning(running) {
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
}

// Waits for the context to run, then starts the buffer in its group,
// `offset` seconds in, at `rate` times its speed. With `own`, the sound has
// a level of its own (`source.level`, `levelDb` to start) between it and the
// group, so it can be set apart from the group or faded out.
async function _start(
  context,
  running,
  buffer,
  group,
  { offset = 0, own = false, levelDb = 0, rate = 1 } = {}
) {
  await _whenRunning(running);
  const source = context.createBufferSource();
  source.buffer = buffer;
  if (rate !== 1) source.playbackRate.value = rate;
  const into = _mixerFor(context).groups[group];
  if (own) {
    source.level = context.createGain();
    source.level.gain.value = _gainOf(levelDb);
    source.level.connect(into);
    source.connect(source.level);
  } else {
    source.connect(into);
  }
  source.start(0, offset);
  return source;
}

// Starts a buffer through a level of its own into its group at `when` on
// the context's clock, `offset` seconds in.
function _startAt(context, buffer, group, when, levelDb, offset = 0) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.level = context.createGain();
  source.level.gain.value = _gainOf(levelDb);
  source.level.connect(_mixerFor(context).groups[group]);
  source.connect(source.level);
  source.start(when, offset);
  return source;
}

/**
 * The gain a group's sounds pass through, or null before the first sound.
 * @param {'switch'|'keys'|'dials'|'camera'|'drawers'|'typing'|'snaps'|'selectors'|'latches'} name
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

/** Fetch the 3D view's three ticks now, once. */
export function preloadCameraSounds() {
  _fetchAhead(Object.values(CAMERA_FILES), 'camera');
}

function _drawerUrl(part) {
  return `/sounds/drawers/${part}.wav`;
}

/** Fetch the drawer's parts now, once. */
export function preloadDrawerSounds() {
  _fetchAhead(Object.keys(DRAWER_LEVELS_DB).map(_drawerUrl), 'drawer');
}

/** Fetch the switches', selectors' and latches' sounds now, once. */
export function preloadControlSounds() {
  _fetchAhead(
    Object.values(CONTROL_FILES).map(([url]) => url),
    'control'
  );
}

/**
 * Play one of the 3D view's ticks in the camera group, which keys and dial
 * clicks lower for a moment, through a level of its own. A turn tells its
 * way by its pitch and strays a little in pitch and level.
 * @param {'zoom'|'turn'|'tilt'} kind
 * @param {{way?: -1|0|1}} [how] - way: a turn left (-1) or right (1)
 * @returns {Promise<number>} The tick's length in seconds once it has begun
 */
export async function playCameraSound(kind, { way = 0 } = {}) {
  if (!CAMERA_FILES[kind]) throw new Error(`No such camera sound: ${kind}`);
  const context = _audioContext();
  const running = context.resume();
  const buffer = await _bufferFor(CAMERA_FILES[kind], context);
  let levelDb = CAMERA_LEVELS_DB[kind];
  let rate = 1;
  if (kind === 'turn') {
    const stray = () => Math.random() * 2 - 1;
    rate = 2 ** ((way * TURN_WAY_CENTS + stray() * TURN_STRAY_CENTS) / 1200);
    levelDb += stray() * TURN_STRAY_DB;
  }
  await _start(context, running, buffer, 'camera', {
    own: true,
    levelDb,
    rate,
  });
  return buffer.duration / rate;
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

// A drawer's sound turned round with the drawer: its parts still to come
// are called off and the roll it is in fades out; a latch or a thump already
// sounding rings on, as it would.
function _turnRound(sound) {
  const now = sound.context.currentTime;
  for (const part of sound.parts) {
    if (part.at > now) {
      part.source.stop();
    } else if (part.roll && part.end > now) {
      _holdFrom(part.source.level.gain, now);
      part.source.level.gain.linearRampToValueAtTime(
        0,
        now + DRAWER_ROLL_FADE_S
      );
      part.source.stop(now + DRAWER_ROLL_FADE_S);
    }
  }
}

// When each of a drawer's parts plays, in seconds from the press, and the
// glide's span: the press's latch (a drawer going the whole way; one turned
// round is in hand already) and the glide at once, the stop as the drawer
// meets it, and shutting, the latch released after.
function _drawerTimeline(phase, stopAt, whole) {
  const { press, roll, stop, after } = DRAWER_PARTS[phase];
  const parts = [];
  if (whole) parts.push({ name: press, at: 0 });
  if (stopAt > 0) parts.push({ name: roll, at: 0, until: stopAt, roll: true });
  const stopped = stopAt > 0 ? stopAt : whole ? DRAWER_STILL_STOP_S : 0;
  parts.push({ name: stop, at: stopped });
  if (after) parts.push({ name: after, at: stopped + DRAWER_LATCH_LAG_S });
  return parts;
}

/**
 * Play a drawer opening or shutting, in time with its slide on screen.
 * Opening from shut: the latch lets go and the glide begins at once, the
 * glide ends as the drawer meets its stop, and the stop's thump comes then.
 * Shutting: the latch gripped open and the glide, the closed stop's muffled
 * thump, the latch released. A slide over part of the way (a press that
 * turned the drawer round) plays only the end of its glide, rising in, with
 * no press of the latch; a drawer that changes at once has no glide. The
 * sound the drawer was making is turned round with it.
 * @param {string} drawer - Which drawer: a sound turns round only its own
 * @param {'open'|'close'} phase
 * @param {{stopAt?: number, whole?: boolean}} [timing]
 *   - stopAt: seconds from now until the drawer meets its stop on screen; 0
 *     when it changes at once
 *   - whole: whether it goes the whole way, from shut or from open
 * @returns {Promise<number>} Seconds from now until its last part ends; 0
 *   when a later sound for the drawer was asked for before this one began
 */
export async function playDrawerSound(
  drawer,
  phase,
  { stopAt = 0, whole = true } = {}
) {
  if (!DRAWER_PARTS[phase]) throw new Error(`No such drawer phase: ${phase}`);
  const askedAt = performance.now();
  const asked = { parts: [] };
  const before = _drawerPlaying.get(drawer);
  _drawerPlaying.set(drawer, asked);
  if (before?.context) _turnRound(before);
  const context = _audioContext();
  const running = context.resume();
  const timeline = _drawerTimeline(phase, stopAt, whole);
  const buffers = await Promise.all(
    timeline.map((part) => _bufferFor(_drawerUrl(part.name), context))
  );
  await _whenRunning(running);
  if (_drawerPlaying.get(drawer) !== asked) return 0;
  // The press was a moment ago: what was to play by now plays now.
  const now = context.currentTime;
  const pressed = now - (performance.now() - askedAt) / 1000;
  let last = now;
  let lastSource = null;
  asked.context = context;
  timeline.forEach((part, n) => {
    const buffer = buffers[n];
    const level = DRAWER_LEVELS_DB[part.name];
    let at = Math.max(now, pressed + part.at);
    let offset = 0;
    if (part.roll) {
      // The roll ends as the drawer meets its stop.
      const from = pressed + part.until - buffer.duration;
      at = Math.max(now, from);
      offset = at - from;
    }
    const source = _startAt(context, buffer, 'drawers', at, level, offset);
    if (offset > 0) {
      source.level.gain.setValueAtTime(0, at);
      source.level.gain.linearRampToValueAtTime(
        _gainOf(level),
        at + DRAWER_ROLL_RISE_S
      );
    }
    const end = at + buffer.duration - offset;
    asked.parts.push({ source, at, end, roll: Boolean(part.roll) });
    if (end >= last) {
      last = end;
      lastSource = source;
    }
  });
  lastSource?.addEventListener('ended', () => {
    if (_drawerPlaying.get(drawer) === asked) _drawerPlaying.delete(drawer);
  });
  return last - now;
}

/**
 * Play a switch's snap, a selector's click or a latch.
 * @param {keyof typeof CONTROL_FILES} kind
 * @returns {Promise<number>} The sound's length in seconds once it has begun
 */
export async function playControlSound(kind) {
  if (!CONTROL_FILES[kind]) throw new Error(`No such control sound: ${kind}`);
  const [url, group] = CONTROL_FILES[kind];
  const context = _audioContext();
  const running = context.resume();
  const buffer = await _bufferFor(url, context);
  await _start(context, running, buffer, group);
  duck('camera');
  return buffer.duration;
}

/**
 * Play a keystroke typed into a field: the look's smallest key, its press
 * only, the takes in turn, in the typing group.
 * @param {'p'|'d'} set - The look's key set
 * @returns {Promise<number>} The sound's length in seconds once it has begun
 */
export async function playTypingSound(set) {
  const keys = KEY_SETS[set];
  if (!keys) throw new Error(`No such key set: ${set}`);
  const takes = keys.bands[1];
  const slot = `${set}typing`;
  const turn = _turn.get(slot) ?? 0;
  _turn.set(slot, (turn + 1) % takes.length);
  const context = _audioContext();
  const running = context.resume();
  const buffer = await _bufferFor(_keyUrl(set, takes[turn], 'down'), context);
  await _start(context, running, buffer, 'typing');
  duck('camera');
  return buffer.duration;
}
