// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { devWorkerModuleGraph } from '../../vite.config.js'

/**
 * D-31 and D-133: WebKit refuses a CACHED module when a worker imports it under
 * Cross-Origin-Embedder-Policy, so the dev server serves the render worker's
 * whole module graph `no-store`. D-31 covered the worker's own directory.
 * D-133 was the same failure one directory over: the worker also imports four
 * modules from src/js/ that the main document loads first, and WebKit refused
 * every one of them, so no preview could render in dev on Safari at all.
 *
 * The scope is computed from the worker's real imports rather than listed by
 * hand. These tests are the pin that the computation actually reaches the
 * far side of the graph - a hand-written list is what failed twice.
 */
describe('the dev render worker\'s no-store scope (D-31, D-133)', () => {
  const graph = devWorkerModuleGraph()

  it('covers the worker entry itself', () => {
    expect(graph.has('/src/worker/openscad-worker.js')).toBe(true)
  })

  it('covers every module the worker imports, including the ones outside src/worker/', () => {
    // These four are the D-133 case: shared with the main thread, cached by it,
    // then refused for the worker. color-utils.js is reached transitively.
    for (const url of [
      '/src/js/file-param-resolver.js',
      '/src/js/font-manifest.js',
      '/src/js/scad-param-formatter.js',
      '/src/js/color-utils.js',
    ]) {
      expect(graph.has(url), `${url} must be served no-store in dev`).toBe(true)
    }
  })

  it('covers Vite\'s injected HMR client, which no source file names', () => {
    expect(graph.has('/@vite/client')).toBe(true)
    expect(graph.has('/node_modules/vite/dist/client/env.mjs')).toBe(true)
  })

  it('reaches the whole graph, not just the first hop', () => {
    // Walk the worker's relative imports independently and require the scope to
    // contain every file the walk finds. If someone adds an import the resolver
    // cannot follow, this fails here rather than on Safari.
    const root = process.cwd()
    const seen = new Set()
    const stack = [path.resolve(root, 'src/worker/openscad-worker.js')]
    const fromRe =
      /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g

    while (stack.length) {
      const file = stack.pop()
      if (seen.has(file) || !existsSync(file)) continue
      seen.add(file)
      const source = readFileSync(file, 'utf-8')
      fromRe.lastIndex = 0
      let match
      while ((match = fromRe.exec(source))) {
        const spec = match[1] || match[2] || match[3]
        if (!spec || !spec.startsWith('.')) continue
        let resolved = path.resolve(path.dirname(file), spec)
        if (!existsSync(resolved) && existsSync(`${resolved}.js`))
          resolved += '.js'
        stack.push(resolved)
      }
    }

    const missing = [...seen]
      .map((file) => `/${path.relative(root, file).split(path.sep).join('/')}`)
      .filter((url) => !graph.has(url))
    expect(missing, 'worker modules left cacheable in dev').toEqual([])
    expect(seen.size).toBeGreaterThan(10)
  })

  it('does not cover modules the worker never imports', () => {
    // Scoped, not global: the rest of dev keeps its caching.
    expect(graph.has('/src/js/ui-generator.js')).toBe(false)
    expect(graph.has('/src/main.js')).toBe(false)
  })
})

/**
 * DP-34's trace worker is the second module worker built from src/, and it
 * imports image-import.js and ink-extraction.js, both of which the main thread
 * loads first. That is precisely the D-133 shape, so it needs the same scope.
 */
describe("the trace worker's no-store scope (DP-34)", () => {
  const graph = devWorkerModuleGraph('src/js/trace-worker.js')

  it('covers the worker entry', () => {
    expect(graph.has('/src/js/trace-worker.js')).toBe(true)
  })

  it('covers the modules it shares with the main thread', () => {
    for (const url of [
      '/src/js/image-import.js',
      '/src/js/ink-extraction.js',
      '/src/js/color-utils.js',
    ]) {
      expect(graph.has(url), `${url} must be served no-store in dev`).toBe(true)
    }
  })
})
