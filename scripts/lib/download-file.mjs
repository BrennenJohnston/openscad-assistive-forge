/**
 * Download a file to a path, following redirects, opening the file only
 * when the final response is a 200.
 *
 * D-169 (2026-09-19): the downloader in scripts/download-wasm.js opened the
 * write stream BEFORE the response arrived and, on a redirect, deleted the
 * destination without waiting and recursed at once. The recursion opened
 * the same path again, and the two operations raced on the file system
 * thread pool. When the delete landed second (Linux, the CI runners) the
 * redirected download wrote into a deleted file, 'finish' fired, the script
 * printed "Downloaded font archive", and the checksum read found nothing:
 * #263's Build Check, red on a docs-only change. The release URL for the
 * fonts always redirects, so every Linux build ran that race. Windows never
 * showed it: deleting an open file fails there, and the error was swallowed.
 *
 * Here nothing touches the destination until a 200 arrives, and a redirect
 * or an error status drains its body and moves on.
 *
 * @license GPL-3.0-or-later
 */

import http from 'node:http';
import https from 'node:https';
import { createWriteStream as fsCreateWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';

const MAX_REDIRECTS = 10;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/**
 * @param {string} url - http(s) URL to fetch
 * @param {string} dest - Destination file path
 * @param {object} [options]
 * @param {typeof fsCreateWriteStream} [options.createWriteStream] - The
 *   stream opener, injectable so a test can count the files opened
 * @param {number} [options.redirectsLeft]
 * @returns {Promise<void>}
 */
export function downloadFile(url, dest, options = {}) {
  const {
    createWriteStream = fsCreateWriteStream,
    redirectsLeft = MAX_REDIRECTS,
  } = options;
  const client = url.startsWith('http:') ? http : https;

  return new Promise((resolve, reject) => {
    const request = client.get(url, (response) => {
      const { statusCode, headers } = response;

      if (REDIRECTS.has(statusCode)) {
        response.resume();
        if (!headers.location) {
          reject(new Error(`Redirect without a location from ${url}`));
          return;
        }
        if (redirectsLeft <= 0) {
          reject(new Error(`Too many redirects from ${url}`));
          return;
        }
        const next = new URL(headers.location, url).href;
        downloadFile(next, dest, {
          ...options,
          redirectsLeft: redirectsLeft - 1,
        }).then(resolve, reject);
        return;
      }

      if (statusCode !== 200) {
        response.resume();
        reject(new Error(`Failed to download: HTTP ${statusCode}`));
        return;
      }

      const file = createWriteStream(dest);
      const fail = (err) => {
        file.destroy();
        unlink(dest).catch(() => {});
        reject(err);
      };
      file.on('error', fail);
      response.on('error', fail);
      response.pipe(file);
      file.on('finish', () => {
        file.close((err) => (err ? fail(err) : resolve()));
      });
    });

    request.on('error', (err) => {
      unlink(dest).catch(() => {});
      reject(err);
    });
  });
}
