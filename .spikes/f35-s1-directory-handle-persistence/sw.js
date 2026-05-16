// Minimal service worker for the F35 S1 spike.
//
// The version constant exists solely so the SW-update flow can be
// exercised: the page registers `./sw.js?cacheBust=<timestamp>` to
// force the browser to refetch this script. The new bytes (different
// query string in the registration URL but identical script body)
// are enough to trigger an "update" lifecycle in some browsers; for
// browsers that diff the script body itself, bump SW_VERSION below
// before reloading instead.

const SW_VERSION = 1;

self.addEventListener('install', (event) => {
  // Activate the new worker as soon as it finishes installing so the
  // spike doesn't have to wait for all clients to close before the
  // update applies — that better matches what we'd want in the real
  // Forge SW too (see Phase A discussion in the plan).
  self.skipWaiting();
  // eslint-disable-next-line no-console
  console.log(`[spike-sw] install (v${SW_VERSION})`);
  // No precache: the page itself is intentionally cache-busting.
  event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
  // eslint-disable-next-line no-console
  console.log(`[spike-sw] activate (v${SW_VERSION})`);
  event.waitUntil(self.clients.claim());
});

// Pure pass-through fetch handler. The spike does not rely on caching
// — its job is to test whether registering / updating a SW invalidates
// the persisted directory handle. Having a fetch listener is what
// makes the page "controlled" by the SW, which is the precondition
// being tested.
self.addEventListener('fetch', (event) => {
  // Let the network handle every request; presence of the listener
  // alone is what makes this a "real" SW from the browser's POV.
  event.respondWith(fetch(event.request));
});
