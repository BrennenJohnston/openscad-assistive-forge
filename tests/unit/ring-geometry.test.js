import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SCALE,
  toPath64,
  fromPath64,
  union,
  evenOddUnion,
  orientRegion,
  difference,
  intersect,
  areaOf,
  regionArea,
  centroid,
  buildRingTree,
  simplify,
  ringsFromPathData,
  ringsToPathData,
} from '../../src/js/ring-geometry.js'

const square = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]
const area = (rings) => Math.abs(regionArea(rings))

describe('the clipper2-js round trip', () => {
  it('keeps a coordinate to a thousandth of a unit', () => {
    const ring = [
      { x: 0.001, y: 2.5 },
      { x: 10, y: 0 },
      { x: 5, y: 7.125 },
    ]
    const back = fromPath64(toPath64(ring))
    expect(back[0].x).toBeCloseTo(0.001, 6)
    expect(back[2].y).toBeCloseTo(7.125, 6)
    expect(SCALE).toBe(1000)
  })

  it('drops a degenerate ring rather than passing it on', () => {
    // A zero-area artefact ring is what this port emits on a re-union; every
    // result comes back through fromPaths64 so no caller has to know that.
    const out = evenOddUnion([square(0, 0, 10, 10), [
      { x: 3, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 3 },
    ]])
    expect(out).toHaveLength(1)
  })
})

describe('booleans', () => {
  it('unions two overlapping squares into one solid ring', () => {
    const out = union([square(0, 0, 10, 10), square(5, 5, 15, 15)])
    expect(out).toHaveLength(1)
    expect(area(out)).toBeCloseTo(175, 3)
  })

  it('★ reads the same two squares as a ring with a HOLE under even-odd', () => {
    // Not a union, and the whole reason the two are separate functions: a
    // point covered twice is OUTSIDE under even-odd. Right for reading a
    // drawing, wrong for combining two regions.
    const out = evenOddUnion([square(0, 0, 10, 10), square(5, 5, 15, 15)])
    expect(out).toHaveLength(2)
    expect(area(out)).toBeCloseTo(150, 3)
  })

  it('unions rings that are wound opposite ways, once they are oriented', () => {
    // A face of a line drawing arrives wound inside out. NonZero would return
    // the complement of it; orientRegion is what stops that.
    const inverted = [...square(0, 0, 10, 10)].reverse()
    expect(area(union(orientRegion([inverted])))).toBeCloseTo(100, 3)
    expect(areaOf(orientRegion([inverted])[0])).toBeGreaterThan(0)
    const withHole = orientRegion([square(0, 0, 20, 20), square(5, 5, 15, 15)])
    expect(areaOf(withHole[0])).toBeGreaterThan(0)
    expect(areaOf(withHole[1])).toBeLessThan(0)
    expect(area(union(withHole))).toBeCloseTo(300, 3)
  })

  it('does not care what order the shapes arrive in', () => {
    // The reason this layer exists: the EvenOdd union path-bool performs is
    // order-DEPENDENT once shapes overlap (D-120), and a drawing of overlapping
    // stroke bands corrupts quietly.
    const a = union([square(0, 0, 10, 10), square(5, 5, 15, 15), square(8, 0, 12, 20)])
    const b = union([square(8, 0, 12, 20), square(0, 0, 10, 10), square(5, 5, 15, 15)])
    expect(area(a)).toBeCloseTo(area(b), 6)
  })

  it('makes a hole out of a ring inside a ring', () => {
    const out = evenOddUnion([square(0, 0, 20, 20), square(5, 5, 15, 15)])
    expect(out).toHaveLength(2)
    expect(area(out)).toBeCloseTo(300, 3)
    const [outer, inner] = out.sort((x, y) => Math.abs(areaOf(y)) - Math.abs(areaOf(x)))
    expect(areaOf(outer)).toBeGreaterThan(0)
    expect(areaOf(inner)).toBeLessThan(0)
  })

  it('subtracts and intersects', () => {
    expect(area(difference([square(0, 0, 10, 10)], [square(5, 0, 15, 10)]))).toBeCloseTo(50, 3)
    expect(area(intersect([square(0, 0, 10, 10)], [square(5, 0, 15, 10)]))).toBeCloseTo(50, 3)
    expect(difference([square(0, 0, 10, 10)], [square(0, 0, 10, 10)])).toHaveLength(0)
  })
})

describe('measurements', () => {
  it('signs a solid positive and a hole negative', () => {
    expect(areaOf(square(0, 0, 10, 10))).toBeCloseTo(100, 6)
    expect(areaOf([...square(0, 0, 10, 10)].reverse())).toBeCloseTo(-100, 6)
  })

  it('nets a region against its holes', () => {
    expect(regionArea(evenOddUnion([square(0, 0, 20, 20), square(5, 5, 15, 15)]))).toBeCloseTo(300, 3)
  })

  it('puts the centroid of a square in the middle of it', () => {
    const c = centroid(square(0, 0, 10, 4))
    expect(c.x).toBeCloseTo(5, 6)
    expect(c.y).toBeCloseTo(2, 6)
  })

  it('falls back to the vertex mean for a ring with no area', () => {
    const c = centroid([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 8, y: 0 },
    ])
    expect(c.x).toBeCloseTo(4, 6)
  })
})

