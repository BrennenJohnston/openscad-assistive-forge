/**
 * One shape is "1 shape": the drawing editor said "1 shapes" when a drawing
 * with one shape opened.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import { EDITOR_STRINGS } from '../../src/js/drawing-editor/strings.js'

describe('the sentence a drawing opens with', () => {
  it('counts one shape as one', () => {
    expect(EDITOR_STRINGS.openedForEditing('walk-shape.svg', 1, {})).toBe(
      'walk-shape.svg opened for editing, 1 shape.'
    )
    expect(EDITOR_STRINGS.openedForEditing('logo.png', 1, { traced: true })).toBe(
      'logo.png traced into 1 shape. Editor opened.'
    )
    expect(
      EDITOR_STRINGS.openedForEditing('photo.jpg', 1, { converted: true, seconds: 2.04 })
    ).toBe('photo.jpg converted in 2.0 seconds, 1 shape. Editor opened.')
  })

  it('counts several as several', () => {
    expect(EDITOR_STRINGS.openedForEditing('a.svg', 12, {})).toBe(
      'a.svg opened for editing, 12 shapes.'
    )
  })
})
