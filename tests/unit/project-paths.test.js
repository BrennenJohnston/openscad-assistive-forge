/**
 * The engine reports its own paths (a single file runs as /tmp/input.scad, a
 * project under /work/). People know their files by the names they gave them.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import { withProjectPaths } from '../../src/js/render-controller.js'

describe('withProjectPaths', () => {
  it('names a single file by the name it was opened with', () => {
    expect(
      withProjectPaths(
        'ERROR: Parser error: syntax error in file /tmp/input.scad, line 4',
        'simple_box.scad'
      )
    ).toBe('ERROR: Parser error: syntax error in file simple_box.scad, line 4')
  })

  it('names a project file by its place in the project', () => {
    expect(
      withProjectPaths("WARNING: Can't open import file '/work/src/frog_7.stl'.", 'frog_choir.scad')
    ).toBe("WARNING: Can't open import file 'src/frog_7.stl'.")
  })

  it('leaves text without engine paths, and anything not text, alone', () => {
    expect(withProjectPaths('ECHO: "ready"', 'a.scad')).toBe('ECHO: "ready"')
    expect(withProjectPaths(undefined, 'a.scad')).toBe(undefined)
    expect(withProjectPaths('in /tmp/input.scad', null)).toBe('in /tmp/input.scad')
  })
})
