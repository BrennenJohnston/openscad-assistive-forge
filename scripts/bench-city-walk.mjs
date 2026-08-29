/**
 * @license GPL-3.0-or-later
 */
// The ASCII City Walk performance bench (CW-30 P0).
//
// This is the instrument Round 5's acceptance bar (CW-Q28) is measured on:
// 30 fps while walking at the 10% character floor with heavy rain, under a
// 4x CPU throttle standing in for a low-end machine. CW-31, CW-32 and CW-37
// all read their numbers from this script, so its honesty is part of the
// deliverable.
//
//   node scripts/bench-city-walk.mjs --label=baseline
//   node scripts/bench-city-walk.mjs --throttle=1 --seconds=30
//   node scripts/bench-city-walk.mjs --sizes=0.1,0.3,0.5,0.1 --throttle=1
//   node scripts/bench-city-walk.mjs --gpu-luid=0,101218   (the other adapter)
//
// WHAT IT REFUSES TO DO, and why each guard is here:
//
//   * It runs HEADED. Headless Chromium renders through SwiftShader, which is
//     a software rasteriser: it reads about a third of the real frame rate and
//     has repeatedly produced confident wrong perf answers in this project.
//     The GL renderer string is fetched, PRINTED, and checked - a software
//     renderer aborts the run rather than reporting a number.
//   * It refuses to measure a tree it cannot identify. Another checkout's dev
//     server has served this project's port before and faked a whole result,
//     so the script fetches one served module and requires a marker string
//     that only the tree under test carries. Point --base-url at your OWN
//     server on your OWN port; never assume 5173.
//   * It reports how far the walker actually travelled. A bench where the
//     keyboard went to the wrong element still produces plausible-looking
//     millisecond numbers, and the distance line is what catches it.
//   * It reads getConvertStats(), which only exists under import.meta.env.DEV,
//     so this measures the dev server. A production build cannot be benched
//     with it, by design - the counters are not shipped.
//   * It refuses to guess which GPU it ran on. Windows hands a non-fullscreen
//     Chromium the power-saving adapter, so on a two-GPU laptop the DEFAULT is
//     the integrated one, and every table this script printed before CW-67 was
//     an integrated-GPU table whether or not anybody read it that way.
//     --gpu-luid=<high>,<low> (the LUIDs are on chrome://gpu) picks the other
//     one; the renderer string is printed on EVERY ROW either way, because a
//     bench row without one has measured nobody knows what.
//
// CW-67 RETIRED THE "reverse" COLUMN. It reported the reverse-video cell count
// of the LAST converted frame, which is a snapshot of wherever the walker
// happened to stop: it swung between 0 and 95,425 across runs of the same
// configuration and said nothing about stability. What the reverse-video layer
// does over a sequence is scripts/seq-city-walk.mjs's question, and that script
// answers it per frame pair.
//
// NUMBERS FROM DIFFERENT SESSIONS ARE NOT COMPARABLE. Three rounds of
// evidence on this machine say so: it is shared with other agent sessions and
// with the owner's own work. Every claim built on this script must be a
// same-session A/B, and every table must carry that caveat.

import { chromium } from '@playwright/test'

