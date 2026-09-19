/**
 * @license GPL-3.0-or-later
 */
// The ASCII City Walk TEMPORAL stability instrument (CW-52 P0).
//
// The owner's report is about motion, not about a picture: "if you are just
// getting screenshots and not analyzing a video sequence then you might not be
// aware of the distracting, unintended sloppy effect of the fractured
// flashes". A still cannot show a flash, so neither can a still-based metric.
// This measures SEQUENCES: N consecutive converted frames under a scripted,
// exactly repeatable motion, scored cell by cell on the converter's own grid.
//
//   node scripts/stability-city-walk.mjs --base-url=http://localhost:5443
//   node scripts/stability-city-walk.mjs --modes=turn --sizes=10 --frames=32
//
// WHAT IT MEASURES, and why each column is here:
//
//   * FLIP (A-B-A) is the fracture signature. A cell that changes as the view
//     slides is doing its job; a cell that goes back to what it was two frames
//     ago while its neighbours slide on is FLASHING. The plain change rate is
//     printed beside it, because a flip rate means nothing without the change
//     rate it is a fraction of.
//   * The score is taken on the converter's DECISIONS, not on the painted
//     pixels. Reverse video paints a solid cell with the glyph knocked out,
//     and no pixel statistic separates that from a dense glyph reliably - but
//     the drive index says so exactly.
//   * Per SURFACE CLASS, from the game's own class pass, so a lit storefront
//     band and the road under it are never averaged together.
//   * A cell whose CLASS changed during the sequence is excluded from every
//     class row and counted separately: it swept across a geometry edge, and
//     its flicker is real motion rather than a fracture.
//
// WHAT IT REFUSES TO DO:
//
//   * Run headless. Headless Chromium rasterises in software, and this project
//     has three rounds of confidently wrong answers from that. The GL string
//     is printed and a software renderer aborts the run - this instrument is
//     entirely about texture filtering, which is the first thing a software
//     rasteriser does differently.
//   * Measure a tree it cannot identify. It fetches one served module and
//     requires a marker string. Point --base-url at YOUR server on YOUR port.
//   * Believe a sequence it did not fully capture. Every run asserts the frame
//     count, a constant grid, a non-empty lit population and a mono palette -
//     a sweep that silently measured nothing is this project's recorded
//     failure mode, four times over in this round alone.
//
// The world's own clock is stopped for the duration (reduced motion halts the
// traffic-light cycle and the weather step), so the ONLY thing that moves in a
// captured sequence is the pose this script sets. STAND is the control and
// must read zero.

import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DEFAULTS = {
  baseUrl: process.env.PW_BASE_URL || 'http://localhost:5443',
  city: 'seattle',
  // stand = the control (nothing moves); turn = a 0.05 deg sub-cell rotation
  // per frame, CW-41's view shift; creep = a 2 cm sub-cell step per frame;
  // walk = the real walk key, recorded once and REPLAYED for every later
  // variant so that an A/B sees the identical route.
  modes: 'stand,turn,creep',
  sizes: '10,30',
  phosphors: 'green',
  frames: 24,
  turnDeg: 0.05,
  creepM: 0.02,
  walkMs: 90,
  // Runtime variants, measured back to back in ONE session - the only kind of
  // comparison this shared machine supports. See VARIANTS below.
  variants: 'shipped',
  label: '',
  width: 1600,
  height: 900,
  // --pose=x,y,headingDeg starts the sequences somewhere other than the
  // spawn. CW-54 needs it: the frozen traffic that carries the head and tail
  // lamps stands on the arterials, and Seattle's spawn is on a residential
  // street where there is none of it to measure.
  pose: '',
  marker: 'CITY_PAVING',
  markerPath: '/src/js/game/city-scene.js',
  // How close to a quantizer boundary counts as sitting ON it.
  band: 0.03,
  // Candidate hysteresis band widths to SIMULATE. A lever is measured before
  // it is built, and dropped with its table if it measures badly.
  hyst: '0.02,0.04,0.06',
  // --shots=<dir> writes every captured frame of every sequence as a PNG of
  // the ASCII canvas, which is what the eyes-on gate reads.
  shots: '',
  // --flipmap=<dir> writes one picture per sequence of WHERE it fractured.
  flipmap: '',
  json: '',
}

const CITY_BUTTONS = {
  seattle: 'Seattle, Washington',
  burnaby: 'Burnaby, British Columbia',
  denver: 'Denver, Colorado',
  albuquerque: 'Albuquerque, New Mexico',
}

/**
 * Runtime variants, each applied by name inside the page so that one browser
 * session measures all of them against the same scenery.
 *
 * 'shipped'       - every material that carries the cell-raster uniform is
 *                   driven, which is what the game's own size sync does.
 * 'no-<mesh>-bias'- that ONE layer's bias forced to zero, so each layer's
 *                   share of the filter's worth is separable.
 * 'no-cellraster' - every bias forced to zero (CW-41 undone): the upper bound
 *                   on what that filter is worth over a sequence.
 * 'flat-<mesh>'   - the CW-41 blur split, taken to its limit: one layer's
 *                   texture is replaced by a single pixel of its own average
 *                   colour, so the layer keeps its brightness and contributes
 *                   no detail at all. Whichever flattening collapses the
 *                   metric names the mechanism.
 */
