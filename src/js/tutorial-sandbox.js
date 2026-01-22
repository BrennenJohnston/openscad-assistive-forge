/**
 * Tutorial Sandbox System - Modern Spotlight Coachmarks
 *
 * Provides guided walkthrough overlays using a spotlight/cutout approach.
 * The tutorial panel positions itself near highlighted elements, with an
 * arrow pointing to the target. Users can interact with highlighted elements
 * through the spotlight cutout.
 *
 * Based on best practices from Shepherd.js, Driver.js, and modern onboarding UX.
 *
 * @module tutorial-sandbox
 */

/**
 * Tutorial step definition
 * @typedef {Object} TutorialStep
 * @property {string} title - Step title
 * @property {string} content - Step description (supports HTML)
 * @property {string} [highlightSelector] - CSS selector to highlight
 * @property {string} [position] - Preferred position: 'top', 'bottom', 'left', 'right', 'auto' (default)
 * @property {Object} [completion] - Optional completion criteria
 */

/**
 * Tutorial definition
 * @typedef {Object} Tutorial
 * @property {string} id - Unique tutorial identifier
 * @property {string} title - Tutorial title
 * @property {TutorialStep[]} steps - Array of tutorial steps
 */

// Tutorial state
let activeTutorial = null;
let currentStepIndex = 0;
let tutorialOverlay = null;
let triggerElement = null;
let previousFocus = null; // Store focus to restore on close
let completionListeners = [];
let stepCompleted = true;
let resizeObserver = null;
let isMinimized = false;
let drawerObserver = null;
let focusTrapCleanup = null; // Cleanup function for focus trap
let consecutiveFailures = 0; // Track consecutive step failures
let isNavigating = false; // Debounce navigation clicks
let isPaused = false; // Pause state for visibility changes
let targetRemovalObserver = null; // Watch for target removal
let currentTarget = null; // Currently highlighted target
let scrollYBeforeLock = 0; // Store scroll position for body lock
let didLockBodyScroll = false; // Avoid fighting other scroll locks (e.g. mobile drawer)
let wasAutoMinimized = false; // Track whether current minimized state was automatic
let isSettingUpStep = false; // Guard flag to prevent drawer observer interference during step setup

const MAX_CONSECUTIVE_FAILURES = 3;
const TUTORIAL_STORAGE_KEY = 'tutorialProgress';
const TUTORIAL_PROGRESS_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Spotlight cutout padding around target element
const SPOTLIGHT_PADDING = 8;
const SPOTLIGHT_RADIUS = 8;
const PANEL_OFFSET = 16;

/**
 * Find the nearest scrollable parent container
 * @param {HTMLElement} element - Element to start search from
 * @returns {HTMLElement|null} - Nearest scrollable parent or null
 */
function findScrollableParent(element) {
  let parent = element.parentElement;

  while (parent && parent !== document.body) {
    const overflowY = window.getComputedStyle(parent).overflowY;
    const overflowX = window.getComputedStyle(parent).overflowX;

    if (
      overflowY === 'auto' ||
      overflowY === 'scroll' ||
      overflowX === 'auto' ||
      overflowX === 'scroll'
    ) {
      // Check if it actually has scrollable content
      if (
        parent.scrollHeight > parent.clientHeight ||
        parent.scrollWidth > parent.clientWidth
      ) {
        return parent;
      }
    }

    parent = parent.parentElement;
  }

  return null;
}

/**
 * Check if we're on mobile viewport
 * @returns {boolean}
 */
function isMobileViewport() {
  return window.innerWidth < 768;
}

/**
 * Check if element is truly visible using comprehensive checks
 * More reliable than offsetParent alone for fixed/sticky positioned elements
 * @param {HTMLElement} element - Element to check
 * @returns {boolean}
 */
function isElementVisible(element) {
  if (!element) return false;

  // Quick style checks first
  const style = getComputedStyle(element);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0'
  ) {
    return false;
  }

  // Check if element has dimensions
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return false;
  }

  // Use visualViewport for zoom-safe visibility checks
  const viewport = getEffectiveViewport();

  // Check if element is within viewport (at least partially)
  const inViewport =
    rect.top < viewport.height &&
    rect.bottom > 0 &&
    rect.left < viewport.width &&
    rect.right > 0;

  // For elements inside mobile drawer, check drawer state
  if (
    isMobileViewport() &&
    isInsideParamPanel(element) &&
    !isMobileDrawerOpen()
  ) {
    return false;
  }

  return inViewport;
}

/**
 * Evaluate showWhen condition for dynamic step skipping
 * @param {Object|Function} showWhen - Condition object or function
 * @returns {boolean} - Whether step should be shown
 */
function evaluateShowWhenCondition(showWhen) {
  // If showWhen is a function, call it
  if (typeof showWhen === 'function') {
    return showWhen();
  }

  // If showWhen is an object, check mobile/desktop conditions
  if (typeof showWhen === 'object') {
    const isMobile = isMobileViewport();

    // Check mobile condition
    if (showWhen.mobile !== undefined && isMobile && !showWhen.mobile) {
      return false;
    }

    // Check desktop condition
    if (showWhen.desktop !== undefined && !isMobile && !showWhen.desktop) {
      return false;
    }

    // Check custom condition function
    if (showWhen.condition && typeof showWhen.condition === 'function') {
      return showWhen.condition();
    }

    return true;
  }

  // Default: show the step
  return true;
}

/**
 * Resolve target by data-tutorial-target attribute
 * @param {string} targetKey - The data-tutorial-target value to find
 * @returns {HTMLElement|null}
 */
function resolveTargetByKey(targetKey, { requireVisible = true } = {}) {
  const element = document.querySelector(
    `[data-tutorial-target="${targetKey}"]`
  );
  if (!element) return null;
  if (requireVisible && !isElementVisible(element)) return null;
  return element;
}

/**
 * Resolve target from a step's configuration
 * Supports both targetKey (preferred) and highlightSelector (legacy)
 * @param {Object} step - Tutorial step with targetKey or highlightSelector
 * @returns {HTMLElement|null}
 */
function resolveStepTarget(step, { requireVisible = true } = {}) {
  // First try targetKey if provided
  if (step.targetKey) {
    const target = resolveTargetByKey(step.targetKey, { requireVisible });
    if (target) return target;
  }

  // Fall back to highlightSelector
  if (!step.highlightSelector) return null;

  const selectors = step.highlightSelector.split(',').map((s) => s.trim());

  for (const selector of selectors) {
    // Support data-tutorial-target shorthand: @key
    if (selector.startsWith('@')) {
      const target = resolveTargetByKey(selector.slice(1), { requireVisible });
      if (target) return target;
      continue;
    }

    const el = document.querySelector(selector);
    if (el && (!requireVisible || isElementVisible(el))) {
      return el;
    }
  }

  return null;
}

/**
 * Wait for element to become visible using IntersectionObserver when available
 * @param {HTMLElement} element - Element to observe
 * @param {number} timeoutMs - Maximum wait time
 * @param {number} threshold - Intersection threshold
 * @returns {Promise<boolean>} - True if element becomes visible
 */
function waitForIntersection(element, timeoutMs = 800, threshold = 0.1) {
  if (!element) return Promise.resolve(false);
  if (!('IntersectionObserver' in window)) {
    return Promise.resolve(isElementVisible(element));
  }

  return new Promise((resolve) => {
    let resolved = false;

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      observer.disconnect();
      clearTimeout(timeoutId);
      resolve(result);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && entry.intersectionRatio >= threshold) {
          finish(true);
        }
      },
      { threshold }
    );

    observer.observe(element);

    const timeoutId = setTimeout(() => {
      finish(isElementVisible(element));
    }, timeoutMs);
  });
}

/**
 * Wait for a target to become available in DOM and visible
 * Uses MutationObserver with timeout for late-rendering targets
 * @param {Object} step - Tutorial step configuration
 * @param {number} timeoutMs - Maximum time to wait in milliseconds
 * @returns {Promise<HTMLElement|null>}
 */
async function resolveTargetWithRetry(step, timeoutMs = 1500) {
  const startTime = performance.now();

  const tryResolve = async () => {
    const candidate = resolveStepTarget(step, { requireVisible: false });
    if (!candidate) return null;
    if (isElementVisible(candidate)) return candidate;

    const remaining = Math.max(0, timeoutMs - (performance.now() - startTime));
    if (remaining <= 0) return null;

    const visible = await waitForIntersection(
      candidate,
      Math.min(remaining, 800)
    );
    return visible && isElementVisible(candidate) ? candidate : null;
  };

  // First, try immediate resolution
  const immediateTarget = await tryResolve();
  if (immediateTarget) return immediateTarget;

  // Set up MutationObserver to wait for target to appear
  return new Promise((resolve) => {
    const startTime = performance.now();
    let resolved = false;
    let checking = false;

    const checkTarget = async () => {
      if (resolved || checking) return;
      checking = true;
      const target = await tryResolve();
      checking = false;
      if (resolved) return;
      if (target) {
        resolved = true;
        observer.disconnect();
        clearTimeout(timeoutId);
        resolve(target);
      }
    };

    const observer = new MutationObserver(() => {
      void checkTarget();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'style', 'data-tutorial-target'],
    });

    // Also poll periodically in case mutations are missed
    const pollInterval = setInterval(() => {
      if (resolved || performance.now() - startTime > timeoutMs) {
        clearInterval(pollInterval);
        return;
      }
      void checkTarget();
    }, 100);

    // Timeout fallback
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        clearInterval(pollInterval);
        resolve(null);
      }
    }, timeoutMs);

    // Do an initial check
    void checkTarget();
  });
}

/**
 * Check if the mobile drawer is currently open
 * @returns {boolean}
 */
function isMobileDrawerOpen() {
  const paramPanel = document.getElementById('paramPanel');
  return paramPanel && paramPanel.classList.contains('drawer-open');
}

/**
 * Check if an element is inside the param panel (mobile drawer)
 * @param {HTMLElement} element - Element to check
 * @returns {boolean}
 */
function isInsideParamPanel(element) {
  const paramPanel = document.getElementById('paramPanel');
  return paramPanel && paramPanel.contains(element);
}

/**
 * Open the mobile drawer programmatically
 */
function openMobileDrawer() {
  const toggleBtn = document.getElementById('mobileDrawerToggle');
  if (toggleBtn && isMobileViewport() && !isMobileDrawerOpen()) {
    toggleBtn.click();
  }
}

/**
 * Close the mobile drawer programmatically
 * Used when advancing to a step that targets elements outside the param panel
 */
function closeMobileDrawer() {
  const closeBtn = document.getElementById('drawerCloseBtn');
  if (closeBtn && isMobileViewport() && isMobileDrawerOpen()) {
    closeBtn.click();
  }
}

/**
 * Wait for an element's transition to complete
 * @param {HTMLElement} element - Element to watch
 * @param {number} timeout - Fallback timeout in ms
 * @returns {Promise<void>}
 */
function waitForTransition(element, timeout = 500) {
  return new Promise((resolve) => {
    if (!element) {
      resolve();
      return;
    }

    // Check if element has a transition
    const hasTransition =
      getComputedStyle(element).transition !== 'none 0s ease 0s';

    if (!hasTransition) {
      resolve();
      return;
    }

    let resolved = false;

    const handler = (e) => {
      if (e.target === element && !resolved) {
        resolved = true;
        element.removeEventListener('transitionend', handler);
        resolve();
      }
    };

    element.addEventListener('transitionend', handler);

    // Timeout fallback in case transitionend doesn't fire
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        element.removeEventListener('transitionend', handler);
        resolve();
      }
    }, timeout);
  });
}

/**
 * Execute a single ensure action
 * @param {Object} action - Action configuration
 * @returns {Promise<void>}
 */
async function executeEnsureAction(action) {
  switch (action.type) {
    case 'openDrawer': {
      if (!isMobileDrawerOpen() && isMobileViewport()) {
        openMobileDrawer();
        const drawer = document.getElementById('paramPanel');
        await waitForTransition(drawer, 400);
      }
      break;
    }

    case 'closeDrawer': {
      if (isMobileDrawerOpen() && isMobileViewport()) {
        closeMobileDrawer();
        const drawer = document.getElementById('paramPanel');
        await waitForTransition(drawer, 400);
      }
      break;
    }

    case 'openDetails': {
      const details = document.querySelector(action.selector);
      if (details instanceof HTMLDetailsElement && !details.open) {
        details.open = true;
        // Small delay for animation
        await new Promise((r) => setTimeout(r, 100));
      }
      break;
    }

    case 'closeDetails': {
      const details = document.querySelector(action.selector);
      if (details instanceof HTMLDetailsElement && details.open) {
        details.open = false;
        await new Promise((r) => setTimeout(r, 100));
      }
      break;
    }

    case 'expandPanel': {
      const panel = document.querySelector(action.selector);
      const toggle = panel?.querySelector('[aria-expanded]');
      if (toggle && toggle.getAttribute('aria-expanded') === 'false') {
        toggle.click();
        await waitForTransition(panel, 400);
      }
      break;
    }

    case 'collapsePanel': {
      const panel = document.querySelector(action.selector);
      const toggle = panel?.querySelector('[aria-expanded]');
      if (toggle && toggle.getAttribute('aria-expanded') === 'true') {
        toggle.click();
        await waitForTransition(panel, 400);
      }
      break;
    }

    case 'wait': {
      await new Promise((r) => setTimeout(r, action.duration || 300));
      break;
    }

    default:
      console.warn(`Unknown ensure action type: ${action.type}`);
  }
}

