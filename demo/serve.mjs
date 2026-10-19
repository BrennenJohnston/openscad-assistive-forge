// Serves this branch's files for the demo, with the two headers that make a
// page cross-origin isolated, as the Forge app is. The engine does not need
// them: any static server works. Node only, no packages.
//
//   node demo/serve.mjs [port]      then open http://localhost:8080/demo/
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] ?? 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

createServer(async (request, response) => {
  const headers = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  };
  let file = path.join(ROOT, decodeURIComponent(new URL(request.url, 'http://x').pathname));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    response.writeHead(403, headers).end('Forbidden');
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    response
      .writeHead(200, { ...headers, 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
      .end(body);
  } catch (error) {
    if (error.code === 'ENOENT') {
      response.writeHead(404, headers).end('Not found');
      return;
    }
    console.error(error);
    response.writeHead(500, headers).end('Server error');
  }
}).listen(PORT, () => {
  console.log(`Serving ${ROOT} on http://localhost:${PORT}/demo/`);
});
