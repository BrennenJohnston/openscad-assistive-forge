/**
 * Error Translator - Converts technical OpenSCAD errors to plain language
 * Implements W3C COGA guidelines for user-friendly error messages
 * @license GPL-3.0-or-later
 */

import { announceError } from './announcer.js';

/**
 * Common OpenSCAD error patterns and their user-friendly translations
 */
const ERROR_PATTERNS = [
  // Syntax errors
  {
    pattern: /syntax error/i,
    title: 'Code Problem Found',
    explanation: "There's a typo or missing character in the model code.",
    suggestion:
      'Check for missing semicolons, brackets, or parentheses in your OpenSCAD file.',
  },
  {
    pattern: /unexpected token/i,
    title: 'Unexpected Character',
    explanation: 'The model code has a character in an unexpected place.',
    suggestion:
      'Review the code near the line number shown for extra or missing punctuation.',
  },
  {
    pattern: /undefined variable[:\s]+(\w+)/i,
    title: 'Missing Variable',
    explanation: (match) =>
      `The model references a variable called "${match[1]}" that doesn't exist.`,
    suggestion:
      'Make sure all parameter names are spelled correctly and defined before use.',
  },
  {
    pattern: /unknown function[:\s]+(\w+)/i,
    title: 'Unknown Function',
    explanation: (match) =>
      `The model uses a function called "${match[1]}" that OpenSCAD doesn't recognize.`,
    suggestion:
      "This might be from a library that's not enabled. Check the Libraries panel.",
  },

  // Geometry errors
  {
    pattern: /invalid polygon/i,
    title: 'Shape Problem',
    explanation:
      'The model created a shape with invalid geometry (like overlapping edges).',
    suggestion:
      'Try adjusting dimensions to create simpler shapes, or reduce the number of sides.',
  },
  {
    pattern: /non-planar face/i,
    title: 'Geometry Issue',
    explanation:
      "One of the surfaces in the model isn't flat when it should be.",
    suggestion:
      'This can happen with complex extrusions. Try simplifying the shape.',
  },
  {
    pattern: /degenerate/i,
    title: 'Invalid Shape',
    explanation:
      "The current parameter values created a shape that's too thin or has no volume.",
    suggestion:
      'Increase dimension values or change parameters to create a valid 3D shape.',
  },

  // Memory and timeout errors
  {
    pattern: /out of memory|memory limit|allocation failed/i,
    title: 'Model Too Complex',
    explanation: 'This model requires more memory than available.',
    suggestion:
      'Try reducing complexity: lower $fn values, simpler shapes, or fewer operations.',
  },
  {
    pattern: /timeout|timed out|too long/i,
    title: 'Taking Too Long',
    explanation: 'The model is taking too long to generate.',
    suggestion:
      'Reduce $fn values, simplify the model, or try the "Fast" preview quality setting.',
  },

  // File errors
  {
    pattern: /file not found[:\s]+(.+)/i,
    title: 'Missing File',
    explanation: (match) =>
      `The model needs a file called "${match[1]}" that wasn't found.`,
    suggestion:
      'If using a ZIP file, ensure all referenced files are included.',
  },
  {
    pattern: /cannot open/i,
    title: 'File Access Problem',
    explanation: "OpenSCAD couldn't read one of the required files.",
    suggestion:
      'Try re-uploading the file or check if all included files are present.',
  },

  // Library errors
  {
    pattern: /use\s+(?:<([^>]+)>|"([^"]+)")/i,
    title: 'Library Required',
    explanation: (match) =>
      `This model needs the "${match[1] || match[2]}" library.`,
    suggestion: 'Enable the required library in the 📚 Libraries panel.',
  },
  {
    pattern: /include\s+(?:<([^>]+)>|"([^"]+)")/i,
    title: 'Missing Include',
    explanation: (match) =>
      `The model includes "${match[1] || match[2]}" which wasn't found.`,
    suggestion:
      'This file might be from an external library. Check the Libraries panel.',
  },

  // CGAL assertion failures — fatal crashes from projection()/roof() in WASM
  // See: openscad-wasm#6, openscad#6582, CGAL#7560
  {
    pattern: /CGAL assertion|CGAL_assertion|CGAL precondition/i,
    title: 'Known Browser Engine Limitation',
    explanation:
      'This model uses a geometry feature (likely projection() or roof()) that triggers ' +
      'a known crash in the browser-based rendering engine (CGAL + WebAssembly).',
    suggestion:
      'Remove or simplify projection()/roof() calls. This is a known upstream issue — ' +
      'the same model may work in desktop OpenSCAD.',
  },
  // Emscripten abort — unrecoverable WASM crash
  {
    pattern: /Aborted\(|abort\(|Emscripten.*abort/i,
    title: 'Rendering Engine Crashed',
    explanation:
      'The browser rendering engine encountered a fatal error and stopped. ' +
      'This often happens with projection() or roof() functions.',
    suggestion:
      'Try removing projection()/roof() calls, or simplify the geometry. ' +
      'The engine will restart automatically for your next render.',
  },
  // WASM RuntimeError: unreachable
  {
    pattern: /RuntimeError:\s*unreachable/i,
    title: 'Rendering Engine Error',
    explanation:
      'The rendering engine hit an internal error (unreachable code path). ' +
      'This is typically caused by projection() or roof() in the browser engine.',
    suggestion:
      'Simplify the model or remove projection()/roof() functions. ' +
      'Desktop OpenSCAD may handle this model better.',
  },
  // WASM RuntimeError: memory access out of bounds
  {
    pattern: /RuntimeError:\s*memory access out of bounds/i,
    title: 'Memory Access Error',
    explanation:
      'The rendering engine tried to access memory outside its bounds. ' +
      'This can happen with very complex models or certain geometry operations.',
    suggestion:
      'Reduce model complexity (lower $fn), remove minkowski() operations, ' +
      'or simplify boolean operations.',
  },
  // General CGAL errors (non-fatal, complex boolean operations)
  {
    pattern: /CGAL error|cgal|nef/i,
    title: 'Complex Geometry Issue',
    explanation:
      "The model's shapes have geometry that's difficult to process.",
    suggestion:
      'Try simpler parameter values, or avoid very thin walls or sharp angles.',
  },

  // 2D model exported to 3D format — applies to any project producing 2D output
  {
    pattern: /MODEL_IS_2D|not a 3D object|Top level object is a 2D object/i,
    title: '2D Model Detected',
    explanation:
      'Your model produces 2D geometry (using projection() or 2D primitives). ' +
      '2D models cannot be previewed in the 3D viewer.',
    suggestion:
      'To export: select SVG or DXF output format, then click Generate. ' +
      'To preview in 3D: adjust your model parameters to produce 3D geometry.',
  },

  // Render quality errors
  {
    pattern: /\$fn.*value.*(\d+)/i,
    title: 'Quality Setting Issue',
    explanation: (match) =>
      `The $fn value of ${match[1]} might be causing problems.`,
    suggestion:
      'Try a lower $fn value (32-64 is usually sufficient for most models).',
  },

  // Generic parameter errors
  {
    pattern: /parameter.*out of range|value.*too (large|small)/i,
    title: 'Value Out of Range',
    explanation: 'One of the parameter values is outside the acceptable range.',
    suggestion:
      'Check your parameter values and try using values closer to the defaults.',
  },
];

/**
 * Default fallback for unknown errors
 */
const DEFAULT_ERROR = {
  title: 'Something Went Wrong',
  explanation: "The model couldn't be generated due to an unexpected error.",
  suggestion:
    'Try resetting parameters to defaults, or try a simpler model first.',
};

/**
 * Translate a technical error message to user-friendly language
 * @param {string} technicalError - The raw error message from OpenSCAD
 * @returns {Object} User-friendly error object with title, explanation, suggestion
 */
export function translateError(technicalError) {
  if (!technicalError || typeof technicalError !== 'string') {
    return {
      ...DEFAULT_ERROR,
      technical: technicalError || 'No error details available',
    };
  }

  // Try to match against known patterns
  for (const pattern of ERROR_PATTERNS) {
    const match = technicalError.match(pattern.pattern);
    if (match) {
      return {
        title: pattern.title,
        explanation:
          typeof pattern.explanation === 'function'
            ? pattern.explanation(match)
            : pattern.explanation,
        suggestion: pattern.suggestion,
        technical: technicalError,
      };
    }
  }

  // No pattern matched, return default with technical details
  return {
    ...DEFAULT_ERROR,
    technical: technicalError,
  };
}

/**
 * Create a user-friendly error display element
 * @param {string} technicalError - The raw error message
 * @returns {HTMLElement} The error display element
 */
export function createFriendlyErrorDisplay(technicalError) {
  const error = translateError(technicalError);

  const container = document.createElement('div');
  container.className = 'error-message-friendly';
  container.setAttribute('role', 'alert');
  container.setAttribute('aria-live', 'assertive');

  // Title with icon (built via DOM to avoid innerHTML XSS risk)
  const title = document.createElement('h3');
  title.className = 'error-title';
  const titleIcon = document.createElement('span');
  titleIcon.setAttribute('aria-hidden', 'true');
  titleIcon.textContent = '⚠️';
  title.appendChild(titleIcon);
  title.appendChild(document.createTextNode(' ' + error.title));
  container.appendChild(title);

  // Plain language explanation
  const explanation = document.createElement('p');
  explanation.className = 'error-explanation';
  explanation.textContent = error.explanation;
  container.appendChild(explanation);

  // Helpful suggestion (built via DOM to avoid innerHTML XSS risk)
  const suggestion = document.createElement('p');
  suggestion.className = 'error-suggestion';
  const suggestionLabel = document.createElement('strong');
  suggestionLabel.textContent = 'What to try:';
  suggestion.appendChild(suggestionLabel);
  suggestion.appendChild(document.createTextNode(' ' + error.suggestion));
  container.appendChild(suggestion);

  // Technical details (collapsed by default)
  if (error.technical) {
    const details = document.createElement('details');
    details.className = 'error-details-toggle';

    const summary = document.createElement('summary');
    summary.textContent = 'Show technical details';
    details.appendChild(summary);

    const technical = document.createElement('pre');
    technical.className = 'error-technical';
    technical.textContent = error.technical;
    details.appendChild(technical);

    container.appendChild(details);
  }

  return container;
}

/**
 * Display a friendly error in a container
 * @param {string} technicalError - The raw error message
 * @param {HTMLElement} container - Container to display the error in
 */
export function showFriendlyError(technicalError, container) {
  if (!container) return;

  const errorDisplay = createFriendlyErrorDisplay(technicalError);
  container.innerHTML = '';
  container.appendChild(errorDisplay);
  container.classList.remove('hidden');

  // Announce to screen readers via assertive region
  const error = translateError(technicalError);
  announceError(`Error: ${error.title}. ${error.explanation}`);
}

/**
 * Clear a friendly error display
 * @param {HTMLElement} container - Container to clear
 */
export function clearFriendlyError(container) {
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Tiered error display: modal (critical) + toast (informational)
// ---------------------------------------------------------------------------

let _modalIdCounter = 0;

/**
 * Show a modal error dialog for critical errors that block workflow.
 * Uses role="alertdialog" with focus trap and keyboard dismissal.
 * @param {Object} options
 * @param {string} options.title - Error title
 * @param {string} options.message - Error explanation
 * @param {string} [options.suggestion] - What the user can try
 * @param {string} [options.technical] - Technical details (collapsible)
 * @returns {Promise<void>} Resolves when the user dismisses the dialog
 */
export function showErrorModal({ title, message, suggestion, technical }) {
  return new Promise((resolve) => {
    const id = `error-modal-${++_modalIdCounter}`;
    const titleId = `${id}-title`;
    const descId = `${id}-desc`;

    const overlay = document.createElement('div');
    overlay.className = 'friendly-error-modal';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', titleId);
    overlay.setAttribute('aria-describedby', descId);
    overlay.dataset.testid = 'friendly-error-modal';

    const content = document.createElement('div');
    content.className = 'friendly-error-modal-content';
    overlay.appendChild(content);

    // Header
    const header = document.createElement('div');
    header.className = 'friendly-error-modal-header';
    content.appendChild(header);

    const titleEl = document.createElement('h3');
    titleEl.id = titleId;
    titleEl.className = 'friendly-error-modal-title';
    const iconSpan = document.createElement('span');
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = '\u26A0\uFE0F';
    titleEl.appendChild(iconSpan);
    titleEl.appendChild(document.createTextNode(' ' + title));
    header.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'friendly-error-modal-close';
    closeBtn.setAttribute('aria-label', 'Close error dialog');
    closeBtn.textContent = '\u00D7';
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement('div');
    body.className = 'friendly-error-modal-body';
    body.id = descId;
    content.appendChild(body);

    const messageEl = document.createElement('p');
    messageEl.className = 'error-explanation';
    messageEl.textContent = message;
    body.appendChild(messageEl);

    if (suggestion) {
      const suggEl = document.createElement('p');
      suggEl.className = 'error-suggestion';
      const strong = document.createElement('strong');
      strong.textContent = 'What to try:';
      suggEl.appendChild(strong);
      suggEl.appendChild(document.createTextNode(' ' + suggestion));
      body.appendChild(suggEl);
    }

    if (technical) {
      const details = document.createElement('details');
      details.className = 'error-details-toggle';
      const summary = document.createElement('summary');
      summary.textContent = 'Show technical details';
      details.appendChild(summary);
      const pre = document.createElement('pre');
      pre.className = 'error-technical';
      pre.textContent = technical;
      details.appendChild(pre);
      body.appendChild(details);
    }

    // Footer
    const footer = document.createElement('div');
    footer.className = 'friendly-error-modal-footer';
    content.appendChild(footer);

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn btn-primary';
    okBtn.textContent = 'OK';
    footer.appendChild(okBtn);

    const cleanup = () => {
      overlay.remove();
      document.removeEventListener('keydown', keyHandler);
      resolve();
    };

    closeBtn.addEventListener('click', cleanup);
    okBtn.addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup();
    });

    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = overlay.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), summary'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', keyHandler);

    document.body.appendChild(overlay);
    okBtn.focus();

    announceError(`Error: ${title}. ${message}`);
  });
}

