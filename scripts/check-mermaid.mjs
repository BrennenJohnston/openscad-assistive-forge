#!/usr/bin/env node
/**
 * Every Mermaid diagram in the tracked Markdown, parsed by Mermaid itself.
 *
 * GitHub renders a ```mermaid fence with Mermaid, and a diagram it cannot
 * parse shows a red "Unable to render rich display" box in its place. The
 * markdown lint and the link checker do not read the fences, so the
 * architecture page carried a broken diagram through every green board
 * until a reader saw it (2026-09-18). This runs the parser GitHub runs, in
 * the Playwright Chromium the tests already use, and fails on the first
 * diagram Mermaid rejects.
 *
 * Usage: node scripts/check-mermaid.mjs [file.md ...]
 *   With no files, every tracked Markdown file is checked.
 *
 * The parser is loaded from the CDN (a pinned major), so nothing is added
 * to package.json; the check needs the network, as the link checker does.
 *
 * @license GPL-3.0-or-later
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js'

const files =
  process.argv.length > 2
    ? process.argv.slice(2)
    : execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
        .split(/\r?\n/)
        .filter(Boolean)

/** Every ```mermaid fence in a file, with the line it starts on. */
function fencesOf(text) {
  const out = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```\s*mermaid\s*$/.test(lines[i])) continue
    const start = i + 1
    const body = []
    for (i = i + 1; i < lines.length && !/^\s*```/.test(lines[i]); i++) {
      body.push(lines[i])
    }
    out.push({ line: start, text: body.join('\n') })
  }
  return out
}

const diagrams = []
for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const fence of fencesOf(text)) diagrams.push({ file, ...fence })
}

if (diagrams.length === 0) {
  console.log('No Mermaid diagrams found.')
  process.exit(0)
}

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<!doctype html><html><body></body></html>')
await page.addScriptTag({ url: MERMAID_URL })
await page.evaluate(() => window.mermaid.initialize({ startOnLoad: false }))

let failures = 0
for (const d of diagrams) {
  const error = await page.evaluate(async (src) => {
    try {
      await window.mermaid.parse(src)
      return null
    } catch (e) {
      return String((e && e.message) || e)
    }
  }, d.text)
  if (error) {
    failures++
    console.log(`FAIL ${d.file}:${d.line}\n  ${error.split('\n').join('\n  ')}`)
  } else {
    console.log(`ok   ${d.file}:${d.line}`)
  }
}
await browser.close()

console.log(
  `\n${diagrams.length} diagram(s) in ${files.length} file(s): ${failures} failed.`
)
process.exit(failures > 0 ? 1 : 0)
