// Renders one model with the engine in ../engine/ and posts the result.
// A new worker, and so a new engine, for every render: OpenSCAD's main()
// is not meant to run twice in one process, and Forge starts the engine
// again between renders for the same reason.
//
// SPDX-License-Identifier: GPL-3.0-or-later

import OpenSCAD from '../engine/openscad.js';

self.onmessage = async ({ data: { source } }) => {
  const output = [];
  const started = performance.now();
  try {
    const engine = await OpenSCAD({
      noInitialRun: true,
      noExitRuntime: true,
      locateFile: (file) => new URL(`../engine/${file}`, import.meta.url).href,
      print: (line) => output.push(line),
      printErr: (line) => output.push(line),
    });
    const loaded = performance.now();
    engine.FS.writeFile('/model.scad', source);
    const status = await engine.callMain([
      '/model.scad',
      '--backend=Manifold',
      '--export-format=binstl',
      '-o',
      '/model.stl',
    ]);
    const done = performance.now();
    if (status !== 0) {
      self.postMessage({ ok: false, status, output, loadMs: loaded - started });
      return;
    }
    const stl = engine.FS.readFile('/model.stl');
    // A binary STL: an 80-byte header, then the triangle count.
    const triangles = new DataView(stl.buffer, stl.byteOffset, stl.byteLength).getUint32(80, true);
    self.postMessage({
      ok: true,
      triangles,
      loadMs: loaded - started,
      renderMs: done - loaded,
      output,
    });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error), output });
  }
};
