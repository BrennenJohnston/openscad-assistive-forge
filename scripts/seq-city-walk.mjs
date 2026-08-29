/**
 * @license GPL-3.0-or-later
 */
// The ASCII City Walk FRAME-SEQUENCE instrument (CW-67 P3).
//
// A sibling of scripts/stability-city-walk.mjs, not a replacement: that one
// asks whether a nearly-still picture fractures, this one asks what a picture
// does while somebody WALKS THROUGH IT. Round 8 exists because every earlier
// verdict about steadiness was read off a still or off a 2 cm creep, and the
// real walk is 4.8 m/s - thirty times faster than anything that had been
// measured. A still is not a filmstrip.
//
//   node scripts/seq-city-walk.mjs --base-url=http://localhost:5490
//   node scripts/seq-city-walk.mjs --sizes=10,30 --modes=walk,look --colour=on
//   node scripts/seq-city-walk.mjs --pose=786.05,326.77,180 --label=lamp
//   node scripts/seq-city-walk.mjs --gpu-luid=0,101218   (the other adapter)
//
// WHAT IT MEASURES. N consecutive CONVERTED frames under a scripted pose,
// scored cell by cell on the converter's own grid by src/js/game/seq-metrics.js
// - the same module the unit tests pin, imported through the dev server so the
// code under test is the code that runs. Per cell: glyph change, A-B-A flip,
// drive change (intensity level in mono, palette index in colour), reverse
// video / white crossings, mean glyph PERSISTENCE in frames, and whether the
// cell is a churn cell (changed in more than half the frame pairs). Per class,
// from the game's own class pass, with every cell whose class MOVED during the
// sequence split out into its own row: it swept a geometry edge, so its
// flicker is real motion rather than a fracture.
//
// THE MODES, and what each is for:
//
//   stand      the control. It must read zero. A non-zero stand row means the
//              world is still moving and nothing else in the run means anything.
//   walk       4.8 m/s at the converter's 30/s governor = 0.16 m per converted
//              frame. This is the walk a player does.
//   walkclamp  the dt-clamped worst case, 0.48 m per frame - what a 10 fps
//              machine steps between two conversions.
//   look       1.5 deg of yaw per frame, a moderate mouse sweep.
//   creep      CW-52's 2 cm step, kept as the comparator to the old verdict.
//   turn       CW-52's 0.05 deg sub-cell rotation, likewise.
//
// WHAT IT REFUSES TO DO:
//
//   * Run headless. Headless Chromium rasterises in software and this project
//     has three rounds of confidently wrong answers from that. The GL string
//     is printed on every table and a software renderer aborts the run.
//   * Measure a tree it cannot identify. It fetches one served module and
//     requires a marker string. Point --base-url at YOUR server on YOUR port.
//   * Believe a sequence it did not fully capture: every frame is asserted to
//     have folded, the grid is asserted constant, and a sequence that saw no
//     lit cell at all aborts rather than reporting a tidy zero.
//   * Guess which GPU it ran on. Windows hands a non-fullscreen Chromium the
//     power-saving adapter, so on a two-GPU laptop the default is the
//     INTEGRATED one. --gpu-luid=<high>,<low> (from chrome://gpu) picks the
//     other, and the string that comes back is printed either way.
//
// The world's own clock is stopped for the duration (reduced motion halts the
// traffic-light cycle and the weather step), so the only thing that moves in a
// captured sequence is the pose this script sets.
//
// NUMBERS FROM DIFFERENT SESSIONS ARE COMPARABLE HERE in a way the frame-time
// bench's are not - these are the converter's decisions, not milliseconds -
// but the GPU string still belongs on every table, because two drivers'
// texture filtering moves about 1 % of the glyph picks.