const VARIANTS = [
  'shipped',
  'no-cellraster',
  'no-sidewalks-bias',
  'no-ground-bias',
  'no-buildings-bias',
  'no-storefronts-bias',
  'flat-buildings',
  'flat-storefronts',
  'flat-sidewalks',
  'flat-ground',
  'flat-all',
  'aniso-ground',
  'aniso-sidewalks',
  'aniso-buildings',
]

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
  return opts
}

const list = (s) =>
  String(s)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

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
// The page-side half. Everything per-cell stays in the page and only small
// aggregates cross the bridge - a 10% frame is over 150,000 cells, and
// serialising four arrays of that per frame would measure the bridge.
// ---------------------------------------------------------------------------

function installProbe() {
  const game = () => window.__cityWalkGame
  const meshesNamed = (name) => {
    const out = []
    game().scene.traverse((o) => {
      if (o.isMesh && o.name === name) out.push(o)
    })
    return out
  }
  const materialsNamed = (name) => {
    const out = []
    for (const mesh of meshesNamed(name)) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) if (m) out.push(m)
    }
    return out
  }
  const savedMaps = new Map()
  const savedAniso = new Map()

  /** A 1x1 texture holding the average colour of an existing one. */
  const flattenTexture = (texture) => {
    const src = texture.image
    const w = src.width
    const h = src.height
    const read = document.createElement('canvas')
    read.width = w
    read.height = h
    const rctx = read.getContext('2d')
    rctx.drawImage(src, 0, 0)
    const data = rctx.getImageData(0, 0, w, h).data
    let r = 0
    let g = 0
    let b = 0
    const n = w * h
    for (let i = 0; i < n; i++) {
      r += data[i * 4]
      g += data[i * 4 + 1]
      b += data[i * 4 + 2]
    }
    const flat = document.createElement('canvas')
    flat.width = 1
    flat.height = 1
    const fctx = flat.getContext('2d')
    fctx.fillStyle = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`
    fctx.fillRect(0, 0, 1, 1)
    // A NEW texture, never a clone. three.js clone() SHARES the Source, and a
    // shared source means the renderer hands back the already-uploaded
    // original - the first form of this instrument reported every flattened
    // layer as bit-identical to the baseline for exactly that reason.
    const out = new texture.constructor(flat)
    out.wrapS = texture.wrapS
    out.wrapT = texture.wrapT
    out.repeat.copy(texture.repeat)
    out.offset.copy(texture.offset)
    out.colorSpace = texture.colorSpace
    out.minFilter = texture.minFilter
    out.magFilter = texture.magFilter
    out.generateMipmaps = texture.generateMipmaps
    out.anisotropy = texture.anisotropy
    out.needsUpdate = true
    return out
  }

  /**
   * A cheap fingerprint of what the converter last decided, so a variant that
   * changed nothing can be caught being reported under its own name.
   */
  const fingerprint = () => {
    const probe = game().altView.readCellProbe()
    if (!probe) return 'none'
    let h = 2166136261
    for (let i = 0; i < probe.glyphs.length; i++) {
      h ^= probe.glyphs[i] + (probe.intensity ? probe.intensity[i] * 977 : 0)
      h = Math.imul(h, 16777619)
    }
    return String(h >>> 0)
  }

  const api = {
    /** Stop the world's own clock so only the scripted pose moves. */
    freeze() {
      const g = game()
      g.motionReduced = true
      return { rainLevel: g.rainLevel, motionReduced: g.motionReduced }
    },
    pose() {
      const s = game().walkState
      return {
        x: s.x,
        y: s.y,
        headingRad: s.headingRad,
        pitchRad: Number.isFinite(s.pitchRad) ? s.pitchRad : 0,
        groundZ: Number.isFinite(s.groundZ) ? s.groundZ : 0,
      }
    },
    /** Set the pose and re-aim the camera the way the game's own loop does. */
    setPose(p) {
      const g = game()
      const s = g.walkState
      s.x = p.x
      s.y = p.y
      s.headingRad = p.headingRad
      s.pitchRad = p.pitchRad
      s.groundZ = p.groundZ
      const eyeZ = 1.7 + p.groundZ
      const cosP = Math.cos(p.pitchRad)
      g.fpCamera.position.set(p.x, p.y, eyeZ)
      g.fpCamera.lookAt(
        p.x + Math.sin(p.headingRad) * cosP,
        p.y + Math.cos(p.headingRad) * cosP,
        eyeZ + Math.sin(p.pitchRad)
      )
      g.altView.invalidate()
    },
    conversions() {
      return game().altView.getConvertTotals().samples
    },
    /** Every named mesh, whether it is textured, and its cell-raster bias. */
    materials() {
      const out = {}
      game().scene.traverse((o) => {
        if (!o.isMesh || !o.name) return
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) {
          if (!m) continue
          const rec = (out[o.name] ??= {
            meshes: 0,
            textured: false,
            bias: null,
          })
          rec.meshes++
          rec.textured = rec.textured || Boolean(m.map)
          if (m.userData?.cellLodBias) rec.bias = m.userData.cellLodBias.value
        }
      })
      return out
    },
    applyVariant(name) {
      const g = game()
      const cell = g.altView.getCellPx()
      const bias = Math.max(0, Math.log2(Math.max(1, cell.h)))

      // Restore every flattened layer first, so a variant that names fewer
      // layers than the last one cannot inherit its state.
      for (const [meshName, maps] of savedMaps) {
        const mats = materialsNamed(meshName)
        mats.forEach((m, i) => {
          if (maps[i]) m.map = maps[i]
        })
      }
      savedMaps.clear()
      for (const [m, a] of savedAniso) {
        if (m.map) {
          m.map.anisotropy = a
          m.map.needsUpdate = true
        }
      }
      savedAniso.clear()

      const setBias = (meshName, value) => {
        let hits = 0
        for (const m of materialsNamed(meshName)) {
          if (m.userData?.cellLodBias) {
            m.userData.cellLodBias.value = value
            hits++
          }
        }
        return hits
      }
      const flatten = (meshName) => {
        const mats = materialsNamed(meshName)
        const originals = mats.map((m) => m.map ?? null)
        savedMaps.set(meshName, originals)
        let hits = 0
        mats.forEach((m) => {
          if (!m.map) return
          m.map = flattenTexture(m.map)
          hits++
        })
        return hits
      }

      // The shipped baseline: every material that carries the uniform is
      // driven, which is exactly what the game's own setCellRaster does. The
      // variants then turn ONE of them off, so each name says what it removes.
      const biased = []
      g.scene.traverse((o) => {
        if (!o.isMesh || !o.name) return
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) {
          if (m?.userData?.cellLodBias && !biased.includes(o.name)) {
            biased.push(o.name)
          }
        }
      })
      const applied = {}
      for (const n of biased) applied[n] = setBias(n, bias)
      // A variant may be several knobs joined with '+', applied in order after
      // ONE reset - so "no-sidewalks-bias+aniso-sidewalks" is a real third
      // option rather than two runs that cannot be compared.
      for (const part of String(name).split('+')) applyOne(part)
      return finishVariant()

      function applyOne(name) {
      if (name === 'shipped') {
        // nothing more
      } else if (name === 'no-cellraster') {
        for (const n of biased) applied[n] = setBias(n, 0)
      } else if (name.startsWith('no-') && name.endsWith('-bias')) {
        const layer = name.slice(3, -5)
        applied[layer] = setBias(layer, 0)
        if (!applied[layer]) {
          throw new Error(
            `variant ${name} changed nothing: no mesh called "${layer}" ` +
              `carries a cell-raster uniform, so the run would have measured ` +
              `the baseline under another name`
          )
        }
      } else if (name.startsWith('aniso-')) {
        // The physically right tool for a GRAZING surface, which a uniform mip
        // bias is not: the ground plane is the one texture in this city seen
        // almost edge-on, where the isotropic LOD picks the larger derivative
        // and throws the along-view detail away.
        const layer = name.slice(6)
        let hits = 0
        for (const m of materialsNamed(layer)) {
          if (m.map) {
            savedAniso.set(m, m.map.anisotropy)
            m.map.anisotropy = 16
            m.map.needsUpdate = true
            hits++
          }
        }
        applied[layer] = hits
        if (!hits) throw new Error(`variant ${name} found no textured mesh`)
      } else if (name === 'flat-all') {
        for (const n of ['buildings', 'storefronts', 'sidewalks', 'ground']) {
          applied[n] = flatten(n)
        }
      } else if (name.startsWith('flat-')) {
        const layer = name.slice(5)
        applied[layer] = flatten(layer)
        if (!applied[layer]) {
          throw new Error(
            `variant ${name} changed nothing: no textured mesh called ` +
              `"${layer}" is in this scene, so the run would have measured ` +
              `the baseline under another name`
          )
        }
      } else {
        throw new Error('unknown variant ' + name)
      }
      }

      function finishVariant() {
        g.altView.invalidate()
        return { bias, applied }
      }
    },
    fingerprint,
    begin(opts) {
      const g = game()
      const probe = g.altView.readCellProbe()
      if (!probe) throw new Error('readCellProbe() is off or empty')
      if (!probe.intensity || !probe.lum) {
        throw new Error(
          'the converter is not in its intensity path - there are no drive ' +
            'decisions to score'
        )
      }
      const levels = g.altView.getIntensityLevels()
      if (!levels || levels.length < 2) {
        throw new Error('no intensity levels are active')
      }
      const n = probe.cols * probe.rows
      window.__cw52 = {
        cols: probe.cols,
        rows: probe.rows,
        band: opts.band,
        // The reverse-video atlas rides at the END of the level array, so its
        // index is the level count. Reading it rather than assuming it keeps
        // this honest if a level is ever added.
        reverseIndex: levels.length,
        frames: 0,
        prev: null,
        prev2: null,
        cls: null,
        prevCls: null,
        classChanged: new Uint8Array(n),
        classToggles: new Int32Array(n),
        // Which pair of ids a cell alternates between, counted over the whole
        // sequence. A cell SWEEPING across a real edge transitions once; a
        // cell whose two surfaces are fighting for the same depth transitions
        // again and again, and only this histogram tells them apart.
        pairs: new Map(),
        maxLum: new Float32Array(n).fill(-1),
        nearRev: new Uint8Array(n),
        nearMid: new Uint8Array(n),
        gChange: new Int32Array(n),
        iChange: new Int32Array(n),
        rToggle: new Int32Array(n),
        gOsc: new Int32Array(n),
        iOsc: new Int32Array(n),
        lumAbs: new Float64Array(n),
        // A hysteresis lever, simulated before it is built (CW-30). For each
        // candidate band width, run a sticky quantizer over the same cell
        // luminances and count what it would have BOUGHT (drive changes it
        // prevents) and what it would have COST (frames a cell spends held at
        // a level its own luminance is no longer anywhere near - the
        // screen-space smear a moving camera would produce).
        hyst: opts.hystBands.map((h) => ({
          h,
          level: new Int8Array(n).fill(-1),
          changes: 0,
          revToggles: 0,
          heldWrong: 0,
        })),
      }
      return { cols: probe.cols, rows: probe.rows, cells: n }
    },
    /** Fold one converted frame into the accumulators. */
    step() {
      const a = window.__cw52
      const g = game()
      const probe = g.altView.readCellProbe()
      if (!probe) throw new Error('readCellProbe() returned nothing')
      if (probe.cols !== a.cols || probe.rows !== a.rows) {
        throw new Error(
          `grid moved mid-sequence: ${a.cols}x${a.rows} -> ` +
            `${probe.cols}x${probe.rows}`
        )
      }
      const cls = g.classPass.read(g.fpCamera, a.cols, a.rows)
      if (!cls || cls.length !== a.cols * a.rows) {
        throw new Error('the class pass returned no map')
      }
      const n = a.cols * a.rows
      if (!a.cls) {
        a.cls = Uint8Array.from(cls)
      } else {
        for (let i = 0; i < n; i++) {
          if (cls[i] !== a.cls[i]) a.classChanged[i] = 1
          const was = a.prevCls[i]
          if (cls[i] !== was) {
            a.classToggles[i]++
            const key = was < cls[i] ? `${was}>${cls[i]}` : `${cls[i]}>${was}`
            a.pairs.set(key, (a.pairs.get(key) ?? 0) + 1)
          }
        }
      }
      a.prevCls = Uint8Array.from(cls)
      const lum = probe.lum
      const inten = probe.intensity
      const glyph = probe.glyphs
      const band = a.band
      for (let i = 0; i < n; i++) {
        const l = lum[i]
        if (l > a.maxLum[i]) a.maxLum[i] = l
        if (Math.abs(l - 0.8) <= band) a.nearRev[i] = 1
        if (Math.abs(l - 0.5) <= band) a.nearMid[i] = 1
      }
      // The sticky-quantizer simulation, run on the SAME luminances the
      // converter just decided from.
      for (const sim of a.hyst) {
        const h = sim.h
        for (let i = 0; i < n; i++) {
          const l = lum[i]
          const plain = l >= 0.8 ? 2 : l >= 0.5 ? 1 : 0
          const was = sim.level[i]
          let now = plain
          if (was >= 0 && plain !== was) {
            // Only cross a boundary once the luminance is CLEAR of it.
            const edge = plain > was ? (was === 0 ? 0.5 : 0.8) : was === 2 ? 0.8 : 0.5
            if (Math.abs(l - edge) < h) now = was
          }
          if (was >= 0) {
            if (now !== was) {
              sim.changes++
              if ((was === 2) !== (now === 2)) sim.revToggles++
            }
            if (now !== plain) sim.heldWrong++
          }
          sim.level[i] = now
        }
      }
      const p = a.prev
      const p2 = a.prev2
      if (p) {
        const rev = a.reverseIndex
        for (let i = 0; i < n; i++) {
          if (glyph[i] !== p.glyph[i]) a.gChange[i]++
          if (inten[i] !== p.inten[i]) {
            a.iChange[i]++
            if ((p.inten[i] === rev) !== (inten[i] === rev)) a.rToggle[i]++
          }
          a.lumAbs[i] += Math.abs(lum[i] - p.lum[i])
          if (p2) {
            if (glyph[i] !== p.glyph[i] && glyph[i] === p2.glyph[i]) a.gOsc[i]++
            if (inten[i] !== p.inten[i] && inten[i] === p2.inten[i]) a.iOsc[i]++
          }
        }
      }
      a.prev2 = p
      a.prev = {
        glyph: Int16Array.from(glyph),
        inten: Int8Array.from(inten),
        lum: Float32Array.from(lum),
      }
      a.frames++
      return a.frames
    },
    /**
     * A picture of WHERE the frame is fracturing: one pixel per cell, green
     * for glyph flips and red for drive flips, upscaled so it can be looked
     * at. A table says how much; this says where, which is what decides
     * whether a number is the defect the owner reported or a different one.
     */
    flipImage(scale) {
      const a = window.__cw52
      const src = document.createElement('canvas')
      src.width = a.cols
      src.height = a.rows
      const sctx = src.getContext('2d')
      const img = sctx.createImageData(a.cols, a.rows)
      let peak = 1
      for (let i = 0; i < a.cols * a.rows; i++) {
        peak = Math.max(peak, a.gOsc[i], a.iOsc[i])
      }
      for (let i = 0; i < a.cols * a.rows; i++) {
        img.data[i * 4] = Math.min(255, (a.iOsc[i] / peak) * 255 * 3)
        img.data[i * 4 + 1] = Math.min(255, (a.gOsc[i] / peak) * 255 * 3)
        img.data[i * 4 + 2] = a.classChanged[i] ? 70 : 0
        img.data[i * 4 + 3] = 255
      }
      sctx.putImageData(img, 0, 0)
      const out = document.createElement('canvas')
      out.width = a.cols * scale
      out.height = a.rows * scale
      const octx = out.getContext('2d')
      octx.imageSmoothingEnabled = false
      octx.drawImage(src, 0, 0, out.width, out.height)
      return { url: out.toDataURL('image/png'), peak }
    },
    /** Collapse the per-cell counters into per-class rows. */
    finish() {
      const a = window.__cw52
      const n = a.cols * a.rows
      const rows = new Map()
      const blank = (cls) => ({
        cls,
        cells: 0,
        lit: 0,
        nearRev: 0,
        nearMid: 0,
        gChange: 0,
        iChange: 0,
        rToggle: 0,
        gOsc: 0,
        iOsc: 0,
        lumAbs: 0,
      })
      // Cells that swept across a geometry edge are excluded from the class
      // rows - their flicker is real motion - but they are NOT thrown away.
      // They get their own row, because hiding a quarter of the frame behind
      // the word "excluded" is how a metric quietly stops measuring.
      const edge = blank(-1)
      let excluded = 0
      for (let i = 0; i < n; i++) {
        if (a.classChanged[i]) {
          excluded++
          edge.cells++
          if (a.maxLum[i] >= 0.5) edge.lit++
          edge.nearRev += a.nearRev[i]
          edge.nearMid += a.nearMid[i]
          edge.gChange += a.gChange[i]
          edge.iChange += a.iChange[i]
          edge.rToggle += a.rToggle[i]
          edge.gOsc += a.gOsc[i]
          edge.iOsc += a.iOsc[i]
          edge.lumAbs += a.lumAbs[i]
          continue
        }
        const key = a.cls[i]
        let r = rows.get(key)
        if (!r) {
          r = {
            cls: key,
            cells: 0,
            lit: 0,
            nearRev: 0,
            nearMid: 0,
            gChange: 0,
            iChange: 0,
            rToggle: 0,
            gOsc: 0,
            iOsc: 0,
            lumAbs: 0,
          }
          rows.set(key, r)
        }
        r.cells++
        if (a.maxLum[i] >= 0.5) r.lit++
        r.nearRev += a.nearRev[i]
        r.nearMid += a.nearMid[i]
        r.gChange += a.gChange[i]
        r.iChange += a.iChange[i]
        r.rToggle += a.rToggle[i]
        r.gOsc += a.gOsc[i]
        r.iOsc += a.iOsc[i]
        r.lumAbs += a.lumAbs[i]
      }
      return {
        cols: a.cols,
        rows: a.rows,
        cells: n,
        frames: a.frames,
        pairs: Math.max(0, a.frames - 1),
        triples: Math.max(0, a.frames - 2),
        classChangedCells: excluded,
        // How many of the excluded cells changed class more than once - the
        // number that separates a sweep from a fight.
        classMultiToggleCells: (() => {
          let c = 0
          for (let i = 0; i < n; i++) if (a.classToggles[i] > 1) c++
          return c
        })(),
        classToggleTotal: (() => {
          let c = 0
          for (let i = 0; i < n; i++) c += a.classToggles[i]
          return c
        })(),
        hyst: a.hyst.map((sim) => ({
          h: sim.h,
          changes: sim.changes,
          revToggles: sim.revToggles,
          heldWrong: sim.heldWrong,
        })),
        classPairs: [...a.pairs.entries()]
          .sort((x, y) => y[1] - x[1])
          .slice(0, 8),
        edge,
        perClass: [...rows.values()].sort((x, y) => y.cells - x.cells),
      }
    },
  }
  window.__cw52api = api
  return true
}

const CLASS_NAMES = [
  'sky',
  'ground',
  'road',
  'curb',
  'wall',
  'roof',
  'storefront',
  'sign',
  'mast',
  'tree',
  'car',
  'lamp',
  'person',
  'sidewalk',
  'green',
]

async function enterCity(page, opts) {
  const buttonName = CITY_BUTTONS[opts.city]
  if (!buttonName) throw new Error(`unknown city: ${opts.city}`)
  await page.goto(`${opts.baseUrl}/?hfm=unlock`, { waitUntil: 'load' })
  const gl = await readGlRenderer(page)
  if (!gl.renderer) throw new Error('no WebGL context at all - cannot measure')
  if (isSoftwareRenderer(gl.renderer)) {
    throw new Error(
      `"${gl.renderer}" is a software rasteriser. Aborting: this instrument ` +
        `is entirely about texture filtering, which is the first thing a ` +
        `software rasteriser does differently.`
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
    .waitFor({ timeout: 60000 })
  const ok = await page.evaluate(
    () => typeof window.__cityWalkGame?.altView?.setCellProbe === 'function'
  )
  if (!ok) {
    throw new Error(
      'setCellProbe() is missing: this is not a dev-server build of a tree ' +
        'carrying the CW-52 probe, so there is nothing to read.'
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

/** Poses for one sequence, generated analytically where the mode allows. */
function generatePoses(mode, start, frames, opts) {
  const out = []
  for (let f = 0; f < frames; f++) {
    if (mode === 'stand') {
      out.push({ ...start })
    } else if (mode === 'turn') {
      const rad = ((opts.turnDeg * f) * Math.PI) / 180
      out.push({ ...start, headingRad: start.headingRad + rad })
    } else if (mode === 'creep') {
      const d = opts.creepM * f
      out.push({
        ...start,
        x: start.x + Math.sin(start.headingRad) * d,
        y: start.y + Math.cos(start.headingRad) * d,
      })
    } else {
      throw new Error(`mode ${mode} has no analytic poses`)
    }
  }
  return out
}

/** Hold the real walk key and record where the game actually put the walker. */
async function recordWalkPoses(page, frames, opts) {
  const poses = []
  await page.keyboard.down('KeyW')
  for (let f = 0; f < frames; f++) {
    await page.waitForTimeout(opts.walkMs)
    poses.push(await page.evaluate(() => window.__cw52api.pose()))
  }
  await page.keyboard.up('KeyW')
  const first = poses[0]
  const last = poses[poses.length - 1]
  const travelled = Math.hypot(last.x - first.x, last.y - first.y)
  if (!(travelled > 0.5)) {
    throw new Error(
      `the walk key moved the walker ${travelled.toFixed(2)} m over ` +
        `${frames} samples - the key never reached the game`
    )
  }
  return poses
}

/** Drive one conversion and wait for it, so a reader never sees a stale frame. */
async function convertOnce(page) {
  const before = await page.evaluate(() => window.__cw52api.conversions())
  await page.evaluate(() => window.__cityWalkGame.altView.invalidate())
  await page.waitForFunction((n) => window.__cw52api.conversions() > n, before, {
    timeout: 15000,
  })
}

async function runSequence(page, poses, opts, shotDir, tag, flipDir) {
  // The probe only holds a frame once one has been CONVERTED with it on, and
  // begin() refuses an empty read rather than starting an accumulator that
  // would quietly score nothing.
  await convertOnce(page)
  await page.evaluate(
    (o) => window.__cw52api.begin(o),
    { band: opts.band, hystBands: list(opts.hyst).map(Number) }
  )
  for (let f = 0; f < poses.length; f++) {
    const before = await page.evaluate(() => window.__cw52api.conversions())
    await page.evaluate((p) => window.__cw52api.setPose(p), poses[f])
    await page.waitForFunction(
      (n) => window.__cw52api.conversions() > n,
      before,
      { timeout: 15000 }
    )
    const got = await page.evaluate(() => window.__cw52api.step())
    if (got !== f + 1) {
      throw new Error(`frame ${f + 1} did not fold in (accumulator at ${got})`)
    }
    if (shotDir) {
      await page.locator('canvas.hfm-overlay-canvas').screenshot({
        path: join(shotDir, `${tag}-${String(f).padStart(3, '0')}.png`),
      })
    }
  }
  if (flipDir) {
    const { url, peak } = await page.evaluate(
      (sc) => window.__cw52api.flipImage(sc),
      3
    )
    writeFileSync(
      join(flipDir, `${tag}-flipmap.png`),
      Buffer.from(url.split(',')[1], 'base64')
    )
    console.log(`  flip map written (peak ${peak} flips in one cell)`)
  }
  const out = await page.evaluate(() => window.__cw52api.finish())
  // Non-vacuity. Every one of these has been a silent zero in this project
  // before: a sweep that skipped, a grid that moved, a lit set that was empty.
  if (out.frames !== poses.length) {
    throw new Error(`captured ${out.frames} frames, asked for ${poses.length}`)
  }
  if (out.cells <= 0) throw new Error('the grid reported no cells')
  const lit = out.perClass.reduce((s, r) => s + r.lit, 0)
  if (lit <= 0) {
    throw new Error(
      'not one cell in the whole sequence reached the bright drive - the ' +
        'instrument measured an empty picture'
    )
  }
  return out
}

function classRows(res) {
  const pairs = Math.max(1, res.pairs)
  const triples = Math.max(1, res.triples)
  const all = res.edge?.cells ? [...res.perClass, res.edge] : res.perClass
  return all.map((r) => ({
    name: r.cls === -1 ? 'EDGE (class moved)' : (CLASS_NAMES[r.cls] ?? `class-${r.cls}`),
    cells: r.cells,
    lit: r.lit,
    nearRev: r.nearRev,
    changePct: (100 * r.iChange) / (r.cells * pairs),
    flipPct: (100 * r.iOsc) / (r.cells * triples),
    glyphChangePct: (100 * r.gChange) / (r.cells * pairs),
    glyphFlipPct: (100 * r.gOsc) / (r.cells * triples),
    revTogglePct: (100 * r.rToggle) / (r.cells * pairs),
    lumJitter: r.lumAbs / (r.cells * pairs),
  }))
}

function totals(res) {
  const pairs = Math.max(1, res.pairs)
  const triples = Math.max(1, res.triples)
  let cells = 0
  let iOsc = 0
  let gOsc = 0
  let iChange = 0
  let rToggle = 0
  for (const r of [...res.perClass, res.edge ?? { cells: 0 }]) {
    if (!r.cells) continue
    cells += r.cells
    iOsc += r.iOsc
    gOsc += r.gOsc
    iChange += r.iChange
    rToggle += r.rToggle
  }
  cells = Math.max(1, cells)
  return {
    driveFlipPct: (100 * iOsc) / (cells * triples),
    glyphFlipPct: (100 * gOsc) / (cells * triples),
    driveChangePct: (100 * iChange) / (cells * pairs),
    revTogglePct: (100 * rToggle) / (cells * pairs),
    iOsc,
    gOsc,
    rToggle,
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const modes = list(opts.modes)
  const sizes = list(opts.sizes).map(Number)
  const phosphors = list(opts.phosphors)
  const variants = list(opts.variants)
  for (const v of variants) {
    for (const part of v.split('+')) {
      if (!VARIANTS.includes(part)) throw new Error(`unknown variant: ${part}`)
    }
  }
  if (opts.shots) mkdirSync(opts.shots, { recursive: true })
  if (opts.flipmap) mkdirSync(opts.flipmap, { recursive: true })

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  })

  const results = []
  let glLine = ''
  try {
    for (const phosphor of phosphors) {
      const context = await browser.newContext({
        deviceScaleFactor: 1,
        viewport: { width: opts.width, height: opts.height },
        colorScheme: phosphor === 'amber' ? 'light' : 'dark',
        reducedMotion: 'reduce',
      })
      await context.addInitScript(() => {
        localStorage.setItem('openscad-forge-first-visit-seen', 'true')
        localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
        localStorage.setItem('openscad-forge-city-walk-colour', 'off')
        localStorage.removeItem('openscad-forge-city-walk-calibrated-floor')
        localStorage.removeItem('openscad-forge-city-walk-font-scale')
        window.__cityWalkCalibrationForce = {}
      })
      const page = await context.newPage()

      const served = await page.request.get(opts.baseUrl + opts.markerPath)
      if (!served.ok()) {
        throw new Error(
          `cannot read ${opts.markerPath} from ${opts.baseUrl} ` +
            `(HTTP ${served.status()})`
        )
      }
      if (!(await served.text()).includes(opts.marker)) {
        throw new Error(
          `${opts.baseUrl} serves a tree without "${opts.marker}" - that is ` +
            `somebody else's checkout`
        )
      }

      const gl = await enterCity(page, opts)
      glLine = gl.renderer
      await page.evaluate(installProbe)
      const world = await page.evaluate(() => window.__cw52api.freeze())
      const accent = await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-accent')
          .trim()
      )
      const palette = await page.evaluate(() =>
        window.__cityWalkGame.altView.getPalette()
      )
      console.log(
        `\n### ${phosphor}: accent ${accent}, ` +
          `palette ${palette ? 'ON' : 'off (mono)'}, ` +
          `rain ${world.rainLevel === null ? 'off' : world.rainLevel}, ` +
          `GL ${gl.renderer}`
      )
      if (palette) {
        throw new Error(
          'a palette is active - this instrument scores the MONOCHROME ' +
            'decision path and a palette replaces it entirely'
        )
      }
      await page.evaluate(() =>
        window.__cityWalkGame.altView.setCellProbe(true)
      )

      // THE spawn, captured once. Every sequence starts here: creep and walk
      // leave the walker somewhere else, and a start pose read after them
      // would put the next size in a different part of the city - which makes
      // two runs of this script look like a result when they are two places.
      let spawnPose = await page.evaluate(() => window.__cw52api.pose())
      if (opts.pose) {
        const [px, py, pdeg] = String(opts.pose).split(',').map(Number)
        if (![px, py, pdeg].every(Number.isFinite)) {
          throw new Error(`--pose wants x,y,headingDeg, got "${opts.pose}"`)
        }
        await page.evaluate(
          (p) => {
            const g = window.__cityWalkGame
            const s = g.walkState
            s.x = p.x
            s.y = p.y
            if (g.surface) s.groundZ = g.surface.heightAt(p.x, p.y)
          },
          { x: px, y: py }
        )
        spawnPose = await page.evaluate(() => window.__cw52api.pose())
        spawnPose.x = px
        spawnPose.y = py
        spawnPose.headingRad = (pdeg * Math.PI) / 180
        await page.evaluate((p) => window.__cw52api.setPose(p), spawnPose)
      }
      console.log(
        `spawn: x ${spawnPose.x.toFixed(2)} y ${spawnPose.y.toFixed(2)} ` +
          `heading ${((spawnPose.headingRad * 180) / Math.PI).toFixed(2)} deg ` +
          `groundZ ${spawnPose.groundZ.toFixed(3)}`
      )

      const mats = await page.evaluate(() => window.__cw52api.materials())
      console.log('mesh | textured | cell-raster bias')
      for (const [name, m] of Object.entries(mats).sort()) {
        console.log(
          `  ${name} | ${m.textured ? 'yes' : 'no'} | ` +
            `${m.bias === null ? '(no uniform)' : m.bias.toFixed(3)}`
        )
      }

      for (const size of sizes) {
        const scale = await setSize(page, size / 100)
        const cellPx = await page.evaluate(() =>
          window.__cityWalkGame.altView.getCellPx()
        )
        const matsAtSize = await page.evaluate(() =>
          window.__cw52api.materials()
        )
        console.log(
          `\n-- size ${Math.round(scale * 100)}% ` +
            `(cell ${cellPx.w}x${cellPx.h} px) --`
        )
        for (const [name, m] of Object.entries(matsAtSize).sort()) {
          if (m.textured) {
            console.log(
              `  ${name}: bias ` +
                `${m.bias === null ? '(no uniform)' : m.bias.toFixed(3)}`
            )
          }
        }
        const startPose = spawnPose
        let walkPoses = null
        for (const mode of modes) {
          let poses
          if (mode === 'walk') {
            if (!walkPoses) {
              await page.evaluate((p) => window.__cw52api.setPose(p), startPose)
              await convertOnce(page)
              walkPoses = await recordWalkPoses(page, opts.frames, opts)
            }
            poses = walkPoses
          } else {
            poses = generatePoses(mode, startPose, opts.frames, opts)
          }
          let baseFingerprint = null
          for (const variant of variants) {
            let saturated = false
            const applied = await page.evaluate(
              (v) => window.__cw52api.applyVariant(v),
              variant
            )
            await page.evaluate((p) => window.__cw52api.setPose(p), poses[0])
            await convertOnce(page)
            const fp = await page.evaluate(() => window.__cw52api.fingerprint())
            if (variant === 'shipped') {
              baseFingerprint = fp
            } else if (baseFingerprint !== null && fp === baseFingerprint) {
              // A variant that decides every cell exactly as the baseline did
              // has not been applied, whatever its name says. For a knob that
              // turns something OFF that is a dead knob and a hard stop. For a
              // flat-* upper bound it is a RESULT - the layer already reads as
              // its own average at cell scale, so there is nothing left for a
              // bigger hammer to take - and it is printed as one.
              if (!variant.split('+').some((p) => p.startsWith('flat-'))) {
                throw new Error(
                  `variant "${variant}" produced a converted frame identical ` +
                    `to "shipped" (fingerprint ${fp}) - it changed nothing, ` +
                    `so its numbers would be the baseline under another name`
                )
              }
              saturated = true
              console.log(
                `
[${phosphor}-${size}-${mode}-${variant}] SATURATED: ` +
                  `flattening this layer changes not one cell of the ` +
                  `converted frame, so the shipped filtering already takes ` +
                  `everything flattening would take`
              )
            }
            const tag = `${phosphor}-${size}-${mode}-${variant}`
            const res = await runSequence(
              page,
              poses,
              opts,
              opts.shots,
              tag,
              opts.flipmap
            )
            const sum = totals(res)
            results.push({
              phosphor,
              size,
              mode,
              variant,
              cellPx,
              accent,
              bias: applied.bias,
              applied: applied.applied,
              saturated,
              startPose,
              endPose: poses[poses.length - 1],
              totals: sum,
              ...res,
            })
            console.log(
              `\n[${tag}] ${res.cols}x${res.rows} = ${res.cells} cells, ` +
                `${res.frames} frames, ${res.classChangedCells} excluded ` +
                `(class changed), bias ${applied.bias.toFixed(3)}`
            )
            console.log(
              `  CLASS MAP: ${res.classToggleTotal} transitions, ` +
                `${res.classMultiToggleCells} cells changed class MORE THAN ` +
                `ONCE · top pairs ` +
                res.classPairs
                  .map(
                    ([k, v]) =>
                      `${k
                        .split('>')
                        .map((i) => CLASS_NAMES[i] ?? i)
                        .join('/')}=${v}`
                  )
                  .join(' ')
            )
            console.log(
              `  WHOLE FRAME: drive FLIP ${sum.driveFlipPct.toFixed(3)}% · ` +
                `drive change ${sum.driveChangePct.toFixed(3)}% · ` +
                `glyph FLIP ${sum.glyphFlipPct.toFixed(3)}% · ` +
                `reverse toggles ${sum.rToggle}`
            )
            if (res.hyst?.length) {
              console.log(
                '  HYSTERESIS (simulated): ' +
                  res.hyst
                    .map(
                      (x) =>
                        `+/-${x.h}: ${x.revToggles} rev toggles (was ` +
                        `${sum.rToggle}), ${x.changes} drive changes, ` +
                        `${x.heldWrong} cell-frames held off-level`
                    )
                    .join(' · ')
              )
            }
            console.log(
              '| class | cells | lit | near 0.8 | drive chg% | drive FLIP% | glyph chg% | glyph FLIP% | rev tog% | lum jitter |'
            )
            console.log('|---|---|---|---|---|---|---|---|---|---|')
            for (const r of classRows(res)) {
              if (r.cells < 50) continue
              console.log(
                `| ${r.name} | ${r.cells} | ${r.lit} | ${r.nearRev} | ` +
                  `${r.changePct.toFixed(2)} | ${r.flipPct.toFixed(2)} | ` +
                  `${r.glyphChangePct.toFixed(2)} | ` +
                  `${r.glyphFlipPct.toFixed(2)} | ` +
                  `${r.revTogglePct.toFixed(3)} | ${r.lumJitter.toFixed(4)} |`
              )
            }
          }
        }
      }
      await page.evaluate(() =>
        window.__cityWalkGame.altView.setCellProbe(false)
      )
      await context.close()
    }
  } finally {
    await browser.close()
  }

  console.log(`\n=== STABILITY (${opts.label || 'no label'}) ===`)
  console.log(
    `city ${opts.city} · frames ${opts.frames} · ` +
      `turn ${opts.turnDeg} deg/frame · creep ${opts.creepM} m/frame · ` +
      `viewport ${opts.width}x${opts.height} @ dpr 1`
  )
  console.log(`GL: ${glLine}`)
  console.log(
    'These are SEQUENCE COUNTS, not timings, so they do not drift with ' +
      'machine load - but every comparison is still same-session.'
  )
  console.log(
    '| phosphor | size | mode | variant | drive FLIP% | drive chg% | glyph FLIP% | rev toggles |'
  )
  console.log('|---|---|---|---|---|---|---|---|')
  for (const r of results) {
    console.log(
      `| ${r.phosphor} | ${r.size} | ${r.mode} | ${r.variant} | ` +
        `${r.totals.driveFlipPct.toFixed(3)} | ` +
        `${r.totals.driveChangePct.toFixed(3)} | ` +
        `${r.totals.glyphFlipPct.toFixed(3)} | ${r.totals.rToggle} |` +
        (r.saturated ? ' SATURATED' : '')
    )
  }
  if (opts.json) {
    writeFileSync(opts.json, JSON.stringify(results, null, 2))
    console.log(`wrote ${opts.json}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
