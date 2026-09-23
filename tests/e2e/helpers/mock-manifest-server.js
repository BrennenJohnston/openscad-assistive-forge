/**
 * A routed stand-in for an author's GitHub-hosted project, shared by the
 * suites that walk the link road (manifest-loading, first-visit-links,
 * project-link-lane, link-failure-notice). Nothing here reaches the network.
 *
 * @license GPL-3.0-or-later
 */

export const MOCK_BASE = 'https://raw.githubusercontent.com/testuser/testrepo/main'
export const MANIFEST_URL = `${MOCK_BASE}/forge-manifest.json`

/**
 * Set up route interception to serve mock manifest and project files.
 * This simulates a GitHub-hosted manifest without requiring real network calls.
 */
export async function setupMockManifestServer(page, {
  manifest = null,
  files = {},
  manifestStatus = 200,
  manifestContentType = 'application/json',
  fileStatuses = {},
  corsHeaders = true,
} = {}) {
  // Intercept manifest URL
  await page.route(MANIFEST_URL, async (route) => {
    const headers = corsHeaders
      ? { 'Access-Control-Allow-Origin': '*', 'Content-Type': manifestContentType }
      : { 'Content-Type': manifestContentType }

    if (manifest === null) {
      await route.fulfill({ status: 404, body: 'Not Found' })
      return
    }

    const body = typeof manifest === 'string' ? manifest : JSON.stringify(manifest)
    await route.fulfill({ status: manifestStatus, headers, body })
  })

  // Intercept project file URLs
  for (const [filename, content] of Object.entries(files)) {
    const status = fileStatuses[filename] || 200
    await page.route(`${MOCK_BASE}/${filename}`, async (route) => {
      const headers = corsHeaders
        ? { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' }
        : { 'Content-Type': 'text/plain' }
      await route.fulfill({ status, headers, body: content })
    })
  }

  return MOCK_BASE
}

/** Minimal valid SCAD content for testing */
export const MINIMAL_SCAD = `
// Test design
width = 50; // [10:1:100]
height = 30; // [10:1:100]
cube([width, height, 10]);
`

/** Minimal valid manifest with just files.main */
export function minimalManifest(mainFile = 'test.scad') {
  return {
    forgeManifest: '1.0',
    files: { main: mainFile },
  }
}

/**
 * Record every text the status region and the two announcers ever hold,
 * from before the app's first script runs. A live region is cleared after it
 * speaks, and a polite message inside another's debounce is replaced, so a
 * sample taken at the end proves nothing; the history does. Also notes the
 * moment the engine reports itself ready (body[data-wasm-ready="true"]).
 * Read it back with liveHistory(page).
 */
export async function recordLiveRegions(page) {
  await page.addInitScript(() => {
    window.__statusHistory = []
    window.__wasmReadyAt = null
    const watch = (id) => {
      const el = document.getElementById(id)
      if (!el) return
      let last = ''
      const push = () => {
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ')
        if (text && text !== last) {
          last = text
          window.__statusHistory.push({ t: performance.now(), src: id, text })
        }
      }
      push()
      new MutationObserver(push).observe(el, {
        childList: true,
        characterData: true,
        subtree: true,
      })
    }
    const start = () => {
      for (const id of ['statusArea', 'srAnnouncer', 'srAnnouncerAssertive']) watch(id)
      const markReady = () => {
        if (window.__wasmReadyAt === null && document.body.getAttribute('data-wasm-ready') === 'true') {
          window.__wasmReadyAt = performance.now()
        }
      }
      markReady()
      new MutationObserver(markReady).observe(document.body, {
        attributes: true,
        attributeFilter: ['data-wasm-ready'],
      })
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start)
    } else {
      start()
    }
  })
}

/** The recorded history: [{ t, src, text }] in the order it happened. */
export async function liveHistory(page) {
  return page.evaluate(() => window.__statusHistory || [])
}