import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DEFAULTS = {
  baseUrl: process.env.PW_BASE_URL || 'http://localhost:5490',
  city: 'seattle',
  // The size ladder is 10/30/40/50: 10% and 20% are the SAME 2x4 px cell
  // here, because the font floor is 3 px.
  sizes: '10,50',
  modes: 'stand,walk,look',
  colour: 'off',
  // Three frames is the minimum an A-B-A flip can be seen in; 24 is what the
  // Round 8 baseline tables are taken at.
  frames: 24,
  // 4.8 m/s at 30 conversions/s. Both halves of that are the game's own
  // numbers, not this script's.
  walkStepM: 0.16,
  clampStepM: 0.48,
  creepM: 0.02,
  lookDeg: 1.5,
  turnDeg: 0.05,
  // --pose=x,y,headingDeg[,pitchDeg] starts somewhere other than the spawn.
  // The pitch is optional and is what a ground-only pose needs (-35 puts the
  // pavement across the whole lower frame).
  pose: '',
  out: '',
  label: '',
  json: '',
  width: 1600,
  height: 900,
  // The marker is this module, which only a tree carrying CW-67 serves.
  marker: 'createFold',
  markerPath: '/src/js/game/seq-metrics.js',
  // --video=0 skips the WebM (the contact sheet is the still record; the
  // WebM is what the owner watches at a gate).
  video: 1,
  sheetCols: 4,
  sheetScale: 0.5,
  flipScale: 3,
  classScale: 2,
  // --hysteresis leaves the game's own CW-68 setting alone when empty (the
  // default), turns it off with `off`, or sets the bands with
  // `glyph,drive,reverse,holdFrames`. A release measuring a converter change
  // photographs before and after against ONE scene in ONE run this way; give
  // each run its own --label so the pictures do not overwrite each other.
  hysteresis: '',
  // --gpu-luid=high,low selects a D3D adapter (Chromium --use-adapter-luid).
  // Empty means whatever Windows hands out, which on this laptop is the
  // integrated GPU.
  gpuLuid: '',
}

const CITY_BUTTONS = {
  seattle: 'Seattle, Washington',
  burnaby: 'Burnaby, British Columbia',
  denver: 'Denver, Colorado',
  albuquerque: 'Albuquerque, New Mexico',
}

const MODES = ['stand', 'walk', 'walkclamp', 'look', 'creep', 'turn']

function parseArgs(argv) {
  const opts = { ...DEFAULTS }
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg)
    if (!m) throw new Error(`unrecognised argument: ${arg}`)
    const key = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    if (!(key in opts)) throw new Error(`unknown option: --${m[1]}`)
    const raw = m[2] ?? 'true'
    opts[key] = typeof opts[key] === 'number' ? Number(raw) : raw
  }
  if (opts.frames < 3) {
    throw new Error(
      `--frames=${opts.frames}: an A-B-A flip cannot be seen in fewer than 3 frames`
    )
  }
  return opts
}

const list = (s) =>
  String(s)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

/**
 * The GL renderer this Chromium actually got. Read on the page that is about
 * to be measured, and printed whether or not anybody asked.
 */
async function readGlRenderer(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return { renderer: null, version: null }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    return {
      renderer: dbg
        ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
    }
  })
}

function isSoftwareRenderer(name) {
  return /swiftshader|llvmpipe|software|basic render/i.test(String(name || ''))
}

