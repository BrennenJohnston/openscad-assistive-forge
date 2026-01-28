/**
 * HTML Utility Functions
 * @license GPL-3.0-or-later
 */

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} - Escaped HTML string
 */
export function escapeHtml(text) {
  if (text == null || text === '') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Validate Service Worker message against allowlist of expected types
 * @param {MessageEvent} event - Message event from Service Worker
 * @param {string[]} allowedTypes - Array of allowed message types
 * @returns {boolean} - True if message is valid
 */
export function isValidServiceWorkerMessage(event, allowedTypes) {
  // Validate event data exists and is an object
  if (!event || !event.data || typeof event.data !== 'object') {
    return false;
  }

  // Validate message type is in allowlist
  if (!allowedTypes.includes(event.data.type)) {
    return false;
  }

  return true;
}

/**
 * Setup character counter for textarea with validation and visual feedback
 * @param {HTMLTextAreaElement} textarea - The textarea element
 * @param {HTMLElement} counterElement - Element to display count
 * @param {HTMLElement} counterContainer - Container element with counter class
 * @param {Object} options - Configuration options
 * @param {number} [options.maxLength=5000] - Maximum allowed length
 * @param {number} [options.warningThreshold=4500] - Length to show warning
 * @param {HTMLElement} [options.submitButton] - Button to disable when over limit
 * @param {Function} [options.onValidChange] - Callback when validation state changes
 */
export function setupNotesCounter(
  textarea,
  counterElement,
  counterContainer,
  options = {}
) {
  const {
    maxLength = 5000,
    warningThreshold = 4500,
    submitButton = null,
    onValidChange = null,
  } = options;

  const updateCounter = () => {
    const length = textarea.value.length;
    counterElement.textContent = length;

    // Update visual feedback
    counterContainer.classList.remove('error', 'warning');

    let isValid = true;

    if (length > maxLength) {
      counterContainer.classList.add('error');
      if (submitButton) submitButton.disabled = true;
      isValid = false;
    } else if (length > warningThreshold) {
      counterContainer.classList.add('warning');
      isValid = true;
    }

    // Call validation callback if provided
    if (onValidChange) {
      onValidChange(isValid, length);
    }
  };

  // Set up event listener
  textarea.addEventListener('input', updateCounter);

  // Initial update
  updateCounter();

  // Return cleanup function
  return () => {
    textarea.removeEventListener('input', updateCounter);
  };
}