describe('buildRingTree', () => {
  it('nests three squares three deep and alternates solid and hole', () => {
    const tree = buildRingTree([
      square(0, 0, 30, 30),
      square(5, 5, 25, 25),
      square(10, 10, 20, 20),
    ])
    expect(tree.roots).toHaveLength(1)
    const depths = tree.nodes.map((n) => n.depth).sort()
    expect(depths).toEqual([0, 1, 2])
    expect(tree.nodes.find((n) => n.depth === 0).isHole).toBe(false)
    expect(tree.nodes.find((n) => n.depth === 1).isHole).toBe(true)
    expect(tree.nodes.find((n) => n.depth === 2).isHole).toBe(false)
  })

  it('gives a ring the SMALLEST ring around it as its parent', () => {
    const tree = buildRingTree([
      square(0, 0, 40, 40),
      square(5, 5, 35, 35),
      square(10, 10, 30, 30),
      square(15, 15, 25, 25),
    ])
    const deepest = tree.nodes.find((n) => n.depth === 3)
    expect(Math.abs(deepest.parent.area)).toBeCloseTo(400, 2)
  })

  it('keeps two side by side squares as two roots', () => {
    const tree = buildRingTree([square(0, 0, 10, 10), square(20, 0, 30, 10)])
    expect(tree.roots).toHaveLength(2)
  })
})

describe('path data', () => {
  it('makes one ring per subpath', () => {
    const rings = ringsFromPathData('M 0 0 H 10 V 10 H 0 Z M 3 3 H 7 V 7 H 3 Z')
    expect(rings).toHaveLength(2)
  })

  it('does not join the subpaths through the gap between them', () => {
    const rings = ringsFromPathData('M 0 0 H 4 V 4 H 0 Z M 16 16 H 20 V 20 H 16 Z')
    expect(Math.abs(areaOf(rings[0]))).toBeCloseTo(16, 3)
    expect(Math.abs(areaOf(rings[1]))).toBeCloseTo(16, 3)
  })

  it('reads relative and shorthand commands', () => {
    const rings = ringsFromPathData('m 0 0 h 10 v 10 h -10 z')
    expect(rings).toHaveLength(1)
    expect(Math.abs(areaOf(rings[0]))).toBeCloseTo(100, 3)
  })

  it('says nothing rather than guessing at path data it cannot read', () => {
    expect(ringsFromPathData('')).toEqual([])
    expect(ringsFromPathData(null)).toEqual([])
    expect(ringsFromPathData('not a path')).toEqual([])
  })

  it('writes rings back out and reads the same area again', () => {
    const rings = evenOddUnion([square(0, 0, 20, 20), square(5, 5, 15, 15)])
    const d = ringsToPathData(rings)
    expect(d.split('Z').length - 1).toBe(2)
    expect(area(evenOddUnion(ringsFromPathData(d)))).toBeCloseTo(300, 2)
  })
})

describe('simplify', () => {
  it('drops points that say nothing and leaves the shape where it was', () => {
    const dense = []
    for (let i = 0; i <= 40; i++) dense.push({ x: i / 4, y: 0 })
    for (let i = 0; i <= 40; i++) dense.push({ x: 10, y: i / 4 })
    dense.push({ x: 0, y: 10 })
    const before = evenOddUnion([dense])
    const after = simplify(before, 0.05)
    expect(after[0].length).toBeLessThan(before[0].length)
    expect(area(after)).toBeCloseTo(area(before), 1)
  })

  it('is a pass through when no tolerance is given', () => {
    const rings = [square(0, 0, 5, 5)]
    expect(simplify(rings, 0)).toBe(rings)
  })
})

describe('the clipper2-js trap', () => {
  /**
   * clipper2-js@1.2.4 has three entry points that are broken, and this module
   * is the only place in the app that may touch the library at all, so the
   * guard belongs here. PROVEN ABLE TO FAIL: adding
   * `const x = Clipper.pointInPolygon` to ring-geometry.js reddens it.
   */
  const codeOf = (file) =>
    readFileSync(resolve(process.cwd(), file), 'utf8')
      // The comments NAME the broken entry points on purpose, so the guard
      // reads code only. Otherwise documenting the danger is what trips it.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('imports only the three clipper2 names that work', () => {
    const code = codeOf('src/js/ring-geometry.js')
    const line = /import\s*\{([^}]*)\}\s*from\s*'clipper2-js'/.exec(code)
    expect(line, 'the clipper2 import should be a named list').not.toBeNull()
    const names = line[1].split(',').map((n) => n.trim()).filter(Boolean)
    expect(names.sort()).toEqual(['Clipper', 'FillRule', 'Paths64'])
  })

  it('calls only the clipper members that work', () => {
    const code = codeOf('src/js/ring-geometry.js')
    expect(code.length, 'the guard read an empty file').toBeGreaterThan(1000)
    const called = code
      .split('Clipper.')
      .slice(1)
      .map((rest) => (/^\w+/.exec(rest) || [''])[0])
    expect(
      called.length,
      'the guard found no clipper call to check'
    ).toBeGreaterThan(0)
    for (const name of called) {
      expect(
        ['makePath', 'Union', 'Difference', 'Intersect', 'simplifyPaths'],
        `Clipper.${name} is not on the allowlist`
      ).toContain(name)
    }
  })

  it('never names ClipperOffset, InflatePaths or executePolyTree at all', () => {
    const code = codeOf('src/js/ring-geometry.js')
    for (const broken of ['ClipperOffset', 'InflatePaths', 'executePolyTree']) {
      expect(code, `${broken} is broken at 1.2.4`).not.toContain(broken)
    }
  })

  it('takes its point-in-polygon from svg-nesting rather than a second copy', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/js/ring-geometry.js'),
      'utf8'
    )
    expect(source).toMatch(/import\s*\{[^}]*pointInPolygon[^}]*\}\s*from\s*'\.\/svg-nesting\.js'/)
  })
})
