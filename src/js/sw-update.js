/**
 * The update banner's Refresh. The service worker takes over as soon as a
 * new version installs, so by the time someone presses Refresh the new
 * version is usually already in charge and only a reload is left to do.
 * When a worker is still waiting, it is asked to take over first, and the
 * page reloads once it has, or after two seconds if it never says so.
 * @license GPL-3.0-or-later
 */

/** How long to wait for a waiting worker to take over before reloading. */
export const UPDATE_FALLBACK_MS = 2000;

/**
 * @param {Object} options
 * @param {ServiceWorker|null} options.worker - the new version's worker,
 *   as the banner was shown for it
 * @param {ServiceWorkerContainer} [options.serviceWorker]
 * @param {() => void} [options.reload]
 * @param {HTMLButtonElement|null} [options.button] - Refresh, shown busy
 * @param {number} [options.fallbackMs]
 */
export function requestSwUpdate({
  worker,
  serviceWorker = navigator.serviceWorker,
  reload = () => window.location.reload(),
  button = null,
  fallbackMs = UPDATE_FALLBACK_MS,
}) {
  if (button) {
    button.setAttribute('aria-busy', 'true');
    button.disabled = true;
    button.textContent = 'Refreshing…';
  }

  let reloaded = false;
  const reloadOnce = () => {
    if (reloaded) return;
    reloaded = true;
    reload();
  };

  const inCharge =
    !worker ||
    worker.state === 'activated' ||
    serviceWorker?.controller === worker;
  if (inCharge) {
    reloadOnce();
    return;
  }

  serviceWorker?.addEventListener('controllerchange', reloadOnce, {
    once: true,
  });
  setTimeout(reloadOnce, fallbackMs);
  worker.postMessage({ type: 'SKIP_WAITING' });
}

/**
 * What the page does when a worker says it is now in charge: nothing when
 * the page is of the same build, a reload on the Main Page (nothing is
 * open there to lose), the update banner anywhere else, so the person
 * chooses the moment. An older page whose files the host has moved on
 * from would otherwise stay open with no way to load its next file.
 * @param {Object} options
 * @param {string} options.pageStamp - the build this page was made from
 * @param {string} options.workerVersion - the build the worker in charge was made from
 * @param {string|null} options.surface - the page's surface, 'welcome' on the Main Page
 * @returns {'none'|'reload'|'banner'}
 */
export function staleShellAction({ pageStamp, workerVersion, surface }) {
  if (!pageStamp || !workerVersion || pageStamp === workerVersion)
    return 'none';
  return surface === 'welcome' ? 'reload' : 'banner';
}