/**
 * Execute step preconditions (ensure actions)
 * @param {Object} step - Tutorial step with optional ensure array
 * @returns {Promise<boolean>} - True if all preconditions succeeded
 */
async function ensureStepPreconditions(step) {
  if (!step.ensure || !Array.isArray(step.ensure)) {
    return true;
  }

  try {
    for (const action of step.ensure) {
      await executeEnsureAction(action);
      // Small delay between actions
      await new Promise((r) => setTimeout(r, 50));
    }
    return true;
  } catch (e) {
    console.warn('Tutorial precondition failed:', e);
    announceToScreenReader('Setup for this step failed. Moving to next step.');
    return false;
  }
}

/**
 * Debounce timeout for drawer state change handling
 */
let drawerChangeTimeout = null;

/**
 * Set up observer to watch for drawer state changes during tutorial
 * Handles both open and close transitions to reposition spotlight
 */
function setupDrawerObserver() {
  clearDrawerObserver();

  const paramPanel = document.getElementById('paramPanel');
  if (!paramPanel) return;

  drawerObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        // Handle any drawer state change (both open and close)
        if (isMobileViewport()) {
          const isNowOpen = paramPanel.classList.contains('drawer-open');
          handleDrawerStateChange(isNowOpen);
        }
      }
    });
  });

  drawerObserver.observe(paramPanel, {
    attributes: true,
    attributeFilter: ['class'],
  });
}

/**
 * Clear the drawer observer
 */
function clearDrawerObserver() {
  if (drawerObserver) {
    drawerObserver.disconnect();
    drawerObserver = null;
  }
  // Clear any pending debounce
  if (drawerChangeTimeout) {
    clearTimeout(drawerChangeTimeout);
    drawerChangeTimeout = null;
  }
}

/**
 * Handle drawer state change (open or close) during a tutorial step
 * Re-resolves the step target and repositions spotlight accordingly
 * @param {boolean} isNowOpen - Whether the drawer is now open
 */
function handleDrawerStateChange(isNowOpen) {
  // Debounce rapid changes during animation
  if (drawerChangeTimeout) {
    clearTimeout(drawerChangeTimeout);
  }

  drawerChangeTimeout = setTimeout(async () => {
    drawerChangeTimeout = null;

    if (!activeTutorial || !tutorialOverlay) return;

    // Don't interfere while a step is being set up - prevents race conditions
    // that can cause the drawer to open/close in a loop
    if (isSettingUpStep) return;

    const step = activeTutorial.steps[currentStepIndex];
    if (!step.highlightSelector && !step.targetKey) return;

    // Wait for drawer animation to complete
    const paramPanel = document.getElementById('paramPanel');
    if (paramPanel) {
      await waitForTransition(paramPanel, 350);
    }

    // Re-resolve the step target - it will pick the first visible target
    // from the selector list (e.g., @mobile-drawer-close when open,
    // @mobile-drawer-toggle when closed)
    const newTarget = resolveStepTarget(step, { requireVisible: true });

    if (newTarget && newTarget !== currentTarget) {
      // Update to the new visible target and reposition spotlight
      currentTarget = newTarget;
      updateSpotlightAndPosition();
    } else if (!newTarget && !stepCompleted) {
      // All targets are hidden - check if any are inside the closed drawer
      const hasTargetInsideDrawer = checkIfAnyTargetInsideDrawer(step);
      if (hasTargetInsideDrawer && !isNowOpen) {
        // Show prompt to reopen drawer
        showDrawerReopenPrompt();
      }
    }
  }, 100); // Debounce for 100ms
}

/**
 * Check if any of the step's targets are inside the param panel
 * @param {Object} step - Tutorial step
 * @returns {boolean}
 */
function checkIfAnyTargetInsideDrawer(step) {
  if (!step.highlightSelector) return false;

  const selectors = step.highlightSelector.split(',').map((s) => s.trim());

  for (const selector of selectors) {
    let el;
    if (selector.startsWith('@')) {
      el = document.querySelector(
        `[data-tutorial-target="${selector.slice(1)}"]`
      );
    } else {
      el = document.querySelector(selector);
    }
    if (el && isInsideParamPanel(el)) {
      return true;
    }
  }
  return false;
}

/**
 * Show a prompt in the tutorial panel to reopen the drawer
 */
function showDrawerReopenPrompt() {
  if (!tutorialOverlay) return;

  const requirementEl = tutorialOverlay.querySelector('#tutorialRequirement');
  if (!requirementEl) return;

  // Create or update the reopen prompt
  requirementEl.innerHTML = `
    <span class="tutorial-drawer-prompt">
      <span>Panel closed. </span>
      <button class="tutorial-reopen-drawer-btn" type="button">
        Reopen Parameters
      </button>
      <span> to continue.</span>
    </span>
  `;
  requirementEl.classList.add('tutorial-requirement-action');

  // Wire up the reopen button
  const reopenBtn = requirementEl.querySelector('.tutorial-reopen-drawer-btn');
  if (reopenBtn) {
    reopenBtn.addEventListener('click', () => {
      openMobileDrawer();
      // Reset the requirement text after a short delay
      setTimeout(() => {
        if (requirementEl && !stepCompleted) {
          requirementEl.textContent = '↑ Complete the action above to continue';
          requirementEl.classList.remove('tutorial-requirement-action');
        }
      }, 400);
    });
  }

  // Update spotlight to show centered panel
  updateSpotlightAndPosition();
}

/**
 * Check if we should use compact content for tutorials
 * Returns true when viewport is small or zoom is high
 * @returns {boolean}
 */
function shouldUseCompactContent() {
  const viewport = getEffectiveViewport();
  // Use compact content when:
  // - High zoom (scale > 1.25)
  // - Short viewport (height < 520px)
  // - Narrow viewport (width < 400px - mobile portrait)
  return viewport.scale > 1.25 || viewport.height < 520 || viewport.width < 400;
}

/**
 * Get the appropriate content for a tutorial step
 * Returns compact content if available and conditions warrant it
 * @param {Object} step - Tutorial step
 * @returns {string} - HTML content to display
 */
function getStepContent(step) {
  if (step.contentCompact && shouldUseCompactContent()) {
    return step.contentCompact;
  }
  return step.content;
}

/**
 * Tutorial definitions - Streamlined content for better UX
 */
