/**
 * Unit tests for when a typed text value is applied: on Enter as a key
 * press (a phone's keyboard may send no change event), on leaving the field,
 * once each time; and never from a field that a newer render replaced.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../src/js/feature-flags.js', () => ({
  isEnabled: vi.fn(() => false),
}))

import {
  renderParameterUI,
  commitPendingParameterEdit,
} from '../../src/js/ui-generator.js'

function schemaWith(defaultLabel = 'HI') {
  return {
    groups: [{ id: 'Sign', label: 'Sign' }],
    parameters: {
      label: {
        name: 'label',
        type: 'string',
        default: defaultLabel,
        uiType: 'input',
        group: 'Sign',
      },
      width: {
        name: 'width',
        type: 'number',
        default: 40,
        uiType: 'input',
        group: 'Sign',
      },
    },
  }
}

let container

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
  vi.restoreAllMocks()
})

function typeInto(input, text) {
  input.focus()
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('a typed text value', () => {
  it('applies on Enter as a key press, with no change event', () => {
    const onChange = vi.fn()
    renderParameterUI(schemaWith(), container, onChange, {})
    const input = container.querySelector('#param-label')
    typeInto(input, 'ABC')
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    )
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toMatchObject({ label: 'ABC' })
  })

  it('applies on leaving the field, with no change event', () => {
    const onChange = vi.fn()
    renderParameterUI(schemaWith(), container, onChange, {})
    const input = container.querySelector('#param-label')
    typeInto(input, 'ABC')
    input.blur()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toMatchObject({ label: 'ABC' })
  })

  it('applies once when a change event and leaving the field both come', () => {
    const onChange = vi.fn()
    renderParameterUI(schemaWith(), container, onChange, {})
    const input = container.querySelector('#param-label')
    typeInto(input, 'ABC')
    input.dispatchEvent(new Event('change'))
    input.blur()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the text did not change', () => {
    const onChange = vi.fn()
    renderParameterUI(schemaWith(), container, onChange, {})
    const input = container.querySelector('#param-label')
    input.focus()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    )
    input.blur()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('says when it applies, and asks a phone keyboard for Done', () => {
    renderParameterUI(schemaWith(), container, vi.fn(), {})
    const input = container.querySelector('#param-label')
    expect(container.querySelector('#param-label-apply-hint').textContent).toBe(
      'Applies when you press Enter or leave the field'
    )
    expect(input.getAttribute('enterkeyhint')).toBe('done')
  })
})

describe('a field that a newer render replaced', () => {
  it('cannot apply its old values over the new ones', () => {
    const first = vi.fn()
    renderParameterUI(schemaWith(), container, first, {})
    const oldInput = container.querySelector('#param-label')

    const second = vi.fn()
    renderParameterUI(schemaWith(), container, second, { width: 100 })
    oldInput.value = 'LATE'
    oldInput.dispatchEvent(new Event('change'))

    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
  })
})

describe('an edit pending when the controls are about to be replaced', () => {
  it('is applied first', () => {
    const onChange = vi.fn()
    renderParameterUI(schemaWith(), container, onChange, {})
    const input = container.querySelector('#param-label')
    typeInto(input, 'ABCDEFG')
    commitPendingParameterEdit(container)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toMatchObject({ label: 'ABCDEFG' })
  })

  it('leaves a field outside the controls alone', () => {
    const onChange = vi.fn()
    renderParameterUI(schemaWith(), container, onChange, {})
    const outside = document.createElement('input')
    document.body.appendChild(outside)
    outside.focus()
    commitPendingParameterEdit(container)
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })
})
