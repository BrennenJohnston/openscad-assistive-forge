/**
 * Reference Image Measurement Tool
 *
 * Allows users to upload any image, view pixel coordinates via mouse or
 * keyboard-driven crosshair, and copy X / Y values for parameter entry.
 *
 * Accessibility:
 *   - Full keyboard navigation (arrow keys, Shift+arrow for 10 px steps)
 *   - Screen reader: two <output> elements + aria-live region for coords
 *   - Forced-colors crosshair fallback via canvas drawing
 *   - 44 px touch targets, design-token spacing
 *
 * @license GPL-3.0-or-later
 */

import { announce, POLITENESS } from './announcer.js';
import { createDocumentFocusTrap } from './focus-trap.js';
import { getUnit, getScaleFactor, onUnitChange, onScaleChange } from './unit-sync.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let canvas = null;
let ctx = null;
let img = null; // loaded HTMLImageElement
let imgNaturalW = 0;
let imgNaturalH = 0;

// Current crosshair position in *image* pixel space
let crossX = 0;
let crossY = 0;

// Zoom / pan
let zoom = 1;
let panX = 0;
let panY = 0;
let isPanning = false;

// DOM refs (set in init)
let coordXOutput = null;
let coordYOutput = null;
let dimDisplay = null;
let zoomDisplay = null;
let copyXBtn = null;
let copyYBtn = null;
let fileInput = null;
let liveRegion = null;

// Debounce for screen-reader announcements
let announceTimeout = null;
const ANNOUNCE_DEBOUNCE_MS = 200;

// Pin state: click canvas to lock crosshair, double-click or Escape to unpin
let pinned = false;
let ghostX = 0;
let ghostY = 0;

// DOM refs for pin UI (set in init)
let unpinBtn = null;
let pinIndicator = null;

// Mode system: point (default) | ruler | calibrate
let measureMode = 'point';
let rulerA = null;
let rulerB = null;
let activePoint = 'b';
let calibA = null;
let calibB = null;

// DOM refs for ruler/calibrate/scale UI (set in init)
let distOutput = null;
let calibPixelsSpan = null;
let helpText = null;

// Fullscreen state
let isFullscreen = false;
let fullscreenTrap = null;
let previousFocusEl = null;

// Forced-colors media query for Canvas 2D adaptation
const forcedColorsMql = window.matchMedia('(forced-colors: active)');

// Callbacks
let onCoordinateCopied = null; // (axis: 'x'|'y', value: number) => void

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the image measurement tool.
 * @param {Object} opts
 * @param {Function} [opts.onCoordinateCopied] - Called when user copies a coordinate
 */