const TUTORIALS = {
  intro: {
    id: 'intro',
    title: 'Getting Started',
    steps: [
      {
        title: 'Welcome!',
        content: `
          <p>This quick tour helps you get comfortable with the interface so you can start customizing right away.</p>
          <ul>
            <li>Find the main panels and drawers</li>
            <li>Change a parameter and see the preview update</li>
            <li>Save a preset and generate a file to download</li>
          </ul>
          <p class="tutorial-hint">Works on desktop and mobile (portrait or landscape).</p>
          <p class="tutorial-hint">Press <kbd>Esc</kbd> to exit anytime.</p>
        `,
        contentCompact: `
          <p>Quick tour of the main controls (~3 min).</p>
          <details class="tutorial-more">
            <summary>What you'll learn</summary>
            <ul>
              <li>Find Parameters, Preview, Actions</li>
              <li>Change a parameter</li>
              <li>Generate &amp; download</li>
            </ul>
          </details>
          <p class="tutorial-hint"><kbd>Esc</kbd> to exit anytime.</p>
        `,
        position: 'center',
      },
      {
        title: 'The 3 main areas',
        content: `
          <p>The app is organized into three areas:</p>
          <ul>
            <li><strong>Parameters</strong> — change your model’s settings</li>
            <li><strong>Preview</strong> — see the 3D model update</li>
            <li><strong>Actions</strong> — export, share, and other tools</li>
          </ul>
          <p class="tutorial-hint">Next, we’ll find each area in your layout.</p>
        `,
        contentCompact: `
          <p><strong>Parameters</strong> (settings) · <strong>Preview</strong> (3D) · <strong>Actions</strong> (export)</p>
          <p class="tutorial-hint">Next: find each area.</p>
        `,
        position: 'center',
      },
      {
        title: 'Open and close Parameters',
        content: `
          <p><strong>Parameters</strong> is where you customize the model.</p>
          <ul>
            <li><strong>Small screens:</strong> use the <strong>Params</strong> button to open the panel. When it’s open, use the <strong>Close</strong> (X) button or tap outside the panel.</li>
            <li><strong>Wide screens:</strong> the Parameters panel is on the left. Use the edge <strong>collapse</strong> button to shrink/expand it.</li>
          </ul>
          <p class="tutorial-hint">Tip: if you rotate your phone and the layout changes, look for whichever control is visible.</p>
        `,
        contentCompact: `
          <p>Tap the highlighted button to open/close <strong>Parameters</strong>.</p>
          <p class="tutorial-hint">Button changes based on screen size.</p>
        `,
        highlightSelector:
          '@mobile-drawer-close, @mobile-drawer-toggle, @collapse-param-panel',
        position: 'right',
      },
      {
        title: 'Adjust a parameter',
        content: `
          <p><strong>Try it:</strong> change <strong>Width</strong> and watch the preview update.</p>
          <p class="tutorial-hint">You can drag the slider or type a number.</p>
        `,
        highlightSelector:
          '#param-width, .param-control[data-param-name="width"] input, .param-control[data-param-name="width"]',
        position: 'right',
        lockScroll: true,
        completion: {
          type: 'domEvent',
          // Some models/themes may render the width input with a slightly different structure.
          // Use a comma-separated selector list (querySelector supports this).
          selector:
            '#param-width, #param-width input, .param-control[data-param-name="width"] input[type="range"], .param-control[data-param-name="width"] input',
          event: 'input',
        },
      },
      {
        title: 'See the preview update',
        content: `
          <p>Nice! The <strong>Preview</strong> updates automatically as you change parameters.</p>
          <p class="tutorial-hint">If you don’t see the model yet, click <strong>Generate</strong> later to build the full 3D file.</p>
        `,
        highlightSelector: '@preview-container',
        position: 'left',
      },
      {
        title: 'Save a preset (optional, but helpful)',
        content: `
          <p>Use <strong>Presets</strong> to save your current settings and return to them later.</p>
          <p class="tutorial-hint">Presets are saved in your browser for this model.</p>
        `,
        // Target the clickable summary so the panel can avoid covering it.
        highlightSelector: '#presetControls summary, @preset-controls',
        position: 'right',
        completion: {
          type: 'detailsOpen',
          selector: '#presetControls details, #presetControls',
        },
      },
      {
        title: 'Preview Settings & Info',
        content: `
          <p>Open <strong>Preview Settings &amp; Info</strong> to find:</p>
          <ul>
            <li>Status and progress</li>
            <li>Model dimensions</li>
            <li>Preview/export quality</li>
          </ul>
          <p class="tutorial-hint">You can resize this drawer using the handle. With keyboard: focus the handle, then use arrow keys.</p>
        `,
        contentCompact: `
          <p>Tap to see status, dimensions, and quality settings.</p>
          <p class="tutorial-hint">Use the handle to resize.</p>
        `,
        highlightSelector: '@preview-drawer-toggle',
        position: 'left',
      },
      {
        title: 'Actions menu',
        content: `
          <p>Open the <strong>Actions</strong> drawer for extra tools:</p>
          <ul>
            <li><strong>Share Link</strong> — copy a link with your current settings</li>
            <li><strong>Export Params</strong> — download your settings as JSON</li>
            <li><strong>Compare</strong> — track changes</li>
            <li><strong>Queue</strong> — batch multiple renders</li>
          </ul>
          <p class="tutorial-hint">On mobile it expands upward from the bottom bar. On desktop it opens from the Actions section next to the main button.</p>
        `,
        highlightSelector: '@actions-drawer-toggle',
        position: 'auto',
      },
      {
        title: 'Camera controls',
        content: `
          <p>Use <strong>Camera</strong> controls to rotate, pan, zoom, and reset the view without drag gestures.</p>
          <ul>
            <li><strong>Mobile:</strong> open the Camera drawer in the bottom bar</li>
            <li><strong>Desktop:</strong> open the Camera panel on the right</li>
          </ul>
          <p class="tutorial-hint">If you prefer drag gestures, you can skip these controls for now.</p>
        `,
        highlightSelector: '@mobile-camera-drawer-toggle, @camera-panel-toggle',
        position: 'left',
      },
      {
        title: 'Generate and download your file',
        content: `
          <p>Click <strong>Generate</strong> to create your output file (STL/OBJ/3MF, etc.).</p>
          <p class="tutorial-hint">The button text updates based on the selected output format in the Parameters panel.</p>
        `,
        highlightSelector: '@primary-action',
        position: 'top',
        completion: {
          type: 'domEvent',
          selector: '#primaryActionBtn',
          event: 'click',
        },
      },
      {
        title: 'Close Parameters (mobile)',
        content: `
          <p>On mobile, the <strong>Parameters</strong> drawer sits on top of the app.</p>
          <p class="tutorial-hint">Close it now so you can reach the top buttons like <strong>Help</strong>.</p>
        `,
        highlightSelector: '@mobile-drawer-close, @collapse-param-panel',
        position: 'left',
        showWhen: { mobile: true, desktop: false },
        completion: {
          type: 'domEvent',
          selector: '#drawerCloseBtn, #collapseParamPanelBtn',
          event: 'click',
        },
      },
      {
        title: 'Help & Examples',
        content: `
          <p>Use <strong>Help</strong> for built-in documentation, examples, and explanations of features.</p>
          <p class="tutorial-hint">Click it now to open the Features Guide.</p>
        `,
        highlightSelector: '@features-guide',
        position: 'left',
        completion: {
          type: 'modalOpen',
          selector: '#featuresGuideModal',
          trigger: '#featuresGuideBtn',
        },
      },
      {
        title: 'Features Guide',
        content: `
          <p>The <strong>Features Guide</strong> is a great place to learn more when you get stuck.</p>
          <p class="tutorial-hint"><strong>Close the modal</strong> (click X or press <kbd>Esc</kbd>) to continue.</p>
        `,
        highlightSelector: '@features-guide-modal',
        position: 'bottom',
        completion: { type: 'modalClose', selector: '#featuresGuideModal' },
      },
      {
        title: "You're ready!",
        content: `
          <p>You now know where the main controls are and how to complete the basic workflow.</p>
          <p><strong>Next steps:</strong></p>
          <ul>
            <li>Try a different example from the Welcome screen</li>
            <li>Upload your own <code>.scad</code> or <code>.zip</code> project</li>
            <li>Use Presets and the Actions menu to save and share your work</li>
          </ul>
        `,
        position: 'center',
      },
    ],
  },
  makers: {
    id: 'makers',
    title: 'Advanced Features',
    steps: [
      {
        title: 'Welcome, Maker!',
        content: `
          <p>This tour covers:</p>
          <ul>
            <li>Library bundles (MCAD, BOSL2)</li>
            <li>Multi-file ZIP projects</li>
            <li>Export formats</li>
          </ul>
          <p class="tutorial-hint">Press <kbd>Esc</kbd> to exit anytime.</p>
        `,
        position: 'center',
      },
      {
        title: 'Libraries Panel',
        content: `
          <p>Click <strong>Libraries</strong> to enable bundles your model needs.</p>
          <p class="tutorial-hint">MCAD, BOSL2, NopSCADlib, dotSCAD available.</p>
        `,
        highlightSelector: '@library-controls',
        position: 'right',
        completion: {
          type: 'detailsOpen',
          selector: '#libraryControls details',
        },
      },
      {
        title: 'Multi-file Projects',
        content: `
          <p>Upload a <strong>ZIP file</strong> with multiple .scad files.</p>
          <p class="tutorial-hint">Dependencies are auto-detected.</p>
        `,
        highlightSelector: '@clear-file',
        position: 'left',
      },
      {
        title: 'Output Formats',
        content: `
          <p><strong>Try it:</strong> Select a different output format.</p>
          <ul>
            <li><strong>STL</strong> - 3D printing</li>
            <li><strong>3MF</strong> - Modern with color</li>
            <li><strong>OBJ</strong> - Rendering/animation</li>
          </ul>
        `,
        highlightSelector: '@output-format',
        position: 'top',
        completion: {
          type: 'domEvent',
          selector: '#outputFormat',
          event: 'change',
        },
      },
      {
        title: 'All Set!',
        content: `
          <p>You're ready for advanced OpenSCAD workflows.</p>
          <p class="tutorial-hint">Check Help → Libraries for details.</p>
        `,
        position: 'center',
      },
    ],
  },
  'keyboard-only': {
    id: 'keyboard-only',
    title: 'Keyboard Navigation',
    steps: [
      {
        title: 'Keyboard-First Design',
        content: `
          <p>Complete the full workflow without a mouse:</p>
          <ul>
            <li><kbd>Tab</kbd> - Move between controls</li>
            <li><kbd>Arrow keys</kbd> - Adjust sliders</li>
            <li><kbd>Esc</kbd> - Close dialogs</li>
          </ul>
        `,
        position: 'center',
      },
      {
        title: 'Skip Link',
        content: `
          <p>Press <kbd>Tab</kbd> at page top to reveal "Skip to content".</p>
          <p class="tutorial-hint">Bypasses the header directly to controls.</p>
        `,
        highlightSelector: '.skip-link',
        position: 'bottom',
      },
      {
        title: 'Navigate Parameters',
        content: `
          <p><strong>Try it:</strong> Press <kbd>Tab</kbd> to reach a parameter, then use <kbd>Arrow keys</kbd> to adjust.</p>
          <p class="tutorial-hint"><kbd>Ctrl+Z</kbd> to undo, <kbd>Ctrl+Shift+Z</kbd> to redo.</p>
        `,
        highlightSelector: '#parametersContainer',
        position: 'right',
        lockScroll: true,
        completion: {
          type: 'domEvent',
          selector: '#parametersContainer',
          event: 'input',
        },
      },
      {
        title: 'Modal Navigation',
        content: `
          <p>Dialogs trap focus inside. Press <kbd>Esc</kbd> to close and return to your previous location.</p>
        `,
        position: 'center',
      },
      {
        title: "You're Set!",
        content: `
          <p>All features work with keyboard only.</p>
          <p class="tutorial-hint">See Keyguard Workflow Guide for full reference.</p>
        `,
        position: 'center',
      },
    ],
  },
  'low-vision': {
    id: 'low-vision',
    title: 'Visual Accessibility',
    steps: [
      {
        title: 'Visual Features',
        content: `
          <p>This tour covers:</p>
          <ul>
            <li>High contrast mode</li>
            <li>Theme switching</li>
            <li>Large touch targets</li>
          </ul>
        `,
        position: 'center',
      },
      {
        title: 'High Contrast',
        content: `
          <p><strong>Try it:</strong> Click the <strong>HC button</strong> to toggle high contrast mode.</p>
          <p class="tutorial-hint">Increases borders and contrast ratios.</p>
        `,
        highlightSelector: '@contrast-toggle',
        position: 'bottom',
        completion: {
          type: 'domEvent',
          selector: '#contrastToggle',
          event: 'click',
        },
      },
      {
        title: 'Theme Toggle',
        content: `
          <p><strong>Try it:</strong> Click the <strong>theme button</strong> (sun/moon) to switch light/dark.</p>
        `,
        highlightSelector: '@theme-toggle',
        position: 'bottom',
        completion: {
          type: 'domEvent',
          selector: '#themeToggle',
          event: 'click',
        },
      },
      {
        title: 'Touch Targets',
        content: `
          <p>All buttons meet <strong>44×44px minimum</strong> touch target size (WCAG AAA).</p>
          <p class="tutorial-hint">Easy to tap even with reduced precision.</p>
        `,
        position: 'center',
      },
      {
        title: 'Ready!',
        content: `
          <p>The app supports Windows High Contrast Mode and system preferences.</p>
        `,
        position: 'center',
      },
    ],
  },
  'voice-input': {
    id: 'voice-input',
    title: 'Voice Control',
    steps: [
      {
        title: 'Voice-Friendly Design',
        content: `
          <p>All controls have <strong>unique, speakable names</strong> for voice recognition software.</p>
        `,
        position: 'center',
      },
      {
        title: 'Button Commands',
        content: `
          <p>Say the button label:</p>
          <ul>
            <li>"Click Generate STL"</li>
            <li>"Click Reset"</li>
            <li>"Click Help"</li>
          </ul>
        `,
        highlightSelector: '@actions-drawer-toggle, @primary-action',
        position: 'top',
      },
      {
        title: 'Parameter Controls',
        content: `
          <p>Each parameter has a unique label:</p>
          <ul>
            <li>"Click Width" (focus input)</li>
            <li>"Set Width to 50"</li>
          </ul>
        `,
        highlightSelector: '@parameters-container',
        position: 'right',
      },
      {
        title: 'Navigation',
        content: `
          <ul>
            <li>"Scroll down/up"</li>
            <li>"Click Help"</li>
            <li>"Click Clear" (return to start)</li>
          </ul>
        `,
        position: 'center',
      },
      {
        title: 'All Set!',
        content: `
          <p>All controls are voice-friendly with stable, speakable names.</p>
        `,
        position: 'center',
      },
    ],
  },
  'screen-reader': {
    id: 'screen-reader',
    title: 'Screen Reader Guide',
    steps: [
      {
        title: 'Screen Reader Support',
        content: `
          <p>This tour covers:</p>
          <ul>
            <li>Status announcements</li>
            <li>ARIA landmarks</li>
            <li>Help locations</li>
          </ul>
        `,
        position: 'center',
      },
      {
        title: 'Status Announcements',
        content: `
          <p>The <strong>Status area</strong> announces all operations automatically.</p>
          <p><strong>Try it:</strong> Adjust <strong>Width</strong> and listen for the announcement.</p>
        `,
        highlightSelector:
          '#statusArea, .param-control[data-param-name="width"], #param-width',
        position: 'auto',
        lockScroll: true,
        completion: {
          type: 'domEvent',
          selector:
            '#param-width, #param-width input, .param-control[data-param-name="width"] input[type="range"], .param-control[data-param-name="width"] input',
          event: 'input',
        },
      },
      {
        title: 'ARIA Landmarks',
        content: `
          <p>Navigate quickly with landmarks:</p>
          <ul>
            <li><strong>Main</strong> - Main content</li>
            <li><strong>Region</strong> - Parameters, Preview</li>
          </ul>
          <p class="tutorial-hint">NVDA: D key, VoiceOver: VO+U</p>
        `,
        position: 'center',
      },
      {
        title: 'Help Button',
        content: `
          <p>The Help button is always in the same location (top-right of Preview).</p>
        `,
        highlightSelector: '@features-guide',
        position: 'left',
      },
      {
        title: 'Ready!',
        content: `
          <p>All features have proper ARIA labels and live region announcements.</p>
        `,
        position: 'center',
      },
    ],
  },
};

// ============================================================================
// State Persistence Functions
// ============================================================================

/**
 * Save tutorial progress to sessionStorage
 * @param {number} stepIndex - Current step index
 */
function saveTutorialProgress(stepIndex) {
  try {
    const progress = {
      tutorialId: activeTutorial?.id,
      stepIndex,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(progress));
  } catch (e) {
    console.warn('Failed to save tutorial progress:', e);
  }
}

/**
 * Load tutorial progress from sessionStorage
 * @returns {{tutorialId: string, stepIndex: number}|null}
 */
function loadTutorialProgress() {
  try {
    const saved = sessionStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (!saved) return null;

    const progress = JSON.parse(saved);

    // Check if progress is still valid (within 24 hours)
    if (Date.now() - progress.timestamp > TUTORIAL_PROGRESS_EXPIRY_MS) {
      clearTutorialProgress();
      return null;
    }

    return progress;
  } catch (e) {
    console.warn('Failed to load tutorial progress:', e);
    return null;
  }
}

/**
 * Clear saved tutorial progress
 */
