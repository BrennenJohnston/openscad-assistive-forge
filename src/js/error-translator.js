/**
 * Error Translator - Converts technical OpenSCAD errors to plain language
 * Implements W3C COGA guidelines for user-friendly error messages
 * @license GPL-3.0-or-later
 */

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
    pattern: /use\s+<([^>]+)>/i,
    title: 'Library Required',
    explanation: (match) => `This model needs the "${match[1]}" library.`,
    suggestion: 'Enable the required library in the 📚 Libraries panel.',
  },
  {
    pattern: /include\s+<([^>]+)>/i,
    title: 'Missing Include',
    explanation: (match) =>
      `The model includes "${match[1]}" which wasn't found.`,
    suggestion:
      'This file might be from an external library. Check the Libraries panel.',
  },

  // CGAL errors (common in complex boolean operations)
  {
    pattern: /CGAL error|cgal|nef/i,
    title: 'Complex Geometry Issue',
    explanation:
      "The model's shapes have geometry that's difficult to process.",
    suggestion:
      'Try simpler parameter values, or avoid very thin walls or sharp angles.',
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

  // Title with icon
  const title = document.createElement('h3');
  title.className = 'error-title';
  title.innerHTML = `<span aria-hidden="true">⚠️</span> ${error.title}`;
  container.appendChild(title);

  // Plain language explanation
  const explanation = document.createElement('p');
  explanation.className = 'error-explanation';
  explanation.textContent = error.explanation;
  container.appendChild(explanation);

  // Helpful suggestion
  const suggestion = document.createElement('p');
  suggestion.className = 'error-suggestion';
  suggestion.innerHTML = `<strong>What to try:</strong> ${error.suggestion}`;
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

  // Announce to screen readers
  const srAnnouncer = document.getElementById('srAnnouncer');
  if (srAnnouncer) {
    const error = translateError(technicalError);
    srAnnouncer.textContent = `Error: ${error.title}. ${error.explanation}`;
  }
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
