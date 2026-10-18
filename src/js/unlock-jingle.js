/**
 * The short tune that plays when the Alt View is found: three original
 * phrases end to end (a triumph motif, a rising arpeggio, a two-step
 * fanfare), each at three quarters of its first speed with its pitch kept.
 * It is synthesized from these notes in the browser, so nothing is
 * downloaded. Each phrase is levelled to the same peak before they are
 * joined, as the version that was chosen was.
 * @license GPL-3.0-or-later
 */

const SPEED = 0.75;
const STRETCH = 1 / SPEED;
const SAMPLE_RATE = 44100;
// The tune's peak, 16 dB under full scale: it then plays a few dB over the
// look's power sound, inside the band the other sounds keep
// (crt-sounds.js), instead of over a video playing in another tab.
const PEAK = 0.16;
// A browser that has not let the page make sound yet leaves a new audio
// context waiting; past this the tune is given up.
const START_TIMEOUT_MS = 1000;

const SEMITONES = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/**
 * @param {string} name - A note such as 'A4' or 'F#5'
 * @returns {number} Its frequency in hertz, A4 at 440
 */
export function noteFrequency(name) {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) throw new Error(`Not a note: ${name}`);
  const semis = SEMITONES[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** (semis / 12);
}

const pulse = (note, t, dur, duty, extra = {}) => ({
  note,
  t,
  dur,
  type: 'pulse',
  duty,
  ...extra,
});
const triangle = (note, t, dur, extra = {}) => ({
  note,
  t,
  dur,
  type: 'triangle',
  ...extra,
});

// At full speed: each phrase's notes, and how long it lasts before the next.
const PHRASES = [
  {
    length: 0.85,
    notes: [
      pulse('G5', 0, 0.08, 0.25, { gain: 0.16, release: 0.02 }),
      pulse('G5', 0.1, 0.08, 0.25, { gain: 0.16, release: 0.02 }),
      pulse('G5', 0.2, 0.08, 0.25, { gain: 0.16, release: 0.02 }),
      pulse('D6', 0.3, 0.5, 0.25, { gain: 0.16, release: 0.3 }),
      triangle('G3', 0, 0.09, { gain: 0.28, release: 0.02 }),
      triangle('B3', 0.1, 0.09, { gain: 0.28, release: 0.02 }),
      triangle('D4', 0.2, 0.09, { gain: 0.28, release: 0.02 }),
      triangle('G4', 0.3, 0.5, { gain: 0.28, release: 0.3 }),
    ],
  },
  {
    length: 0.85,
    notes: [
      // A step of 0.07 s each, computed as the chosen version computed it:
      // 3 * 0.07 is not 0.21 in floating point, and the sample a note starts
      // on shapes its whole wave.
      ...['C5', 'E5', 'G5', 'C6', 'E6'].map((note, i) =>
        pulse(note, i * 0.07, 0.07, 0.25)
      ),
      pulse('G6', 0.35, 0.45, 0.5, { gain: 0.14, release: 0.25 }),
      triangle('C4', 0.35, 0.45, { gain: 0.3, release: 0.25 }),
    ],
  },
  {
    length: 1.15,
    notes: [
      pulse('D5', 0, 0.08, 0.125),
      pulse('F#5', 0.08, 0.08, 0.125),
      pulse('A5', 0.16, 0.08, 0.125),
      pulse('E5', 0.3, 0.08, 0.125),
      pulse('G#5', 0.38, 0.08, 0.125),
      pulse('B5', 0.46, 0.08, 0.125),
      pulse('D6', 0.6, 0.5, 0.125, { gain: 0.15, release: 0.3 }),
      pulse('A5', 0.6, 0.5, 0.5, { gain: 0.1, release: 0.3 }),
      triangle('D4', 0.6, 0.5, { gain: 0.3, release: 0.3 }),
    ],
  },
];

/**
 * The tune as played: every time stretched, every frequency kept.
 * @returns {{ phrases: Array<{ start: number, length: number, notes: Array<Object> }>, seconds: number }}
 */
export function jingleSchedule() {
  let start = 0;
  const phrases = PHRASES.map(({ length, notes }) => {
    const phrase = {
      start,
      length: length * STRETCH,
      notes: notes.map(
        ({ gain = 0.18, attack = 0.004, release = 0.05, ...n }) => ({
          ...n,
          gain,
          freq: noteFrequency(n.note),
          t: n.t * STRETCH,
          dur: n.dur * STRETCH,
          attack: attack * STRETCH,
          release: release * STRETCH,
        })
      ),
    };
    start += phrase.length;
    return phrase;
  });
  return { phrases, seconds: start };
}

function pulseWave(context, duty) {
  const size = 64;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  for (let i = 1; i < size; i++) {
    real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
  }
  return context.createPeriodicWave(real, imag);
}

function scheduleNote(context, note) {
  const { t, dur, attack, release, gain, freq } = note;
  const osc = context.createOscillator();
  if (note.type === 'pulse') osc.setPeriodicWave(pulseWave(context, note.duty));
  else osc.type = note.type;
  osc.frequency.setValueAtTime(freq, t);
  const level = context.createGain();
  level.gain.setValueAtTime(0, t);
  level.gain.linearRampToValueAtTime(gain, t + attack);
  level.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
  level.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(level).connect(context.destination);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

async function renderPhrase(phrase) {
  const frames = Math.ceil(SAMPLE_RATE * 1.3 * STRETCH);
  const offline = new OfflineAudioContext(1, frames, SAMPLE_RATE);
  phrase.notes.forEach((note) => scheduleNote(offline, note));
  const rendered = await offline.startRendering();
  const data = rendered
    .getChannelData(0)
    .slice(0, Math.ceil(SAMPLE_RATE * phrase.length));
  let peak = 0;
  for (const x of data) peak = Math.max(peak, Math.abs(x));
  const scale = peak > 0 ? PEAK / peak : 1;
  return data.map((x) => x * scale);
}

/**
 * The tune's samples, mono at 44.1 kHz.
 * @returns {Promise<Float32Array>}
 */
export async function renderJingle() {
  const parts = await Promise.all(jingleSchedule().phrases.map(renderPhrase));
  const joined = new Float32Array(
    parts.reduce((n, part) => n + part.length, 0)
  );
  let at = 0;
  for (const part of parts) {
    joined.set(part, at);
    at += part.length;
  }
  return joined;
}

/**
 * Play the tune once. Call it from the press that found the Alt View: the
 * audio context is made before the first wait, inside that press, because a
 * browser lets a page make sound only after a person has used it.
 * @returns {Promise<number>} The tune's length in seconds, once it has begun
 */
export async function playUnlockJingle() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context || typeof OfflineAudioContext === 'undefined') {
    throw new Error('Web Audio is not available');
  }
  const context = new Context();
  const running = context.resume();
  try {
    const samples = await renderJingle();
    const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
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
    source.connect(context.destination);
    source.addEventListener('ended', () => context.close());
    source.start();
    return buffer.duration;
  } catch (error) {
    context.close();
    throw error;
  }
}
