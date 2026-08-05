/**
 * Classic window-bottom status bar (C8).
 *
 * Mirrors the in-viewport status overlay (#previewStatusText,
 * #previewStatusStats, #memoryText) into #classicStatusBar while Classic
 * mode is active. Read-only MutationObservers copy textContent — the bar
 * never writes back to its sources, so there is no loop risk. Classic
 * hides the overlay (display:none removes it from the accessibility
 * tree), leaving this bar as the single live status region.
 *
 * @license GPL-3.0-or-later
 */

import { getUIModeController } from './ui-mode-controller.js';

const SOURCES = [
  { sourceId: 'previewStatusText', mirrorId: 'classicStatusText' },
  { sourceId: 'previewStatusStats', mirrorId: 'classicStatusStats' },
  { sourceId: 'memoryText', mirrorId: 'classicStatusMemory' },
];

let observers = [];
let active = false;

function mirrorOnce() {
  for (const { sourceId, mirrorId } of SOURCES) {
    const source = document.getElementById(sourceId);
    const mirror = document.getElementById(mirrorId);
    if (source && mirror) {
      mirror.textContent = source.textContent;
    }
  }
}

function start() {
  if (active) return;
  active = true;
  mirrorOnce();
  for (const { sourceId, mirrorId } of SOURCES) {
    const source = document.getElementById(sourceId);
    const mirror = document.getElementById(mirrorId);
    if (!source || !mirror) continue;
    const observer = new MutationObserver(() => {
      mirror.textContent = source.textContent;
    });
    observer.observe(source, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    observers.push(observer);
  }
}

function stop() {
  if (!active) return;
  active = false;
  for (const observer of observers) observer.disconnect();
  observers = [];
}

/**
 * Wire the status bar to UI-mode changes. Call once during app init.
 */
export function initClassicStatusBar() {
  const ui = getUIModeController();
  ui.subscribe((newMode) => {
    if (newMode === 'classic') {
      start();
    } else {
      stop();
    }
  });
  if (ui.getMode() === 'classic') {
    start();
  }
}