const DEFAULTS = {
  baseUrl: process.env.PW_BASE_URL || 'http://localhost:5199',
  // Both cities the CW-30 baseline table names. Seattle is the owner's
  // reference city; Burnaby is the second-densest extract.
  cities: 'seattle',
  seconds: 60,
  throttle: 4,
  charScale: 0.1,
  // --sizes=0.1,0.3,0.5 sweeps the character size, one walk per size inside
  // ONE browser session, in the order given. Repeat a size to check the run
  // order is not itself the effect. Overrides --char-scale when set.
  sizes: '',
  rain: 'heavy',
  // A string present in the tree under test and absent from develop. Update
  // it when the branch's identity changes; the run aborts if it is missing.
  marker: 'createFold',
  markerPath: '/src/js/game/seq-metrics.js',
  label: '',
  width: 1600,
  height: 900,
  // --profile=1 additionally records a CPU profile over the walk and prints
  // self-time per function. That table is how CW-30 found out which part of
  // the converter actually costs the time, rather than assuming.
  profile: 0,
  // Which converter paths to measure, in order. Every named variant is walked
  // separately, from the same spawn and along the same scripted route, inside
  // ONE browser session - which is the only way an A/B on this machine means
  // anything. Repeat a name to check the run order is not itself the effect:
  //   --variants=new,legacy-taps,new,legacy-taps
  variants: 'new',
  // --walk=0 measures from a STANDING pose instead of a scripted walk.
  //
  // Both modes are needed and they answer different questions. The walk is
  // what the acceptance bar is about, but under a 4x throttle it is not
  // repeatable: movement is dt-based, so a slower run covers less ground,
  // ends up somewhere else, and the two variants are then timed against
  // different scenery. (Measured: four interleaved 45 s walks covered 17, 16,
  // 14 and 23 m and saw wildly different amounts of reverse video.) Standing
  // still with the rain on keeps every frame dirty, so conversions run flat
  // out over the SAME view - which is what a comparison of two converter
  // paths actually needs.
  walk: 1,
  // --shot=<prefix> writes <prefix>-<city>-<variant>.png of the viewport at
  // the end of each run, for the eyes-on gates. Pair it with --rain=none
  // --walk=0 so the two variants photograph the same standing scene.
  shot: '',
  // --gpu-luid=high,low selects a D3D adapter (Chromium --use-adapter-luid).
  // Empty means whatever Windows hands out, which on this laptop is the
  // integrated GPU - see the refusal note above.
  gpuLuid: '',
}

/** Variant name -> the setBenchLegacy payload that selects it. */
const VARIANTS = {
  new: {},
  'legacy-taps': { taps: true },
  'legacy-contrast': { contrast: true },
  // The CPU sampling loop, forced, so the GPU glyph pass can be measured
  // against it inside one session.
  'legacy-cpu-sample': { cpuSample: true },
  'legacy-all': { taps: true, contrast: true, cpuSample: true },
  // CW-39 (CW-Q37): the game retired the phosphor trail, so 'new' now runs
  // at persistFade 0. This variant re-enables the retired fade through the
  // converter's own public API (not a setBenchLegacy switch) so trail-on
  // can be A/B'd against trail-off inside one session.
  trail: {},
  // CW-41: the cell-raster facade filtering OFF (bias forced to zero), so
  // its cost can be A/B'd against the shipped filtering in one session.
  'no-cellraster': {},
  // CW-68: the frame-to-frame memory turned OFF for this run, so its cost can
  // be priced against the shipped configuration inside one session - which is
  // the only kind of comparison this machine supports. Use it A-B-B-A:
  //   --variants=no-hysteresis,new,new,no-hysteresis
  'no-hysteresis': {},
}

/** What persistFade each variant runs at. */
const VARIANT_FADE = { trail: 0.45 }

const CITY_BUTTONS = {
  seattle: 'Seattle, Washington',
  burnaby: 'Burnaby, British Columbia',
  denver: 'Denver, Colorado',
  albuquerque: 'Albuquerque, New Mexico',
}

/** Rain levels, in the order KeyG cycles them: null -> light -> heavy -> null. */
const RAIN_PRESSES = { none: 0, light: 1, heavy: 2 }

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

/**
 * The GL renderer this Chromium actually got. A software rasteriser here
 * means every millisecond the run would report is about the CPU emulating a
 * GPU, which is not the thing being measured.
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

/**
 * Self time per function from a V8 CPU profile.
 *
 * A sample names the function that was ON TOP of the stack, so summing the
 * time deltas per sampled node gives self time, not inclusive time. Small
 * callees that V8 inlined show up inside their caller - which is a limit of
 * the instrument worth knowing when a one-line wrapper appears to cost more
 * than the function it wraps.
 */
