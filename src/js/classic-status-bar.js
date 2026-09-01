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
/** @type {((event: CustomEvent) => void)|null} */
let onCameraChange = null;

/**
 * Two decimals, like the desktop's status line — not the three the
 * Viewport-Control panel's own fields use. A status bar is read at a glance.
 * @param {number} value
 * @returns {string}
 */
function statusNumber(value) {
  if (!Number.isFinite(value)) return '—';
  // A rotation a hair below zero rounds to the string "-0.00", which reads as a
  // defect rather than as zero. Normalise the sign, not the value.
  const rounded = Number(value.toFixed(2));
  return (rounded === 0 ? 0 : rounded).toFixed(2);
}

/**
 * The desktop's status line, verbatim in shape (OpenSCAD_1):
 *
 *   Viewport: translate = [ 26.02 18.31 10.03 ], rotate = [ 57.80 0.00 48.80 ],
 *   distance = 550.78, fov = 22.50 (1156x779)
 *
 * fov is dropped for an orthographic camera, which has none — showing a number
 * that means nothing there would be worse than showing nothing.
 * @param {Object} detail - the `viewport-camera-change` detail
 * @returns {string}
 */
export function formatViewportStatus({ pose, width, height }) {
  if (!pose) return '';
  const vec = (v) =>
    `[ ${statusNumber(v.x)} ${statusNumber(v.y)} ${statusNumber(v.z)} ]`;
  const parts = [
    `translate = ${vec(pose.translation)}`,
    `rotate = ${vec(pose.rotation)}`,
    `distance = ${statusNumber(pose.distance)}`,
  ];
  if (!pose.orthographic && Number.isFinite(pose.fov)) {
    parts.push(`fov = ${statusNumber(pose.fov)}`);
  }
  const size = width && height ? ` (${width}x${height})` : '';
  return `Viewport: ${parts.join(', ')}${size}`;
}

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

  // Viewport telemetry (P8). The Viewport-Control panel owns the throttle in
  // front of the camera's change feed and emits the pose it has already read,
  // so there is exactly one subscription to a feed that fires ~118 times per
  // drag. The target span sits OUTSIDE the bar's live region.
  onCameraChange = (event) => {
    const span = document.getElementById('classicStatusViewport');
    if (span) span.textContent = formatViewportStatus(event.detail);
  };
  document.addEventListener('viewport-camera-change', onCameraChange);
}

function stop() {
  if (!active) return;
  active = false;
  for (const observer of observers) observer.disconnect();
  observers = [];

  if (onCameraChange) {
    document.removeEventListener('viewport-camera-change', onCameraChange);
    onCameraChange = null;
  }
  const viewport = document.getElementById('classicStatusViewport');
  if (viewport) viewport.textContent = '';

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