function clearTutorialProgress() {
  try {
    sessionStorage.removeItem(TUTORIAL_STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear tutorial progress:', e);
  }
}

/**
 * Show a resume dialog when progress exists
 * @param {number} stepIndex - Saved step index
 * @param {number} totalSteps - Total steps in tutorial
 * @returns {Promise<boolean>} True to resume, false to start over
 */
function showTutorialResumeDialog(stepIndex, totalSteps) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'preset-modal confirm-modal tutorial-resume-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'tutorialResumeTitle');
    modal.setAttribute('aria-describedby', 'tutorialResumeMessage');
    modal.dataset.testid = 'tutorial-resume-dialog';
    modal.style.zIndex = '10005';

    modal.innerHTML = `
      <div class="preset-modal-content confirm-modal-content">
        <div class="preset-modal-header">
          <h3 id="tutorialResumeTitle" class="preset-modal-title">Resume tutorial?</h3>
        </div>
        <div class="confirm-modal-body">
          <p id="tutorialResumeMessage">You were on step ${stepIndex + 1} of ${totalSteps}. Would you like to resume?</p>
        </div>
        <div class="preset-form-actions">
          <button type="button" class="btn btn-primary" data-action="resume">Resume</button>
          <button type="button" class="btn btn-secondary" data-action="restart">Start over</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const cleanup = (shouldResume) => {
      modal.remove();
      resolve(shouldResume);
    };

    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      cleanup(btn.dataset.action === 'resume');
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup(false);
      }
    });

    const resumeBtn = modal.querySelector('button[data-action="resume"]');
    resumeBtn?.focus();
  });
}

/**
 * Show an error recovery dialog after repeated failures
 * @param {string} message - Error message
 * @returns {Promise<boolean>} True to restart, false to exit
 */
function showTutorialErrorDialog(message) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'preset-modal confirm-modal tutorial-error-modal';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'tutorialErrorTitle');
    modal.setAttribute('aria-describedby', 'tutorialErrorMessage');
    modal.dataset.testid = 'tutorial-error-dialog';
    modal.style.zIndex = '10005';

    modal.innerHTML = `
      <div class="preset-modal-content confirm-modal-content">
        <div class="preset-modal-header">
          <h3 id="tutorialErrorTitle" class="preset-modal-title">Tutorial needs help</h3>
        </div>
        <div class="confirm-modal-body">
          <p id="tutorialErrorMessage">${message}</p>
        </div>
        <div class="preset-form-actions">
          <button type="button" class="btn btn-primary" data-action="restart">Restart</button>
          <button type="button" class="btn btn-secondary" data-action="exit">Exit</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const cleanup = (shouldRestart) => {
      modal.remove();
      resolve(shouldRestart);
    };

    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      cleanup(btn.dataset.action === 'restart');
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup(false);
      }
    });

    const restartBtn = modal.querySelector('button[data-action="restart"]');
    restartBtn?.focus();
  });
}

// ============================================================================
// Body Scroll Locking
// ============================================================================

/**
 * Lock body scrolling while tutorial is active
 */
function lockBodyScroll() {
  // The mobile Parameters drawer already locks body scroll and sets body.top.
  // Locking again here can create weird fixed-position offsets on mobile.
  if (document.body.classList.contains('drawer-open')) {
    didLockBodyScroll = false;
    return;
  }
  scrollYBeforeLock = window.scrollY;
  document.body.classList.add('tutorial-body-locked');
  document.body.style.top = `-${scrollYBeforeLock}px`;
  didLockBodyScroll = true;
}

/**
 * Unlock body scrolling when tutorial closes
 */
function unlockBodyScroll() {
  if (!didLockBodyScroll) return;
  document.body.classList.remove('tutorial-body-locked');
  document.body.style.top = '';
  window.scrollTo(0, scrollYBeforeLock);
  didLockBodyScroll = false;
}

// ============================================================================
// Navigation Debouncing
// ============================================================================

/**
 * Navigate to a step with debouncing to prevent rapid clicks
 * @param {number} newIndex - Target step index
 */
async function navigateToStep(newIndex) {
  if (isNavigating) {
    console.log('Navigation in progress, ignoring click');
    return;
  }

  isNavigating = true;
  // Prevent "double taps" from being ignored silently on mobile.
  // While we are navigating, disable nav buttons so the UI reflects the busy state.
  const backBtn = tutorialOverlay?.querySelector('#tutorialBackBtn');
  const nextBtn = tutorialOverlay?.querySelector('#tutorialNextBtn');
  backBtn?.setAttribute('disabled', 'true');
  nextBtn?.setAttribute('disabled', 'true');
  try {
    await showStep(newIndex);
    consecutiveFailures = 0;
  } finally {
    isNavigating = false;
    // Re-enable buttons based on the current step state
    if (tutorialOverlay) {
      const currentStep = activeTutorial?.steps?.[currentStepIndex];
      const back = tutorialOverlay.querySelector('#tutorialBackBtn');
      const next = tutorialOverlay.querySelector('#tutorialNextBtn');
      if (back) back.disabled = currentStepIndex === 0;
      if (next) next.disabled = !!currentStep?.completion && !stepCompleted;
    }
  }
}

/**
 * Find the next step index that matches showWhen conditions
 * @param {number} startIndex - Index to start searching from
 * @param {number} direction - 1 for forward, -1 for backward
 * @returns {number|null}
 */
function findNextValidStepIndex(startIndex, direction) {
  const steps = activeTutorial?.steps || [];
  for (let i = startIndex; i >= 0 && i < steps.length; i += direction) {
    const step = steps[i];
    if (!step?.showWhen || evaluateShowWhenCondition(step.showWhen)) {
      return i;
    }
  }
  return null;
}

/**
 * Skip to the next valid step with an announcement
 * @param {number} stepIndex - Current step index
 * @param {number} direction - Direction to move
 * @param {string} reason - Skip reason
 */
async function skipToNextValidStep(stepIndex, direction, reason) {
  announceToScreenReader(`Step skipped: ${reason}`);
  const nextIndex = findNextValidStepIndex(stepIndex + direction, direction);
  if (nextIndex === null) {
    closeTutorial(true);
    return;
  }
  await showStep(nextIndex);
}

/**
 * Handle repeated failures and offer recovery options
 * @param {string} reason - Failure reason
 * @param {number} stepIndex - Step index where failure occurred
 * @param {number} direction - Direction to move on skip
 */
async function handleStepFailure(reason, stepIndex, direction) {
  consecutiveFailures += 1;

  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    announceToScreenReader(
      'Tutorial encountered an issue. Choose to restart or exit.',
      'assertive'
    );
    const shouldRestart = await showTutorialErrorDialog(
      'Tutorial is having trouble continuing. Would you like to restart or exit?'
    );

    consecutiveFailures = 0;
    if (shouldRestart) {
      clearTutorialProgress();
      await showStep(0);
    } else {
      closeTutorial();
    }
    return;
  }

  await skipToNextValidStep(stepIndex, direction, reason);
}

// ============================================================================
// Target Removal Detection
// ============================================================================

/**
 * Watch for the current target element being removed from DOM
 * @param {HTMLElement} targetElement - Element to watch
 * @param {Function} onRemoved - Callback when element is removed
 * @returns {MutationObserver}
 */
function watchTargetRemoval(targetElement, onRemoved) {
  if (targetRemovalObserver) {
    targetRemovalObserver.disconnect();
  }

  targetRemovalObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (
          node === targetElement ||
          (node.contains && node.contains(targetElement))
        ) {
          targetRemovalObserver.disconnect();
          targetRemovalObserver = null;
          onRemoved();
          return;
        }
      }
    }
  });

  targetRemovalObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return targetRemovalObserver;
}

// ============================================================================
// Pause/Resume for Visibility Changes
// ============================================================================

/**
 * Handle visibility change (tab switch, minimize)
 */
function handleVisibilityChange() {
  if (document.hidden && activeTutorial) {
    pauseTutorial();
  } else if (!document.hidden && isPaused) {
    resumeTutorial();
  }
}

/**
 * Pause the tutorial when tab is not visible
 */
function pauseTutorial() {
  if (!activeTutorial) return;
  isPaused = true;
  saveTutorialProgress(currentStepIndex);
  tutorialOverlay?.classList.add('tutorial-paused');
}

/**
 * Resume the tutorial when tab becomes visible
 */
function resumeTutorial() {
  if (!activeTutorial || !isPaused) return;
  isPaused = false;
  tutorialOverlay?.classList.remove('tutorial-paused');
  // Re-measure and reposition in case layout changed
  scheduleReposition();
}

/**
 * Handle beforeunload to save progress
 */
function handleBeforeUnload() {
  if (activeTutorial && currentStepIndex > 0) {
    saveTutorialProgress(currentStepIndex);
  }
}

/**
 * Handle browser back/forward navigation during tutorial
 */
function handlePopState() {
  if (activeTutorial) {
    saveTutorialProgress(currentStepIndex);
    closeTutorial();
  }
}

// ============================================================================
// Touch Event Handling
// ============================================================================

/**
 * Setup touch handlers for tutorial panel
 * @param {HTMLElement} panel - Tutorial panel element
 */