// ---------------------------------------------------------------------------
// PAGE SIDE. Everything below installProbe runs inside the page: it reaches
// the game through window.__cityWalkGame, folds each frame with the SERVED
// seq-metrics module, and draws the contact sheet, flip map and class map on
// canvases of its own. Keeping the fold here (rather than shipping ~150,000
// glyph indices per frame back over the bridge) is what lets the instrument
// run at the converter's pace instead of the debugger's - and it means the
// module the unit tests cover is literally the module that produced every
// number in the round's tables.
// ---------------------------------------------------------------------------
async function installProbe(modulePath) {
  const metrics = await import(/* @vite-ignore */ modulePath)
  const game = () => window.__cityWalkGame
  const state = { fold: null, sheet: null, sheetCtx: null, tile: 0, cfg: null }

  const api = {
    /** Stop the world's own clock so the pose is the only thing moving. */
    freeze() {
      const g = game()
      g.motionReduced = true
      return { rain: g.rainLevel ?? null }
    },
    pose() {
      const s = game().walkState
      return {
        x: s.x,
        y: s.y,
        headingRad: s.headingRad,
        pitchRad: s.pitchRad ?? 0,
        groundZ: s.groundZ ?? 0,
      }
    },
    setPose(p) {
      const g = game()
      const s = g.walkState
      s.x = p.x
      s.y = p.y
      s.headingRad = p.headingRad
      s.pitchRad = p.pitchRad
      s.groundZ = g.surface ? g.surface.heightAt(p.x, p.y) : p.groundZ
      const eyeZ = 1.7 + s.groundZ
      const cosP = Math.cos(p.pitchRad)
      g.fpCamera.position.set(p.x, p.y, eyeZ)
      g.fpCamera.lookAt(
        p.x + Math.sin(p.headingRad) * cosP,
        p.y + Math.cos(p.headingRad) * cosP,
        eyeZ + Math.sin(p.pitchRad)
      )
      g.altView.invalidate()
    },
    blocked(x, y) {
      return game().collision.isBlocked(x, y)
    },
    conversions() {
      return game().altView.getConvertTotals().samples
    },
    cell() {
      return game().altView.getCellPx()
    },
    palette() {
      return game().altView.getPalette()
    },
    stats() {
      return game().altView.getConvertStats()
    },

    /** Open a fold and the contact sheet it will be tiled into. */
    begin(cfg) {
      const g = game()
      const probe = g.altView.readCellProbe()
      if (!probe) throw new Error('readCellProbe() is empty - is the probe on?')
      const palette = g.altView.getPalette()
      const levels = g.altView.getIntensityLevels()
      const mono = Boolean(probe.intensity)
      if (mono && !levels) throw new Error('mono with no intensity ladder')
      if (!mono && !palette) throw new Error('palette mode with no palette')
      state.cfg = cfg
      state.paletteRgb = palette
        ? palette.map((hex) => [
            parseInt(hex.slice(1, 3), 16),
            parseInt(hex.slice(3, 5), 16),
            parseInt(hex.slice(5, 7), 16),
          ])
        : null
      state.fold = metrics.createFold(probe.cols, probe.rows, {
        mono,
        // The reverse-video atlas rides one past the last drive level.
        reverseIndex: levels ? levels.length : -1,
        whiteIndex: palette
          ? palette.findIndex((hex) => hex.toLowerCase() === '#ffffff')
          : -1,
      })
      const overlay = document.querySelector('canvas.hfm-overlay-canvas')
      state.scratch = document.createElement('canvas')
      state.scratch.width = overlay.width
      state.scratch.height = overlay.height
      state.tileW = Math.round(overlay.width * cfg.sheetScale)
      state.tileH = Math.round(overlay.height * cfg.sheetScale)
      state.tile = 0
      const sheetRows = Math.ceil(cfg.frames / cfg.sheetCols)
      state.sheet = document.createElement('canvas')
      state.sheet.width = state.tileW * cfg.sheetCols
      state.sheet.height = state.tileH * sheetRows
      state.sheetCtx = state.sheet.getContext('2d')
      state.sheetCtx.fillStyle = '#000'
      state.sheetCtx.fillRect(0, 0, state.sheet.width, state.sheet.height)
      return { cols: probe.cols, rows: probe.rows, mono }
    },

    /**
     * The per-cell palette index, read off the painted pixels.
     *
     * In palette mode the DEV probe's intensity and luminance are null by
     * design - there is no intensity ladder to report - so the only place the
     * converter's colour decision survives is the paint. Each cell's opaque
     * pixels are matched to the nearest palette entry and the cell takes the
     * modal one, which is stable under the bloom halo in a way a single
     * sampled pixel is not.
     */
    readColours() {
      const a = state
      const overlay = document.querySelector('canvas.hfm-overlay-canvas')
      const ctx = a.scratch.getContext('2d', { willReadFrequently: true })
      ctx.clearRect(0, 0, a.scratch.width, a.scratch.height)
      ctx.drawImage(overlay, 0, 0)
      const img = ctx.getImageData(0, 0, a.scratch.width, a.scratch.height).data
      const W = a.scratch.width
      const { cols, rows, cells } = a.fold
      const out = new Int8Array(cells).fill(-1)
      const cw = a.cfg.cellW
      const ch = a.cfg.cellH
      const pal = a.paletteRgb
      const counts = new Int32Array(pal.length)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          counts.fill(0)
          let any = 0
          const x0 = c * cw
          const y0 = r * ch
          for (let y = y0; y < y0 + ch; y++) {
            let p = (y * W + x0) * 4
            for (let x = 0; x < cw; x++, p += 4) {
              if (img[p + 3] < 40) continue
              let best = 0
              let bestD = Infinity
              for (let k = 0; k < pal.length; k++) {
                const d =
                  (img[p] - pal[k][0]) ** 2 +
                  (img[p + 1] - pal[k][1]) ** 2 +
                  (img[p + 2] - pal[k][2]) ** 2
                if (d < bestD) {
                  bestD = d
                  best = k
                }
              }
              counts[best]++
              any++
            }
          }
          if (!any) continue
          let bestIndex = 0
          for (let k = 1; k < pal.length; k++) {
            if (counts[k] > counts[bestIndex]) bestIndex = k
          }
          out[r * cols + c] = bestIndex
        }
      }
      return out
    },

    /** Fold the frame that is on screen, and tile it into the contact sheet. */
    step() {
      const a = state
      const g = game()
      const probe = g.altView.readCellProbe()
      if (!probe) throw new Error('readCellProbe() went empty mid-sequence')
      const cls = g.classPass.read(g.fpCamera, a.fold.cols, a.fold.rows)
      metrics.foldFrame(a.fold, {
        glyphs: probe.glyphs,
        intensity: probe.intensity,
        lum: probe.lum,
        colour: a.fold.mono ? null : api.readColours(),
        cls,
      })
      const overlay = document.querySelector('canvas.hfm-overlay-canvas')
      const col = a.tile % a.cfg.sheetCols
      const row = Math.floor(a.tile / a.cfg.sheetCols)
      a.sheetCtx.drawImage(
        overlay,
        col * a.tileW,
        row * a.tileH,
        a.tileW,
        a.tileH
      )
      a.sheetCtx.fillStyle = '#ff00ff'
      a.sheetCtx.font = '14px monospace'
      a.sheetCtx.fillText(String(a.tile), col * a.tileW + 4, row * a.tileH + 16)
      a.tile++
      return a.fold.frames
    },

    sheet() {
      return state.sheet.toDataURL('image/png')
    },

    /**
     * One pixel per cell: RED where the drive (or colour) changed, GREEN where
     * the glyph changed, BLUE where the class ever moved. Green arcs on a blue-
     * free field are texture churn; blue bands are geometry edges sweeping.
     */
    flipMap(scale) {
      const f = state.fold
      const pairs = Math.max(1, f.frames - 1)
      const src = document.createElement('canvas')
      src.width = f.cols
      src.height = f.rows
      const sctx = src.getContext('2d')
      const img = sctx.createImageData(f.cols, f.rows)
      for (let i = 0; i < f.cells; i++) {
        img.data[i * 4] = Math.min(255, (f.driveChange[i] / pairs) * 400)
        img.data[i * 4 + 1] = Math.min(255, (f.glyphChange[i] / pairs) * 400)
        img.data[i * 4 + 2] = f.classChanged[i] ? 90 : 0
        img.data[i * 4 + 3] = 255
      }
      sctx.putImageData(img, 0, 0)
      return upscale(src, scale)
    },

    /** Frame 0's classes on the left, the cells whose class moved on the right. */
    classMap(scale) {
      const f = state.fold
      const COLOURS = [
        [10, 10, 40],
        [90, 60, 20],
        [60, 60, 60],
        [200, 200, 0],
        [160, 40, 40],
        [120, 0, 160],
        [0, 200, 200],
        [255, 120, 0],
        [180, 180, 255],
        [0, 160, 0],
        [255, 0, 255],
        [255, 255, 255],
        [255, 100, 100],
        [0, 90, 140],
        [40, 120, 40],
      ]
      const gap = 4
      const src = document.createElement('canvas')
      src.width = f.cols * 2 + gap
      src.height = f.rows
      const sctx = src.getContext('2d')
      const img = sctx.createImageData(src.width, f.rows)
      for (let r = 0; r < f.rows; r++) {
        for (let c = 0; c < f.cols; c++) {
          const i = r * f.cols + c
          const rgb = COLOURS[f.firstClass[i]] ?? [255, 0, 0]
          let p = (r * src.width + c) * 4
          img.data[p] = rgb[0]
          img.data[p + 1] = rgb[1]
          img.data[p + 2] = rgb[2]
          img.data[p + 3] = 255
          p = (r * src.width + f.cols + gap + c) * 4
          img.data[p] = Math.min(255, f.classToggles[i] * 40)
          img.data[p + 1] = f.classChanged[i] ? 60 : 0
          img.data[p + 2] = f.classChanged[i] ? 120 : 0
          img.data[p + 3] = 255
        }
      }
      sctx.putImageData(img, 0, 0)
      return upscale(src, scale)
    },

    finish() {
      return metrics.finishFold(state.fold)
    },
  }

  function upscale(src, scale) {
    const out = document.createElement('canvas')
    out.width = src.width * scale
    out.height = src.height * scale
    const ctx = out.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(src, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  }

  window.__seqApi = api
  return true
}

