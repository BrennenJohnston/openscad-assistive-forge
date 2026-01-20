/**
 * Workflow Progress Indicator
 * Implements W3C COGA breadcrumbs/progress pattern
 * Shows user where they are in the upload → customize → render → download flow
 * @license GPL-3.0-or-later
 */

/**
 * Workflow steps in order
 */
const WORKFLOW_STEPS = ['upload', 'customize', 'render', 'download'];

/**
 * Current workflow state
 */
let currentStep = null;
let completedSteps = new Set();

/**
 * Initialize the workflow progress indicator
 * @param {boolean} visible - Whether to show the progress bar initially
 */
export function initWorkflowProgress(visible = false) {
  const progressElement = document.getElementById('workflowProgress');
  if (!progressElement) return;

  progressElement.classList.toggle('hidden', !visible);

  // Reset state
  currentStep = null;
  completedSteps.clear();
  updateProgressUI();
}

/**
 * Show the workflow progress indicator
 */
export function showWorkflowProgress() {
  const progressElement = document.getElementById('workflowProgress');
  if (progressElement) {
    progressElement.classList.remove('hidden');
  }
}

/**
 * Hide the workflow progress indicator
 */
export function hideWorkflowProgress() {
  const progressElement = document.getElementById('workflowProgress');
  if (progressElement) {
    progressElement.classList.add('hidden');
  }
}

/**
 * Set the current workflow step
 * @param {string} step - One of: 'upload', 'customize', 'render', 'download'
 */
export function setWorkflowStep(step) {
  if (!WORKFLOW_STEPS.includes(step)) {
    console.warn(`Unknown workflow step: ${step}`);
    return;
  }

  // Mark previous steps as completed
  const stepIndex = WORKFLOW_STEPS.indexOf(step);
  for (let i = 0; i < stepIndex; i++) {
    completedSteps.add(WORKFLOW_STEPS[i]);
  }

  currentStep = step;
  updateProgressUI();

  // Announce step change to screen readers
  announceStepChange(step);
}

/**
 * Mark a step as completed
 * @param {string} step - The step to mark as completed
 */
export function completeWorkflowStep(step) {
  if (!WORKFLOW_STEPS.includes(step)) return;

  completedSteps.add(step);
  updateProgressUI();
}

/**
 * Reset the workflow progress
 */
export function resetWorkflowProgress() {
  currentStep = null;
  completedSteps.clear();
  updateProgressUI();
}

/**
 * Get the current workflow state
 * @returns {Object} Current workflow state
 */
export function getWorkflowState() {
  return {
    currentStep,
    completedSteps: Array.from(completedSteps),
    allSteps: WORKFLOW_STEPS,
  };
}

/**
 * Update the progress indicator UI
 */
function updateProgressUI() {
  const progressElement = document.getElementById('workflowProgress');
  if (!progressElement) return;

  WORKFLOW_STEPS.forEach((step) => {
    const stepElement = progressElement.querySelector(`[data-step="${step}"]`);
    if (!stepElement) return;

    // Remove all state classes
    stepElement.classList.remove('active', 'completed');
    stepElement.removeAttribute('aria-current');

    // Apply current state
    if (completedSteps.has(step)) {
      stepElement.classList.add('completed');
    }

    if (step === currentStep) {
      stepElement.classList.add('active');
      stepElement.setAttribute('aria-current', 'step');
    }
  });
}

/**
 * Announce step change to screen readers
 * @param {string} step - The new current step
 */
function announceStepChange(step) {
  const srAnnouncer = document.getElementById('srAnnouncer');
  if (!srAnnouncer) return;

  const stepIndex = WORKFLOW_STEPS.indexOf(step) + 1;
  const stepLabels = {
    upload: 'Upload file',
    customize: 'Customize parameters',
    render: 'Generate model',
    download: 'Download file',
  };

  const message = `Step ${stepIndex} of ${WORKFLOW_STEPS.length}: ${stepLabels[step] || step}`;

  // Use a timeout to avoid conflicting with other announcements
  setTimeout(() => {
    srAnnouncer.textContent = message;
  }, 100);
}

/**
 * Helper to advance to next step
 */
export function advanceWorkflowStep() {
  if (!currentStep) {
    setWorkflowStep('upload');
    return;
  }

  const currentIndex = WORKFLOW_STEPS.indexOf(currentStep);
  if (currentIndex < WORKFLOW_STEPS.length - 1) {
    completeWorkflowStep(currentStep);
    setWorkflowStep(WORKFLOW_STEPS[currentIndex + 1]);
  } else {
    // Complete final step
    completeWorkflowStep(currentStep);
  }
}
