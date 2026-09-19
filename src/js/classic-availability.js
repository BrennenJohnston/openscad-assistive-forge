/**
 * Classic availability — the viewport half of "can Classic be entered?"
 * (U-10: Classic is desktop-only for now.)
 *
 * One predicate, evaluated live: a viewport is desktop-shaped when it is at
 * least CLASSIC_MIN_WIDTH_PX wide AND not portrait (height <= width). The
 * width floor is the same 1024 where Classic's own stacked layout begins
 * (UF-2), so the gate and the layout agree on where "desktop" starts.
 *
 * Deliberately no user-agent sniffing: the gate is about the shape the
 * Classic layout needs, not the device name. A desktop window narrowed to
 * a phone shape is gated; a wide tablet in landscape is not. The recorded
 * trade (Q-25): a portrait desktop monitor counts as mobile-shaped.
 *
 * The classic_mode feature flag stays a separate concern —
 * UIModeController.isClassicAvailable() composes flag AND shape.
 *
 * @license GPL-3.0-or-later
 */

export const CLASSIC_MIN_WIDTH_PX = 1024;

const RESIZE_DEBOUNCE_MS = 150;

const subscribers = new Set();
let debounceTimer = null;
let listenersWired = false;
let lastNotified = null;

/**
 * @returns {boolean} True when the viewport can hold the Classic layout:
 *   at least CLASSIC_MIN_WIDTH_PX wide and not portrait.
 */
export function isViewportDesktopShaped() {
  return (
    window.innerWidth >= CLASSIC_MIN_WIDTH_PX &&
    window.innerHeight <= window.innerWidth
  );
}

function evaluateAndNotify() {
  const desktopShaped = isViewportDesktopShaped();
  if (desktopShaped === lastNotified) return;
  lastNotified = desktopShaped;
  subscribers.forEach((callback) => {
    try {
      callback(desktopShaped);
    } catch (error) {
      console.error('[ClassicAvailability] Subscriber error:', error);
    }
  });
}

function onViewportEvent() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(evaluateAndNotify, RESIZE_DEBOUNCE_MS);
}

function wireListeners() {
  if (listenersWired) return;
  listenersWired = true;
  lastNotified = isViewportDesktopShaped();
  window.addEventListener('resize', onViewportEvent);
  window.addEventListener('orientationchange', onViewportEvent);
}

/**
 * Subscribe to changes of the desktop-shaped predicate. The callback fires
 * only when the debounced re-evaluation CHANGES value, not on every resize;
 * read isViewportDesktopShaped() for the state at subscribe time.
 * @param {(desktopShaped: boolean) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function subscribeViewportShape(callback) {
  wireListeners();
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}