// ---------------------------------------------------------------------------
// NODE SIDE
// ---------------------------------------------------------------------------
async function enterCity(page, opts) {
  const buttonName = CITY_BUTTONS[opts.city]
  if (!buttonName) throw new Error(`unknown city: ${opts.city}`)
  await page.goto(`${opts.baseUrl}/?hfm=unlock`, { waitUntil: 'load' })
  const gl = await readGlRenderer(page)
  if (!gl.renderer) throw new Error('no WebGL context at all - cannot measure')
  if (isSoftwareRenderer(gl.renderer)) {
    throw new Error(
      `"${gl.renderer}" is a software rasteriser. Aborting: every number ` +
        `this instrument reports is about texture filtering and per-cell ` +
        `luminance, which is the first thing a software rasteriser does ` +
        `differently.`
    )
  }
  await page
    .locator('#cityWalkCard')
    .waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('#cityWalkLaunchBtn').click()
  await page.locator('#cityWalkLayer').waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: buttonName }).click()
  await page
    .locator('#cityWalkHudStatus')
    .filter({ hasText: 'street view' })
    .waitFor({ timeout: 90000 })
  const ok = await page.evaluate(
    () => typeof window.__cityWalkGame?.altView?.setCellProbe === 'function'
  )
  if (!ok) {
    throw new Error(
      'setCellProbe() is missing: this is not a dev-server build carrying ' +
        'the CW-52 cell probe, so there is nothing to read.'
    )
  }
  return gl
}

