/**
 * Workflow Progress Container Controller
 * Manages visibility of the #workflowProgress toolbar container.
 * @license GPL-3.0-or-later
 */

/**
 * Initialize the workflow progress container
 * @param {boolean} visible - Whether to show the container initially
 */
export function initWorkflowProgress(visible = false) {
  const progressElement = document.getElementById('workflowProgress');
  if (!progressElement) return;

  progressElement.classList.toggle('hidden', !visible);
}

/**
 * Show the workflow progress container
 */
export function showWorkflowProgress() {
  const progressElement = document.getElementById('workflowProgress');
  if (progressElement) {
    progressElement.classList.remove('hidden');
  }
}

/**
 * Hide the workflow progress container
 */
export function hideWorkflowProgress() {
  const progressElement = document.getElementById('workflowProgress');
  if (progressElement) {
    progressElement.classList.add('hidden');
  }
}
