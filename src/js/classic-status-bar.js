/**
 * Classic chrome text mirrors: the window-bottom status bar (C8) and the
 * desktop window caption.
 *
 * Mirrors the in-viewport status overlay (#previewStatusText,
 * #previewStatusStats, #memoryText) into #classicStatusBar, and the loaded
 * file name (#fileInfoSummary) into the title bar's #classicWindowTitle,
 * while Classic mode is active. Read-only MutationObservers copy
 * textContent — the mirrors never write back to their sources, so there is
 * no loop risk. Classic hides the overlay (display:none removes it from the
 * accessibility tree), leaving the bar as the single live status region.
 *
 * @license GPL-3.0-or-later
 */

import { getUIModeController } from './ui-mode-controller.js';

const SOURCES = [
  { sourceId: 'previewStatusText', mirrorId: 'classicStatusText' },
  { sourceId: 'previewStatusStats', mirrorId: 'classicStatusStats' },
  { sourceId: 'memoryText', mirrorId: 'classicStatusMemory' },
  {
    // Desktop caption format: "keyguard_v75.scad — OpenSCAD"
    sourceId: 'fileInfoSummary',
    mirrorId: 'classicWindowTitle',
    format: (text) => (text.trim() ? `${text.trim()} — ` : ''),
  },
];

let observers = [];
let active = false;

function mirrorOnce() {
  for (const { sourceId, mirrorId, format } of SOURCES) {
    const source = document.getElementById(sourceId);
    const mirror = document.getElementById(mirrorId);
    if (source && mirror) {
      const text = source.textContent || '';
      mirror.textContent = format ? format(text) : text;
    }
  }
}

function start() {
  if (active) return;
  active = true;
  mirrorOnce();
  for (const { sourceId, mirrorId, format } of SOURCES) {
    const source = document.getElementById(sourceId);
    const mirror = document.getElementById(mirrorId);
    if (!source || !mirror) continue;
    const observer = new MutationObserver(() => {
      const text = source.textContent || '';
      mirror.textContent = format ? format(text) : text;
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

  // The caption lives inside the <h1>, so leaving Classic must clear it
  // rather than leave a stale file name in the page heading.
  const caption = document.getElementById('classicWindowTitle');
  if (caption) caption.textContent = '';
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