async function setSize(page, wanted) {
  const start = await page.evaluate(() =>
    window.__cityWalkGame.altView.getFontScale()
  )
  const steps = Math.round((start - wanted) / 0.1)
  const key = steps >= 0 ? 'Minus' : 'Equal'
  for (let i = 0; i < Math.abs(steps); i++) await page.keyboard.press(key)
  const got = await page.evaluate(() =>
    window.__cityWalkGame.altView.getFontScale()
  )
  if (Math.abs(got - wanted) > 1e-6) {
    throw new Error(`character size is ${got}, asked for ${wanted}`)
  }
  return got
}

/**
 * Apply --hysteresis, and report what the instance ended up with.
 *
 * An empty argument leaves the game's own configuration in place: the
 * instrument's job is to photograph what ships, and it must not silently
 * change the thing it is measuring.
 *
 * @returns {Promise<{glyph: number, drive: number, holdFrames: number}|null>}
 */
async function applyHysteresis(page, arg) {
  if (!arg) {
    return page.evaluate(
      () => window.__cityWalkGame.altView.getTemporalHysteresis?.() ?? null
    )
  }
  let wanted = null
  if (arg !== 'off' && arg !== 'none') {
    const [glyph, drive, reverse, holdFrames] = list(arg).map(Number)
    if (
      ![glyph, drive, reverse, holdFrames].every((n) => Number.isFinite(n))
    ) {
      throw new Error(
        `--hysteresis=${arg}: expected "off" or ` +
          `"glyph,drive,reverse,holdFrames"`
      )
    }
    wanted = { glyph, drive, reverse, holdFrames }
  }
  const set = await page.evaluate(
    (h) => window.__cityWalkGame.altView.setTemporalHysteresis?.(h) ?? null,
    wanted
  )
  if (wanted && !set) {
    throw new Error(
      'this tree has no setTemporalHysteresis() - --hysteresis needs CW-68'
    )
  }
  return set
}

/** Wait for the converter to produce one more frame than it had. */
async function convertOnce(page) {
  const before = await page.evaluate(() => window.__seqApi.conversions())
  await page.evaluate(() => window.__cityWalkGame.altView.invalidate())
  await page.waitForFunction((n) => window.__seqApi.conversions() > n, before, {
    timeout: 15000,
  })
}

/**
 * The poses of one sequence, generated analytically.
 *
 * Analytically, not by pressing keys: a key-driven walk is dt-based, so two
 * runs of the same sequence cover different ground and are then scored
 * against different scenery. The step sizes are the game's own - 0.16 m is
 * 4.8 m/s at the converter's 30/s governor.
 */