function _getToastContainer() {
  let container = document.getElementById('error-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'error-toast-container';
    container.className = 'error-toast-container';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Show a toast notification for non-blocking informational errors.
 * Auto-dismisses after the specified duration.
 * @param {Object} options
 * @param {string} options.title - Toast title
 * @param {string} options.message - Toast message
 * @param {number} [options.duration=8000] - Auto-dismiss delay in ms (0 = no auto-dismiss)
 */
export function showErrorToast({ title, message, duration = 8000 }) {
  const container = _getToastContainer();

  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.setAttribute('role', 'alert');

  const icon = document.createElement('span');
  icon.className = 'error-toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '\u26A0\uFE0F';
  toast.appendChild(icon);

  const textWrap = document.createElement('div');
  textWrap.className = 'error-toast-text';
  toast.appendChild(textWrap);

  const titleEl = document.createElement('strong');
  titleEl.className = 'error-toast-title';
  titleEl.textContent = title;
  textWrap.appendChild(titleEl);

  const msgEl = document.createElement('span');
  msgEl.className = 'error-toast-message';
  msgEl.textContent = message;
  textWrap.appendChild(msgEl);

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'error-toast-dismiss';
  dismissBtn.setAttribute('aria-label', 'Dismiss notification');
  dismissBtn.textContent = '\u00D7';
  toast.appendChild(dismissBtn);

  let timeoutId = null;
  const dismiss = () => {
    if (timeoutId) clearTimeout(timeoutId);
    toast.classList.add('error-toast-exit');
    toast.addEventListener('animationend', () => toast.remove(), {
      once: true,
    });
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 400);
  };

  dismissBtn.addEventListener('click', dismiss);
  container.appendChild(toast);

  if (duration > 0) {
    timeoutId = setTimeout(dismiss, duration);
  }

  announceError(`${title}. ${message}`);
}