export function initImageMeasurement(opts = {}) {
  canvas = document.getElementById('measureCanvas');
  ctx = canvas?.getContext('2d');
  coordXOutput = document.getElementById('measureCoordX');
  coordYOutput = document.getElementById('measureCoordY');
  dimDisplay = document.getElementById('measureDimensions');
  zoomDisplay = document.getElementById('measureZoomLevel');
  copyXBtn = document.getElementById('measureCopyX');
  copyYBtn = document.getElementById('measureCopyY');
  fileInput = document.getElementById('measureFileInput');
  liveRegion = document.getElementById('measureLiveRegion');
  unpinBtn = document.getElementById('measureUnpinBtn');
  pinIndicator = document.getElementById('measurePinIndicator');
  distOutput = document.getElementById('measureDistValue');
  calibPixelsSpan = document.getElementById('measureCalibPixels');
  helpText = document.querySelector('.measure-help-text');

  if (opts.onCoordinateCopied) {
    onCoordinateCopied = opts.onCoordinateCopied;
  }

  if (!canvas || !ctx) return;

  // Event listeners
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseleave', handleMouseLeave);
  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('dblclick', handleCanvasDblClick);
  canvas.addEventListener('keydown', handleKeyDown);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  canvas.addEventListener('mousedown', handlePanStart);
  canvas.addEventListener('mouseup', handlePanEnd);

  if (copyXBtn) copyXBtn.addEventListener('click', () => copyCoord('x'));
  if (copyYBtn) copyYBtn.addEventListener('click', () => copyCoord('y'));
  if (unpinBtn) unpinBtn.addEventListener('click', unpinCrosshair);

  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }

  // Drag & drop on canvas
  canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    canvas.classList.add('drag-over');
  });
  canvas.addEventListener('dragleave', () => {
    canvas.classList.remove('drag-over');
  });
  canvas.addEventListener('drop', handleDrop);

  // Zoom buttons
  const zoomInBtn = document.getElementById('measureZoomIn');
  const zoomOutBtn = document.getElementById('measureZoomOut');
  const zoomResetBtn = document.getElementById('measureZoomReset');
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => changeZoom(0.25));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => changeZoom(-0.25));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetZoom);

  // Editable zoom input
  if (zoomDisplay) {
    zoomDisplay.addEventListener('change', () => {
      const pct = parseInt(zoomDisplay.value, 10);
      if (Number.isFinite(pct) && pct >= 10 && pct <= 1000) {
        zoom = pct / 100;
        updateZoomDisplay();
        redraw();
      } else {
        updateZoomDisplay();
      }
    });
    zoomDisplay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        zoomDisplay.blur();
      }
    });
  }

  // Initialise canvas with placeholder
  resizeCanvas();
  drawPlaceholder();

  // Watch for container resize
  const observer = new ResizeObserver(() => {
    resizeCanvas();
    redraw();
  });
  const container = canvas.parentElement;
  if (container) observer.observe(container);

  // Subscribe to unit/scale changes for mm display
  onUnitChange(() => { updateCoordOutputs(); updateDistanceOutput(); });
  onScaleChange(() => { updateCoordOutputs(); updateDistanceOutput(); });
}

/**
 * Load an image programmatically (e.g. from overlay upload).
 * @param {File|Blob} file
 */
export function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  loadImageFromURL(url, file.name, true);
}

/**
 * Load an image from a data URL (e.g. from shared image store).
 * @param {string} dataUrl
 * @param {string} [name]
 */
export function loadImageFromDataURL(dataUrl, name) {
  if (!dataUrl) return;
  loadImageFromURL(dataUrl, name || 'image', false);
}

/**
 * Get the current crosshair coordinates.
 * @returns {{ x: number, y: number } | null}
 */
export function getCurrentCoordinates() {
  if (!img) return null;
  return { x: crossX, y: crossY };
}

/** Get current image dimensions. */
export function getImageDimensions() {
  if (!img) return null;
  return { width: imgNaturalW, height: imgNaturalH };
}

/**
 * Set the measurement mode.
 * @param {'point'|'ruler'|'calibrate'} mode
 */
export function setMeasureMode(mode) {
  if (!['point', 'ruler', 'calibrate'].includes(mode) || mode === measureMode) return;
  if (measureMode === 'point' && pinned) unpinCrosshair();
  rulerA = null;
  rulerB = null;
  calibA = null;
  calibB = null;
  activePoint = 'b';
  measureMode = mode;
  updateHelpText();
  updateDistanceOutput();
  const modeLabel = mode === 'point' ? 'Point' : mode === 'ruler' ? 'Ruler' : 'Calibrate';
  announce(`${modeLabel} mode`, POLITENESS.POLITE);
  redraw();
}

/** Clear ruler points and reset to pre-placement state. */
export function clearRulerPoints() {
  rulerA = null;
  rulerB = null;
  activePoint = 'b';
  updateDistanceOutput();
  updateHelpText();
  if (liveRegion) liveRegion.textContent = '';
  redraw();
}