function generatePoses(mode, start, frames, opts) {
  const out = []
  for (let f = 0; f < frames; f++) {
    const pose = { ...start }
    if (mode === 'stand') {
      // the control: nothing moves
    } else if (mode === 'walk' || mode === 'walkclamp' || mode === 'creep') {
      const step =
        mode === 'walk'
          ? opts.walkStepM
          : mode === 'walkclamp'
            ? opts.clampStepM
            : opts.creepM
      const d = step * f
      pose.x = start.x + Math.sin(start.headingRad) * d
      pose.y = start.y + Math.cos(start.headingRad) * d
    } else if (mode === 'look' || mode === 'turn') {
      const deg = (mode === 'look' ? opts.lookDeg : opts.turnDeg) * f
      pose.headingRad = start.headingRad + (deg * Math.PI) / 180
    } else {
      throw new Error(`unknown mode: ${mode} (known: ${MODES.join(', ')})`)
    }
    out.push(pose)
  }
  return out
}

async function runSequence(page, opts, out, tag, poses, cell) {
  await page.evaluate((p) => window.__seqApi.setPose(p), poses[0])
  await convertOnce(page)
  const grid = await page.evaluate(
    (cfg) => window.__seqApi.begin(cfg),
    {
      sheetCols: opts.sheetCols,
      sheetScale: opts.sheetScale,
      frames: opts.frames,
      cellW: cell.w,
      cellH: cell.h,
    }
  )
  const t0 = Date.now()
  for (let f = 0; f < poses.length; f++) {
    const before = await page.evaluate(() => window.__seqApi.conversions())
    await page.evaluate((p) => window.__seqApi.setPose(p), poses[f])
    await page.waitForFunction(
      (n) => window.__seqApi.conversions() > n,
      before,
      { timeout: 15000 }
    )
    const folded = await page.evaluate(() => window.__seqApi.step())
    if (folded !== f + 1) {
      throw new Error(
        `frame ${f} did not fold (the fold has ${folded} frames) - a ` +
          `sequence that silently measured nothing is this project's ` +
          `recorded failure mode`
      )
    }
  }
  const result = await page.evaluate(() => window.__seqApi.finish())
  if (result.frames !== opts.frames) {
    throw new Error(`captured ${result.frames} frames, asked for ${opts.frames}`)
  }
  if (result.total.lit === 0) {
    throw new Error(
      'not one cell was lit in the whole sequence - the picture was blank, ' +
        'and every rate below it would have been a tidy, meaningless zero'
    )
  }
  const stats = await page.evaluate(() => window.__seqApi.stats())
  const write = async (name, expr, arg) => {
    const url = await page.evaluate(expr, arg)
    writeFileSync(
      join(out, `${tag}-${name}.png`),
      Buffer.from(url.split(',')[1], 'base64')
    )
  }
  await write('sheet', () => window.__seqApi.sheet())
  await write('flipmap', (s) => window.__seqApi.flipMap(s), opts.flipScale)
  await write('classmap', (s) => window.__seqApi.classMap(s), opts.classScale)
  return {
    ...result,
    tag,
    grid,
    cell,
    usedGpu: stats.usedGpu,
    seconds: (Date.now() - t0) / 1000,
  }
}

