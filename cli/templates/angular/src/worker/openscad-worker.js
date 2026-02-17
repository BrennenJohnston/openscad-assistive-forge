/**
 * OpenSCAD WASM Worker
 * @license GPL-3.0-or-later
 */

let instance = null;

async function initOpenSCAD() {
  if (instance) return instance;

  try {
    // Use vendored official OpenSCAD WASM build (with Manifold support)
    // Place openscad.js and openscad.wasm in public/wasm/openscad-official/
    // Download from: https://files.openscad.org/playground/
    const wasmBasePath = `${self.location.origin}/wasm/openscad-official`;
    const OpenSCADModule = await import(/* @vite-ignore */ `${wasmBasePath}/openscad.js`);
    const OpenSCAD = OpenSCADModule.default;
    instance = await OpenSCAD({
      noInitialRun: true,
      noExitRuntime: true,
      print: (text) => console.log('[OpenSCAD]', text),
      printErr: (text) => console.error('[OpenSCAD]', text),
      locateFile: (path) => {
        if (path.endsWith('.wasm') || path.endsWith('.data')) {
          return `${wasmBasePath}/${path}`;
        }
        return path;
      },
    });
    return instance;
  } catch (err) {
    throw new Error(`Failed to initialize OpenSCAD: ${err.message}`);
  }
}

async function render(scadContent, format = 'stl') {
  const openscad = await initOpenSCAD();
  
  // Write source file
  openscad.FS.writeFile('/input.scad', scadContent);
  
  // Determine output file extension
  const outputFile = `/output.${format}`;
  
  // Run OpenSCAD
  const args = ['/input.scad', '-o', outputFile];
  
  self.postMessage({ type: 'progress', progress: 10 });
  
  try {
    openscad.callMain(args);
    
    self.postMessage({ type: 'progress', progress: 80 });
    
    // Read output
    const output = openscad.FS.readFile(outputFile);
    
    self.postMessage({ type: 'progress', progress: 100 });
    
    // Clean up
    openscad.FS.unlink('/input.scad');
    openscad.FS.unlink(outputFile);
    
    return output.buffer;
  } catch (error) {
    throw new Error(`OpenSCAD render failed: ${error.message}`);
  }
}

self.onmessage = async function(event) {
  const { type, scadContent, format } = event.data;
  
  if (type === 'render') {
    try {
      const result = await render(scadContent, format);
      self.postMessage({ type: 'complete', data: result }, [result]);
    } catch (error) {
      self.postMessage({ type: 'error', error: error.message });
    }
  }
};