/** Get the current ruler distance in pixels. */
export function getRulerDistancePx() {
  if (!rulerA || !rulerB) return null;
  const dx = rulerB.x - rulerA.x;
  const dy = rulerB.y - rulerA.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Get the current calibration pixel distance. */
export function getCalibDistancePx() {
  if (!calibA || !calibB) return null;
  const dx = calibB.x - calibA.x;
  const dy = calibB.y - calibA.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Get the current measurement mode. */
export function getMeasureMode() {
  return measureMode;
}

// ---------------------------------------------------------------------------
// Image Loading
// ---------------------------------------------------------------------------

function handleFileSelect(e) {
  const file = e.target.files?.[0];
  if (file) loadImageFile(file);
}

function handleDrop(e) {
  e.preventDefault();
  canvas.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith('image/')) {
    loadImageFile(file);
  }
}

function loadImageFromURL(url, name, revokeOnLoad) {
  const newImg = new Image();
  newImg.onload = () => {
    img = newImg;
    imgNaturalW = img.naturalWidth;
    imgNaturalH = img.naturalHeight;
    crossX = Math.floor(imgNaturalW / 2);
    crossY = Math.floor(imgNaturalH / 2);
    zoom = 1;
    panX = 0;
    panY = 0;
    pinned = false;
    updatePinUI(false);

    if (revokeOnLoad) URL.revokeObjectURL(url);

    // Update UI
    if (dimDisplay) {
      dimDisplay.textContent = `${imgNaturalW} × ${imgNaturalH} px`;
    }
    updateZoomDisplay();
    updateCoordOutputs();

    // Announce to screen readers
    announce(
      `Image loaded: ${imgNaturalW} by ${imgNaturalH} pixels. ${name || 'unnamed'}`,
      POLITENESS.POLITE
    );

    // Fit image in canvas
    fitImageToCanvas();
    redraw();

    // Enable canvas focus
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('role', 'application');
    canvas.setAttribute(
      'aria-label',
      `Image measurement canvas. ${imgNaturalW} by ${imgNaturalH} pixels. Use arrow keys to move crosshair.`
    );
  };
  newImg.onerror = () => {
    if (revokeOnLoad) URL.revokeObjectURL(url);
    announce('Failed to load image.', POLITENESS.ASSERTIVE);
  };
  newImg.src = url;
}

// ---------------------------------------------------------------------------
// Canvas Drawing
// ---------------------------------------------------------------------------

function resizeCanvas() {
  if (!canvas) return;
  const container = canvas.parentElement;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function fitImageToCanvas() {
  if (!img || !canvas) return;
  const cw = parseFloat(canvas.style.width);
  const ch = parseFloat(canvas.style.height);
  if (!cw || !ch) return;

  const scaleX = cw / imgNaturalW;
  const scaleY = ch / imgNaturalH;
  zoom = Math.min(scaleX, scaleY, 1); // don't upscale
  panX = 0;
  panY = 0;
  updateZoomDisplay();
}

function drawPlaceholder() {
  if (!ctx || !canvas) return;
  const cw = parseFloat(canvas.style.width);
  const ch = parseFloat(canvas.style.height);
  ctx.clearRect(0, 0, cw, ch);

  ctx.fillStyle = getComputedColor('--color-bg-secondary') || '#1a1a2e';
  ctx.fillRect(0, 0, cw, ch);

  ctx.fillStyle = getComputedColor('--color-text-tertiary') || '#888';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Drop an image here or click Browse', cw / 2, ch / 2);
}

function redraw() {
  if (!ctx || !canvas) return;
  const cw = parseFloat(canvas.style.width);
  const ch = parseFloat(canvas.style.height);
  ctx.clearRect(0, 0, cw, ch);

  if (!img) {
    drawPlaceholder();
    return;
  }

  // Draw image
  const drawW = imgNaturalW * zoom;
  const drawH = imgNaturalH * zoom;
  const ox = (cw - drawW) / 2 + panX;
  const oy = (ch - drawH) / 2 + panY;

  ctx.drawImage(img, ox, oy, drawW, drawH);

  if (measureMode === 'point') {
    const cx = ox + crossX * zoom;
    const cy = oy + crossY * zoom;
    if (pinned) {
      const gx = ox + ghostX * zoom;
      const gy = oy + ghostY * zoom;
      drawGhostCrosshair(gx, gy, cw, ch);
      drawPinnedCrosshair(cx, cy, cw, ch);
    } else {
      drawCrosshair(cx, cy, cw, ch);
    }
  } else if (measureMode === 'ruler') {
    drawModeOverlay(ox, oy, cw, ch, rulerA, rulerB, true);
  } else if (measureMode === 'calibrate') {
    drawModeOverlay(ox, oy, cw, ch, calibA, calibB, false);
  }
}

function drawCrosshair(cx, cy, cw, ch) {
  // Use theme-aware colour; forced-colors mode will use system colour
  const color =
    getComputedColor('--color-accent') || 'rgba(100, 180, 255, 0.9)';

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  // Horizontal line
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(cw, cy);
  ctx.stroke();

  // Vertical line
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, ch);
  ctx.stroke();

  ctx.setLineDash([]);

  // Centre dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPinnedCrosshair(cx, cy, cw, ch) {
  const color =
    getComputedColor('--color-accent') || 'rgba(100, 180, 255, 0.9)';

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(cw, cy);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, ch);
  ctx.stroke();

  // Filled centre dot (5px radius for pinned state)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawGhostCrosshair(gx, gy, cw, ch) {
  const color =
    getComputedColor('--color-text-tertiary') || 'rgba(150, 150, 150, 0.5)';

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 3]);

  ctx.beginPath();
  ctx.moveTo(0, gy);
  ctx.lineTo(cw, gy);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(gx, 0);
  ctx.lineTo(gx, ch);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.restore();
}

