/**
 * The Alt View's code, counted in this browser: what each finding brings, the
 * break-through that waits while the look is on, the developer doors, and a
 * stored value that is not the shape written here.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { STORAGE_KEY_ALT_UNLOCK } from '../../src/js/storage-keys.js'
import {
  isPermanent,
  noteDevUnlock,
  readUnlockState,
  recordCodeEntry,
  takePendingBreak,
} from '../../src/js/alt-unlock-stages.js'

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY_ALT_UNLOCK))

describe('the code, counted', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('is kept under its own key', () => {
    expect(STORAGE_KEY_ALT_UNLOCK).toBe('openscad-forge-alt-unlock')
  })

  it('starts with nothing found', () => {
    expect(readUnlockState()).toEqual({
      entries: 0,
      permanent: false,
      pendingBreak: false,
    })
    expect(isPermanent()).toBe(false)
  })

  it('the first finding is the arrival, the second the crack, the third the key for good', () => {
    expect(recordCodeEntry({ altViewOn: false })).toBe('arrival')
    expect(stored()).toEqual({ entries: 1, permanent: false, pendingBreak: false })
    expect(recordCodeEntry({ altViewOn: false })).toBe('crack')
    expect(stored()).toEqual({ entries: 2, permanent: false, pendingBreak: false })
    expect(recordCodeEntry({ altViewOn: false })).toBe('break')
    expect(stored()).toEqual({ entries: 3, permanent: true, pendingBreak: false })
    expect(isPermanent()).toBe(true)
  })

  it('the first two count the same with the look on', () => {
    expect(recordCodeEntry({ altViewOn: true })).toBe('arrival')
    expect(recordCodeEntry({ altViewOn: true })).toBe('crack')
  })

  it('the third with the look on makes the key permanent at once and keeps the break-through waiting, once', () => {
    recordCodeEntry({ altViewOn: false })
    recordCodeEntry({ altViewOn: true })
    expect(recordCodeEntry({ altViewOn: true })).toBe('break-pending')
    expect(stored()).toEqual({ entries: 3, permanent: true, pendingBreak: true })
    expect(isPermanent()).toBe(true)

    expect(takePendingBreak()).toBe(true)
    expect(stored().pendingBreak).toBe(false)
    expect(takePendingBreak()).toBe(false)
  })

  it('nothing waits after a third finding with the look off', () => {
    recordCodeEntry({ altViewOn: false })
    recordCodeEntry({ altViewOn: false })
    recordCodeEntry({ altViewOn: false })
    expect(takePendingBreak()).toBe(false)
  })

  it('once the key is permanent a finding brings nothing and changes nothing', () => {
    for (let i = 0; i < 3; i++) recordCodeEntry({ altViewOn: false })
    const before = localStorage.getItem(STORAGE_KEY_ALT_UNLOCK)
    expect(recordCodeEntry({ altViewOn: false })).toBe('none')
    expect(recordCodeEntry({ altViewOn: true })).toBe('none')
    expect(localStorage.getItem(STORAGE_KEY_ALT_UNLOCK)).toBe(before)
  })

  it('a developer door counts as the first finding, with no stage of its own', () => {
    expect(noteDevUnlock()).toBeUndefined()
    expect(stored()).toEqual({ entries: 1, permanent: false, pendingBreak: false })
    expect(recordCodeEntry({ altViewOn: false })).toBe('crack')
  })

  it('a developer door takes nothing away from findings already made', () => {
    recordCodeEntry({ altViewOn: false })
    recordCodeEntry({ altViewOn: false })
    noteDevUnlock()
    expect(stored().entries).toBe(2)
  })

  it.each([
    ['not JSON', '{entries: 2'],
    ['a list', '[2]'],
    ['null', 'null'],
    ['a negative count', '{"entries":-1,"permanent":false,"pendingBreak":false}'],
    ['a count in words', '{"entries":"2","permanent":false,"pendingBreak":false}'],
    ['a fraction', '{"entries":1.5,"permanent":false,"pendingBreak":false}'],
  ])('a damaged value (%s) reads as nothing found and is written over by the next finding', (_, value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(STORAGE_KEY_ALT_UNLOCK, value)
    expect(readUnlockState()).toEqual({
      entries: 0,
      permanent: false,
      pendingBreak: false,
    })
    expect(isPermanent()).toBe(false)
    expect(warn).toHaveBeenCalled()
    expect(recordCodeEntry({ altViewOn: false })).toBe('arrival')
    expect(stored()).toEqual({ entries: 1, permanent: false, pendingBreak: false })
    warn.mockRestore()
  })

  it('a waiting break-through without a permanent key is not believed', () => {
    localStorage.setItem(
      STORAGE_KEY_ALT_UNLOCK,
      '{"entries":2,"permanent":false,"pendingBreak":true}'
    )
    expect(readUnlockState().pendingBreak).toBe(false)
    expect(takePendingBreak()).toBe(false)
  })
})