function setupTouchHandlers(panel) {
  let touchStartTime = 0;
  let lastTapTime = 0;

  // Prevent double-tap zoom on tutorial buttons
  const handleTouchStart = (e) => {
    if (
      e.target.matches(
        '.tutorial-btn-back, .tutorial-btn-next, .tutorial-close, .tutorial-minimize'
      )
    ) {
      touchStartTime = Date.now();

      // Prevent double-tap zoom
      const timeSinceLastTap = touchStartTime - lastTapTime;
      if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
        e.preventDefault();
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (
      e.target.matches(
        '.tutorial-btn-back, .tutorial-btn-next, .tutorial-close, .tutorial-minimize'
      )
    ) {
      const touchDuration = Date.now() - touchStartTime;
      lastTapTime = Date.now();

      // Fast tap - trigger click immediately (bypasses 300ms delay)
      if (touchDuration < 200) {
        e.preventDefault();
        e.target.click();
      }
    }
  };

  // Prevent context menu on long press
  const handleContextMenu = (e) => {
    if (e.target.matches('.tutorial-btn-back, .tutorial-btn-next')) {
      e.preventDefault();
    }
  };

  panel.addEventListener('touchstart', handleTouchStart, { passive: false });
  panel.addEventListener('touchend', handleTouchEnd, { passive: false });
  panel.addEventListener('contextmenu', handleContextMenu);

  // Return cleanup function
  return () => {
    panel.removeEventListener('touchstart', handleTouchStart);
    panel.removeEventListener('touchend', handleTouchEnd);
    panel.removeEventListener('contextmenu', handleContextMenu);
  };
}

// ============================================================================
// Focus Trap
// ============================================================================

/**
 * Setup focus trap inside tutorial panel to keep focus within the dialog
 * @param {HTMLElement} panelElement - The panel element to trap focus within
 * @returns {Function} Cleanup function to remove the trap
 */
function setupFocusTrap(panelElement) {
  const focusableSelectors =
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

  const getFocusables = () => panelElement.querySelectorAll(focusableSelectors);

  const trapHandler = (e) => {
    if (e.key !== 'Tab') return;

    const focusables = getFocusables();
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  panelElement.addEventListener('keydown', trapHandler);
  return () => panelElement.removeEventListener('keydown', trapHandler);
}

/**
 * Make background content inert while tutorial is active
 * @param {boolean} makeInert - Whether to make content inert
 * @note Reserved for future accessibility enhancement
 */
// eslint-disable-next-line no-unused-vars
function setBackgroundInert(makeInert) {
  // Find main app content containers (excluding tutorial overlay)
  const mainContent =
    document.getElementById('main-content') || document.querySelector('main');
  const appContainer = document.getElementById('app') || document.body;

  // Use inert attribute if supported, otherwise use aria-hidden
  const targets = [mainContent, appContainer].filter(
    (el) => el && !el.contains(tutorialOverlay)
  );

  targets.forEach((el) => {
    if (makeInert) {
      if ('inert' in el) {
        el.inert = true;
      } else {
        el.setAttribute('aria-hidden', 'true');
      }
    } else {
      if ('inert' in el) {
        el.inert = false;
      } else {
        el.removeAttribute('aria-hidden');
      }
    }
  });
}

/**
 * Start a tutorial
 * @param {string} tutorialId - Tutorial identifier
 * @param {Object} options - Options
 * @param {HTMLElement} [options.triggerEl] - Element that triggered the tutorial
 */
export async function startTutorial(tutorialId, { triggerEl } = {}) {
  const tutorial = TUTORIALS[tutorialId];
  if (!tutorial) {
    console.warn(`Tutorial "${tutorialId}" not found`);
    return;
  }

  let startIndex = 0;
  const savedProgress = loadTutorialProgress();
  if (
    savedProgress &&
    savedProgress.tutorialId === tutorialId &&
    Number.isInteger(savedProgress.stepIndex) &&
    savedProgress.stepIndex > 0 &&
    savedProgress.stepIndex < tutorial.steps.length
  ) {
    const shouldResume = await showTutorialResumeDialog(
      savedProgress.stepIndex,
      tutorial.steps.length
    );
    if (shouldResume) {
      startIndex = savedProgress.stepIndex;
    } else {
      clearTutorialProgress();
    }
  }

  // Store current focus to restore on close
  previousFocus = document.activeElement;
  triggerElement = triggerEl || previousFocus;
  activeTutorial = tutorial;
  currentStepIndex = startIndex;
  isMinimized = false;

  createTutorialOverlay();
  await showStep(startIndex);
  announceToScreenReader(
    `${tutorial.title} started. Step ${startIndex + 1} of ${tutorial.steps.length}. Press Escape to exit at any time.`,
    'assertive'
  );
}

/**
 * Create the tutorial overlay DOM structure
 */
function createTutorialOverlay() {
  if (tutorialOverlay) {
    closeTutorial();
  }

  const overlay = document.createElement('div');
  overlay.className = 'tutorial-overlay';
  // Role and aria-label on outer container for screen reader context
  overlay.setAttribute('role', 'presentation');
  overlay.setAttribute('aria-hidden', 'false');

  overlay.innerHTML = `
    <svg class="tutorial-spotlight-svg" aria-hidden="true">
      <defs>
        <mask id="tutorial-spotlight-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white"/>
          <rect class="tutorial-spotlight-cutout" x="0" y="0" width="0" height="0" rx="${SPOTLIGHT_RADIUS}" fill="black"/>
        </mask>
      </defs>
      <rect class="tutorial-backdrop" x="0" y="0" width="100%" height="100%" mask="url(#tutorial-spotlight-mask)"/>
    </svg>
    
    <div class="tutorial-panel" 
         role="dialog" 
         aria-modal="true"
         aria-labelledby="tutorial-panel-title" 
         aria-describedby="tutorial-panel-content"
         tabindex="-1">
      <div class="tutorial-arrow" aria-hidden="true"></div>
      
      <div class="tutorial-header">
        <h2 id="tutorial-panel-title" class="tutorial-title">${activeTutorial.title}</h2>
        <div class="tutorial-header-actions">
          <button class="tutorial-minimize" aria-label="Minimize tutorial" title="Minimize" type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button class="tutorial-close" aria-label="Exit tutorial (Escape)" title="Close (Esc)" type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="tutorial-body">
        <div id="tutorial-panel-content" class="tutorial-content"></div>
        <div class="tutorial-requirement" id="tutorialRequirement" role="status" aria-live="polite"></div>
      </div>
      
      <div class="tutorial-footer">
        <div class="tutorial-progress" aria-live="polite">
          Step <span id="tutorial-step-current">1</span> of <span id="tutorial-step-total">${activeTutorial.steps.length}</span>
        </div>
        <div class="tutorial-nav">
          <button class="btn btn-sm tutorial-btn-back" id="tutorialBackBtn" type="button" disabled aria-label="Previous step">← Back</button>
          <button class="btn btn-sm tutorial-btn-next" id="tutorialNextBtn" type="button" aria-label="Next step">Next →</button>
        </div>
        <details class="tutorial-keyboard-help" id="tutorialKeyboardHelp">
          <summary aria-label="Keyboard shortcuts" title="Keyboard shortcuts">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="2" y="6" width="20" height="12" rx="2"></rect>
              <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12"></path>
            </svg>
          </summary>
          <div class="tutorial-keyboard-help-content" role="note">
            <div><kbd>←</kbd>/<kbd>→</kbd> or <kbd>b</kbd>/<kbd>n</kbd> — steps</div>
            <div><kbd>Esc</kbd> — exit</div>
            <div><kbd>Home</kbd>/<kbd>End</kbd> — first/last</div>
            <div><kbd>?</kbd> — open this help</div>
          </div>
        </details>
      </div>
    </div>
    
    <div class="tutorial-minimized hidden">
      <button class="tutorial-restore" aria-label="Restore tutorial" type="button">
        <span class="tutorial-minimized-text">Tutorial</span>
        <span class="tutorial-minimized-progress">${currentStepIndex + 1}/${activeTutorial.steps.length}</span>
      </button>
    </div>
  `;

  document.body.appendChild(overlay);
  tutorialOverlay = overlay;

  // Lock body scroll
  lockBodyScroll();

  setupTutorialListeners();
  setupResizeObserver();

  // Setup focus trap and touch handlers on the panel
  const panel = tutorialOverlay.querySelector('.tutorial-panel');
  if (panel) {
    focusTrapCleanup = setupFocusTrap(panel);
    setupTouchHandlers(panel);

    // Move focus to the panel (or first focusable element)
    const firstFocusable =
      panel.querySelector('button:not(:disabled)') || panel;
    requestAnimationFrame(() => {
      firstFocusable.focus();
    });
  }

  // Setup visibility change listener for pause/resume
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Setup beforeunload to save progress
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Handle browser navigation (back/forward) during tutorial
  window.addEventListener('popstate', handlePopState);
}

/**
 * Set up event listeners for tutorial controls
 */
function setupTutorialListeners() {
  const closeBtn = tutorialOverlay.querySelector('.tutorial-close');
  const minimizeBtn = tutorialOverlay.querySelector('.tutorial-minimize');
  const restoreBtn = tutorialOverlay.querySelector('.tutorial-restore');
  const backBtn = tutorialOverlay.querySelector('#tutorialBackBtn');
  const nextBtn = tutorialOverlay.querySelector('#tutorialNextBtn');

  closeBtn?.addEventListener('click', closeTutorial);
  minimizeBtn?.addEventListener('click', toggleMinimize);
  restoreBtn?.addEventListener('click', toggleMinimize);

  backBtn?.addEventListener('click', () =>
    navigateToStep(currentStepIndex - 1)
  );
  nextBtn?.addEventListener('click', handleNextClick);

  // Click outside panel to focus target (if there is one)
  tutorialOverlay.addEventListener('click', handleOverlayClick);

  document.addEventListener('keydown', handleKeydown);
}

/**
 * Handle keyboard events
 */
function handleKeydown(e) {
  if (!tutorialOverlay) return;

  // Don't intercept keyboard shortcuts if user is typing in an input
  const activeElement = document.activeElement;
  const isTyping =
    activeElement &&
    (activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.isContentEditable);

  if (e.key === 'Escape') {
    e.preventDefault();
    closeTutorial();
  } else if (
    (e.key === 'ArrowRight' || e.key === 'n') &&
    !e.ctrlKey &&
    !e.metaKey &&
    !isTyping &&
    stepCompleted
  ) {
    e.preventDefault();
    if (currentStepIndex < activeTutorial.steps.length - 1) {
      navigateToStep(currentStepIndex + 1);
    }
  } else if (
    (e.key === 'ArrowLeft' || e.key === 'b') &&
    !e.ctrlKey &&
    !e.metaKey &&
    !isTyping
  ) {
    e.preventDefault();
    if (currentStepIndex > 0) {
      navigateToStep(currentStepIndex - 1);
    }
  } else if (e.key === 'Home' && !isTyping) {
    e.preventDefault();
    navigateToStep(0);
  } else if (e.key === 'End' && !isTyping) {
    e.preventDefault();
    navigateToStep(activeTutorial.steps.length - 1);
  } else if (e.key === '?' && !isTyping) {
    e.preventDefault();
    showKeyboardHelp();
  }
}

/**
 * Show keyboard shortcuts help dialog
 */
function showKeyboardHelp() {
  const details = tutorialOverlay?.querySelector('#tutorialKeyboardHelp');
  if (details instanceof HTMLDetailsElement) {
    details.open = true;
    const summary = details.querySelector('summary');
    summary?.focus?.();
  }
  announceToScreenReader(
    'Keyboard shortcuts help: Arrow keys or n and b to navigate steps, Home and End to jump to first or last step, Escape to exit, Question mark to show this help'
  );
}

/**
 * Handle clicks on the overlay (outside the panel)
 */
function handleOverlayClick(e) {
  const panel = tutorialOverlay.querySelector('.tutorial-panel');
  const minimized = tutorialOverlay.querySelector('.tutorial-minimized');

  // If click is outside panel and minimized button, focus the highlighted element
  if (!panel?.contains(e.target) && !minimized?.contains(e.target)) {
    const step = activeTutorial.steps[currentStepIndex];
    if (step.highlightSelector || step.targetKey) {
      const target = resolveStepTarget(step);
      if (target && typeof target.focus === 'function') {
        target.focus();
      }
    }
  }
}

/**
 * Handle Next button click
 */
function handleNextClick() {
  if (!stepCompleted) {
    announceToScreenReader('Complete the highlighted action first.');
    // Pulse the requirement text
    const reqEl = tutorialOverlay.querySelector('#tutorialRequirement');
    if (reqEl) {
      reqEl.classList.add('tutorial-requirement-pulse');
      setTimeout(
        () => reqEl.classList.remove('tutorial-requirement-pulse'),
        500
      );
    }
    return;
  }

  if (currentStepIndex < activeTutorial.steps.length - 1) {
    navigateToStep(currentStepIndex + 1);
  } else {
    // Tutorial completed
    announceToScreenReader(
      'Tutorial completed! You can now explore the application.',
      'assertive'
    );
    closeTutorial(true); // Mark as completed
  }
}

// Debounce timeout for repositioning
let repositionTimeout = null;

/**
 * Schedule a debounced reposition to prevent jank during rapid changes
 */
function scheduleReposition() {
  if (repositionTimeout) {
    cancelAnimationFrame(repositionTimeout);
  }
  repositionTimeout = requestAnimationFrame(() => {
    updateSpotlightAndPosition();
    repositionTimeout = null;
  });
}

/**
 * Handle orientation change with delay for browser reflow
 */
function handleOrientationChange() {
  // Some mobile browsers report incorrect dimensions immediately after orientation change
  // Wait for browser reflow before repositioning
  setTimeout(() => {
    if (activeTutorial) {
      const step = activeTutorial.steps[currentStepIndex];
      if (step?.showWhen && !evaluateShowWhenCondition(step.showWhen)) {
        void skipToNextValidStep(currentStepIndex, 1, 'layout changed');
        return;
      }
    }
    scheduleReposition();
  }, 100);
}

/**
 * Setup resize observer to reposition panel on window changes
 * Includes visualViewport support for zoom/keyboard/browser chrome
 */
function setupResizeObserver() {
  // ResizeObserver for body size changes (debounced)
  resizeObserver = new ResizeObserver(() => {
    if (activeTutorial && tutorialOverlay) {
      scheduleReposition();
    }
  });
  resizeObserver.observe(document.body);

  // Scroll handler (debounced)
  window.addEventListener('scroll', scheduleReposition, { passive: true });

  // visualViewport API for zoom, keyboard, and browser chrome changes
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleReposition);
    window.visualViewport.addEventListener('scroll', scheduleReposition);
  }

  // Orientation change handler with delay
  window.addEventListener('orientationchange', handleOrientationChange);

  // screen.orientation API for more reliable detection
  if (screen.orientation) {
    screen.orientation.addEventListener('change', handleOrientationChange);
  }
}

/**
 * Toggle minimized state
 */
function toggleMinimize() {
  // User-initiated toggle
  setMinimized(!isMinimized, { auto: false });
}

/**
 * Set minimized state (supports auto-minimize).
 * @param {boolean} minimized
 * @param {{auto?: boolean}} opts
 */
function setMinimized(minimized, { auto = false } = {}) {
  if (!tutorialOverlay) return;
  if (isMinimized === minimized) return;

  isMinimized = minimized;
  wasAutoMinimized = auto ? minimized : false;

  const panel = tutorialOverlay.querySelector('.tutorial-panel');
  const minimizedEl = tutorialOverlay.querySelector('.tutorial-minimized');
  const svg = tutorialOverlay.querySelector('.tutorial-spotlight-svg');

  if (isMinimized) {
    panel.classList.add('hidden');
    minimizedEl.classList.remove('hidden');
    svg.style.opacity = '0.3';
  } else {
    panel.classList.remove('hidden');
    minimizedEl.classList.add('hidden');
    svg.style.opacity = '1';
    updateSpotlightAndPosition();
  }

  announceToScreenReader(
    isMinimized ? 'Tutorial minimized' : 'Tutorial restored'
  );
}

function restoreIfAutoMinimized() {
  if (!tutorialOverlay) return;
  if (isMinimized && wasAutoMinimized) {
    setMinimized(false, { auto: true });
  }
}

/**
 * Show a specific tutorial step
 * @param {number} stepIndex - Step index
 */
