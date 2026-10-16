/**
 * @license GPL-3.0-or-later
 */
// Input sequence detector module
const PATTERN = [
  'UP',
  'UP',
  'DOWN',
  'DOWN',
  'LEFT',
  'RIGHT',
  'LEFT',
  'RIGHT',
  'B',
  'A',
];
const TIMEOUT_MS = 4000;

// The same sequence on the keyboard, by physical key.
const KEY_MAP = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  KeyB: 'B',
  KeyA: 'A',
};
// Where typing means typing: the keys are left to the field or the editor.
const TYPING_TARGET = 'input, textarea, select, [contenteditable], .cm-editor';

function getButtonTarget(event) {
  if (!event) return null;
  const path =
    typeof event.composedPath === 'function' ? event.composedPath() : null;
  if (path && path.length) {
    for (const node of path) {
      if (node && node.tagName === 'BUTTON') {
        return node;
      }
    }
  }
  const target = event.target;
  if (target && typeof target.closest === 'function') {
    return target.closest('button');
  }
  let current = target;
  while (current && current.nodeType === 1) {
    if (current.tagName === 'BUTTON') {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

/**
 * Initialize camera control sequence detector
 * @param {Function} onMatch - Callback fired when sequence is matched
 * @returns {Function} Cleanup function to remove event listeners
 */
export function initSequenceDetector(onMatch) {
  let buffer = [];
  let lastInputTime = 0;

  const INPUT_MAP = {
    // Desktop camera panel
    cameraRotateUp: 'UP',
    cameraRotateDown: 'DOWN',
    cameraRotateLeft: 'LEFT',
    cameraRotateRight: 'RIGHT',
    cameraPanDown: 'B',
    cameraPanRight: 'A',
    focusModeBtn: 'START',
    // Mobile camera drawer
    mobileCameraRotateUp: 'UP',
    mobileCameraRotateDown: 'DOWN',
    mobileCameraRotateLeft: 'LEFT',
    mobileCameraRotateRight: 'RIGHT',
    mobileCameraPanDown: 'B',
    mobileCameraPanRight: 'A',
  };

  function handleDocClick(event) {
    const btn = getButtonTarget(event);
    if (!btn) return;

    const token = INPUT_MAP[btn.id];
    if (!token) return;
    feed(token);
  }

  function handleKeydown(event) {
    const token = KEY_MAP[event.code];
    if (!token) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    const target = event.target;
    if (
      target &&
      typeof target.closest === 'function' &&
      target.closest(TYPING_TARGET)
    ) {
      return;
    }
    feed(token);
  }

  function feed(token) {
    const now = Date.now();
    if (now - lastInputTime > TIMEOUT_MS) {
      buffer = []; // Reset on timeout
    }
    lastInputTime = now;

    buffer.push(token);

    // Keep buffer at sequence length
    if (buffer.length > PATTERN.length) {
      buffer.shift();
    }

    // Check for match
    if (
      buffer.length === PATTERN.length &&
      buffer.every((t, i) => t === PATTERN[i])
    ) {
      buffer = [];
      onMatch();
    }
  }

  // Capture helps if anything stops propagation later.
  // Use boolean `true` so removeEventListener works reliably.
  document.addEventListener('click', handleDocClick, true);
  document.addEventListener('keydown', handleKeydown, true);

  // Return cleanup to remove listeners if needed
  return () => {
    document.removeEventListener('click', handleDocClick, true);
    document.removeEventListener('keydown', handleKeydown, true);
  };
}
