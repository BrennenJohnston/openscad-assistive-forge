import { describe, it, expect, vi } from 'vitest'
import {
  adjustmentSentence,
  describeAdjustments,
  createParameterNotices,
} from '../../src/js/parameter-notices.js'

describe('adjustmentSentence', () => {
  it('says what was asked for and what it became, above the range', () => {
    expect(
      adjustmentSentence('width', { reason: 'max', value: 999, maximum: 100 }, 100)
    ).toBe(
      'width was set to 999, above the highest allowed value. It is now 100.'
    )
  })

  it('says the same below the range', () => {
    expect(
      adjustmentSentence('hole_count', { reason: 'min', value: 0, minimum: 1 }, 1)
    ).toBe(
      'hole_count was set to 0, below the lowest allowed value. It is now 1.'
    )
  })

  it('falls back to the range bound when no applied value is known', () => {
    expect(
      adjustmentSentence('width', { reason: 'max', value: 999, maximum: 100 })
    ).toMatch(/It is now 100\./)
  })

  it('names a parameter this design does not have', () => {
    expect(
      adjustmentSentence('not_a_param', { reason: 'unknown-param', value: 5 })
    ).toBe('not_a_param is not a parameter of this design, so it was ignored.')
  })

  it('explains a value outside a list of choices', () => {
    const sentence = adjustmentSentence('include_lid', {
      reason: 'enum',
      value: 'maybe',
      allowed: ['yes', 'no'],
    })
    expect(sentence).toMatch(/not one of its choices/)
    expect(sentence).toMatch(/the design's own value was kept/)
  })

  it('still says something useful for a reason it has never seen', () => {
    expect(adjustmentSentence('x', { reason: 'brand-new' })).toBe(
      'x was adjusted to fit what this design allows.'
    )
  })
})

describe('describeAdjustments', () => {
  it('says nothing at all when nothing was adjusted', () => {
    expect(describeAdjustments({})).toBeNull()
    expect(describeAdjustments(null)).toBeNull()
  })

  it('counts in the singular for one', () => {
    const notice = describeAdjustments(
      { width: { reason: 'max', value: 999, maximum: 100 } },
      { width: 100 }
    )
    expect(notice.title).toBe(
      'One value in this link was changed to fit the design'
    )
    expect(notice.lines).toHaveLength(1)
  })

  it('counts them for more than one', () => {
    const notice = describeAdjustments({
      width: { reason: 'max', value: 999, maximum: 100 },
      nope: { reason: 'unknown-param', value: 1 },
    })
    expect(notice.title).toBe(
      '2 values in this link were changed to fit the design'
    )
    expect(notice.lines).toHaveLength(2)
  })
})

describe('createParameterNotices', () => {
  function harness() {
    const container = document.createElement('div')
    container.hidden = true
    document.body.appendChild(container)
    const announced = []
    const notices = createParameterNotices(container, {
      announce: (m) => announced.push(m),
    })
    return { container, notices, announced }
  }

  const sample = {
    title: 'One value in this link was changed to fit the design',
    lines: ['width was set to 999, above the highest allowed value.'],
  }

  it('shows the notice and reveals its container', () => {
    const { container, notices } = harness()
    notices.show(sample)
    expect(container.hidden).toBe(false)
    expect(container.querySelector('.parameter-notice-title').textContent).toBe(
      sample.title
    )
    expect(container.querySelectorAll('li')).toHaveLength(1)
  })

  it('is not an alert: it reports what already happened without interrupting', () => {
    const { container, notices } = harness()
    notices.show(sample)
    expect(
      container.querySelector('.parameter-notice').getAttribute('role')
    ).toBeNull()
  })

  it('announces the whole notice once', () => {
    const { notices, announced } = harness()
    notices.show(sample)
    expect(announced).toHaveLength(1)
    expect(announced[0]).toContain(sample.title)
    expect(announced[0]).toContain(sample.lines[0])
  })

  it('dismisses on the button, and says so', () => {
    const { container, notices, announced } = harness()
    notices.show(sample)
    container.querySelector('.parameter-notice-dismiss').click()
    expect(container.hidden).toBe(true)
    expect(container.querySelectorAll('.parameter-notice')).toHaveLength(0)
    expect(announced.at(-1)).toBe('Notice dismissed.')
  })

  it('replaces an earlier notice rather than stacking', () => {
    // Two at once would mean the older one is about a project that is no
    // longer loaded.
    const { container, notices } = harness()
    notices.show(sample)
    notices.show({ title: 'Second', lines: ['a', 'b'] })
    expect(container.querySelectorAll('.parameter-notice')).toHaveLength(1)
    expect(container.querySelector('.parameter-notice-title').textContent).toBe(
      'Second'
    )
  })

  it('does nothing when there is nothing to show', () => {
    const { container, notices, announced } = harness()
    notices.show(null)
    expect(container.hidden).toBe(true)
    expect(announced).toHaveLength(0)
  })

  it('survives having no container at all', () => {
    const notices = createParameterNotices(null, { announce: vi.fn() })
    expect(() => notices.show(sample)).not.toThrow()
    expect(() => notices.clear()).not.toThrow()
  })
})