async function showStep(stepIndex) {
  if (stepIndex < 0 || stepIndex >= activeTutorial.steps.length) return;

  // Clear previous state
  clearCompletionListeners();
  clearDrawerObserver();
  if (targetRemovalObserver) {
    targetRemovalObserver.disconnect();
    targetRemovalObserver = null;
  }
  currentTarget = null;

  const previousStepIndex = currentStepIndex;
  currentStepIndex = stepIndex;
  const direction = stepIndex >= previousStepIndex ? 1 : -1;
  const step = activeTutorial.steps[stepIndex];

  // Check if step should be shown based on showWhen conditions
  if (step.showWhen) {
    const shouldShow = evaluateShowWhenCondition(step.showWhen);
    if (!shouldShow) {
      const reason = isMobileViewport()
        ? 'not applicable on mobile'
        : 'not applicable on desktop';
      await skipToNextValidStep(stepIndex, direction, reason);
      return;
    }
  }

  // Execute step preconditions (ensure actions) if defined
  if (step.ensure) {
    const preconditionsOk = await ensureStepPreconditions(step);
    if (!preconditionsOk) {
      await handleStepFailure('setup failed', stepIndex, direction);
      return;
    }
  }

  // Check if this step targets an element inside the param panel
  // If so, set up drawer observer and ensure drawer is open on mobile
  if ((step.highlightSelector || step.targetKey) && isMobileViewport()) {
    // Set guard flag to prevent drawer observer from interfering during setup
    isSettingUpStep = true;

    // First try to resolve the target (even if not yet visible)
    const target = resolveStepTarget(step, { requireVisible: false });
    let needsDrawerOpen = target ? isInsideParamPanel(target) : false;

    // If no target yet but we have selectors, check if any would be inside drawer
    if (!target && step.highlightSelector) {
      const selectors = step.highlightSelector.split(',').map((s) => s.trim());
      for (const selector of selectors) {
        const query = selector.startsWith('@')
          ? `[data-tutorial-target="${selector.slice(1)}"]`
          : selector;
        const el = document.querySelector(query);
        if (el && isInsideParamPanel(el)) {
          needsDrawerOpen = true;
          break;
        }
      }
    }

    if (needsDrawerOpen) {
      // Set up observer to detect drawer closes
      setupDrawerObserver();

      // If drawer is closed, open it automatically and wait for animation
      if (!isMobileDrawerOpen()) {
        openMobileDrawer();
        await waitForTransition(document.getElementById('paramPanel'), 400);
      }
    } else {
      // Target is NOT inside the param panel, so close the drawer
      // to ensure the target element is visible (not hidden behind drawer)
      if (isMobileDrawerOpen()) {
        closeMobileDrawer();
        await waitForTransition(document.getElementById('paramPanel'), 400);
      }
    }
  }

  // Resolve target with retry (late DOM availability + visibility)
  let resolvedTarget = null;
  if (step.highlightSelector || step.targetKey) {
    resolvedTarget = await resolveTargetWithRetry(step);
    if (!resolvedTarget) {
      isSettingUpStep = false; // Clear flag before early return
      await handleStepFailure('target unavailable', stepIndex, direction);
      return;
    }
  }
  currentTarget = resolvedTarget;
  if (currentTarget) {
    const observedStepIndex = stepIndex;
    watchTargetRemoval(currentTarget, () => {
      if (!activeTutorial || currentStepIndex !== observedStepIndex) return;
      announceToScreenReader(
        'Tutorial step interrupted: element no longer available.'
      );
      currentTarget = null;
      void handleStepFailure('target removed', observedStepIndex, 1);
    });
  }

  // Update content (use compact content if viewport is small/zoomed)
  const contentEl = tutorialOverlay.querySelector('#tutorial-panel-content');
  contentEl.innerHTML = `
    <h3 class="tutorial-step-title" id="tutorial-step-title">${step.title}</h3>
    <div class="tutorial-step-content">${getStepContent(step)}</div>
  `;

  // Update progress
  tutorialOverlay.querySelector('#tutorial-step-current').textContent =
    stepIndex + 1;
  tutorialOverlay.querySelector('.tutorial-minimized-progress').textContent =
    `${stepIndex + 1}/${activeTutorial.steps.length}`;
  tutorialOverlay.querySelector('.tutorial-minimized-text').textContent =
    step.autoMinimize ? 'Explore the modal' : 'Tutorial';

  // Update buttons
  const backBtn = tutorialOverlay.querySelector('#tutorialBackBtn');
  const nextBtn = tutorialOverlay.querySelector('#tutorialNextBtn');

  backBtn.disabled = stepIndex === 0;
  nextBtn.textContent =
    stepIndex === activeTutorial.steps.length - 1 ? 'Finish ✓' : 'Next →';

  // Setup completion gate
  setupCompletion(step);

  // Update spotlight and position
  updateSpotlightAndPosition();

  // Auto-minimize if requested (useful for modal overlays)
  if (step.autoMinimize && !isMinimized) {
    toggleMinimize();
  } else if (!step.autoMinimize && isMinimized) {
    // Restore if was minimized and current step doesn't need minimization
    toggleMinimize();
  }

  // Save progress to sessionStorage
  saveTutorialProgress(stepIndex);

  // Reset failure count on successful step display
  consecutiveFailures = 0;

  // Clear the guard flag - step setup is complete, drawer observer can now work
  isSettingUpStep = false;

  // Announce to screen readers
  announceToScreenReader(
    `Step ${stepIndex + 1} of ${activeTutorial.steps.length}: ${step.title}`
  );
}

/**
 * Update spotlight cutout and panel position
 */
function updateSpotlightAndPosition() {
  if (!tutorialOverlay || isMinimized) return;

  const step = activeTutorial.steps[currentStepIndex];
  const panel = tutorialOverlay.querySelector('.tutorial-panel');
  const arrow = tutorialOverlay.querySelector('.tutorial-arrow');
  const cutout = tutorialOverlay.querySelector('.tutorial-spotlight-cutout');

  // Clear previous highlight
  document.querySelectorAll('.tutorial-target-highlight').forEach((el) => {
    el.classList.remove('tutorial-target-highlight');
  });

  // Clear previous scroll locks
  document.querySelectorAll('.tutorial-scroll-locked').forEach((el) => {
    el.classList.remove('tutorial-scroll-locked');
  });

  if (
    (!step.highlightSelector && !step.targetKey) ||
    step.position === 'center'
  ) {
    // No highlight - center the panel, hide spotlight
    cutout.setAttribute('width', '0');
    cutout.setAttribute('height', '0');
    panel.style.position = 'fixed';
    panel.style.top = '50%';
    panel.style.left = '50%';
    // Clear any docked constraints from mobile CSS so centering is reliable
    panel.style.right = '';
    panel.style.bottom = '';
    panel.style.transform = 'translate(-50%, -50%)';
    panel.classList.remove('tutorial-panel-positioned');
    arrow.style.display = 'none';
    currentTarget = null;
    return;
  }

  // Find the first *visible* target element using comprehensive visibility check
  // Supports both targetKey (data-tutorial-target) and legacy selectors
  let target = currentTarget;
  if (!target || !document.contains(target) || !isElementVisible(target)) {
    target = resolveStepTarget(step);
    currentTarget = target;
  }

  if (!target) {
    // Target not found - center panel
    cutout.setAttribute('width', '0');
    cutout.setAttribute('height', '0');
    panel.style.position = 'fixed';
    panel.style.top = '50%';
    panel.style.left = '50%';
    panel.style.transform = 'translate(-50%, -50%)';
    panel.classList.remove('tutorial-panel-positioned');
    arrow.style.display = 'none';
    return;
  }

  // Add highlight class to target
  target.classList.add('tutorial-target-highlight');
  adjustTutorialZIndex(target);
  // Note: We intentionally apply scroll locking *after* we ensure the target
  // is visible. Otherwise, `overflow: hidden` can prevent our own programmatic
  // scrolling and leave the highlighted control under fixed UI (mobile actions bar).

  // Get effective viewport dimensions (zoom-safe)
  const viewport = getEffectiveViewport();

  /**
   * On mobile, the bottom actions/camera bar is fixed and can cover content
   * (including elements inside the Parameters drawer). Treat that area as
   * "not visible" for spotlight interactions.
   */
  const getEffectiveViewportBottom = () => {
    // Default: use visualViewport height for zoom-safe calculations
    let bottom = viewport.height;

    // Mobile actions bar is fixed at the bottom and can overlap the Parameters drawer.
    const actionsBar = document.getElementById('actionsBar');
    if (actionsBar) {
      // If the highlighted element is *inside* the fixed actions bar (e.g. Actions/Camera
      // toggles), treat the full viewport as usable so we don't consider the target "hidden"
      // behind itself. Otherwise the spotlight can get stuck on the previous step's cutout.
      if (actionsBar.contains(target)) {
        return viewport.height;
      }

      const style = window.getComputedStyle(actionsBar);
      const rect = actionsBar.getBoundingClientRect();
      if (
        style.position === 'fixed' &&
        rect.height > 0 &&
        rect.top >= 0 &&
        rect.top < viewport.height
      ) {
        bottom = Math.min(bottom, rect.top);
      }
    }

    // Small padding so the highlighted control isn't flush against the bar.
    return Math.max(0, bottom - 8);
  };

  // Scroll target into view if needed
  const targetRect = target.getBoundingClientRect();
  const effectiveBottom = getEffectiveViewportBottom();
  const isVisible =
    targetRect.top >= 0 &&
    targetRect.bottom <= effectiveBottom &&
    targetRect.left >= 0 &&
    targetRect.right <= viewport.width;

  if (!isVisible) {
    const scrollableParent = findScrollableParent(target);
    const deltaDown = targetRect.bottom - effectiveBottom;
    const topPadding = 16;

    // Prefer adjusting the nearest scrollable parent so we can account for
    // fixed UI overlays (like the mobile actions bar).
    if (scrollableParent && typeof scrollableParent.scrollBy === 'function') {
      if (deltaDown > 0) {
        scrollableParent.scrollBy({
          top: deltaDown + topPadding,
          behavior: 'smooth',
        });
      } else if (targetRect.top < topPadding) {
        scrollableParent.scrollBy({
          top: targetRect.top - topPadding,
          behavior: 'smooth',
        });
      } else {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center',
        });
      }
    } else if (typeof window.scrollBy === 'function') {
      if (deltaDown > 0) {
        window.scrollBy({ top: deltaDown + topPadding, behavior: 'smooth' });
      } else if (targetRect.top < topPadding) {
        window.scrollBy({
          top: targetRect.top - topPadding,
          behavior: 'smooth',
        });
      } else {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center',
        });
      }
    } else {
      // Fallback for older environments
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      });
    }

    // Wait for scroll to complete before positioning
    setTimeout(() => updateSpotlightAndPosition(), 350);
    return;
  }

  // Get target bounds
  const rect = target.getBoundingClientRect();

  // Lock scrolling on parent scrollable container if requested (after scrolling)
  if (step.lockScroll) {
    const scrollableParent = findScrollableParent(target);
    if (scrollableParent) {
      scrollableParent.classList.add('tutorial-scroll-locked');
    }
  }

  // Update spotlight cutout
  cutout.setAttribute('x', rect.left - SPOTLIGHT_PADDING);
  cutout.setAttribute('y', rect.top - SPOTLIGHT_PADDING);
  cutout.setAttribute('width', rect.width + SPOTLIGHT_PADDING * 2);
  cutout.setAttribute('height', rect.height + SPOTLIGHT_PADDING * 2);

  // -------------------------------------------------------------------------
  // Mobile behavior: dock panel to top/bottom to avoid covering targets.
  // - Target near bottom → dock panel to TOP
  // - Target near top → dock panel to BOTTOM
  // If docking still blocks the target, auto-minimize (only for steps that
  // require the user to interact with the highlighted control).
  // -------------------------------------------------------------------------
  if (isMobileViewport()) {
    const safeAreas = measureSafeAreaInsets();
    const requiresUserInteraction = !!step.completion;

    const actionsBar = document.getElementById('actionsBar');
    const actionsBarRect = actionsBar?.getBoundingClientRect?.();
    const actionsBarHeight =
      actionsBarRect && window.getComputedStyle(actionsBar).position === 'fixed'
        ? Math.max(0, actionsBarRect.height || 0)
        : 0;

    const topOffset = Math.max(8, safeAreas.top + 8);
    const bottomOffset = Math.max(8, safeAreas.bottom + actionsBarHeight + 8);

    const intersects = (a, b, pad = 6) => {
      return !(
        a.right < b.left - pad ||
        a.left > b.right + pad ||
        a.bottom < b.top - pad ||
        a.top > b.bottom + pad
      );
    };

    const overlapArea = (a, b) => {
      const left = Math.max(a.left, b.left);
      const right = Math.min(a.right, b.right);
      const top = Math.max(a.top, b.top);
      const bottom = Math.min(a.bottom, b.bottom);
      const w = Math.max(0, right - left);
      const h = Math.max(0, bottom - top);
      return w * h;
    };

    const isBlockedAtCenter = () => {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const topEl = document.elementFromPoint(cx, cy);
      return !!topEl && (panel.contains(topEl) || topEl === panel);
    };

    const dock = (side) => {
      // Compact floating bubble (not full-width sheet) for portrait usability.
      panel.style.position = 'fixed';
      panel.style.left = '50%';
      panel.style.right = '';
      panel.style.transform = 'translateX(-50%)';
      panel.style.width = 'min(94vw, 360px)';
      panel.style.maxWidth = '';

      if (side === 'top') {
        panel.style.top = `${viewport.offsetTop + topOffset}px`;
        panel.style.bottom = '';
      } else {
        panel.style.bottom = `${bottomOffset}px`;
        panel.style.top = '';
      }

      // Constrain height so it doesn't eat the whole screen.
      const available = Math.max(
        160,
        viewport.height - topOffset - bottomOffset - 16
      );
      panel.style.maxHeight = `${Math.min(available, viewport.height * 0.45)}px`;

      panel.classList.add('tutorial-panel-positioned');
      arrow.style.display = 'none';
    };

    const targetCenterY = rect.top + rect.height / 2;
    const preferTop = targetCenterY > viewport.height * 0.6;
    const first = preferTop ? 'top' : 'bottom';
    const second = preferTop ? 'bottom' : 'top';

    dock(first);
    const pr1 = panel.getBoundingClientRect();
    if (intersects(pr1, rect) || isBlockedAtCenter()) {
      dock(second);
      const pr2 = panel.getBoundingClientRect();
      if (intersects(pr2, rect) || isBlockedAtCenter()) {
        // If the highlighted target is a large region (e.g. preview container),
        // it may be impossible to avoid overlap. Only auto-minimize when the
        // current step is gating progress on a required interaction.
        if (requiresUserInteraction) {
          // Last resort: auto-minimize so the user can tap the target.
          setMinimized(true, { auto: true });
          return;
        }

        // Non-interactive step: keep the panel visible, choosing the docked
        // side that minimizes overlap with the target.
        const a1 = overlapArea(pr1, rect);
        const a2 = overlapArea(pr2, rect);
        if (a1 < a2) {
          dock(first);
        }
        restoreIfAutoMinimized();
        return;
      }
    }

    // If we were auto-minimized on the previous step but this step fits, restore.
    restoreIfAutoMinimized();
    return;
  }

  // Measure actual panel dimensions for accurate positioning
  applyZoomAdjustments(panel);

  // Clear any mobile docking overrides
  panel.style.width = '';
  panel.style.maxHeight = '';
  const panelRect = panel.getBoundingClientRect();

  // Calculate best position for panel using measured dimensions
  const position = calculateBestPosition(rect, step.position, panelRect);
  positionPanel(panel, arrow, rect, position);
  panel.classList.add('tutorial-panel-positioned');

  // Desktop/tablet: keep arrow enabled as-is (no further changes).
}