function drawModeOverlay(ox, oy, cw, ch, ptA, ptB, showDistPill) {
  const fc = forcedColorsMql.matches;
  const color = fc ? 'CanvasText' : (getComputedColor('--color-accent') || 'rgba(100, 180, 255, 0.9)');
  const ringColor = fc ? 'Highlight' : color;

  // Draw tracking crosshair while placing points
  if (!ptA || !ptB) {
    const cx = ox + crossX * zoom;
    const cy = oy + crossY * zoom;
    drawCrosshair(cx, cy, cw, ch);
  }

  if (ptA) {
    drawMarker(ox + ptA.x * zoom, oy + ptA.y * zoom, 'A', color, activePoint === 'a', ringColor);
  }
  if (ptB) {
    drawMarker(ox + ptB.x * zoom, oy + ptB.y * zoom, 'B', color, activePoint === 'b', ringColor);
  }

  if (ptA && ptB) {
    const ax = ox + ptA.x * zoom;
    const ay = oy + ptA.y * zoom;
    const bx = ox + ptB.x * zoom;
    const by = oy + ptB.y * zoom;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();

    if (showDistPill) {
      drawDistancePill((ax + bx) / 2, (ay + by) / 2);
    }
  }
}

function drawMarker(x, y, label, color, isActive, ringColor) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();

  if (isActive) {
    ctx.strokeStyle = ringColor || color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = color;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, x + 8, y - 4);
  ctx.restore();
}

