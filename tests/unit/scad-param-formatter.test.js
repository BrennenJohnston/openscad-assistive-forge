import { describe, it, expect } from 'vitest'
import {
  formatScadValue,
  buildDefineArgs,
} from '../../src/js/scad-param-formatter.js'

// A3 regression guard: the hex-color branch used to run for EVERY string,
// so any 6-hex-char word ("decade", "facade", "beaded") silently became an
// RGB vector regardless of its declared type — corrupting text parameters.
describe('formatScadValue — hex coercion is color-type-only', () => {
  it('keeps untyped 6-hex-char words as quoted strings', () => {
    expect(formatScadValue('word', 'decade', {})).toBe('"decade"')
    expect(formatScadValue('word', 'facade', {})).toBe('"facade"')
    expect(formatScadValue('word', 'beaded', {})).toBe('"beaded"')
    expect(formatScadValue('word', 'efface', {})).toBe('"efface"')
  })

  it('keeps string-typed 6-hex-char words as quoted strings', () => {
    expect(formatScadValue('word', 'decade', { word: 'string' })).toBe(
      '"decade"'
    )
    expect(formatScadValue('code', 'ABCDEF', { code: 'string' })).toBe(
      '"ABCDEF"'
    )
    expect(formatScadValue('code', '#ABCDEF', { code: 'string' })).toBe(
      '"#ABCDEF"'
    )
  })

  it('still converts color-typed hex values to RGB vectors (vector style)', () => {
    expect(formatScadValue('c', 'ff0000', { c: 'color' })).toBe('[255,0,0]')
    expect(formatScadValue('c', '#00ff00', { c: 'color' })).toBe('[0,255,0]')
  })

  it('preserves string-literal style for color-typed params declared as strings', () => {
    const scadWithHash = 'c = "#FF0000"; // [#FF0000, #00FF00]\ncube(1);'
    expect(formatScadValue('c', '#39bdb0', { c: 'color' }, scadWithHash)).toBe(
      '"#39BDB0"'
    )
    const scadNoHash = 'c = "FF0000";\ncube(1);'
    expect(formatScadValue('c', '39bdb0', { c: 'color' }, scadNoHash)).toBe(
      '"39BDB0"'
    )
  })

  it('leaves non-hex strings, numbers, booleans, and vectors unchanged', () => {
    expect(formatScadValue('s', 'hello', {})).toBe('"hello"')
    expect(formatScadValue('n', 42, {})).toBe('42')
    expect(formatScadValue('b', true, {})).toBe('true')
    expect(formatScadValue('v', [1, 2, 3], {})).toBe('[1,2,3]')
  })

  it('buildDefineArgs carries the fix through to -D arguments', () => {
    const args = buildDefineArgs(
      { word: 'decade', c: 'ff0000' },
      { word: 'string', c: 'color' }
    )
    expect(args).toEqual([
      '-D',
      'word="decade"',
      '-D',
      'c=[255,0,0]',
    ])
  })
})