function selfTimeTable(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const perNode = new Map()
  const deltas = profile.timeDeltas || []
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i]
    perNode.set(id, (perNode.get(id) || 0) + (deltas[i] || 0))
  }
  const merged = new Map()
  for (const [id, us] of perNode) {
    const node = byId.get(id)
    if (!node) continue
    const f = node.callFrame
    // Vite serves modules with a ?t= cache-buster that changes every edit;
    // strip it so two runs of the same function merge into one row.
    const file = String(f.url || '')
      .split('/')
      .pop()
      .replace(/\?.*$/, '')
    const name = `${f.functionName || '(anonymous)'} @ ${file}:${f.lineNumber + 1}`
    merged.set(name, (merged.get(name) || 0) + us / 1000)
  }
  return [...merged].sort((a, b) => b[1] - a[1])
}

async function benchCity(page, cdp, city, variant, opts, runIndex) {
  const buttonName = CITY_BUTTONS[city]
  if (!buttonName) throw new Error(`unknown city: ${city}`)

  await page.goto(`${opts.baseUrl}/?hfm=unlock`, { waitUntil: 'load' })

  // The GL renderer is read HERE, on the page that is about to be measured,
  // and never on a throwaway navigation first: loading the app twice in one
  // page leaves the second load short of its unlock, and the gated card
  // never appears. One navigation per measured run, always.
  const gl = await readGlRenderer(page)
  if (!gl.renderer) throw new Error('no WebGL context at all - cannot bench')
  if (isSoftwareRenderer(gl.renderer)) {
    throw new Error(
      `"${gl.renderer}" is a software rasteriser. Every number this run ` +
        `produced would be about the CPU pretending to be a GPU. Aborting.`
    )
  }

  // The card is revealed by the unlock, and the button inside it is hidden
  // until then - waiting on the button alone times out against a real
  // element that is simply not shown yet.
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

  const devHandleReady = await page.evaluate(
    () => typeof window.__cityWalkGame?.altView?.getConvertStats === 'function'
  )
  if (!devHandleReady) {
    throw new Error(
      'getConvertStats() is missing: this is not a dev-server build, so there ' +
        'is nothing to measure.'
    )
  }

  // Character size, driven through the real key so the game's own clamp and
  // persistence run. Step from wherever the size actually IS: the game saves
  // it, so a second run in the same browser profile does not start at 100%.
  const startScale = await page.evaluate(() =>
    window.__cityWalkGame.altView.getFontScale()
  )
  const steps = Math.round((startScale - opts.charScale) / 0.1)
  const key = steps >= 0 ? 'Minus' : 'Equal'
  for (let i = 0; i < Math.abs(steps); i++) {
    await page.keyboard.press(key)
  }
  const fontScale = await page.evaluate(() =>
    window.__cityWalkGame.altView.getFontScale()
  )
  if (Math.abs(fontScale - opts.charScale) > 1e-6) {
    throw new Error(
      `character size is ${fontScale}, asked for ${opts.charScale}`
    )
  }

  // CW-68. Read what the game configured for itself, or turn it off for the
  // variant that prices it; either way the answer goes in the table, because
  // a converter row that does not say whether the memory was on is a number
  // about nothing.
  const hysteresis = await page.evaluate((off) => {
    const api = window.__cityWalkGame.altView
    if (typeof api.getTemporalHysteresis !== 'function') return undefined
    return off ? api.setTemporalHysteresis(null) : api.getTemporalHysteresis()
  }, variant === 'no-hysteresis')

  const rainPresses = RAIN_PRESSES[opts.rain]
  if (rainPresses === undefined) throw new Error(`unknown rain: ${opts.rain}`)
  for (let i = 0; i < rainPresses; i++) await page.keyboard.press('KeyG')
  const rainLevel = await page.evaluate(
    () => window.__cityWalkGame.rainLevel ?? null
  )
  const wantLevel = rainPresses === 0 ? null : rainPresses - 1
  if (rainLevel !== wantLevel) {
    throw new Error(`rain level is ${rainLevel}, asked for ${wantLevel}`)
  }

  const legacyFlags = VARIANTS[variant]
  if (!legacyFlags) throw new Error(`unknown variant: ${variant}`)
  const applied = await page.evaluate((flags) => {
    const api = window.__cityWalkGame.altView
    if (typeof api.setBenchLegacy !== 'function') return null
    // Clear every switch first, so a variant that names fewer of them than
    // the previous run cannot inherit one.
    api.setBenchLegacy({ taps: false, contrast: false, cpuSample: false })
    return api.setBenchLegacy(flags)
  }, legacyFlags)
  if (!applied) {
    throw new Error('setBenchLegacy() is missing - cannot select a variant')
  }
  // Read back what the renderer actually holds, rather than trusting that the
  // call landed: a variant that silently failed to apply would report the
  // other path's number under this one's name.
  for (const flag of ['taps', 'contrast', 'cpuSample']) {
    const want = Boolean(legacyFlags[flag])
    if (applied[flag] !== want) {
      throw new Error(
        `variant "${variant}" asked for legacy ${flag}=${want} but the ` +
          `renderer reports ${applied[flag]}`
      )
    }
  }

  // CW-39: set the variant's persistFade explicitly every time - never
  // inherit the previous variant's fade - and read it back the same way the
  // legacy flags are read back. setPersistFade refuses under reduced motion,
  // which would silently turn a 'trail' run into a trail-off run reported
  // under the trail's name.
  const wantFade = VARIANT_FADE[variant] ?? 0
  const gotFade = await page.evaluate((fade) => {
    const api = window.__cityWalkGame.altView
    api.setPersistFade(fade)
    api.invalidate()
    return api.getPersistFade()
  }, wantFade)
  if (gotFade !== wantFade) {
    throw new Error(
      `variant "${variant}" asked for persistFade ${wantFade} but the ` +
        `renderer reports ${gotFade}`
    )
  }

  // CW-41: set the facade filtering per variant, never inherited. Passing a
  // cell height of 1 gives log2(1) = 0 - stock filtering; anything else
  // re-syncs the game's own bias from the converter's real cell size.
  await page.evaluate((off) => {
    const g = window.__cityWalkGame
    if (!g.city3d?.setCellRaster) return
    if (off) g.city3d.setCellRaster(1)
    else g.city3d.setCellRaster(g.altView.getCellPx().h)
    g.altView.invalidate()
  }, variant === 'no-cellraster')

  // Let the first few conversions at the new size settle before the clock
  // starts - the atlas rebuild lands in the first frame after a size change
  // and is not part of what a walk costs.
  await page.waitForTimeout(1500)

  if (opts.throttle > 1) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.throttle })
  }
  if (opts.profile) {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 })
    await cdp.send('Profiler.start')
  }

  const startPose = await page.evaluate(() => {
    const g = window.__cityWalkGame
    g.altView.resetConvertStats()
    window.__benchFrames = 0
    window.__benchStop = false
    const tick = () => {
      window.__benchFrames++
      if (!window.__benchStop) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return { x: g.walkState.x, y: g.walkState.y, t: performance.now() }
  })

  // The scripted walk: forward held for the whole run (keyboard.press is far
  // too brief to repaint - the CW-17 discipline), with a turn pulsed in every
  // five seconds so the view keeps changing rather than settling into one
  // corridor. Deterministic, so two runs walk the same walk.
  if (opts.walk) {
    await page.keyboard.down('ArrowUp')
    const endAt = Date.now() + opts.seconds * 1000
    let turn = 'ArrowRight'
    while (Date.now() < endAt) {
      await page.waitForTimeout(Math.min(4200, Math.max(0, endAt - Date.now())))
      if (Date.now() >= endAt) break
      await page.keyboard.down(turn)
      await page.waitForTimeout(Math.min(800, Math.max(0, endAt - Date.now())))
      await page.keyboard.up(turn)
      turn = turn === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight'
    }
    await page.keyboard.up('ArrowUp')
  } else {
    await page.waitForTimeout(opts.seconds * 1000)
  }

  const result = await page.evaluate(() => {
    const g = window.__cityWalkGame
    window.__benchStop = true
    return {
      stats: g.altView.getConvertStats(),
      frames: window.__benchFrames,
      x: g.walkState.x,
      y: g.walkState.y,
      t: performance.now(),
    }
  })

  // The eyes-on capture. Taken with --rain=none --walk=0 the pose and the
  // scene are identical between variants, so two shots differ only where the
  // code does - which is what makes looking at them worth anything.
  if (opts.shot) {
    await page.waitForTimeout(400)
    // The run index is in the name so that repeating a variant - the control
    // that tells a real difference from session noise - does not overwrite
    // its own first shot.
    await page
      .locator('#cityWalkViewport')
      .screenshot({ path: `${opts.shot}-${runIndex}-${city}-${variant}.png` })
  }

  let profileRows = null
  if (opts.profile) {
    const stopped = await cdp.send('Profiler.stop')
    profileRows = selfTimeTable(stopped.profile)
  }
  if (opts.throttle > 1) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  }

  const elapsedS = (result.t - startPose.t) / 1000
  const walkedM = Math.hypot(result.x - startPose.x, result.y - startPose.y)
  return {
    city,
    variant,
    glRenderer: gl.renderer,
    profileRows,
    elapsedS,
    walkedM,
    rafFps: result.frames / elapsedS,
    convPerS: result.stats.samples / elapsedS,
    convertAvgMs: result.stats.avgMs,
    convertMaxMs: result.stats.maxMs,
    samples: result.stats.samples,
    dynamicIntervalMs: result.stats.dynamicIntervalMs,
    usedGpu: result.stats.usedGpu,
    cells: result.stats.cells,
    charScale: opts.charScale,
    hysteresis,
    charW: result.stats.charW,
    charH: result.stats.charH,
    fontSizePx: result.stats.fontSizePx,
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const cities = String(opts.cities)
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)

  const launchArgs = [
    // Chromium throttles rAF to 1 Hz when it believes the window is
    // occluded, which once turned a real measurement into a flat line
    // (CW-12). These keep the tab running at full rate while it is behind
    // whatever else is on screen.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ]
  if (opts.gpuLuid) launchArgs.push(`--use-adapter-luid=${opts.gpuLuid}`)
  const browser = await chromium.launch({ headless: false, args: launchArgs })
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width: opts.width, height: opts.height },
  })
  await context.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    // CW-42: benches measure the size THEY set. The inert forced-probe map
    // stops the entry calibration on its first frame, and clearing the
    // stored floor keeps a previous real calibration from seeding the
    // landing or blocking the keypress ladder below 30% (the scale
    // verification would catch it loudly, but a bench that cannot reach
    // its config is still a dead bench).
    window.__cityWalkCalibrationForce = {}
    localStorage.removeItem('openscad-forge-city-walk-calibrated-floor')
  })
  const page = await context.newPage()

  try {
    // Is the server on the other end of --base-url actually serving THIS
    // tree? A dev server from another checkout has answered for this project
    // before and produced a full red-then-green proof that meant nothing.
    const probe = await page.request.get(opts.baseUrl + opts.markerPath)
    if (!probe.ok()) {
      throw new Error(
        `cannot read ${opts.markerPath} from ${opts.baseUrl} ` +
          `(HTTP ${probe.status()}) - is the dev server running there?`
      )
    }
    const served = await probe.text()
    if (!served.includes(opts.marker)) {
      throw new Error(
        `${opts.baseUrl} is serving a tree without "${opts.marker}" in ` +
          `${opts.markerPath}. That is somebody else's checkout - point ` +
          `--base-url at your own server.`
      )
    }
    console.log(`marker "${opts.marker}" found in ${opts.markerPath} — OK`)

    const cdp = await context.newCDPSession(page)

    const variants = String(opts.variants)
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)

    // A size sweep is a list of runs inside ONE session, which is the only
    // kind of comparison this shared machine supports.
    const sizes = opts.sizes
      ? String(opts.sizes)
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n))
      : [opts.charScale]

    const rows = []
    for (const city of cities) {
      for (const variant of variants) {
        for (const charScale of sizes) {
          console.log(
            `\n--- ${city} / ${variant} / chars ${(charScale * 100).toFixed(0)}% ` +
              `(${opts.seconds}s, ${opts.throttle}x CPU throttle) ---`
          )
          const row = await benchCity(
            page,
            cdp,
            city,
            variant,
            { ...opts, charScale },
            rows.length
          )
          console.log(`GL renderer: ${row.glRenderer}`)
          rows.push(row)
        }
      }
    }
    const gl = { renderer: rows[0]?.glRenderer ?? 'unknown' }

    console.log('\n=== BENCH ===')
    console.log(
      `label: ${opts.label || '(none)'}   throttle: ${opts.throttle}x   ` +
        `chars: ${sizes.map((s) => `${(s * 100).toFixed(0)}%`).join(',')}   ` +
        `rain: ${opts.rain}   viewport: ${opts.width}x${opts.height} @ dpr 1   ` +
        `adapter: ${opts.gpuLuid || 'default (whatever Windows hands out)'}`
    )
    console.log(`GL: ${gl.renderer}`)
    console.log(
      '| city | variant | chars | mem | path | conv avg ms | conv max ms | conv/s | rAF fps | governor ms | cells | cell px | walked m | GL |'
    )
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for (const r of rows) {
      console.log(
        `| ${r.city} | ${r.variant} | ${(r.charScale * 100).toFixed(0)}% | ` +
          `${r.hysteresis === undefined ? 'n/a' : r.hysteresis ? 'on' : 'off'} | ` +
          `${r.usedGpu ? 'gpu' : 'cpu'} | ${r.convertAvgMs.toFixed(1)} | ` +
          `${r.convertMaxMs.toFixed(1)} | ${r.convPerS.toFixed(1)} | ` +
          `${r.rafFps.toFixed(1)} | ${r.dynamicIntervalMs} | ${r.cells} | ` +
          `${r.charW}x${r.charH} | ${r.walkedM.toFixed(0)} | ${r.glRenderer} |`
      )
    }
    for (const r of rows) {
      if (!r.profileRows) continue
      const total = r.profileRows.reduce((s, [, ms]) => s + ms, 0)
      console.log(
        `\n--- CPU profile, ${r.city} (self time, ${total.toFixed(0)} ms sampled) ---`
      )
      console.log('| self ms | share | function |')
      console.log('|---|---|---|')
      for (const [name, ms] of r.profileRows.slice(0, 24)) {
        console.log(
          `| ${ms.toFixed(0)} | ${((ms / total) * 100).toFixed(1)}% | ${name} |`
        )
      }
    }

    console.log(
      '\nNUMBERS FROM DIFFERENT SESSIONS ARE NOT COMPARABLE (shared machine).'
    )
    console.log(
      `4x CPU throttle is a PROXY for a low-end machine, not one: it slows ` +
        `this CPU and leaves the GPU alone.`
    )
    for (const r of rows) {
      if (r.walkedM < 5) {
        console.log(
          `\nWARNING: ${r.city} walked only ${r.walkedM.toFixed(1)} m. The ` +
            `keys may not have reached the game.`
        )
      }
    }
    // A scripted walk that runs into a building is a different scene from one
    // that does not, however tidy the milliseconds look. Denver at 40% covered
    // 57 m where its other rows covered 110-130, and only the distance column
    // said so.
    const walked = rows.map((r) => r.walkedM)
    if (rows.length > 1 && Math.min(...walked) < 0.6 * Math.max(...walked)) {
      console.log(
        `\nWARNING: the walked distances range ` +
          `${Math.min(...walked).toFixed(0)}-${Math.max(...walked).toFixed(0)} m ` +
          `across these rows. The short ones saw different scenery; compare ` +
          `them with that in mind.`
      )
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(String(err?.stack || err))
  process.exitCode = 1
})