/**
 * Get effective viewport dimensions accounting for visualViewport API
 * Handles mobile zoom, on-screen keyboard, and browser chrome changes
 * @returns {{width: number, height: number, offsetTop: number, offsetLeft: number, scale: number}}
 */
function getEffectiveViewport() {
  // Use visualViewport API if available (handles zoom, keyboard, browser chrome)
  if (window.visualViewport) {
    return {
      width: window.visualViewport.width,
      height: window.visualViewport.height,
      offsetTop: window.visualViewport.offsetTop,
      offsetLeft: window.visualViewport.offsetLeft,
      scale: window.visualViewport.scale,
    };
  }

  // Fallback to window dimensions
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    offsetTop: 0,
    offsetLeft: 0,
    scale: 1,
  };
}

/**
 * Adjust panel sizing for high zoom levels
 * @param {HTMLElement} panel - Tutorial panel element
 */
function applyZoomAdjustments(panel) {
  if (!panel) return;
  const zoom = window.visualViewport?.scale || 1;
  if (zoom > 1.5) {
    panel.style.maxWidth = '280px';
  } else {
    panel.style.maxWidth = '';
  }
}

/**
 * Measure safe area insets for notched devices via CSS env() variables
 * @returns {{top: number, right: number, bottom: number, left: number}}
 */
function measureSafeAreaInsets() {
  // Create a test element to measure CSS env() values
  const testEl = document.createElement('div');
  testEl.style.cssText = `
    position: fixed;
    top: env(safe-area-inset-top, 0px);
    right: env(safe-area-inset-right, 0px);
    bottom: env(safe-area-inset-bottom, 0px);
    left: env(safe-area-inset-left, 0px);
    pointer-events: none;
    visibility: hidden;
    width: 1px;
    height: 1px;
  `;
  document.body.appendChild(testEl);
  const rect = testEl.getBoundingClientRect();
  document.body.removeChild(testEl);

  return {
    top: rect.top,
    right: window.innerWidth - rect.right,
    bottom: window.innerHeight - rect.bottom,
    left: rect.left,
  };
}

/**
 * Calculate best position for panel relative to target
 * Uses measured panel dimensions instead of fixed constants
 * @param {DOMRect} targetRect - Target element bounds
 * @param {string} preferred - Preferred position
 * @param {DOMRect} panelRect - Measured panel dimensions
 * @returns {string} - Position: 'top', 'bottom', 'left', 'right'
 */
function calculateBestPosition(targetRect, preferred, panelRect) {
  const panelWidth = panelRect?.width || 340;
  const panelHeight = panelRect?.height || 250;

  // Use effective viewport (handles zoom, keyboard, browser chrome)
  const viewport = getEffectiveViewport();
  const safeAreas = measureSafeAreaInsets();

  // Calculate available space accounting for safe areas
  const viewportTop = viewport.offsetTop;
  const viewportBottom = viewport.offsetTop + viewport.height;
  const viewportLeft = viewport.offsetLeft;
  const viewportRight = viewport.offsetLeft + viewport.width;

  const space = {
    top: targetRect.top - (viewportTop + safeAreas.top),
    bottom: viewportBottom - targetRect.bottom - safeAreas.bottom,
    left: targetRect.left - (viewportLeft + safeAreas.left),
    right: viewportRight - targetRect.right - safeAreas.right,
  };

  // If preferred position has enough space, use it
  if (preferred && preferred !== 'auto') {
    const minSpace =
      preferred === 'top' || preferred === 'bottom'
        ? panelHeight + PANEL_OFFSET
        : panelWidth + PANEL_OFFSET;
    if (space[preferred] >= minSpace) {
      return preferred;
    }
  }

  // Find best position with most space
  const positions = [
    { pos: 'bottom', space: space.bottom, needed: panelHeight + PANEL_OFFSET },
    { pos: 'top', space: space.top, needed: panelHeight + PANEL_OFFSET },
    { pos: 'right', space: space.right, needed: panelWidth + PANEL_OFFSET },
    { pos: 'left', space: space.left, needed: panelWidth + PANEL_OFFSET },
  ];

  // Prefer positions with enough space, sorted by available space
  const viable = positions.filter((p) => p.space >= p.needed);
  if (viable.length > 0) {
    return viable.sort((a, b) => b.space - a.space)[0].pos;
  }

  // Fallback: use position with most space
  return positions.sort((a, b) => b.space - a.space)[0].pos;
}

/**
 * Position the panel and arrow relative to target
 * Uses visualViewport and safe area insets for robust positioning
 * @param {HTMLElement} panel - Tutorial panel
 * @param {HTMLElement} arrow - Arrow element
 * @param {DOMRect} targetRect - Target bounds
 * @param {string} position - Position
 */
function positionPanel(panel, arrow, targetRect, position) {
  const panelRect = panel.getBoundingClientRect();
  const viewport = getEffectiveViewport();
  const safeAreas = measureSafeAreaInsets();

  // Calculate margins including safe areas
  const marginTop = Math.max(16, safeAreas.top);
  const marginBottom = Math.max(16, safeAreas.bottom);
  const marginLeft = Math.max(16, safeAreas.left);
  const marginRight = Math.max(16, safeAreas.right);
  const viewportTop = viewport.offsetTop;
  const viewportBottom = viewport.offsetTop + viewport.height;
  const viewportLeft = viewport.offsetLeft;
  const viewportRight = viewport.offsetLeft + viewport.width;

  let top, left;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;

  // Reset transforms
  panel.style.transform = '';

  // Arrow position constraints - keep within panel bounds
  const minArrowOffset = 20;
  const maxArrowOffsetX = Math.max(minArrowOffset, panelRect.width - 40);
  const maxArrowOffsetY = Math.max(minArrowOffset, panelRect.height - 40);

  switch (position) {
    case 'top':
      top =
        targetRect.top - panelRect.height - PANEL_OFFSET - SPOTLIGHT_PADDING;
      left = Math.max(
        viewportLeft + marginLeft,
        Math.min(
          targetCenterX - panelRect.width / 2,
          viewportRight - panelRect.width - marginRight
        )
      );
      arrow.className = 'tutorial-arrow tutorial-arrow-bottom';
      arrow.style.left = `${Math.min(Math.max(targetCenterX - left - 8, minArrowOffset), maxArrowOffsetX)}px`;
      arrow.style.top = '';
      break;

    case 'bottom':
      top = targetRect.bottom + PANEL_OFFSET + SPOTLIGHT_PADDING;
      left = Math.max(
        viewportLeft + marginLeft,
        Math.min(
          targetCenterX - panelRect.width / 2,
          viewportRight - panelRect.width - marginRight
        )
      );
      arrow.className = 'tutorial-arrow tutorial-arrow-top';
      arrow.style.left = `${Math.min(Math.max(targetCenterX - left - 8, minArrowOffset), maxArrowOffsetX)}px`;
      arrow.style.top = '';
      break;

    case 'left':
      left =
        targetRect.left - panelRect.width - PANEL_OFFSET - SPOTLIGHT_PADDING;
      top = Math.max(
        viewportTop + marginTop,
        Math.min(
          targetCenterY - panelRect.height / 2,
          viewportBottom - panelRect.height - marginBottom
        )
      );
      arrow.className = 'tutorial-arrow tutorial-arrow-right';
      arrow.style.top = `${Math.min(Math.max(targetCenterY - top - 8, minArrowOffset), maxArrowOffsetY)}px`;
      arrow.style.left = '';
      break;

    case 'right':
      left = targetRect.right + PANEL_OFFSET + SPOTLIGHT_PADDING;
      top = Math.max(
        viewportTop + marginTop,
        Math.min(
          targetCenterY - panelRect.height / 2,
          viewportBottom - panelRect.height - marginBottom
        )
      );
      arrow.className = 'tutorial-arrow tutorial-arrow-left';
      arrow.style.top = `${Math.min(Math.max(targetCenterY - top - 8, minArrowOffset), maxArrowOffsetY)}px`;
      arrow.style.left = '';
      break;
  }

  // Clamp to effective viewport with safe area margins
  top = Math.max(
    viewportTop + marginTop,
    Math.min(top, viewportBottom - panelRect.height - marginBottom)
  );
  left = Math.max(
    viewportLeft + marginLeft,
    Math.min(left, viewportRight - panelRect.width - marginRight)
  );

  panel.style.position = 'fixed';
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  arrow.style.display = 'block';
}

/**
 * Adjust tutorial z-index when targeting elements with high stacking contexts
 * @param {HTMLElement} targetElement - Target element
 */
function adjustTutorialZIndex(targetElement) {
  if (!tutorialOverlay || !targetElement) return;

  const rootStyles = getComputedStyle(document.documentElement);
  const baseBackdrop =
    parseInt(rootStyles.getPropertyValue('--z-index-tutorial-backdrop'), 10) ||
    9998;

  let maxZ = 0;
  const collectZ = (el) => {
    const zIndex = parseInt(getComputedStyle(el).zIndex, 10);
    if (!Number.isNaN(zIndex)) {
      maxZ = Math.max(maxZ, zIndex);
    }
  };

  collectZ(targetElement);
  let parent = targetElement.parentElement;
  while (parent && parent !== document.body) {
    collectZ(parent);
    parent = parent.parentElement;
  }

  if (maxZ >= baseBackdrop) {
    tutorialOverlay.style.setProperty(
      '--z-index-tutorial-backdrop',
      String(maxZ + 1)
    );
    tutorialOverlay.style.setProperty(
      '--z-index-tutorial-spotlight',
      String(maxZ + 2)
    );
    tutorialOverlay.style.setProperty(
      '--z-index-tutorial-panel',
      String(maxZ + 3)
    );
    tutorialOverlay.style.setProperty(
      '--z-index-tutorial-minimized',
      String(maxZ + 3)
    );
  } else {
    tutorialOverlay.style.removeProperty('--z-index-tutorial-backdrop');
    tutorialOverlay.style.removeProperty('--z-index-tutorial-spotlight');
    tutorialOverlay.style.removeProperty('--z-index-tutorial-panel');
    tutorialOverlay.style.removeProperty('--z-index-tutorial-minimized');
  }
}

