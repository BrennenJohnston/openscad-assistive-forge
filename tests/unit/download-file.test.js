/**
 * D-169: the build's downloader never opens the file it is about to delete.
 *
 * The old downloader opened the write stream before the response and, on a
 * redirect, deleted the destination without waiting and recursed at once, so
 * the recursion's own stream raced that delete. On the Linux runners the
 * delete could land second, the redirected download wrote into a deleted
 * file, and the script said "Downloaded font archive" over a file that was
 * not there (#263's Build Check, 2026-09-18). The fonts' release URL always
 * redirects.
 *
 * The guard counts the files opened through a redirect: one, for the final
 * 200, and none for the hops. Counting is deterministic where the race was
 * not; the old code opened one per hop.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import {
  createWriteStream,
  existsSync,
  readFileSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadFile } from '../../scripts/lib/download-file.mjs';

let server;
let base;
let dir;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/hop2') {
      res.writeHead(301, { Location: '/hop' });
      res.end();
      return;
    }
    if (req.url === '/hop') {
      res.writeHead(302, { Location: '/file' });
      res.end();
      return;
    }
    if (req.url === '/file') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end('fonts');
      return;
    }
    res.writeHead(404);
    res.end('nope');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  dir = mkdtempSync(join(tmpdir(), 'download-file-'));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

describe('D-169: a redirect never opens the file it is about to delete', () => {
  it('follows two redirects and opens the file once, for the final 200', async () => {
    const dest = join(dir, 'a.bin');
    let opened = 0;
    await downloadFile(`${base}/hop2`, dest, {
      createWriteStream: (path) => {
        opened += 1;
        return createWriteStream(path);
      },
    });
    expect(readFileSync(dest, 'utf8')).toBe('fonts');
    expect(opened).toBe(1);
  });

  it('a 404 rejects with the status and leaves no file behind', async () => {
    const dest = join(dir, 'b.bin');
    await expect(downloadFile(`${base}/missing`, dest)).rejects.toThrow(
      'HTTP 404'
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(existsSync(dest)).toBe(false);
  });
});
