/**
 * The charm preview's geometry work, off the main thread (DP-52 P4, D-143):
 * for a big OFF, the parse, the centering, the flat normals, the cavity-tint
 * classification and the edge segments in one job; for a mesh the page
 * already holds (an STL), the classification and the edges alone.
 *
 * MEASURED before this: all of it ran on the main thread in one task after
 * a render arrived - 1.3 s at 1x and 6.4 s at 4x CPU for the logo's Line art
 * design (211,700 triangles) - and the page answered nothing for that long.
 * Here it costs the page one copy of the text or of its arrays, and the
 * typed arrays come back transferred, not copied.
 *
 * Every message carries its id; a reply for a mesh that has since been
 * replaced is dropped by the page, not by this worker.
 *
 * @license GPL-3.0-or-later
 */

import { computeMeshExtras, prepareOFF } from './mesh-extras.js';

const transfersOf = (arrays) =>
  arrays.filter((a) => a && a.buffer).map((a) => a.buffer);

self.onmessage = (event) => {
  const message = event.data || {};
  const { id } = message;
  try {
    if (message.type === 'off') {
      const result = prepareOFF(message.text, {
        wantEdges: message.wantEdges !== false,
        thresholdDeg: message.thresholdDeg,
        edgeBudget: message.edgeBudget,
      });
      self.postMessage(
        { id, type: 'off-done', ...result },
        transfersOf([
          result.positions,
          result.normals,
          result.colors,
          result.isInner,
          result.edges,
        ])
      );
      return;
    }
    const { positions, normals } = message;
    const result = computeMeshExtras({
      positions: new Float32Array(positions),
      normals: normals ? new Float32Array(normals) : null,
      wantInner: message.wantInner !== false,
      wantEdges: message.wantEdges !== false,
      thresholdDeg: message.thresholdDeg,
      edgeBudget: message.edgeBudget,
    });
    self.postMessage(
      {
        id,
        type: 'done',
        isInner: result.isInner,
        edges: result.edges,
        edgeTotal: result.edgeTotal,
        edgeShown: result.edgeShown,
      },
      transfersOf([result.isInner, result.edges])
    );
  } catch (error) {
    self.postMessage({
      id,
      type: message.type === 'off' ? 'off-error' : 'error',
      message: error && error.message ? error.message : String(error),
    });
  }
};
