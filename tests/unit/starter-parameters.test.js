import { describe, it, expect } from 'vitest'
import {
  normalizeStarterList,
  resolveStarterParameters,
  starterViewApplies,
  starterHint,
  starterAnnouncement,
  unknownStarterMessage,
  describeUnknownStarter,
  SHOW_ALL_LABEL,
  SHOW_STARTER_LABEL,
} from '../../src/js/starter-parameters.js'

const schema = {
  parameters: {
    width: { name: 'width', group: 'size' },
    height: { name: 'height', group: 'size' },
    style: { name: 'style', group: 'looks' },
    tolerance: { name: 'tolerance', group: 'fit' },
  },
}

describe('normalizeStarterList', () => {
  it('keeps the order the author wrote', () => {
    expect(normalizeStarterList(['b', 'a', 'c'])).toEqual(['b', 'a', 'c'])
  })

  it('trims, drops blanks, and drops repeats', () => {
    expect(normalizeStarterList([' width ', 'width', '', '   '])).toEqual(['width'])
  })

  it('survives a manifest that got the type wrong', () => {
    // Somebody else's file. A bad value here is not a reason to refuse a load.
    expect(normalizeStarterList('width')).toEqual([])
    expect(normalizeStarterList(null)).toEqual([])
    expect(normalizeStarterList([1, true, { name: 'width' }])).toEqual([])
  })
})

describe('resolveStarterParameters', () => {
  it('separates the names this design has from the ones it does not', () => {
    const result = resolveStarterParameters(schema, ['width', 'nope', 'style'])
    expect(result.known).toEqual(['width', 'style'])
    expect(result.unknown).toEqual(['nope'])
  })

  it('collects the groups the starter parameters live in', () => {
    const result = resolveStarterParameters(schema, ['width', 'style'])
    expect([...result.groupIds].sort()).toEqual(['looks', 'size'])
  })

  it('counts every parameter, not just the starters', () => {
    expect(resolveStarterParameters(schema, ['width']).total).toBe(4)
  })

  it('says nothing is known when there is no schema yet', () => {
    expect(resolveStarterParameters(null, ['width']).known).toEqual([])
  })
})

describe('starterViewApplies', () => {
  const names = ['width']

  it('applies when a list belongs to the project on screen', () => {
    expect(starterViewApplies({ names, fileKey: 'a.scad' }, 'a.scad', 1)).toBe(true)
  })

  it('does not apply to a different project', () => {
    // A starter list belongs to the design it came with. Opening something
    // else must not inherit somebody else's idea of what matters.
    expect(starterViewApplies({ names, fileKey: 'a.scad' }, 'b.scad', 1)).toBe(false)
  })

  it('applies to any project when no file was named', () => {
    expect(starterViewApplies({ names, fileKey: null }, 'b.scad', 1)).toBe(true)
  })

  it('does not apply when nothing was declared', () => {
    expect(starterViewApplies({ names: [], fileKey: null }, 'a.scad', 0)).toBe(false)
    expect(starterViewApplies(null, 'a.scad', 0)).toBe(false)
  })

  it('does not apply when not one declared name is real', () => {
    // A starter view built from names this design does not have is an empty
    // screen, which is worse than the long one.
    expect(starterViewApplies({ names, fileKey: null }, 'a.scad', 0)).toBe(false)
  })
})

describe('the words', () => {
  it('says what is on screen and what is waiting', () => {
    expect(starterHint(12, 174)).toBe(
      'Showing the 12 settings this design starts with. 162 more are available.'
    )
  })

  it('does not promise more when there is no more', () => {
    expect(starterHint(4, 4)).toBe('Showing all 4 settings.')
  })

  it('never reports a negative remainder', () => {
    expect(starterHint(10, 4)).toBe('Showing all 4 settings.')
  })

  it('announces both directions', () => {
    expect(starterAnnouncement(true, 12, 174)).toBe('Showing all 174 settings.')
    expect(starterAnnouncement(false, 12, 174)).toBe(
      'Showing the 12 settings this design starts with.'
    )
  })

  it('labels a toggle, not a button that vanishes', () => {
    // A control that removes itself takes the focus with it, and the way back
    // to a shorter screen should not be "reload the page".
    expect(SHOW_ALL_LABEL).toBe('Show all parameters')
    expect(SHOW_STARTER_LABEL).toBe('Show only the starter settings')
  })
})

describe('unknown names', () => {
  it('says nothing when every name was found', () => {
    expect(unknownStarterMessage([])).toBeNull()
    expect(describeUnknownStarter([])).toBeNull()
    expect(describeUnknownStarter(null)).toBeNull()
  })

  it('names the single one', () => {
    expect(unknownStarterMessage(['nope'])).toMatch(/nope/)
    expect(describeUnknownStarter(['nope']).title).toBe(
      'One starting setting in this link is not part of this design'
    )
  })

  it('counts and lists several', () => {
    const notice = describeUnknownStarter(['a', 'b'])
    expect(notice.title).toBe(
      '2 starting settings in this link are not part of this design'
    )
    expect(notice.lines).toEqual([
      'a is not a parameter of this design, so it was left out.',
      'b is not a parameter of this design, so it was left out.',
    ])
  })
})
