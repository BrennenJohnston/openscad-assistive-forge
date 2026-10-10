/**
 * Unit tests for the words a person gets when a model is deeper than the
 * browser can follow, and when a preview is stopped at its time limit.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import { translateWorkerError } from '../../src/worker/error-translations.js'
import {
  translateError,
  previewFailureSentence,
  TRANSLATIONS_BY_CODE,
} from '../../src/js/error-translator.js'

const TOO_DEEP = {
  title: 'Model Too Deep',
  explanation:
    'The model repeats a module or function inside itself more times than this browser can follow.',
  suggestion:
    'Try a smaller value for the setting that sets how many times it repeats. Desktop OpenSCAD can go deeper.',
}

// When the engine's own stack overruns, the browser reports whatever the
// damaged memory hits next. These words are the usual result of a deep model,
// but not proof of one, so they are told as the likely cause.
const OUT_OF_ROOM = {
  title: 'Engine Ran Out of Room',
  explanation:
    'The browser engine ran out of room while building the model. The most common cause is a module or function that repeats inside itself many times.',
  suggestion: TOO_DEEP.suggestion,
}

describe('a model deeper than the browser can follow', () => {
  it.each([
    ['Chromium', 'Maximum call stack size exceeded'],
    ['Firefox, in its JavaScript', 'too much recursion'],
    ['OpenSCAD itself', "ERROR: Recursion detected calling function 'f'"],
  ])('%s says so for certain', (_, raw) => {
    const { code } = translateWorkerError(new Error(raw))
    expect(code).toBe('RECURSION')
    const friendly = translateError(raw, { code })
    expect(friendly).toMatchObject(TOO_DEEP)
  })

  it.each([
    ['Firefox, the spiral at depth 190', 'indirect call to null'],
    ['Firefox, the test model at 400 steps', 'index out of bounds'],
    ['WebKit, the spiral at depth 190', 'call_indirect to a signature that does not match'],
    [
      'WebKit, the test model at 400 steps',
      "Out of bounds memory access (evaluating 'original(...args)')",
    ],
  ])('%s gives the likely cause', (_, raw) => {
    const error = new Error(raw)
    error.name = 'RuntimeError'
    const { code } = translateWorkerError(error)
    expect(code).toBe('ENGINE_OUT_OF_ROOM')
    const friendly = translateError(raw, { code })
    expect(friendly).toMatchObject(OUT_OF_ROOM)
  })

  it('is never called infinite: a deep model can be finite', () => {
    for (const raw of ['too much recursion', 'index out of bounds']) {
      expect(translateWorkerError(new Error(raw)).message).not.toMatch(
        /infinite/i
      )
    }
    for (const code of ['RECURSION', 'ENGINE_OUT_OF_ROOM']) {
      expect(JSON.stringify(TRANSLATIONS_BY_CODE[code])).not.toMatch(
        /infinite/i
      )
    }
  })

  it('the preview says which', () => {
    const error = new Error('Maximum call stack size exceeded')
    error.code = 'RECURSION'
    expect(previewFailureSentence(error)).toBe('Preview failed: Model Too Deep')
  })
})

describe('a preview stopped at its time limit', () => {
  function timeLimitError(seconds) {
    const error = new Error(
      `Stopped after ${seconds} seconds: the render took longer than its time limit.`
    )
    error.code = 'RENDER_TIMEOUT'
    error.timeoutSeconds = seconds
    return error
  }

  it('says how long it waited and what to try', () => {
    expect(previewFailureSentence(timeLimitError(60))).toBe(
      'Preview stopped: it took longer than 60 seconds. Try a simpler setting, then change a value to preview again.'
    )
  })

  it('has a translation of its own, not the generic one', () => {
    const friendly = translateError(timeLimitError(90).message, {
      code: 'RENDER_TIMEOUT',
    })
    expect(friendly.title).toBe(TRANSLATIONS_BY_CODE.TIMEOUT.title)
  })
})

describe('other preview failures keep their sentence', () => {
  it('a failure names its title', () => {
    const error = new Error('Parser error in line 3')
    error.code = 'SYNTAX_ERROR'
    expect(previewFailureSentence(error)).toBe(
      `Preview failed: ${TRANSLATIONS_BY_CODE.SYNTAX_ERROR.title}`
    )
  })

  it('an engine that could not start again says what to do', () => {
    const error = new Error('The OpenSCAD engine could not start again.')
    error.code = 'ENGINE_RESTART_FAILED'
    const friendly = translateError(error.message, { code: error.code })
    expect(previewFailureSentence(error)).toBe(
      `Preview failed: ${friendly.title}. ${friendly.suggestion}`
    )
  })
})
