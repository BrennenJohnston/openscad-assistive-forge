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
let completionListeners = [];
let stepCompleted = true;
let resizeObserver = null;
let isMinimized = false;

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
 * Tutorial definitions - Streamlined content for better UX
 */
const TUTORIALS = {
  educators: {
    id: 'educators',
    title: 'Educator Quick Start',
    steps: [
      {
        title: 'Welcome!',
        content: `
          <p>This 2-minute tour shows you how to:</p>
          <ul>
            <li>Customize parameters</li>
            <li>Save presets for reuse</li>
            <li>Generate 3D files</li>
          </ul>
          <p class="tutorial-hint">Press <kbd>Esc</kbd> to exit anytime.</p>
        `,
        position: 'center',
      },
      {
        title: 'Adjust Parameters',
        content: `
          <p><strong>Try it:</strong> Change the <strong>Width</strong> value and watch the preview update.</p>
          <p class="tutorial-hint">Use the slider or type a number.</p>
        `,
        highlightSelector:
          '.param-control[data-param-name="width"], #param-width',
        position: 'right',
        lockScroll: true,
        completion: {
          type: 'domEvent',
          selector: '#param-width',
          event: 'input',
        },
      },
      {
        title: 'See the Preview',
        content: `
          <p>Great! The preview panel now shows your updated model.</p>
          <p class="tutorial-hint">The 3D preview updates automatically as you adjust parameters.</p>
        `,
        highlightSelector: '#previewContainer',
        position: 'left',
      },
      {
        title: 'Save Presets',
        content: `
          <p>Click <strong>Presets</strong> to save your current configuration for later.</p>
          <p class="tutorial-hint">Great for classroom demonstrations!</p>
        `,
        highlightSelector: '#presetControls',
        position: 'right',
        completion: { type: 'detailsOpen', selector: '#presetControls' },
      },
      {
        title: 'Generate Your Model',
        content: `
          <p>Click <strong>Generate STL</strong> to create your 3D file.</p>
          <p class="tutorial-hint">The file downloads automatically.</p>
        `,
        highlightSelector: '#primaryActionBtn',
        position: 'top',
        completion: {
          type: 'domEvent',
          selector: '#primaryActionBtn',
          event: 'click',
        },
      },
      {
        title: 'Get Help',
        content: `
          <p>Click the <strong>Help button</strong> for detailed documentation and examples.</p>
          <p class="tutorial-hint">Click it now to see the features guide.</p>
        `,
        highlightSelector: '#featuresGuideBtn',
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
          <p>The <strong>Features Guide</strong> has everything you need:</p>
          <ul>
            <li>Library documentation</li>
            <li>Example files</li>
            <li>Keyboard shortcuts</li>
          </ul>
          <p class="tutorial-hint">Close it to continue the tutorial.</p>
        `,
        highlightSelector: '#featuresGuideModal',
        position: 'center',
        autoMinimize: true,
        completion: { type: 'modalClose', selector: '#featuresGuideModal' },
      },
      {
        title: "You're Ready!",
        content: `
          <p>You can now demonstrate 3D customization to your students.</p>
          <p><strong>Next steps:</strong></p>
          <ul>
            <li>Try different examples</li>
            <li>Upload your own .scad files</li>
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
        highlightSelector: '#libraryControls',
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
        highlightSelector: '#clearFileBtn',
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
        highlightSelector: '#outputFormat',
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
        highlightSelector: '#contrastToggle',
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
        highlightSelector: '#themeToggle',
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
        highlightSelector: '.actions',
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
        highlightSelector: '#parametersContainer',
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
          selector: '#param-width',
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
        highlightSelector: '#featuresGuideBtn',
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

/**
 * Start a tutorial
 * @param {string} tutorialId - Tutorial identifier
 * @param {Object} options - Options
 * @param {HTMLElement} [options.triggerEl] - Element that triggered the tutorial
 */
export function startTutorial(tutorialId, { triggerEl } = {}) {
  const tutorial = TUTORIALS[tutorialId];
  if (!tutorial) {
    console.warn(`Tutorial "${tutorialId}" not found`);
    return;
  }

  triggerElement = triggerEl || null;
  activeTutorial = tutorial;
  currentStepIndex = 0;
  isMinimized = false;

  createTutorialOverlay();
  showStep(0);
  announceToScreenReader(
    `${tutorial.title} started. Step 1 of ${tutorial.steps.length}.`
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
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${activeTutorial.title} tutorial`);
  overlay.setAttribute('aria-live', 'polite');

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
    
    <div class="tutorial-panel" role="dialog" aria-labelledby="tutorial-title" aria-describedby="tutorial-content">
      <div class="tutorial-arrow" aria-hidden="true"></div>
      
      <div class="tutorial-header">
        <h2 id="tutorial-title" class="tutorial-title">${activeTutorial.title}</h2>
        <div class="tutorial-header-actions">
          <button class="tutorial-minimize" aria-label="Minimize tutorial" title="Minimize">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button class="tutorial-close" aria-label="Exit tutorial (Escape)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="tutorial-body">
        <div id="tutorial-content" class="tutorial-content"></div>
        <div class="tutorial-requirement" id="tutorialRequirement" role="status" aria-live="polite"></div>
      </div>
      
      <div class="tutorial-footer">
        <div class="tutorial-progress">
          Step <span id="tutorial-step-current">1</span> of <span id="tutorial-step-total">${activeTutorial.steps.length}</span>
        </div>
        <div class="tutorial-nav">
          <button class="btn btn-sm tutorial-btn-back" id="tutorialBackBtn" disabled>← Back</button>
          <button class="btn btn-sm btn-primary tutorial-btn-next" id="tutorialNextBtn">Next →</button>
        </div>
      </div>
    </div>
    
    <div class="tutorial-minimized hidden">
      <button class="tutorial-restore" aria-label="Restore tutorial">
        <span class="tutorial-minimized-text">Tutorial</span>
        <span class="tutorial-minimized-progress">${currentStepIndex + 1}/${activeTutorial.steps.length}</span>
      </button>
    </div>
  `;

  document.body.appendChild(overlay);
  tutorialOverlay = overlay;

  setupTutorialListeners();
  setupResizeObserver();

  // Focus the panel
  const panel = tutorialOverlay.querySelector('.tutorial-panel');
  if (panel) {
    panel.focus();
  }
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

  backBtn?.addEventListener('click', () => showStep(currentStepIndex - 1));
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

  if (e.key === 'Escape') {
    e.preventDefault();
    closeTutorial();
  } else if (e.key === 'ArrowRight' && !e.ctrlKey && stepCompleted) {
    e.preventDefault();
    if (currentStepIndex < activeTutorial.steps.length - 1) {
      showStep(currentStepIndex + 1);
    }
  } else if (e.key === 'ArrowLeft' && !e.ctrlKey) {
    e.preventDefault();
    if (currentStepIndex > 0) {
      showStep(currentStepIndex - 1);
    }
  }
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
    if (step.highlightSelector) {
      const target = document.querySelector(
        step.highlightSelector.split(',')[0]
      );
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
    showStep(currentStepIndex + 1);
  } else {
    closeTutorial();
  }
}

/**
 * Setup resize observer to reposition panel on window changes
 */
function setupResizeObserver() {
  resizeObserver = new ResizeObserver(() => {
    if (activeTutorial && tutorialOverlay) {
      updateSpotlightAndPosition();
    }
  });
  resizeObserver.observe(document.body);

  // Also handle scroll
  window.addEventListener('scroll', updateSpotlightAndPosition, {
    passive: true,
  });
}

/**
 * Toggle minimized state
 */
function toggleMinimize() {
  isMinimized = !isMinimized;

  const panel = tutorialOverlay.querySelector('.tutorial-panel');
  const minimized = tutorialOverlay.querySelector('.tutorial-minimized');
  const svg = tutorialOverlay.querySelector('.tutorial-spotlight-svg');

  if (isMinimized) {
    panel.classList.add('hidden');
    minimized.classList.remove('hidden');
    svg.style.opacity = '0.3';
  } else {
    panel.classList.remove('hidden');
    minimized.classList.add('hidden');
    svg.style.opacity = '1';
    updateSpotlightAndPosition();
  }

  announceToScreenReader(
    isMinimized ? 'Tutorial minimized' : 'Tutorial restored'
  );
}

/**
 * Show a specific tutorial step
 * @param {number} stepIndex - Step index
 */
function showStep(stepIndex) {
  if (stepIndex < 0 || stepIndex >= activeTutorial.steps.length) return;

  // Clear previous state
  clearCompletionListeners();

  currentStepIndex = stepIndex;
  const step = activeTutorial.steps[stepIndex];

  // Update content
  const contentEl = tutorialOverlay.querySelector('#tutorial-content');
  contentEl.innerHTML = `
    <h3 class="tutorial-step-title">${step.title}</h3>
    <div class="tutorial-step-content">${step.content}</div>
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

  if (!step.highlightSelector || step.position === 'center') {
    // No highlight - center the panel, hide spotlight
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

  // Find the target element
  const targetSelector = step.highlightSelector.split(',')[0].trim();
  const target = document.querySelector(targetSelector);

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

  // Lock scrolling on parent scrollable container if requested
  if (step.lockScroll) {
    const scrollableParent = findScrollableParent(target);
    if (scrollableParent) {
      scrollableParent.classList.add('tutorial-scroll-locked');
    }
  }

  // Scroll target into view if needed
  const targetRect = target.getBoundingClientRect();
  const isVisible =
    targetRect.top >= 0 &&
    targetRect.bottom <= window.innerHeight &&
    targetRect.left >= 0 &&
    targetRect.right <= window.innerWidth;

  if (!isVisible) {
    target.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center',
    });
    // Wait for scroll to complete before positioning
    setTimeout(() => updateSpotlightAndPosition(), 300);
    return;
  }

  // Get target bounds
  const rect = target.getBoundingClientRect();

  // Update spotlight cutout
  cutout.setAttribute('x', rect.left - SPOTLIGHT_PADDING);
  cutout.setAttribute('y', rect.top - SPOTLIGHT_PADDING);
  cutout.setAttribute('width', rect.width + SPOTLIGHT_PADDING * 2);
  cutout.setAttribute('height', rect.height + SPOTLIGHT_PADDING * 2);

  // Calculate best position for panel
  const position = calculateBestPosition(rect, step.position);
  positionPanel(panel, arrow, rect, position);
  panel.classList.add('tutorial-panel-positioned');
}

/**
 * Calculate best position for panel relative to target
 * @param {DOMRect} targetRect - Target element bounds
 * @param {string} preferred - Preferred position
 * @returns {string} - Position: 'top', 'bottom', 'left', 'right'
 */
function calculateBestPosition(targetRect, preferred) {
  const panelWidth = 340;
  const panelHeight = 250;
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  const space = {
    top: targetRect.top,
    bottom: viewport.height - targetRect.bottom,
    left: targetRect.left,
    right: viewport.width - targetRect.right,
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
 * @param {HTMLElement} panel - Tutorial panel
 * @param {HTMLElement} arrow - Arrow element
 * @param {DOMRect} targetRect - Target bounds
 * @param {string} position - Position
 */
function positionPanel(panel, arrow, targetRect, position) {
  const panelRect = panel.getBoundingClientRect();
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  let top, left;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;

  // Reset transforms
  panel.style.transform = '';

  switch (position) {
    case 'top':
      top =
        targetRect.top - panelRect.height - PANEL_OFFSET - SPOTLIGHT_PADDING;
      left = Math.max(
        16,
        Math.min(
          targetCenterX - panelRect.width / 2,
          viewport.width - panelRect.width - 16
        )
      );
      arrow.className = 'tutorial-arrow tutorial-arrow-bottom';
      arrow.style.left = `${Math.min(Math.max(targetCenterX - left - 8, 20), panelRect.width - 40)}px`;
      arrow.style.top = '';
      break;

    case 'bottom':
      top = targetRect.bottom + PANEL_OFFSET + SPOTLIGHT_PADDING;
      left = Math.max(
        16,
        Math.min(
          targetCenterX - panelRect.width / 2,
          viewport.width - panelRect.width - 16
        )
      );
      arrow.className = 'tutorial-arrow tutorial-arrow-top';
      arrow.style.left = `${Math.min(Math.max(targetCenterX - left - 8, 20), panelRect.width - 40)}px`;
      arrow.style.top = '';
      break;

    case 'left':
      left =
        targetRect.left - panelRect.width - PANEL_OFFSET - SPOTLIGHT_PADDING;
      top = Math.max(
        16,
        Math.min(
          targetCenterY - panelRect.height / 2,
          viewport.height - panelRect.height - 16
        )
      );
      arrow.className = 'tutorial-arrow tutorial-arrow-right';
      arrow.style.top = `${Math.min(Math.max(targetCenterY - top - 8, 20), panelRect.height - 40)}px`;
      arrow.style.left = '';
      break;

    case 'right':
      left = targetRect.right + PANEL_OFFSET + SPOTLIGHT_PADDING;
      top = Math.max(
        16,
        Math.min(
          targetCenterY - panelRect.height / 2,
          viewport.height - panelRect.height - 16
        )
      );
      arrow.className = 'tutorial-arrow tutorial-arrow-left';
      arrow.style.top = `${Math.min(Math.max(targetCenterY - top - 8, 20), panelRect.height - 40)}px`;
      arrow.style.left = '';
      break;
  }

  // Clamp to viewport
  top = Math.max(16, Math.min(top, viewport.height - panelRect.height - 16));
  left = Math.max(16, Math.min(left, viewport.width - panelRect.width - 16));

  panel.style.position = 'fixed';
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  arrow.style.display = 'block';
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
    attachCompletionListener({
      selector,
      event: 'toggle',
      predicate: (el) => el instanceof HTMLDetailsElement && el.open === true,
    });
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

    target.removeEventListener(event, handler, true);
    completionListeners = completionListeners.filter(
      (l) => l.handler !== handler
    );
  };

  target.addEventListener(event, handler, true);
  completionListeners.push({ element: target, event, handler });
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
 */
export function closeTutorial() {
  if (!tutorialOverlay) return;

  clearCompletionListeners();

  // Remove highlight from any targeted elements
  document.querySelectorAll('.tutorial-target-highlight').forEach((el) => {
    el.classList.remove('tutorial-target-highlight');
  });

  // Remove scroll locks
  document.querySelectorAll('.tutorial-scroll-locked').forEach((el) => {
    el.classList.remove('tutorial-scroll-locked');
  });

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  window.removeEventListener('scroll', updateSpotlightAndPosition);
  document.removeEventListener('keydown', handleKeydown);

  tutorialOverlay.remove();
  tutorialOverlay = null;

  // Restore focus to trigger element or fallback to visible focusable element
  // Use requestAnimationFrame to ensure DOM has settled after overlay removal
  requestAnimationFrame(() => {
    let focusRestored = false;

    // Try trigger element first (only if still visible in DOM)
    if (triggerElement && document.contains(triggerElement)) {
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

  triggerElement = null;

  activeTutorial = null;
  currentStepIndex = 0;
  isMinimized = false;

  announceToScreenReader('Tutorial closed.');
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
function announceToScreenReader(message) {
  const announcer = document.getElementById('srAnnouncer');
  if (announcer) {
    announcer.textContent = message;
  }
}
