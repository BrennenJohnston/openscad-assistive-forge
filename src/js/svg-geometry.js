/**
 * The drawing geometry, loaded when a picture first needs it.
 *
 * Reading, preparing and nesting a drawing takes the preparer, the editor
 * workspace, the nesting tree, the credit-line remover, the hole check and
 * the stencil bridges, and under them the clipping and path libraries:
 * the largest part of the app that most models never use. They load as
 * their own chunk the first time a picture parameter is drawn, so a model
 * without one never downloads them.
 *
 * `loadSvgGeometry()` starts the load once and resolves with the modules.
 * `svgGeometry()` hands them to the synchronous code that runs only after a
 * load has resolved: every way a drawing enters the parameter UI (a file, a
 * gallery choice, a trace, a link, a restore) waits for the load first.
 * A load that fails is not kept, so the next picture tries again.
 *
 * @license GPL-3.0-or-later
 */

let geometry = null;
let pending = null;

export function loadSvgGeometry() {
  if (geometry) return Promise.resolve(geometry);
  pending ??= Promise.all([
    import('./svg-preparer.js'),
    import('./svg-preparer-workspace.js'),
    import('./svg-nesting.js'),
    import('./credit-line.js'),
    import('./hole-placement.js'),
    import('./stencil-bridges.js'),
  ]).then(
    ([preparer, workspace, nesting, creditLine, holes, bridges]) => {
      geometry = { preparer, workspace, nesting, creditLine, holes, bridges };
      return geometry;
    },
    (err) => {
      pending = null;
      throw err;
    }
  );
  return pending;
}

/**
 * The loaded modules, for code that runs after a load has resolved.
 * @throws {Error} when nothing has loaded them yet, which is a bug in the
 *   caller: it reached the geometry by a path that did not wait for it.
 */
export function svgGeometry() {
  if (!geometry) {
    throw new Error(
      'The drawing geometry was used before it loaded; await loadSvgGeometry() first.'
    );
  }
  return geometry;
}

export function isSvgGeometryLoaded() {
  return geometry !== null;
}
