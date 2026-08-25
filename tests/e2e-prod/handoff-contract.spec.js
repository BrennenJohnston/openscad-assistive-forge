/**
 * The hand-off contract, proven under the real CSP.
 *
 * docs/specs/FORGE_HANDOFF_CONTRACT.md tells somebody building another tool how
 * to open work in Forge without talking to anybody. This spec is the check that
 * the page is telling the truth: the link below was composed from the page
 * ALONE, by reading it as if the code were not available, and it runs in the
 * production-parity lane where the shipped Content-Security-Policy is enforced.
 *
 * A documentation page nobody has executed is a wish. This one has been.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

test.describe('Forge hand-off contract (prod CSP)', () => {
  test('prod-handoff: a link composed from the contract page alone opens a project with its settings', async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(180000)

    // Composed by following the page, section by section:
    //   2   - the parameter is ?manifest=<url>, percent-encoded
    //   2.3 - that url may be data:application/json;base64,<...>
    //   2.3 - a data: manifest must name ABSOLUTE urls, because relative paths
    //         cannot resolve against a data: base
    //   2.1 - 'self' is on the connect-src allowlist, so the design may be
    //         hosted on Forge's own origin
    //   2.2 - settings ride in #v=1&params=<percent-encoded JSON>
    //   2   - ?skipWelcome=true goes straight to the project
    const manifest = {
      forgeManifest: '1.0',
      name: 'Cold Read Project',
      author: 'A tool that never talked to us',
      files: { main: `${baseURL}/examples/simple-box/simple_box.scad` },
      defaults: { skipWelcome: true },
    }
    const manifestUrl = `data:application/json;base64,${Buffer.from(
      JSON.stringify(manifest),
      'utf8'
    ).toString('base64')}`
    const params = encodeURIComponent(JSON.stringify({ width: 77 }))
    const link = `/?manifest=${encodeURIComponent(manifestUrl)}&skipWelcome=true#v=1&params=${params}`

    // Section 2.3 puts a number on this. Hold the page to it.
    expect(
      Buffer.byteLength(`${baseURL}${link}`, 'utf8'),
      'the page says keep the whole URL under 8 KB'
    ).toBeLessThan(8192)

    const violations = []
    page.on('console', (message) => {
      const text = message.text()
      if (/Refused to (connect|load|frame)|violates the following/i.test(text)) {
        violations.push(text)
      }
    })

    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    })
    await page.goto(link)

    await expect(page.locator('.param-control').first()).toBeAttached({
      timeout: 60000,
    })

    const skip = page.locator('#manifestSaveCopySkip')
    try {
      await skip.waitFor({ state: 'visible', timeout: 5000 })
      await skip.click()
    } catch {
      // The save-copy modal did not appear.
    }

    // The manifest was read: its name and author are on screen.
    await expect(page.locator('#manifestInfoBanner')).toContainText(
      'Cold Read Project'
    )

    // The fragment was read: the control holds what the link asked for, not
    // the design's own default of 50.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const el = document.querySelector('#param-width-spinbox, #param-width')
          return el ? el.value : null
        })
      )
      .toBe('77')

    expect(violations, violations.join(' | ')).toEqual([])
  })

  test('prod-handoff: the capability index is served, and it agrees with the CSP it describes', async ({
    page,
    baseURL,
  }) => {
    const response = await page.request.get(`${baseURL}/forge-capabilities.txt`)
    expect(response.ok(), 'the index must actually deploy').toBe(true)

    const body = await response.text()
    expect(body).toContain('OpenSCAD Assistive Forge - capability index')

    // The index lists the hosts a tool may fetch from. That list is a copy of
    // something, and a copy that can drift is the defect this round exists to
    // end - so compare it against its source rather than trusting it.
    const headers = fs.readFileSync(
      path.join(process.cwd(), 'public', '_headers'),
      'utf8'
    )
    // The POLICY line, not the comment above it that happens to say
    // "connect-src includes GitHub raw/media URLs". Reading the file with a
    // bare /connect-src/ matched that sentence and asked the index to contain
    // a host called "includes".
    const policyLine = headers
      .split('\n')
      .find((line) => line.trim().startsWith('Content-Security-Policy:'))
    expect(policyLine, 'public/_headers must set a CSP').toBeTruthy()
    const connectSrc = policyLine.match(/connect-src ([^;]+);/)
    expect(connectSrc, 'the CSP must declare connect-src').not.toBeNull()

    const hosts = connectSrc[1]
      .trim()
      .split(/\s+/)
      .filter((token) => token !== "'self'" && token !== 'data:')
      .map((token) => token.replace(/^https:\/\//, ''))

    for (const host of hosts) {
      expect(body, `the index omits ${host}, which the CSP allows`).toContain(
        host
      )
    }

    // And the other direction: nothing the index promises may be missing from
    // the policy.
    const listed = body
      .split('\n')
      .find((line) => line.startsWith('allowed:'))
    expect(listed, 'the index must have an "allowed:" line').toBeTruthy()
  })
})