/**
 * Setup step completion gating
 * @param {TutorialStep} step
 */
function setupCompletion(step) {
  const requirementEl = tutorialOverlay?.querySelector('#tutorialRequirement');
  const nextBtn = tutorialOverlay?.querySelector('#tutorialNextBtn');

  if (!requirementEl || !nextBtn) return;

  stepCompleted = !step.completion;

  if (step.completion) {
    requirementEl.textContent = '↑ Complete the action above to continue';
    requirementEl.classList.remove('tutorial-requirement-done');
  } else {
    requirementEl.textContent = '';
  }

  nextBtn.disabled = !stepCompleted;
  nextBtn.setAttribute('aria-disabled', String(!stepCompleted));

  if (!step.completion) return;

  const { type, selector, event, trigger } = step.completion;

  if (type === 'detailsOpen') {
    attachDetailsOpenListener(selector);
  } else if (type === 'domEvent') {
    attachCompletionListener({ selector, event, predicate: null });
  } else if (type === 'modalOpen') {
    // Watch for modal to become visible (lose 'hidden' class)
    attachModalOpenListener(selector, trigger);
  } else if (type === 'modalClose') {
    // Watch for modal to become hidden (gain 'hidden' class)
    attachModalCloseListener(selector);
  }
}

/**
 * Attach a completion listener
 */
function attachCompletionListener({ selector, event, predicate }) {
  const requirementEl = tutorialOverlay?.querySelector('#tutorialRequirement');
  const nextBtn = tutorialOverlay?.querySelector('#tutorialNextBtn');
  if (!requirementEl || !nextBtn) return;

  // Support selector lists like "#a, #b" and tolerate missing nodes.
  // For detailsOpen we may want to watch either the actual <details> node
  // or a wrapper; find the first matching element.
  const target = document.querySelector(selector);
  if (!target) {
    // Wait for element to appear
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        attachCompletionListener({ selector, event, predicate });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    completionListeners.push({ observer });
    return;
  }

  const handler = () => {
    if (predicate && !predicate(target)) return;

    stepCompleted = true;
    nextBtn.disabled = false;
    nextBtn.setAttribute('aria-disabled', 'false');
    requirementEl.textContent = '✓ Done! Click Next to continue';
    requirementEl.classList.add('tutorial-requirement-done');
    announceToScreenReader('Action completed. Next enabled.');
    // If we auto-minimized to let the user interact, bring the panel back.
    setTimeout(() => restoreIfAutoMinimized(), 250);

    target.removeEventListener(event, handler, true);
    completionListeners = completionListeners.filter(
      (l) => l.handler !== handler
    );
  };

  target.addEventListener(event, handler, true);
  completionListeners.push({ element: target, event, handler });
}

/**
 * Attach a completion listener for a <details> element, even when the selector
 * points at a wrapper element containing the <details>.
 */
function attachDetailsOpenListener(selector) {
  const requirementEl = tutorialOverlay?.querySelector('#tutorialRequirement');
  const nextBtn = tutorialOverlay?.querySelector('#tutorialNextBtn');
  if (!requirementEl || !nextBtn) return;

  const resolveDetails = () => {
    // Selector may be a list; pick the first element we can resolve to a <details>.
    const el = document.querySelector(selector);
    if (!el) return null;
    if (el instanceof HTMLDetailsElement) return el;
    return el.querySelector?.('details') instanceof HTMLDetailsElement
      ? el.querySelector('details')
      : null;
  };

  const details = resolveDetails();
  if (!details) {
    const observer = new MutationObserver(() => {
      const d = resolveDetails();
      if (d) {
        observer.disconnect();
        attachDetailsOpenListener(selector);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    completionListeners.push({ observer });
    return;
  }

  const handler = () => {
    if (!details.open) return;
    stepCompleted = true;
    nextBtn.disabled = false;
    nextBtn.setAttribute('aria-disabled', 'false');
    requirementEl.textContent = '✓ Done! Click Next to continue';
    requirementEl.classList.add('tutorial-requirement-done');
    announceToScreenReader('Action completed. Next enabled.');
    setTimeout(() => restoreIfAutoMinimized(), 250);

    details.removeEventListener('toggle', handler, true);
    completionListeners = completionListeners.filter(
      (l) => l.handler !== handler
    );
  };

  details.addEventListener('toggle', handler, true);
  completionListeners.push({ element: details, event: 'toggle', handler });

  // If it's already open (or was toggled before we attached), mark complete immediately.
  if (details.open) {
    handler();
  }
}

/**
 * Attach a modal open listener using MutationObserver
 */
function attachModalOpenListener(modalSelector, triggerSelector) {
  const requirementEl = tutorialOverlay?.querySelector('#tutorialRequirement');
  const nextBtn = tutorialOverlay?.querySelector('#tutorialNextBtn');
  if (!requirementEl || !nextBtn) return;

  const modal = document.querySelector(modalSelector);
  if (!modal) {
    console.warn(`Modal not found: ${modalSelector}`);
    return;
  }

  // Also set up click listener on trigger button to ensure it opens
  const triggerBtn = document.querySelector(triggerSelector);
  if (triggerBtn) {
    const clickHandler = () => {
      // Give modal time to open
      setTimeout(() => {
        if (!modal.classList.contains('hidden')) {
          markStepComplete();
        }
      }, 100);
    };
    triggerBtn.addEventListener('click', clickHandler, true);
    completionListeners.push({
      element: triggerBtn,
      event: 'click',
      handler: clickHandler,
    });
  }

  // Watch for class changes on modal
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        if (!modal.classList.contains('hidden')) {
          markStepComplete();
          observer.disconnect();
        }
      }
    });
  });

  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  completionListeners.push({ observer });

  function markStepComplete() {
    stepCompleted = true;
    nextBtn.disabled = false;
    nextBtn.setAttribute('aria-disabled', 'false');
    requirementEl.textContent = '✓ Done! Click Next to continue';
    requirementEl.classList.add('tutorial-requirement-done');
    announceToScreenReader('Help opened. Next enabled.');

    // Auto-advance to show the modal
    setTimeout(() => {
      if (stepCompleted && currentStepIndex < activeTutorial.steps.length - 1) {
        showStep(currentStepIndex + 1);
      }
    }, 800);
  }
}

/**
 * Attach a modal close listener using MutationObserver
 */
function attachModalCloseListener(modalSelector) {
  const requirementEl = tutorialOverlay?.querySelector('#tutorialRequirement');
  const nextBtn = tutorialOverlay?.querySelector('#tutorialNextBtn');
  if (!requirementEl || !nextBtn) return;

  const modal = document.querySelector(modalSelector);
  if (!modal) {
    console.warn(`Modal not found: ${modalSelector}`);
    return;
  }

  // Watch for class changes on modal
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        if (modal.classList.contains('hidden')) {
          stepCompleted = true;
          nextBtn.disabled = false;
          nextBtn.setAttribute('aria-disabled', 'false');
          requirementEl.textContent = '✓ Done! Click Next to continue';
          requirementEl.classList.add('tutorial-requirement-done');
          announceToScreenReader('Help closed. Next enabled.');
          observer.disconnect();
        }
      }
    });
  });

  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  completionListeners.push({ observer });
}

/**
 * Clear all completion listeners
 */
function clearCompletionListeners() {
  completionListeners.forEach(({ element, event, handler, observer }) => {
    if (observer) {
      observer.disconnect();
    } else if (element && handler) {
      element.removeEventListener(event, handler, true);
    }
  });
  completionListeners = [];
  stepCompleted = true;
}

/**
 * Close the tutorial and clean up
 * @param {boolean} completed - Whether tutorial was completed (vs cancelled)
 */
export function closeTutorial(completed = false) {
  if (!tutorialOverlay) return;

  clearCompletionListeners();
  clearDrawerObserver();

  // Clean up focus trap
  if (focusTrapCleanup) {
    focusTrapCleanup();
    focusTrapCleanup = null;
  }

  // Clean up target removal observer
  if (targetRemovalObserver) {
    targetRemovalObserver.disconnect();
    targetRemovalObserver = null;
  }

  // Remove highlight from any targeted elements
  document.querySelectorAll('.tutorial-target-highlight').forEach((el) => {
    el.classList.remove('tutorial-target-highlight');
  });

  // Remove scroll locks
  document.querySelectorAll('.tutorial-scroll-locked').forEach((el) => {
    el.classList.remove('tutorial-scroll-locked');
  });

  // Unlock body scroll
  unlockBodyScroll();

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  // Clear debounce timeout
  if (repositionTimeout) {
    cancelAnimationFrame(repositionTimeout);
    repositionTimeout = null;
  }

  // Remove all event listeners
  window.removeEventListener('scroll', scheduleReposition);
  window.removeEventListener('orientationchange', handleOrientationChange);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  window.removeEventListener('popstate', handlePopState);
  document.removeEventListener('visibilitychange', handleVisibilityChange);

  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', scheduleReposition);
    window.visualViewport.removeEventListener('scroll', scheduleReposition);
  }

  if (screen.orientation) {
    screen.orientation.removeEventListener('change', handleOrientationChange);
  }

  document.removeEventListener('keydown', handleKeydown);

  tutorialOverlay.remove();
  tutorialOverlay = null;

  // Store step info for announcement before clearing
  const stepsTotal = activeTutorial?.steps?.length || 0;
  const currentStep = currentStepIndex + 1;

  // Clear or keep progress based on completion
  if (completed) {
    clearTutorialProgress();
  }

  // Restore focus to the element that had focus before tutorial started
  // Use requestAnimationFrame to ensure DOM has settled after overlay removal
  requestAnimationFrame(() => {
    let focusRestored = false;

    // First try: previousFocus (the element that had focus when tutorial started)
    if (previousFocus && document.contains(previousFocus)) {
      const style = window.getComputedStyle(previousFocus);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        previousFocus.focus();
        focusRestored = true;
      }
    }

    // Second try: triggerElement (the element that triggered the tutorial)
    if (!focusRestored && triggerElement && document.contains(triggerElement)) {
      const triggerStyle = window.getComputedStyle(triggerElement);
      if (
        triggerStyle.display !== 'none' &&
        triggerStyle.visibility !== 'hidden'
      ) {
        triggerElement.focus();
        focusRestored = true;
      }
    }

    // Fallback: focus a visible, focusable element
    if (!focusRestored) {
      const fallbackTargets = [
        '#primaryActionBtn:not([disabled])',
        '#parametersContainer button:not([disabled])',
        '#featuresGuideBtn',
        '#clearFileBtn',
        '.param-control input:not([disabled])',
        '.param-control select:not([disabled])',
        '.btn-primary:not([disabled])',
        '#main-content',
      ];

      for (const selector of fallbackTargets) {
        const el = document.querySelector(selector);
        if (el && typeof el.focus === 'function') {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            el.focus();
            focusRestored = true;
            break;
          }
        }
      }
    }

    // Last resort: focus body to at least have something focused
    if (!focusRestored) {
      document.body.focus();
    }
  });

  previousFocus = null;
  triggerElement = null;

  activeTutorial = null;
  currentStepIndex = 0;
  isMinimized = false;
  currentTarget = null;
  consecutiveFailures = 0;

  announceToScreenReader(
    `Tutorial closed at step ${currentStep} of ${stepsTotal}.`
  );
}

/**
 * Check if a tutorial is currently active
 * @returns {boolean}
 */
export function isTutorialActive() {
  return !!activeTutorial;
}

/**
 * Get the current tutorial ID
 * @returns {string|null}
 */
export function getCurrentTutorialId() {
  return activeTutorial ? activeTutorial.id : null;
}

/**
 * Announce a message to screen readers
 * @param {string} message - Message to announce
 */
/**
 * Announce message to screen readers with optional politeness control
 * @param {string} message - Message to announce
 * @param {string} politeness - 'polite' (default) or 'assertive'
 */
function announceToScreenReader(message, politeness = 'polite') {
  const announcer = document.getElementById('srAnnouncer');
  if (announcer) {
    announcer.setAttribute('aria-live', politeness);
    announcer.textContent = message;

    // Clear after announcement is read
    setTimeout(() => {
      announcer.textContent = '';
    }, 1000);
  }
}