function drawDistancePill(mx, my) {
  const distPx = getRulerDistancePx();
  if (distPx === null) return;

  const unit = getUnit();
  const sf = getScaleFactor();
  const text = (unit === 'mm' && sf > 0)
    ? `${(distPx / sf).toFixed(1)} mm`
    : `${distPx.toFixed(1)} px`;

  const fc = forcedColorsMql.matches;
  const pillBg = fc ? 'Canvas' : (getComputedColor('--color-bg-elevated') || 'rgba(0, 0, 0, 0.7)');
  const pillText = fc ? 'CanvasText' : (getComputedColor('--color-text-primary') || '#fff');

  ctx.save();
  ctx.font = '12px sans-serif';
  const metrics = ctx.measureText(text);
  const pw = metrics.width + 12;
  const ph = 20;
  const rx = mx - pw / 2;
  const ry = my - ph / 2;

  ctx.fillStyle = pillBg;
  ctx.beginPath();
  ctx.rect(rx, ry, pw, ph);
  ctx.fill();
  if (fc) {
    ctx.strokeStyle = 'CanvasText';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.fillStyle = pillText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, mx, my);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Coordinate Helpers
// ---------------------------------------------------------------------------

function canvasToImageCoords(clientX, clientY) {
  if (!canvas || !img) return null;
  const rect = canvas.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;

  const cw = parseFloat(canvas.style.width);
  const ch = parseFloat(canvas.style.height);
  const drawW = imgNaturalW * zoom;
  const drawH = imgNaturalH * zoom;
  const ox = (cw - drawW) / 2 + panX;
  const oy = (ch - drawH) / 2 + panY;

  const ix = Math.round((mx - ox) / zoom);
  const iy = Math.round((my - oy) / zoom);

  return {
    x: Math.max(0, Math.min(imgNaturalW - 1, ix)),
    y: Math.max(0, Math.min(imgNaturalH - 1, iy)),
  };
}

function updateCoordOutputs() {
  const unit = getUnit();
  const sf = getScaleFactor();
  if (unit === 'mm' && sf > 0) {
    if (coordXOutput) coordXOutput.textContent = (crossX / sf).toFixed(1);
    if (coordYOutput) coordYOutput.textContent = (crossY / sf).toFixed(1);
  } else if (unit === 'mm' && sf <= 0) {
    if (coordXOutput) { coordXOutput.textContent = '--'; coordXOutput.title = 'Calibrate or set scale factor to display mm values'; }
    if (coordYOutput) { coordYOutput.textContent = '--'; coordYOutput.title = 'Calibrate or set scale factor to display mm values'; }
  } else {
    if (coordXOutput) { coordXOutput.textContent = crossX; coordXOutput.title = ''; }
    if (coordYOutput) { coordYOutput.textContent = crossY; coordYOutput.title = ''; }
  }
}

function announceCoords() {
  clearTimeout(announceTimeout);
  announceTimeout = setTimeout(() => {
    if (!liveRegion) return;
    const unit = getUnit();
    const sf = getScaleFactor();
    let xVal, yVal, suffix;
    if (unit === 'mm' && sf > 0) {
      xVal = (crossX / sf).toFixed(1);
      yVal = (crossY / sf).toFixed(1);
      suffix = 'mm';
    } else {
      xVal = crossX;
      yVal = crossY;
      suffix = 'px';
    }
    liveRegion.textContent = `X: ${xVal} ${suffix}, Y: ${yVal} ${suffix}`;
  }, ANNOUNCE_DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// Mouse Handlers
// ---------------------------------------------------------------------------

function handleMouseMove(e) {
  if (isPanning) {
    panX += e.movementX;
    panY += e.movementY;
    redraw();
    return;
  }

  const coords = canvasToImageCoords(e.clientX, e.clientY);
  if (!coords) return;

  if (measureMode === 'point') {
    if (pinned) {
      ghostX = coords.x;
      ghostY = coords.y;
    } else {
      crossX = coords.x;
      crossY = coords.y;
      updateCoordOutputs();
    }
  } else {
    // Ruler and Calibrate: crosshair tracks for pre-placement guidance
    crossX = coords.x;
    crossY = coords.y;
    updateCoordOutputs();
  }
  redraw();
}

function handleMouseLeave() {
  // Keep last coordinate visible
}

function handleCanvasClick(e) {
  if (isPanning) return;
  const coords = canvasToImageCoords(e.clientX, e.clientY);
  if (!coords) return;

  if (measureMode === 'point') {
    crossX = coords.x;
    crossY = coords.y;
    updateCoordOutputs();
    if (!pinned) {
      pinned = true;
      ghostX = coords.x;
      ghostY = coords.y;
      updatePinUI(true);
      announcePin('pinned');
    } else {
      announcePin('moved');
    }
  } else if (measureMode === 'ruler') {
    handleRulerClick(coords);
  } else if (measureMode === 'calibrate') {
    handleCalibrateClick(coords);
  }
  redraw();
}

function handleRulerClick(coords) {
  if (!rulerA) {
    rulerA = { x: coords.x, y: coords.y };
    activePoint = 'a';
    announce(`Point A set at ${coords.x}, ${coords.y}`, POLITENESS.POLITE);
  } else {
    rulerB = { x: coords.x, y: coords.y };
    activePoint = 'b';
    announce(`Point B set at ${coords.x}, ${coords.y}`, POLITENESS.POLITE);
  }
  updateDistanceOutput();
  updateHelpText();
}

function handleCalibrateClick(coords) {
  if (!calibA) {
    calibA = { x: coords.x, y: coords.y };
    announce(`Calibration Point A set at ${coords.x}, ${coords.y}`, POLITENESS.POLITE);
  } else {
    calibB = { x: coords.x, y: coords.y };
    announce(`Calibration Point B set at ${coords.x}, ${coords.y}`, POLITENESS.POLITE);
  }
  updateCalibPixels();
}

function handleCanvasDblClick(e) {
  if (!pinned) return;
  e.preventDefault();
  unpinCrosshair();
}

function unpinCrosshair() {
  if (!pinned) return;
  pinned = false;
  updatePinUI(false);
  announcePin('unpinned');
  redraw();
}

function updatePinUI(isPinned) {
  if (unpinBtn) unpinBtn.hidden = !isPinned;
  if (pinIndicator) pinIndicator.hidden = !isPinned;
}

function announcePin(action) {
  let msg;
  if (action === 'pinned') {
    msg = `Coordinate pinned at X: ${crossX}, Y: ${crossY}`;
  } else if (action === 'moved') {
    msg = `Pin moved to X: ${crossX}, Y: ${crossY}`;
  } else {
    msg = 'Coordinate unpinned';
  }
  if (liveRegion) liveRegion.textContent = msg;
  announce(msg, POLITENESS.POLITE);
}

function handlePanStart(e) {
  if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
    isPanning = true;
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  }
}

function handlePanEnd() {
  if (isPanning) {
    isPanning = false;
    canvas.style.cursor = '';
  }
}

// ---------------------------------------------------------------------------
// Keyboard Navigation
// ---------------------------------------------------------------------------

function handleKeyDown(e) {
  if (!img) return;
  const step = e.shiftKey ? 10 : 1;
  let handled = false;

  if (measureMode === 'ruler' || measureMode === 'calibrate') {
    handled = handleModeKeyDown(e, step);
  } else {
    // Point mode
    switch (e.key) {
      case 'ArrowLeft':
        crossX = Math.max(0, crossX - step);
        handled = true;
        break;
      case 'ArrowRight':
        crossX = Math.min(imgNaturalW - 1, crossX + step);
        handled = true;
        break;
      case 'ArrowUp':
        crossY = Math.max(0, crossY - step);
        handled = true;
        break;
      case 'ArrowDown':
        crossY = Math.min(imgNaturalH - 1, crossY + step);
        handled = true;
        break;
      case 'Enter':
      case ' ':
        if (pinned) {
          unpinCrosshair();
        } else {
          pinned = true;
          ghostX = crossX;
          ghostY = crossY;
          updatePinUI(true);
          announcePin('pinned');
        }
        handled = true;
        break;
      case 'Escape':
        if (pinned) {
          unpinCrosshair();
          handled = true;
        }
        break;
    }
  }

  // Zoom keys work in all modes
  if (!handled) {
    switch (e.key) {
      case '+':
      case '=':
        changeZoom(0.25);
        handled = true;
        break;
      case '-':
        changeZoom(-0.25);
        handled = true;
        break;
      case '0':
        resetZoom();
        handled = true;
        break;
    }
  }

  if (handled) {
    e.preventDefault();
    e.stopPropagation();
    updateCoordOutputs();
    announceCoords();
    redraw();
  }
}

function handleModeKeyDown(e, step) {
  const isRuler = measureMode === 'ruler';
  const ptA = isRuler ? rulerA : calibA;
  const ptB = isRuler ? rulerB : calibB;
  const target = activePoint === 'a' ? ptA : ptB;

  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown': {
      if (target) {
        if (e.key === 'ArrowLeft') target.x = Math.max(0, target.x - step);
        if (e.key === 'ArrowRight') target.x = Math.min(imgNaturalW - 1, target.x + step);
        if (e.key === 'ArrowUp') target.y = Math.max(0, target.y - step);
        if (e.key === 'ArrowDown') target.y = Math.min(imgNaturalH - 1, target.y + step);
        if (isRuler) updateDistanceOutput();
        else updateCalibPixels();
      } else {
        if (e.key === 'ArrowLeft') crossX = Math.max(0, crossX - step);
        if (e.key === 'ArrowRight') crossX = Math.min(imgNaturalW - 1, crossX + step);
        if (e.key === 'ArrowUp') crossY = Math.max(0, crossY - step);
        if (e.key === 'ArrowDown') crossY = Math.min(imgNaturalH - 1, crossY + step);
      }
      return true;
    }
    case 'Tab':
      if (ptA && ptB) {
        activePoint = activePoint === 'a' ? 'b' : 'a';
        const label = activePoint === 'a' ? 'Point A active' : 'Point B active';
        announce(label, POLITENESS.POLITE);
        return true;
      }
      return false;
    case 'Enter':
    case ' ':
      if (isRuler) handleRulerClick({ x: crossX, y: crossY });
      else handleCalibrateClick({ x: crossX, y: crossY });
      return true;
    case 'Escape':
      if (isRuler) {
        clearRulerPoints();
      } else {
        calibA = null;
        calibB = null;
        updateCalibPixels();
      }
      announce('Points cleared', POLITENESS.POLITE);
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Zoom
// ---------------------------------------------------------------------------

function handleWheel(e) {
  if (!img) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  changeZoom(delta);
}

function changeZoom(delta) {
  zoom = Math.max(0.1, Math.min(10, zoom + delta));
  updateZoomDisplay();
  redraw();
}

function resetZoom() {
  fitImageToCanvas();
  redraw();
}

function updateZoomDisplay() {
  if (zoomDisplay) {
    zoomDisplay.value = Math.round(zoom * 100);
  }
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

function copyCoord(axis) {
  const rawValue = axis === 'x' ? crossX : crossY;
  const label = axis.toUpperCase();
  const unit = getUnit();
  const sf = getScaleFactor();
  let value, unitLabel;
  if (unit === 'mm' && sf > 0) {
    value = (rawValue / sf).toFixed(1);
    unitLabel = 'mm';
  } else {
    value = String(rawValue);
    unitLabel = 'px';
  }

  navigator.clipboard
    .writeText(value)
    .then(() => {
      announce(`${label} coordinate ${value} ${unitLabel} copied`, POLITENESS.POLITE);
      if (onCoordinateCopied) {
        onCoordinateCopied(axis, parseFloat(value));
      }
    })
    .catch(() => {
      announce(`Could not copy ${label} coordinate`, POLITENESS.ASSERTIVE);
    });
}

// ---------------------------------------------------------------------------
// Fullscreen Expansion
// ---------------------------------------------------------------------------

export function openFullscreen() {
  if (isFullscreen || !canvas) return;
  const controls = canvas.closest('.measure-controls');
  const backdrop = document.getElementById('measureFullscreenBackdrop');
  const closeBtn = document.getElementById('measureFullscreenClose');
  if (!controls) return;

  isFullscreen = true;
  previousFocusEl = document.activeElement;

  controls.classList.add('measure-fullscreen');
  if (backdrop) backdrop.classList.remove('hidden');
  if (closeBtn) closeBtn.classList.remove('hidden');

  // Refit image to the new (larger) canvas after layout settles
  requestAnimationFrame(() => {
    resizeCanvas();
    if (img) fitImageToCanvas();
    redraw();
  });

  fullscreenTrap = createDocumentFocusTrap(controls, {
    onEscape: closeFullscreen,
  });
  fullscreenTrap.activate({ initialFocus: canvas, initialFocusDelay: 50 });
  announce('Image measurement expanded to fullscreen', POLITENESS.POLITE);
}

export function closeFullscreen() {
  if (!isFullscreen || !canvas) return;
  const controls = canvas.closest('.measure-controls');
  const backdrop = document.getElementById('measureFullscreenBackdrop');
  const closeBtn = document.getElementById('measureFullscreenClose');

  isFullscreen = false;
  controls?.classList.remove('measure-fullscreen');
  if (backdrop) backdrop.classList.add('hidden');
  if (closeBtn) closeBtn.classList.add('hidden');

  // Refit image to the restored (smaller) canvas
  requestAnimationFrame(() => {
    resizeCanvas();
    if (img) fitImageToCanvas();
    redraw();
  });

  if (fullscreenTrap) {
    fullscreenTrap.deactivate();
    fullscreenTrap = null;
  }
  if (previousFocusEl?.focus) previousFocusEl.focus();
  announce('Exited fullscreen measurement view', POLITENESS.POLITE);
}

// ---------------------------------------------------------------------------
// Mode Helpers
// ---------------------------------------------------------------------------

function updateDistanceOutput() {
  if (!distOutput) return;
  const distPx = getRulerDistancePx();
  if (distPx === null) {
    distOutput.textContent = '--';
    return;
  }
  const unit = getUnit();
  const sf = getScaleFactor();
  const text = (unit === 'mm' && sf > 0)
    ? `${(distPx / sf).toFixed(1)} mm`
    : `${distPx.toFixed(1)} px`;
  distOutput.textContent = text;
  announce(`Distance: ${text}`, POLITENESS.POLITE);
}

function updateCalibPixels() {
  if (!calibPixelsSpan) return;
  if (!calibA || !calibB) {
    calibPixelsSpan.textContent = '0 px';
    return;
  }
  const dx = calibB.x - calibA.x;
  const dy = calibB.y - calibA.y;
  calibPixelsSpan.textContent = Math.sqrt(dx * dx + dy * dy).toFixed(1) + ' px';
}

function updateHelpText() {
  if (!helpText) return;
  switch (measureMode) {
    case 'point':
      helpText.textContent =
        'Click to pin crosshair. Double-click or Escape to unpin. Arrow keys move crosshair; Shift+arrows for 10 px steps. Enter/Space toggles pin. Scroll to zoom.';
      break;
    case 'ruler':
      if (!rulerA) helpText.textContent = 'Click to place Point A. Arrow keys nudge active point. Tab cycles A/B. Escape clears.';
      else if (!rulerB) helpText.textContent = 'Click to place Point B. Arrow keys nudge active point. Tab cycles A/B. Escape clears.';
      else helpText.textContent = 'Click to move Point B. Arrow keys nudge active point. Tab cycles A/B. Escape clears.';
      break;
    case 'calibrate':
      helpText.textContent = 'Click two points on a known distance, enter real mm, click Apply.';
      break;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function getComputedColor(tokenName) {
  try {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(tokenName)
      .trim();
  } catch {
    return null;
  }
}
