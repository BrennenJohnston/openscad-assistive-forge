import { describe, it, expect, vi } from 'vitest'
import {
  parseSvgElements,
  classifyElements,
  flattenLayers,
} from '../../src/js/svg-preparer.js'
import { buildNestingTree, suggestLayers, layerLimit } from '../../src/js/svg-nesting.js'
import { flattenWithRings } from '../../src/js/svg-preparer-workspace.js'
import * as ringEngine from '../../src/js/ring-geometry.js'

/**
 * D-132: the charm's file control built its layer companions with
 * `flattenToCompoundPath`, the pairwise path-bool chain that D-120 retired from
 * the editor, on the main thread, on every emit. CPU-profiled on the owner's
 * activities icon at 1x it was 18,905 ms of an 18,960 ms emit, while the trace
 * that produced the drawing took 186 ms.
 *
 * The fix gives `flattenLayers` an injected flatten so the caller can hand it
 * the ring engine. The engine cannot be imported by svg-preparer.js itself: it
 * lives in a lazy chunk, and its wrapper lives in the workspace, which imports
 * svg-preparer.js. These tests pin the seam, and that the ring path produces a
 * real stack rather than quietly producing nothing.
 */

const square = (x, y, size) =>
  `M ${x} ${y} L ${x + size} ${y} L ${x + size} ${y + size} L ${x} ${y + size} Z`

/** Three squares nested about a common centre, outermost first. */
const NESTED = `<svg viewBox="0 0 100 100">
  <path d="${square(0, 0, 100)}"/>
  <path d="${square(20, 20, 60)}"/>
  <path d="${square(40, 40, 20)}"/>
</svg>`

function stackOf(svgText) {
  const elements = classifyElements(parseSvgElements(svgText))
  const tree = buildNestingTree(elements)
  return {
    elements,
    layers: suggestLayers(tree).map((v) => v || 1),
    limit: layerLimit(tree),
    meta: { viewBox: '0 0 100 100' },
  }
}

const ringFlatten = (els, meta, warnings) =>
  flattenWithRings(ringEngine, els, meta, warnings)

describe('the layer stack can be flattened by the ring engine (D-132)', () => {
  it('uses the injected flatten instead of the built-in one', () => {
    const { elements, layers, limit, meta } = stackOf(NESTED)
    const spy = vi.fn(ringFlatten)

    const out = flattenLayers(elements, layers, limit, meta, null, {
      flattenRegion: spy,
    })

    expect(limit).toBeGreaterThan(1)
    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls.length).toBe(limit)
    // Every call gets the elements for that layer, the meta, and the warnings
    // sink - the same three arguments the built-in flatten takes.
    expect(spy.mock.calls[0][1]).toBe(meta)
    expect(out.filter(Boolean).length).toBe(limit)
  })

  it('falls back to the built-in flatten when no engine is in hand', () => {
    // The ring engine lives in a lazy chunk. Until it lands, a stack must
    // still be produced rather than silently dropped.
    const { elements, layers, limit, meta } = stackOf(NESTED)
    const out = flattenLayers(elements, layers, limit, meta)
    expect(out.filter(Boolean).length).toBe(limit)
  })

  it('ignores an option that is not a function', () => {
    const { elements, layers, limit, meta } = stackOf(NESTED)
    for (const bad of [null, undefined, 'rings', 42, {}]) {
      const out = flattenLayers(elements, layers, limit, meta, null, {
        flattenRegion: bad,
      })
      expect(out.filter(Boolean).length).toBe(limit)
    }
  })

  it('the ring path writes a real stack, on one shared canvas', () => {
    const { elements, layers, limit, meta } = stackOf(NESTED)
    const out = flattenLayers(elements, layers, limit, meta, null, {
      flattenRegion: ringFlatten,
    })

    const built = out.filter(Boolean)
    expect(built.length).toBe(limit)
    for (const svg of built) {
      expect(svg).toContain('<path')
      expect(/ d="[^"]+"/.test(svg)).toBe(true)
    }
    // D-7's law: ONE transform and ONE canvas across the stack, or OpenSCAD's
    // resize() fits each pass on its own and the stack prints as slabs.
    const transforms = new Set(built.map((s) => /<g transform="([^"]*)"/.exec(s)?.[1]))
    const canvases = new Set(built.map((s) => /viewBox="([^"]*)"/.exec(s)?.[1]))
    expect(transforms.size).toBe(1)
    expect(canvases.size).toBe(1)
  })

  it('keeps the stencil’s solid mode working through the injected flatten', () => {
    // DP-12: the bridge-less stencil needs every cut solid, and that option is
    // applied before the flatten, so it must survive the seam.
    const { elements, layers, limit, meta } = stackOf(NESTED)
    const seen = []
    flattenLayers(elements, layers, limit, meta, null, {
      solid: true,
      flattenRegion: (els, m, w) => {
        seen.push(els.map((el) => el.role))
        return ringFlatten(els, m, w)
      },
    })
    expect(seen.length).toBe(limit)
    for (const roles of seen) {
      expect(roles.every((r) => r === 'foreground')).toBe(true)
    }
  })
})
