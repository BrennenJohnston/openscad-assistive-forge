/**
 * The words a person reads are American English (DP-Q49).
 *
 * `strings.js` has declared "US English" in its own header since it was
 * written, and shipped "Colours" fifty-four times anyway. A rule with nothing
 * enforcing it is the same story as the em dash the style guide banned and
 * thirteen strings kept using. This is that rule with a build behind it.
 *
 * The reader lives in `scripts/us-english-scan.mjs`, which also prints the
 * list on its own (`node scripts/us-english-scan.mjs`) so a sweep can be done
 * by hand from it. What it reads, and what it deliberately leaves alone, is
 * written at the top of that file.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import { scanAll, findings, jsTextRuns } from '../../scripts/us-english-scan.mjs'

describe('American English in every word a person reads (DP-Q49)', () => {
  it('finds no British spelling in the app, the tiles or the papers', () => {
    const found = scanAll()
    const report =
      found.length === 0
        ? ''
        : `\n${found.length} British spelling(s):\n${found.join('\n')}\n`
    expect(report).toBe('')
  })

  describe('the reader itself', () => {
    it('reads a string and a comment, and leaves the code alone', () => {
      const runs = jsTextRuns(
        `const colourCount = 5; // the colour count\nconst label = 'Colours';\n`
      )
      expect(runs.map((r) => r.text.trim())).toEqual([
        'the colour count',
        'Colours',
      ])
    })

    it('steps over a regular expression that holds a quote', () => {
      const runs = jsTextRuns(`const q = /['"]/g; const s = 'Kept as prose';\n`)
      expect(runs.map((r) => r.text)).toEqual(['Kept as prose'])
    })

    it('leaves a lower-case one-word string alone: it is a key', () => {
      const runs = jsTextRuns(
        `const mode = 'colours'; const label = 'How many colours';\n`
      )
      expect(runs.map((r) => r.text)).toEqual(['How many colours'])
    })

    it('reads a template as the pieces around its holes', () => {
      const runs = jsTextRuns('const s = `before ${colourName} after`;\n')
      expect(runs.map((r) => r.text)).toEqual(['before ', ' after'])
    })

    it('keeps a template line true to the file after a hole', () => {
      const runs = jsTextRuns(
        'const s = `one\\n${\n  spread\n}\\ntwo Colours`;\n'
      )
      // Three source lines: the hole spans two of them, and the \n inside the
      // template is an escape, not a line.
      expect(runs.at(-1).line).toBe(3)
    })

    it('leaves a name alone but catches the same word in a sentence', () => {
      const text = 'Choose a colour from colour-separation.js'
      const hits = findings('x.js', [{ line: 1, text }])
      expect(hits).toHaveLength(1)
      expect(hits[0]).toContain('"colour"')
    })

    it('treats a dot before letters as a file name, not a full stop', () => {
      expect(findings('x.js', [{ line: 1, text: 'see colours.json' }])).toEqual(
        []
      )
      expect(
        findings('x.js', [{ line: 1, text: 'Pick your colours.' }])
      ).toHaveLength(1)
    })
  })
})
