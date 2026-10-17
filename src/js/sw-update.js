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
