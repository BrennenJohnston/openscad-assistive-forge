/**
 * The Alt View's switch sounds: a screen coming on, a look changing and a
 * screen going off, each a short recording played whole (the recordings
 * and their makers are named in THIRD_PARTY_NOTICES.md). A file is fetched
 * and decoded the first time it is wanted and kept; one sound plays at a
 * time, and the newest one asked for is the one heard.
 * @license GPL-3.0-or-later
 */

const FILES = {
  on: '/sounds/crt-on.wav',
  look: '/sounds/crt-look.wav',
  off: '/sounds/crt-off.wav',
};
// A browser that has not let the page make sound yet leaves the audio
// context waiting; past this the sound is given up.
const START_TIMEOUT_MS = 1000;

let _context = null;
const _buffers = new Map();
let _playing = null;
let _asked = 0;

function _audioContext() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new Error('Web Audio is not available');
  if (!_context || _context.state === 'closed') _context = new Context();
  return _context;
}

async function _fetchBuffer(url, context) {
  const response = await fetch(url);
  const type = response.headers.get('content-type') || '';
  // The dev server answers a missing file with the page itself, status 200.
  if (!response.ok || !type.startsWith('audio/')) {
    throw new Error(
      `${url} is not a sound (${response.status}, ${type || 'no type'})`
    );
  }
  return context.decodeAudioData(await response.arrayBuffer());
}

function _bufferFor(name, context) {
  if (!_buffers.has(name)) {
    const loading = _fetchBuffer(FILES[name], context).catch((error) => {
      _buffers.delete(name);
      throw error;
    });
    _buffers.set(name, loading);
  }
  return _buffers.get(name);
}

/** Ends the sound playing now, if any. */
export function stopCrtSound() {
  if (!_playing) return;
  _playing.stop();
  _playing = null;
}

/**
 * Play one of the three sounds. Call it from the press that switched the
 * look, so the browser lets the sound start.
 * @param {'on'|'look'|'off'} name
 * @returns {Promise<number>} The sound's length in seconds once it has begun;
 *   0 when a later sound was asked for before this one could start
 */
export async function playCrtSound(name) {
  if (!FILES[name]) throw new Error(`No such sound: ${name}`);
  const context = _audioContext();
  const running = context.resume();
  const asked = ++_asked;
  const buffer = await _bufferFor(name, context);
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
  if (asked !== _asked) return 0;
  stopCrtSound();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.addEventListener('ended', () => {
    if (_playing === source) _playing = null;
  });
  source.start();
  _playing = source;
  return buffer.duration;
}
