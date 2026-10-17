/**
 * The update banner's Refresh: it reloads the page whether the new version's
 * worker is already in charge or still waiting, and says it is working.
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestSwUpdate } from '../../src/js/sw-update.js';

/** A stand-in for navigator.serviceWorker: a controller and its events. */
function fakeContainer(controller = null) {
  const target = new EventTarget();
  target.controller = controller;
  return target;
}

function fakeWorker(state) {
  return { state, postMessage: vi.fn() };
}

describe('Refresh on the update banner', () => {
  let button;
  let reload;

  beforeEach(() => {
    document.body.innerHTML =
      '<button id="updateBannerRefresh" type="button">Refresh</button>';
    button = document.getElementById('updateBannerRefresh');
    reload = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('reloads at once when the new version is already in charge', () => {
    const worker = fakeWorker('activated');
    requestSwUpdate({
      worker,
      serviceWorker: fakeContainer(worker),
      reload,
      button,
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('reloads at once when there is no waiting worker to ask', () => {
    requestSwUpdate({
      worker: null,
      serviceWorker: fakeContainer(fakeWorker('activated')),
      reload,
      button,
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('asks a waiting worker to take over, then reloads when it has', () => {
    const worker = fakeWorker('installed');
    const container = fakeContainer(fakeWorker('activated'));
    requestSwUpdate({ worker, serviceWorker: container, reload, button });
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads after two seconds if the worker never says it took over, and only once', () => {
    vi.useFakeTimers();
    const worker = fakeWorker('installed');
    const container = fakeContainer(fakeWorker('activated'));
    requestSwUpdate({ worker, serviceWorker: container, reload, button });
    vi.advanceTimersByTime(1999);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows that it is working: busy, not pressable again, and says so', () => {
    requestSwUpdate({
      worker: fakeWorker('installed'),
      serviceWorker: fakeContainer(fakeWorker('activated')),
      reload,
      button,
    });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Refreshing…');
  });
});