function printSequence(res, mono) {
  const t = res.total
  console.log(
    `[${res.tag}] ${res.cols}x${res.rows} ${res.frames} fr in ` +
      `${res.seconds.toFixed(1)} s · path ${res.usedGpu ? 'gpu' : 'cpu'} · ` +
      `lit ${(res.litShareMean * 100).toFixed(1)}% · class-moved ${res.classChangedCells}`
  )
  console.log(
    `  TOTAL glyph chg ${t.glyphChangePct}% flip ${t.glyphFlipPct}% · ` +
      `${mono ? 'drive' : 'colour'} chg ${t.driveOrColourChangePct}% flip ` +
      `${t.driveOrColourFlipPct}% · ${mono ? 'reverse' : 'white'} toggles ` +
      `${t.reverseOrWhiteToggles} · churn cells ${t.churnCellsPct}% · ` +
      `mean glyph persistence ${t.meanGlyphPersistenceFrames} fr · ` +
      `ghost ${res.ghostPct}% of ${res.classMoveLitEvents} inked class ` +
      `moves (${res.classMoveEvents} in all)`
  )
  // The first eight AND the last, always. The planning session's tables
  // recorded "58.5 -> 55.7" for a 24-frame walk because an earlier version of
  // this line printed the first eight values and an ellipsis, and the eighth
  // reads like the end of the sequence. It was not: that walk ends at 49.7.
  const shares = mono ? res.reverseShare : res.whiteShare
  const pc = (v) => (v * 100).toFixed(2)
  console.log(
    `  ${mono ? 'reverse' : 'white'} share per frame: ` +
      shares.slice(0, 8).map(pc).join(' ') +
      (shares.length > 8
        ? ` ... (frame ${shares.length - 1}) ${pc(shares[shares.length - 1])}`
        : '') +
      `  [min ${pc(Math.min(...shares))} max ${pc(Math.max(...shares))}]`
  )
  console.log(
    `  | class | cells | lit | glyph chg% | glyph FLIP% | ${mono ? 'drive' : 'colour'} chg% | flip% | ${mono ? 'rev' : 'white'} tog | churn% | persist |`
  )
  console.log('  |---|---|---|---|---|---|---|---|---|---|')
  for (const row of [...res.perClass, res.edge]) {
    if (row.cells < 40) continue
    console.log(
      `  | ${row.name} | ${row.cells} | ${row.lit} | ${row.glyphChangePct} | ` +
        `${row.glyphFlipPct} | ${row.driveOrColourChangePct} | ` +
        `${row.driveOrColourFlipPct} | ${row.reverseOrWhiteToggles} | ` +
        `${row.churnCellsPct} | ${row.meanGlyphPersistenceFrames} |`
    )
  }
  if (res.classPairs.length) {
    console.log(
      '  top class pairs: ' +
        res.classPairs.map(([k, v]) => `${k}=${v}`).join(' ')
    )
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const sizes = list(opts.sizes).map(Number)
  const modes = list(opts.modes)
  for (const mode of modes) {
    if (!MODES.includes(mode)) {
      throw new Error(`unknown mode: ${mode} (known: ${MODES.join(', ')})`)
    }
  }
  const out = opts.out || join(process.cwd(), 'seq-out')
  mkdirSync(out, { recursive: true })

  const args = [
    // Chromium throttles rAF to 1 Hz when it believes the window is occluded,
    // which once turned a real measurement into a flat line (CW-12).
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ]
  if (opts.gpuLuid) args.push(`--use-adapter-luid=${opts.gpuLuid}`)
  const browser = await chromium.launch({ headless: false, args })
  const contextOptions = {
    deviceScaleFactor: 1,
    viewport: { width: opts.width, height: opts.height },
    colorScheme: 'dark',
    // The instrument sets the pose itself; the game's own easing would be a
    // second thing moving in a sequence that is meant to have exactly one.
    reducedMotion: 'reduce',
  }
  if (Number(opts.video)) {
    contextOptions.recordVideo = {
      dir: out,
      size: { width: opts.width, height: opts.height },
    }
  }
  const context = await browser.newContext(contextOptions)
  const colourOn = opts.colour === 'on'
  await context.addInitScript((on) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    localStorage.setItem('openscad-forge-city-walk-colour', on ? 'on' : 'off')
    // CW-42: the instrument measures the size IT sets. The inert forced-probe
    // map stops the entry calibration on its first frame and the cleared keys
    // keep a previous real calibration from seeding the landing.
    window.__cityWalkCalibrationForce = {}
    localStorage.removeItem('openscad-forge-city-walk-calibrated-floor')
    localStorage.removeItem('openscad-forge-city-walk-font-scale')
  }, colourOn)
  const page = await context.newPage()

  const results = []
  try {
    // Is the server on the other end of --base-url serving THIS tree? A dev
    // server from another checkout has answered for this project before and
    // produced a full red-then-green proof that meant nothing.
    const probe = await page.request.get(opts.baseUrl + opts.markerPath)
    if (!probe.ok()) {
      throw new Error(
        `cannot read ${opts.markerPath} from ${opts.baseUrl} ` +
          `(HTTP ${probe.status()}) - is the dev server running there?`
      )
    }
    if (!(await probe.text()).includes(opts.marker)) {
      throw new Error(
        `${opts.baseUrl} serves ${opts.markerPath} without "${opts.marker}" ` +
          `in it. That is somebody else's checkout - point --base-url at ` +
          `your own server.`
      )
    }
    const gl = await enterCity(page, opts)
    await page.evaluate(installProbe, opts.markerPath)
    const world = await page.evaluate(() => window.__seqApi.freeze())
    const palette = await page.evaluate(() => window.__seqApi.palette())
    console.log(`GL: ${gl.renderer}`)
    console.log(
      `city ${opts.city} · ${palette ? 'colour ' + palette.join(',') : 'mono'} · ` +
        `rain ${world.rain ?? 'off'} · adapter ${opts.gpuLuid || 'default (whatever Windows hands out)'}`
    )
    if (colourOn && !palette) {
      throw new Error('--colour=on but the game is in mono - nothing to score')
    }
    if (!colourOn && palette) {
      throw new Error('--colour=off but the game is in palette mode')
    }

    await page.evaluate(() => window.__cityWalkGame.altView.setCellProbe(true))
    const hysteresis = await applyHysteresis(page, opts.hysteresis)
    console.log(
      `hysteresis: ${hysteresis ? JSON.stringify(hysteresis) : 'OFF'}` +
        (opts.hysteresis ? '' : " (the game's own setting, untouched)")
    )
    let start = await page.evaluate(() => window.__seqApi.pose())
    if (opts.pose) {
      const [px, py, headingDeg, pitchDeg] = String(opts.pose)
        .split(',')
        .map(Number)
      start = {
        ...start,
        x: px,
        y: py,
        headingRad: (headingDeg * Math.PI) / 180,
        pitchRad: Number.isFinite(pitchDeg)
          ? (pitchDeg * Math.PI) / 180
          : start.pitchRad,
      }
    }
    await page.evaluate((p) => window.__seqApi.setPose(p), start)
    console.log(
      `start pose x ${start.x.toFixed(2)} y ${start.y.toFixed(2)} heading ` +
        `${((start.headingRad * 180) / Math.PI).toFixed(1)} deg pitch ` +
        `${((start.pitchRad * 180) / Math.PI).toFixed(1)} deg`
    )
    // A walk that runs into a wall is a different scene from a walk that does
    // not, and the two are not comparable. Say so before measuring, not after.
    const runM = Math.max(opts.walkStepM, opts.clampStepM) * opts.frames
    const blockedAt = await page.evaluate(
      ({ s, run }) => {
        for (let d = 0; d <= run; d += 0.25) {
          const x = s.x + Math.sin(s.headingRad) * d
          const y = s.y + Math.cos(s.headingRad) * d
          if (window.__seqApi.blocked(x, y)) return d
        }
        return null
      },
      { s: start, run: runM }
    )
    console.log(
      `walk corridor: ${
        blockedAt === null
          ? `clear for ${runM.toFixed(1)} m`
          : `BLOCKED at ${blockedAt} m - the walk sequences leave the corridor`
      }`
    )

    for (const size of sizes) {
      await setSize(page, size / 100)
      const cell = await page.evaluate(() => window.__seqApi.cell())
      console.log(`\n-- size ${size}% cell ${cell.w}x${cell.h} px --`)
      for (const mode of modes) {
        const poses = generatePoses(mode, start, opts.frames, opts)
        const tag = `${opts.label || 'run'}-${colourOn ? 'colour' : 'mono'}-${size}-${mode}`
        const res = await runSequence(page, opts, out, tag, poses, cell)
        results.push({
          ...res,
          size,
          mode,
          glRenderer: gl.renderer,
          hysteresis,
        })
        printSequence(res, res.mono)
      }
    }
    await page.evaluate(() => window.__cityWalkGame.altView.setCellProbe(false))
  } finally {
    const video = page.video()
    await context.close()
    if (video) {
      const from = await video.path()
      const to = join(out, `${opts.label || 'run'}-${opts.colour}-video.webm`)
      try {
        if (existsSync(from)) renameSync(from, to)
        console.log(`video ${to}`)
      } catch {
        console.log(`video ${from}`)
      }
    }
    await browser.close()
  }

  console.log('\n=== SUMMARY ===')
  console.log(`GL: ${results[0]?.glRenderer ?? 'unknown'}`)
  console.log(
    '| tag | cell px | glyph chg% | glyph FLIP% | drive/colour chg% | rev/white toggles | churn% | persistence fr | class-moved | GL |'
  )
  console.log('|---|---|---|---|---|---|---|---|---|---|')
  for (const r of results) {
    const t = r.total
    console.log(
      `| ${r.tag} | ${r.cell.w}x${r.cell.h} | ${t.glyphChangePct} | ` +
        `${t.glyphFlipPct} | ${t.driveOrColourChangePct} | ` +
        `${t.reverseOrWhiteToggles} | ${t.churnCellsPct} | ` +
        `${t.meanGlyphPersistenceFrames} | ${r.classChangedCells} | ${r.glRenderer} |`
    )
  }
  console.log(`\npictures in ${out}`)
  if (opts.json) {
    writeFileSync(opts.json, JSON.stringify(results, null, 1))
    console.log(`json ${opts.json}`)
  }
}

main().catch((err) => {
  console.error(String(err?.stack || err))
  process.exitCode = 1
})
