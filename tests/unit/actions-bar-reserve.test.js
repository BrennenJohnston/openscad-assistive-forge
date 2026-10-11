/**
 * Unit tests for keeping the room under the page equal to the fixed Actions
 * bar's height.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, afterEach } from 'vitest'
import { reserveSpaceForActionsBar } from '../../src/js/actions-bar-reserve.js'

function barOf(height, position) {
  const bar = document.createElement('div')
  bar.style.position = position
  bar.getBoundingClientRect = () => ({ height })
  document.body.appendChild(bar)
  return bar
}

afterEach(() => {
  document.documentElement.style.removeProperty('--actions-bar-reserved')
  document.body.innerHTML = ''
})

describe('the room left for the Actions bar', () => {
  it('is the fixed bar’s whole height, two rows and all', () => {
    const stop = reserveSpaceForActionsBar(barOf(98.4, 'fixed'))
    expect(
      document.documentElement.style.getPropertyValue('--actions-bar-reserved')
    ).toBe('99px')
    stop()
  })

  it('is left to the stylesheet when the bar is not fixed', () => {
    document.documentElement.style.setProperty('--actions-bar-reserved', '99px')
    const stop = reserveSpaceForActionsBar(barOf(52, 'sticky'))
    expect(
      document.documentElement.style.getPropertyValue('--actions-bar-reserved')
    ).toBe('')
    stop()
  })

  it('follows the bar when the window changes', () => {
    const bar = barOf(99, 'fixed')
    const stop = reserveSpaceForActionsBar(bar)
    bar.getBoundingClientRect = () => ({ height: 140 })
    window.dispatchEvent(new Event('resize'))
    expect(
      document.documentElement.style.getPropertyValue('--actions-bar-reserved')
    ).toBe('140px')
    stop()
  })
})
