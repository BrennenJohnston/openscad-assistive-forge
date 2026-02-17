/**
 * OpenSCAD Worker - Web Worker for STL Generation
 * @license GPL-3.0-or-later
 */

let openscad = null;

// Initialize OpenSCAD WASM
async function initOpenSCAD() {
  if (openscad) return openscad;

  try {
    // Use vendored official OpenSCAD WASM build (with Manifold support)
    // Place openscad.js and openscad.wasm in public/wasm/openscad-official/
    // Download from: https://files.openscad.org/playground/
    const wasmBasePath = `${self.location.origin}/wasm/openscad-official`;
    const OpenSCADModule = await import(/* @vite-ignore */ `${wasmBasePath}/openscad.js`);
    const OpenSCAD = OpenSCADModule.default;
    openscad = await OpenSCAD({
      noInitialRun: true,
      noExitRuntime: true,
      locateFile: (path) => {
        if (path.endsWith('.wasm') || path.endsWith('.data')) {
          return `${wasmBasePath}/${path}`;
        }
        return path;
      },
    });
    return openscad;
  } catch (err) {
    throw new Error(`Failed to initialize OpenSCAD: ${err.message}`);
  }
}

// Handle messages from main thread
self.addEventListener('message', async (e) => {
  const { type, source } = e.data;

  if (type === 'render') {
    try {
      // Initialize OpenSCAD if not already done
      await initOpenSCAD();

      // Write source to virtual filesystem
      openscad.FS.writeFile('/input.scad', source);

      // Render to STL
      const result = openscad.render('/input.scad', {
        format: 'stl',
        timeout: 60000,
      });

      if (result.error) {
        self.postMessage({
          type: 'render-error',
          error: result.error,
        });
        return;
      }

      // Read STL file
      const stlData = openscad.FS.readFile('/output.stl', { encoding: 'binary' });

      self.postMessage({
        type: 'render-complete',
        stl: stlData,
      });
    } catch (err) {
      self.postMessage({
        type: 'render-error',
        error: err.message,
      });
    }
  }
});
