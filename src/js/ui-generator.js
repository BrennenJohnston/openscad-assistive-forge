/**
 * UI Generator - Renders form controls from schema
 * @license GPL-3.0-or-later
 */

import { formatFileSize } from './download.js';

/**
 * Format a parameter name for display (replaces underscores with spaces)
 * @param {string} name - Parameter name
 * @returns {string} Formatted name
 */
function formatParamName(name) {
  return name.replace(/_/g, ' ');
}

/**
 * Create a label container with optional help tooltip and reset button
 * Consolidates duplicated label creation logic across control types
 * @param {Object} param - Parameter definition
 * @param {Object} options - Creation options
 * @param {boolean} [options.includeResetButton=false] - Include individual reset button
 * @param {boolean} [options.useLabel=true] - Use <label> element (false uses <span>)
 * @param {Function} [options.onChange] - Change handler (required if includeResetButton is true)
 * @returns {HTMLElement} Label container element
 */
function createLabelContainer(param, options = {}) {
  const {
    includeResetButton = false,
    useLabel = true,
    onChange = null,
  } = options;

  const labelContainer = document.createElement('div');
  labelContainer.className = 'param-label-container';

  // Create either <label> or <span> for the text
  if (useLabel) {
    const label = document.createElement('label');
    label.htmlFor = `param-${param.name}`;
    label.textContent = formatParamName(param.name);
    labelContainer.appendChild(label);
  } else {
    const labelText = document.createElement('span');
    labelText.textContent = formatParamName(param.name);
    labelContainer.appendChild(labelText);
  }

  // Add help tooltip if description exists
  const helpTooltip = createHelpTooltip(param);
  if (helpTooltip) {
    labelContainer.appendChild(helpTooltip);
  }

  // Add individual reset button if requested
  if (includeResetButton && onChange) {
    const resetBtn = createParameterResetButton(param, onChange);
    labelContainer.appendChild(resetBtn);
  }

  return labelContainer;
}

// Store current parameter values for dependency checking
let currentParameterValues = {};

// Store default values for reset functionality
let defaultParameterValues = {};

// Store original schema limits for unlock functionality
let originalParameterLimits = {};

// Track if limits are unlocked
let limitsUnlocked = false;

// Store parameter metadata for search
let parameterMetadata = {};

/**
 * Set whether parameter limits are unlocked
 * @param {boolean} unlocked - Whether limits should be unlocked
 */
export function setLimitsUnlocked(unlocked) {
  limitsUnlocked = unlocked;

  // Update all numeric inputs to reflect the new state
  document.querySelectorAll('.param-control').forEach((control) => {
    const paramName = control.dataset.paramName;
    if (!paramName) return;

    const limits = originalParameterLimits[paramName];
    if (!limits) return;

    // Update range inputs
    const rangeInput = control.querySelector('input[type="range"]');
    if (rangeInput) {
      if (unlocked) {
        // Expand limits significantly
        const range = limits.max - limits.min;
        rangeInput.min = limits.min - range;
        rangeInput.max = limits.max + range;
        control.classList.add('limits-unlocked');
      } else {
        // Restore original limits
        rangeInput.min = limits.min;
        rangeInput.max = limits.max;
        control.classList.remove('limits-unlocked');

        // Clamp value if out of range
        const currentValue = parseFloat(rangeInput.value);
        if (currentValue < limits.min) {
          rangeInput.value = limits.min;
          rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (currentValue > limits.max) {
          rangeInput.value = limits.max;
          rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }

    // Update number inputs
    const numberInput = control.querySelector('input[type="number"]');
    if (numberInput) {
      if (unlocked) {
        numberInput.removeAttribute('min');
        numberInput.removeAttribute('max');
        control.classList.add('limits-unlocked');
      } else {
        if (limits.min !== undefined) numberInput.min = limits.min;
        if (limits.max !== undefined) numberInput.max = limits.max;
        control.classList.remove('limits-unlocked');
      }
    }
  });
}

/**
 * Check if limits are currently unlocked
 * @returns {boolean}
 */
export function areLimitsUnlocked() {
  return limitsUnlocked;
}

/**
 * Get default value for a parameter
 * @param {string} paramName - Parameter name
 * @returns {*} Default value or undefined
 */
export function getDefaultValue(paramName) {
  return defaultParameterValues[paramName];
}

/**
 * Get all default values
 * @returns {Object} Map of parameter names to default values
 */
export function getAllDefaults() {
  return { ...defaultParameterValues };
}

/**
 * Clear the parameter search filter (if active)
 */
export function clearParameterSearch() {
  const searchInput = document.getElementById('paramSearchInput');
  if (!searchInput) return;
  if (!searchInput.value) return;
  searchInput.value = '';
  // Trigger the existing input handler which calls filterParameters()
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Attempt to locate a parameter control by paramName or by label text.
 * @param {string} paramName - Parameter name (key)
 * @param {string|null} labelHint - Optional label text from backend errors
 * @returns {HTMLElement|null}
 */
function findParamControl(paramName, labelHint = null) {
  if (paramName) {
    const direct = document.querySelector(
      `.param-control[data-param-name="${paramName}"]`
    );
    if (direct) return direct;
  }

  // Fallback: try to match by label text in metadata (more reliable than DOM text).
  if (labelHint) {
    const hint = String(labelHint).trim().toLowerCase();
    for (const [name, meta] of Object.entries(parameterMetadata || {})) {
      const lbl = String(meta?.label || '')
        .trim()
        .toLowerCase();
      if (lbl && lbl === hint) {
        const byLabel = document.querySelector(
          `.param-control[data-param-name="${name}"]`
        );
        if (byLabel) return byLabel;
      }
    }
  }

  return null;
}

/**
 * Locate a parameter key in the UI without side effects (no scrolling/focus).
 * @param {string} paramName - Parameter name (key guess)
 * @param {Object} options
 * @param {string|null} options.labelHint - Optional label text for fallback lookup
 * @returns {string|null} The found parameter key (data-param-name), or null
 */
export function locateParameterKey(paramName, options = {}) {
  const { labelHint = null } = options;
  const control = findParamControl(paramName, labelHint);
  return control?.dataset?.paramName || null;
}

/**
 * Focus and visually highlight a parameter control in the UI.
 * If the target is hidden due to a dependency, focus the dependency toggle instead.
 *
 * @param {string} paramName - Parameter name to focus (key)
 * @param {Object} options
 * @param {string|null} options.labelHint - Optional label text for fallback lookup
 * @param {number} options.highlightMs - How long to keep highlight class
 * @returns {{focusedParam: string|null, found: boolean}}
 */
export function focusParameter(paramName, options = {}) {
  const { labelHint = null, highlightMs = 4500 } = options;
  clearParameterSearch();

  const control = findParamControl(paramName, labelHint);
  if (!control) return { focusedParam: null, found: false };

  // If hidden by dependency, focus the dependency controller instead.
  const isHiddenByDependency = control.getAttribute('aria-hidden') === 'true';
  if (isHiddenByDependency) {
    const dependsOn = control.dataset.depends;
    if (dependsOn) {
      const dep = findParamControl(dependsOn, null);
      if (dep) {
        dep.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dep.classList.add('param-highlight');
        const depInput = dep.querySelector('input, select, textarea, button');
        if (depInput) depInput.focus();
        window.setTimeout(() => dep.classList.remove('param-highlight'), 2500);
        announceChange(
          `This option is hidden. Change ${formatParamName(dependsOn)} first.`
        );
        return { focusedParam: dependsOn, found: true };
      }
    }
  }

  // Expand containing group if applicable
  const group = control.closest('.param-group');
  if (group) group.open = true;

  control.scrollIntoView({ behavior: 'smooth', block: 'center' });
  control.classList.add('param-highlight');
  const input = control.querySelector('input, select, textarea, button');
  if (input) input.focus();

  window.setTimeout(() => {
    control.classList.remove('param-highlight');
  }, highlightMs);

  announceChange(`Highlighted ${formatParamName(paramName)}`);
  return { focusedParam: paramName, found: true };
}

/**
 * Set a parameter value via its UI control (and dispatch change events).
 * Intended for guided fixes (e.g., toggles required by the model).
 *
 * @param {string} paramName
 * @param {string|number|boolean} value
 * @returns {boolean} true if set successfully
 */
export function setParameterValue(paramName, value) {
  const control = findParamControl(paramName, null);
  if (!control) return false;

  const input = control.querySelector('input, select, textarea');
  if (!input) return false;

  if (input.type === 'checkbox') {
    input.checked = String(value).toLowerCase() === 'yes' || value === true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (input.tagName === 'SELECT') {
    input.value = String(value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (input.type === 'range') {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    input.value = String(value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  currentParameterValues[paramName] = String(value);
  return true;
}

/**
 * Reset a single parameter to its default value
 * @param {string} paramName - Parameter name to reset
 * @param {Function} onChange - Callback to notify of change
 * @returns {*} The default value, or undefined if not found
 */
export function resetParameter(paramName, onChange) {
  const defaultValue = defaultParameterValues[paramName];
  if (defaultValue === undefined) return undefined;

  // Find the control and update it
  const control = document.querySelector(
    `.param-control[data-param-name="${paramName}"]`
  );
  if (!control) return defaultValue;

  // Update the input element
  const input = control.querySelector('input, select');
  if (input) {
    if (input.type === 'checkbox') {
      input.checked = defaultValue.toLowerCase() === 'yes';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.type === 'range') {
      input.value = defaultValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      input.value = defaultValue;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // Update current values
  currentParameterValues[paramName] = defaultValue;

  // Notify onChange
  if (onChange) {
    onChange({ ...currentParameterValues });
  }

  return defaultValue;
}

/**
 * Check if a dependency condition is met
 * @param {Object} dependency - Dependency object with parameter, operator, value
 * @param {Object} currentParams - Current parameter values
 * @returns {boolean} True if dependency is met (parameter should be visible)
 */
function checkDependency(dependency, currentParams) {
  if (!dependency) return true;

  const actualValue = String(currentParams[dependency.parameter] ?? '');
  const expectedValue = dependency.value;

  if (dependency.operator === '==') {
    return actualValue === expectedValue;
  } else if (dependency.operator === '!=') {
    return actualValue !== expectedValue;
  }

  return true;
}

/**
 * Update visibility of dependent parameters
 * @param {string} changedParam - Name of the parameter that changed
 * @param {*} newValue - New value of the changed parameter
 */
export function updateDependentParameters(changedParam, newValue) {
  // Update stored values
  currentParameterValues[changedParam] = newValue;

  // Find all parameters that depend on changedParam
  const allControls = document.querySelectorAll('.param-control[data-depends]');

  allControls.forEach((control) => {
    const dependsOn = control.dataset.depends;

    if (dependsOn === changedParam) {
      const operator = control.dataset.dependsOperator;
      const expectedValue = control.dataset.dependsValue;
      const actualValue = String(newValue);

      let shouldShow = false;
      if (operator === '==') {
        shouldShow = actualValue === expectedValue;
      } else if (operator === '!=') {
        shouldShow = actualValue !== expectedValue;
      }

      const paramName = control.dataset.paramName;

      if (shouldShow) {
        control.style.display = '';
        control.setAttribute('aria-hidden', 'false');

        // Re-enable inputs for accessibility
        const inputs = control.querySelectorAll('input, select, textarea');
        inputs.forEach((input) => input.removeAttribute('tabindex'));

        // Announce to screen readers
        announceChange(`${formatParamName(paramName)} is now visible`);
      } else {
        control.style.display = 'none';
        control.setAttribute('aria-hidden', 'true');

        // Remove from tab order when hidden
        const inputs = control.querySelectorAll('input, select, textarea');
        inputs.forEach((input) => input.setAttribute('tabindex', '-1'));

        announceChange(`${formatParamName(paramName)} is now hidden`);
      }
    }
  });
}

/**
 * Announce changes to screen readers via dedicated live region
 * Separate from visible status to avoid flickering
 * @param {string} message - Message to announce
 */
function announceChange(message) {
  const srAnnouncer = document.getElementById('srAnnouncer');
  if (!srAnnouncer) return;

  // Debounce announcements to avoid spamming (e.g., slider changes)
  if (announceChange._timeout) {
    clearTimeout(announceChange._timeout);
  }

  // Cancel pending clear (avoid clearing a newer message written elsewhere)
  if (announceChange._clearTimeout) {
    clearTimeout(announceChange._clearTimeout);
  }

  announceChange._timeout = window.setTimeout(() => {
    // Clear first so repeated strings are re-announced reliably
    srAnnouncer.textContent = '';

    requestAnimationFrame(() => {
      srAnnouncer.textContent = message;

      // Clear after a short delay, but only if unchanged
      announceChange._clearTimeout = window.setTimeout(() => {
        if (srAnnouncer.textContent === message) {
          srAnnouncer.textContent = '';
        }
      }, 1500);
    });
  }, 350);
}

/**
 * Apply dependency attributes and initial visibility to a parameter control
 * @param {HTMLElement} container - The parameter control container
 * @param {Object} param - Parameter definition with optional dependency
 * @param {Object} currentParams - Current parameter values for dependency checking
 */
function applyDependency(container, param, currentParams) {
  if (!param.dependency) return;

  container.dataset.paramName = param.name;
  container.dataset.depends = param.dependency.parameter;
  container.dataset.dependsOperator = param.dependency.operator;
  container.dataset.dependsValue = param.dependency.value;

  // Check if dependency is met and set initial visibility
  if (!checkDependency(param.dependency, currentParams)) {
    container.style.display = 'none';
    container.setAttribute('aria-hidden', 'true');

    // Remove from tab order when hidden
    const inputs = container.querySelectorAll('input, select, textarea');
    inputs.forEach((input) => input.setAttribute('tabindex', '-1'));
  }
}

/**
 * Create a help tooltip button
 * WCAG 2.2 compliant: aria-describedby links trigger to tooltip,
 * tooltip shows on focus as well as click
 * @param {Object} param - Parameter definition
 * @returns {HTMLElement|null} Help button element with tooltip
 */
function createHelpTooltip(param) {
  if (!param.description) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'param-help-wrapper';

  const tooltipId = `tooltip-${param.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  const button = document.createElement('button');
  button.className = 'param-help-button';
  button.type = 'button';
  button.setAttribute('aria-label', `Help for ${formatParamName(param.name)}`);
  button.setAttribute('aria-expanded', 'false');
  // WCAG: Link trigger to tooltip content for SR announcement
  button.setAttribute('aria-describedby', tooltipId);
  button.innerHTML = '?';

  const tooltip = document.createElement('div');
  tooltip.className = 'param-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.id = tooltipId;
  tooltip.textContent = param.description;
  tooltip.style.display = 'none';
  // Ensure tooltip is not in tab order
  tooltip.setAttribute('tabindex', '-1');

  // Show tooltip helper
  const showTooltip = () => {
    // Hide all other tooltips first
    document.querySelectorAll('.param-tooltip').forEach((t) => {
      if (t !== tooltip) {
        t.style.display = 'none';
      }
    });
    document.querySelectorAll('.param-help-button').forEach((b) => {
      if (b !== button) {
        b.setAttribute('aria-expanded', 'false');
      }
    });

    tooltip.style.display = 'block';
    button.setAttribute('aria-expanded', 'true');
  };

  // Hide tooltip helper
  const hideTooltip = () => {
    tooltip.style.display = 'none';
    button.setAttribute('aria-expanded', 'false');
  };

  // Toggle tooltip on click
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isVisible = tooltip.style.display === 'block';
    if (isVisible) {
      hideTooltip();
    } else {
      showTooltip();
    }
  });

  // Show tooltip on focus (WCAG: keyboard accessible)
  button.addEventListener('focus', () => {
    showTooltip();
  });

  // Hide tooltip on blur
  button.addEventListener('blur', () => {
    // Small delay to allow click on tooltip if needed
    setTimeout(() => {
      if (!wrapper.contains(document.activeElement)) {
        hideTooltip();
      }
    }, 100);
  });

  // Keyboard support: Escape to close
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tooltip.style.display === 'block') {
      hideTooltip();
      button.focus();
    }
  });

  wrapper.appendChild(button);
  wrapper.appendChild(tooltip);

  return wrapper;
}

// Close all tooltips when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.param-help-wrapper')) {
    document.querySelectorAll('.param-tooltip').forEach((t) => {
      t.style.display = 'none';
    });
    document.querySelectorAll('.param-help-button').forEach((b) => {
      b.setAttribute('aria-expanded', 'false');
    });
  }
});

// Global Escape key handler to close all tooltips
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const visibleTooltips = document.querySelectorAll(
      '.param-tooltip[style*="display: block"]'
    );
    if (visibleTooltips.length > 0) {
      document.querySelectorAll('.param-tooltip').forEach((t) => {
        t.style.display = 'none';
      });
      document.querySelectorAll('.param-help-button').forEach((b) => {
        b.setAttribute('aria-expanded', 'false');
      });
    }
  }
});

/**
 * Initialize parameter search functionality
 * Call this after rendering the parameter UI
 */
export function initParameterSearch() {
  const searchInput = document.getElementById('paramSearchInput');
  const clearBtn = document.getElementById('clearParamSearchBtn');
  const jumpSelect = document.getElementById('paramJumpSelect');
  const showAllBtn = document.getElementById('showAllParamsBtn');

  if (!searchInput) return;

  // Search input handler
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    filterParameters(query);

    // Show/hide clear button
    if (clearBtn) {
      clearBtn.classList.toggle('hidden', !query);
    }
  });

  // Clear button handler
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      filterParameters('');
      clearBtn.classList.add('hidden');
      searchInput.focus();
    });
  }

  // Jump to group handler
  if (jumpSelect) {
    jumpSelect.addEventListener('change', (e) => {
      const groupId = e.target.value;
      if (!groupId) return;

      const groupElement = document.querySelector(
        `.param-group[data-group-id="${groupId}"]`
      );
      if (groupElement) {
        // Expand the group if collapsed
        groupElement.open = true;
        // Scroll into view
        groupElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Focus the group summary
        const summary = groupElement.querySelector('summary');
        if (summary) summary.focus();
        // Announce for screen readers
        announceChange(
          `Jumped to ${groupElement.querySelector('summary')?.textContent || groupId} group`
        );
      }
      // Reset select
      jumpSelect.value = '';
    });
  }

  // Show all button handler
  if (showAllBtn) {
    showAllBtn.addEventListener('click', () => {
      searchInput.value = '';
      filterParameters('');
      if (clearBtn) clearBtn.classList.add('hidden');
      searchInput.focus();
    });
  }
}

/**
 * Filter parameters by search query
 * @param {string} query - Search query (lowercase)
 */
function filterParameters(query) {
  const paramControls = document.querySelectorAll(
    '.param-control[data-param-name]'
  );
  const paramGroups = document.querySelectorAll('.param-group');
  const filterStats = document.getElementById('paramFilterStats');
  const filterCount = document.getElementById('paramFilterCount');

  let visibleCount = 0;
  const totalCount = paramControls.length;

  paramControls.forEach((control) => {
    const paramName = control.dataset.paramName;
    const metadata = parameterMetadata[paramName] || {};

    // Skip if already hidden by dependency
    const isHiddenByDependency = control.getAttribute('aria-hidden') === 'true';

    if (!query) {
      // No search - show all (unless hidden by dependency)
      control.classList.remove('search-hidden');
      if (!isHiddenByDependency) visibleCount++;
    } else {
      // Check if parameter matches search
      const searchableText = [
        paramName.toLowerCase().replace(/_/g, ' '),
        (metadata.label || '').toLowerCase(),
        (metadata.description || '').toLowerCase(),
        (metadata.group || '').toLowerCase(),
      ].join(' ');

      const matches = searchableText.includes(query);
      control.classList.toggle('search-hidden', !matches);

      if (matches && !isHiddenByDependency) visibleCount++;
    }
  });

  // Update group visibility based on whether they have visible parameters
  paramGroups.forEach((group) => {
    const visibleParams = group.querySelectorAll(
      '.param-control:not(.search-hidden):not([aria-hidden="true"])'
    );
    group.classList.toggle('search-empty', visibleParams.length === 0);

    // Auto-expand groups with matches when searching
    if (query && visibleParams.length > 0) {
      group.open = true;
    }
  });

  // Update filter stats display
  if (filterStats && filterCount) {
    if (query) {
      filterStats.classList.remove('hidden');
      filterCount.textContent = visibleCount;
      announceChange(`${visibleCount} of ${totalCount} parameters shown`);
    } else {
      filterStats.classList.add('hidden');
    }
  }
}

/**
 * Populate the jump-to-group dropdown
 * @param {Array} groups - Array of group definitions
 */
export function populateGroupJumpSelect(groups) {
  const jumpSelect = document.getElementById('paramJumpSelect');
  if (!jumpSelect) return;

  // Clear existing options (keep placeholder)
  jumpSelect.innerHTML = '<option value="">Jump to group...</option>';

  // Add options for each group
  groups.forEach((group) => {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = group.label;
    jumpSelect.appendChild(option);
  });
}

/**
 * Get count of modified parameters (different from defaults)
 * @returns {number} Count of modified parameters
 */
export function getModifiedParameterCount() {
  let count = 0;
  for (const [name, value] of Object.entries(currentParameterValues)) {
    if (String(value) !== String(defaultParameterValues[name])) {
      count++;
    }
  }
  return count;
}

/**
 * Create a range slider control
 * @param {Object} param - Parameter definition
 * @param {Function} onChange - Change handler
 * @returns {HTMLElement} Control element
 */
function createSliderControl(param, onChange) {
  const container = document.createElement('div');
  container.className = 'param-control';
  container.dataset.paramName = param.name;

  // Store original limits for unlock functionality
  originalParameterLimits[param.name] = {
    min: param.minimum,
    max: param.maximum,
    step: param.step || 1,
  };

  // Label container with help tooltip and reset button
  const labelContainer = createLabelContainer(param, {
    includeResetButton: true,
    onChange,
  });
  container.appendChild(labelContainer);

  const sliderContainer = document.createElement('div');
  sliderContainer.className = 'slider-container';

  const input = document.createElement('input');
  input.type = 'range';
  input.id = `param-${param.name}`;
  input.min = limitsUnlocked
    ? param.minimum - (param.maximum - param.minimum)
    : param.minimum;
  input.max = limitsUnlocked
    ? param.maximum + (param.maximum - param.minimum)
    : param.maximum;
  input.step = param.step || 1;
  input.value = param.default;
  input.setAttribute('aria-valuemin', param.minimum);
  input.setAttribute('aria-valuemax', param.maximum);
  input.setAttribute('aria-valuenow', param.default);
  input.setAttribute(
    'aria-label',
    `${formatParamName(param.name)}: ${param.default}${param.unit ? ' ' + param.unit : ''}`
  );

  const output = document.createElement('output');
  output.htmlFor = `param-${param.name}`;
  output.className = 'slider-value';

  // Display value with unit if available
  const formatValueWithUnit = (val) => {
    return param.unit ? `${val} ${param.unit}` : val;
  };
  output.textContent = formatValueWithUnit(param.default);

  input.addEventListener('input', (e) => {
    const value =
      param.type === 'integer'
        ? parseInt(e.target.value)
        : parseFloat(e.target.value);
    output.textContent = formatValueWithUnit(value);
    input.setAttribute('aria-valuenow', value);
    input.setAttribute(
      'aria-label',
      `${formatParamName(param.name)}: ${value}${param.unit ? ' ' + param.unit : ''}`
    );

    // Check if value is out of original range
    const limits = originalParameterLimits[param.name];
    if (limits && (value < limits.min || value > limits.max)) {
      container.classList.add('out-of-range');
    } else {
      container.classList.remove('out-of-range');
    }

    // Update reset button state
    updateResetButtonState(param.name, value);

    onChange(param.name, value);
  });

  sliderContainer.appendChild(input);
  sliderContainer.appendChild(output);

  // Show original default value hint (COGA: reduce memory load)
  // Use stored original default, not the current/effective value
  const originalDefault = defaultParameterValues[param.name];
  if (originalDefault !== undefined) {
    const defaultHint = document.createElement('span');
    defaultHint.className = 'param-default-value';
    defaultHint.textContent = formatValueWithUnit(originalDefault);
    defaultHint.setAttribute(
      'title',
      `Default: ${formatValueWithUnit(originalDefault)}`
    );
    sliderContainer.appendChild(defaultHint);
  }

  container.appendChild(sliderContainer);

  // Apply limits-unlocked class if needed
  if (limitsUnlocked) {
    container.classList.add('limits-unlocked');
  }

  return container;
}

/**
 * Create a parameter reset button
 * @param {Object} param - Parameter definition
 * @param {Function} onChange - Change handler
 * @returns {HTMLElement} Reset button element
 */
function createParameterResetButton(param, onChange) {
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'param-reset-btn';
  resetBtn.textContent = '↩';
  resetBtn.title = `Reset ${formatParamName(param.name)} to default`;
  resetBtn.setAttribute(
    'aria-label',
    `Reset ${formatParamName(param.name)} to default value`
  );
  resetBtn.dataset.paramName = param.name;

  resetBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetParameter(param.name, onChange);
  });

  return resetBtn;
}

/**
 * Update reset button state based on current value
 * @param {string} paramName - Parameter name
 * @param {*} currentValue - Current value
 */
function updateResetButtonState(paramName, currentValue) {
  const defaultValue = defaultParameterValues[paramName];
  const resetBtn = document.querySelector(
    `.param-reset-btn[data-param-name="${paramName}"]`
  );

  if (resetBtn) {
    // Compare values (handle type coercion)
    const isModified = String(currentValue) !== String(defaultValue);
    resetBtn.classList.toggle('modified', isModified);
  }
}

/**
 * Create a number input control
 * @param {Object} param - Parameter definition
 * @param {Function} onChange - Change handler
 * @returns {HTMLElement} Control element
 */
function createNumberInput(param, onChange) {
  const container = document.createElement('div');
  container.className = 'param-control';
  container.dataset.paramName = param.name;

  // Store original limits for unlock functionality
  if (param.minimum !== undefined || param.maximum !== undefined) {
    originalParameterLimits[param.name] = {
      min: param.minimum,
      max: param.maximum,
      step: param.step,
    };
  }

  // Label container with help tooltip and reset button
  const labelContainer = createLabelContainer(param, {
    includeResetButton: true,
    onChange,
  });
  container.appendChild(labelContainer);

  // Create wrapper for input + unit
  const inputContainer = document.createElement('div');
  inputContainer.className = 'number-input-container';

  const input = document.createElement('input');
  input.type = 'number';
  input.id = `param-${param.name}`;
  input.value = param.default;
  input.setAttribute(
    'aria-label',
    `Enter ${formatParamName(param.name)}${param.unit ? ' in ' + param.unit : ''}`
  );

  // Only apply limits if not unlocked
  if (!limitsUnlocked) {
    if (param.minimum !== undefined) {
      input.min = param.minimum;
      input.setAttribute('aria-valuemin', param.minimum);
    }
    if (param.maximum !== undefined) {
      input.max = param.maximum;
      input.setAttribute('aria-valuemax', param.maximum);
    }
  }
  if (param.step !== undefined) input.step = param.step;

  input.addEventListener('change', (e) => {
    const value =
      param.type === 'integer'
        ? parseInt(e.target.value)
        : parseFloat(e.target.value);

    // Check if value is out of original range
    const limits = originalParameterLimits[param.name];
    if (
      limits &&
      ((limits.min !== undefined && value < limits.min) ||
        (limits.max !== undefined && value > limits.max))
    ) {
      container.classList.add('out-of-range');
    } else {
      container.classList.remove('out-of-range');
    }

    // Update reset button state
    updateResetButtonState(param.name, value);

    onChange(param.name, value);
  });

  inputContainer.appendChild(input);

  // Add unit label if present
  if (param.unit) {
    const unitLabel = document.createElement('span');
    unitLabel.className = 'unit-label';
    unitLabel.textContent = param.unit;
    unitLabel.setAttribute('aria-hidden', 'true'); // Decorative, already in aria-label
    inputContainer.appendChild(unitLabel);
  }

  // Show original default value hint (COGA: reduce memory load)
  const originalDefault = defaultParameterValues[param.name];
  if (originalDefault !== undefined) {
    const defaultHint = document.createElement('span');
    defaultHint.className = 'param-default-value';
    defaultHint.textContent = param.unit
      ? `${originalDefault} ${param.unit}`
      : String(originalDefault);
    defaultHint.setAttribute(
      'title',
      `Default: ${originalDefault}${param.unit ? ' ' + param.unit : ''}`
    );
    inputContainer.appendChild(defaultHint);
  }

  container.appendChild(inputContainer);

  // Apply limits-unlocked class if needed
  if (
    limitsUnlocked &&
    (param.minimum !== undefined || param.maximum !== undefined)
  ) {
    container.classList.add('limits-unlocked');
  }

  return container;
}

/**
 * Create a select dropdown control
 * @param {Object} param - Parameter definition
 * @param {Function} onChange - Change handler
 * @returns {HTMLElement} Control element
 */
function createSelectControl(param, onChange) {
  const container = document.createElement('div');
  container.className = 'param-control';
  container.dataset.paramName = param.name;

  // Label container with help tooltip
  const labelContainer = createLabelContainer(param);
  container.appendChild(labelContainer);

  const select = document.createElement('select');
  select.id = `param-${param.name}`;
  select.setAttribute('aria-label', `Select ${formatParamName(param.name)}`);

  param.enum.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    if (value === param.default) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  select.addEventListener('change', (e) => {
    onChange(param.name, e.target.value);
  });

  container.appendChild(select);

  return container;
}

/**
 * Create a toggle switch control
 * @param {Object} param - Parameter definition
 * @param {Function} onChange - Change handler
 * @returns {HTMLElement} Control element
 */
function createToggleControl(param, onChange) {
  const container = document.createElement('div');
  container.className = 'param-control';
  container.dataset.paramName = param.name;

  // Label container with help tooltip
  const labelContainer = createLabelContainer(param, { useLabel: false });
  container.appendChild(labelContainer);

  const toggleContainer = document.createElement('div');
  toggleContainer.className = 'toggle-switch';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = `param-${param.name}`;
  input.setAttribute('role', 'switch');
  input.checked = param.default.toLowerCase() === 'yes';
  input.setAttribute('aria-label', `Toggle ${formatParamName(param.name)}`);
  input.setAttribute('aria-checked', param.default.toLowerCase() === 'yes');

  const label = document.createElement('label');
  label.htmlFor = `param-${param.name}`;
  label.className = 'toggle-label';
  label.textContent = formatParamName(param.name);

  input.addEventListener('change', (e) => {
    const value = e.target.checked ? 'yes' : 'no';
    input.setAttribute('aria-checked', e.target.checked);
    onChange(param.name, value);
  });

  toggleContainer.appendChild(input);
  toggleContainer.appendChild(label);

  container.appendChild(toggleContainer);

  return container;
}

/**
 * Create a text input control
 * @param {Object} param - Parameter definition
 * @param {Function} onChange - Change handler
 * @returns {HTMLElement} Control element
 */
function createTextInput(param, onChange) {
  const container = document.createElement('div');
  container.className = 'param-control';
  container.dataset.paramName = param.name;

  // Label container with help tooltip
  const labelContainer = createLabelContainer(param);
  container.appendChild(labelContainer);

  const input = document.createElement('input');
  input.type = 'text';
  input.id = `param-${param.name}`;
  input.value = param.default;
  input.setAttribute('aria-label', `Enter ${formatParamName(param.name)}`);

  input.addEventListener('change', (e) => {
    onChange(param.name, e.target.value);
  });
  container.appendChild(input);

  return container;
}

/**
 * Create a color picker control
 * @param {Object} param - Parameter definition
 * @param {Function} onChange - Change handler
 * @returns {HTMLElement} Control element
 */
function createColorControl(param, onChange) {
  const container = document.createElement('div');
  container.className = 'param-control param-control--color';

  // Label container with help tooltip
  const labelContainer = createLabelContainer(param);
  container.appendChild(labelContainer);

  const colorContainer = document.createElement('div');
  colorContainer.className = 'color-picker-container';

  // Normalize color value to hex format
  let hexValue = param.default || '#FF0000';
  if (!hexValue.startsWith('#')) {
    hexValue = '#' + hexValue;
  }
  // Ensure it's 6 digits
  if (hexValue.length === 4) {
    // Convert #RGB to #RRGGBB
    hexValue =
      '#' +
      hexValue[1] +
      hexValue[1] +
      hexValue[2] +
      hexValue[2] +
      hexValue[3] +
      hexValue[3];
  }

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.id = `param-${param.name}`;
  colorInput.value = hexValue;
  colorInput.className = 'color-picker';
  colorInput.setAttribute(
    'aria-label',
    `Select color for ${formatParamName(param.name)}`
  );

  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'color-hex-input';
  hexInput.value = hexValue.substring(1).toUpperCase(); // Remove # for display
  hexInput.placeholder = 'RRGGBB';
  hexInput.maxLength = 6;
  hexInput.setAttribute(
    'aria-label',
    `Hex color code for ${formatParamName(param.name)}`
  );

  const preview = document.createElement('div');
  preview.className = 'color-preview';
  preview.style.backgroundColor = hexValue;
  preview.setAttribute('role', 'img');
  preview.setAttribute('aria-label', `Color preview: ${hexValue}`);

  // Update on color picker change
  colorInput.addEventListener('input', (e) => {
    const hex = e.target.value;
    hexInput.value = hex.substring(1).toUpperCase();
    preview.style.backgroundColor = hex;
    preview.setAttribute('aria-label', `Color preview: ${hex}`);
    onChange(param.name, hex.substring(1)); // Store without #
  });

  // Update on hex input change
  hexInput.addEventListener('input', (e) => {
    let hex = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
    hexInput.value = hex;

    if (hex.length === 6) {
      const fullHex = '#' + hex;
      colorInput.value = fullHex;
      preview.style.backgroundColor = fullHex;
      preview.setAttribute('aria-label', `Color preview: ${fullHex}`);
      onChange(param.name, hex); // Store without #
    }
  });

  colorContainer.appendChild(preview);
  colorContainer.appendChild(colorInput);
  colorContainer.appendChild(hexInput);

  container.appendChild(colorContainer);

  return container;
}

/**
 * Create a file upload control
 * @param {Object} param - Parameter definition
 * @param {Function} onChange - Change handler
 * @returns {HTMLElement} Control element
 */
function createFileControl(param, onChange) {
  const container = document.createElement('div');
  container.className = 'param-control param-control--file';

  // Label container with help tooltip
  const labelContainer = createLabelContainer(param);
  container.appendChild(labelContainer);

  const fileContainer = document.createElement('div');
  fileContainer.className = 'file-upload-container';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = `param-${param.name}`;
  fileInput.className = 'file-input';
  fileInput.setAttribute(
    'aria-label',
    `Upload file for ${formatParamName(param.name)}`
  );

  // Set accepted file types if specified
  if (param.acceptedExtensions && param.acceptedExtensions.length > 0) {
    fileInput.accept = param.acceptedExtensions
      .map((ext) => `.${ext}`)
      .join(',');
  }

  const fileButton = document.createElement('button');
  fileButton.type = 'button';
  fileButton.className = 'file-upload-button';
  fileButton.textContent = '📁 Choose File';
  fileButton.setAttribute(
    'aria-label',
    `Choose file for ${formatParamName(param.name)}`
  );

  const fileInfo = document.createElement('div');
  fileInfo.className = 'file-info';
  fileInfo.textContent = param.default || 'No file selected';
  fileInfo.setAttribute('role', 'status');
  fileInfo.setAttribute('aria-live', 'polite');

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'file-clear-button';
  clearButton.textContent = '✕';
  clearButton.title = 'Clear file';
  clearButton.setAttribute(
    'aria-label',
    `Clear file for ${formatParamName(param.name)}`
  );
  clearButton.style.display = 'none';

  // Button triggers file input
  fileButton.addEventListener('click', () => {
    fileInput.click();
  });

  // Handle file selection
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        // Read file as base64
        const reader = new FileReader();
        reader.onload = (evt) => {
          const dataUrl = evt.target.result;
          fileInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
          fileInfo.title = file.name;
          clearButton.style.display = 'inline-block';

          // Pass file data to onChange
          onChange(param.name, {
            name: file.name,
            size: file.size,
            type: file.type,
            data: dataUrl,
          });
        };
        reader.onerror = () => {
          fileInfo.textContent = 'Error reading file';
          fileInfo.className = 'file-info file-info--error';
        };
        reader.readAsDataURL(file);
      } catch (error) {
        fileInfo.textContent = 'Error reading file';
        fileInfo.className = 'file-info file-info--error';
        console.error('File read error:', error);
      }
    }
  });

  // Clear file
  clearButton.addEventListener('click', () => {
    fileInput.value = '';
    fileInfo.textContent = 'No file selected';
    fileInfo.className = 'file-info';
    clearButton.style.display = 'none';
    onChange(param.name, null);
  });

  fileContainer.appendChild(fileButton);
  fileContainer.appendChild(fileInfo);
  fileContainer.appendChild(clearButton);
  fileContainer.appendChild(fileInput);

  container.appendChild(fileContainer);

  return container;
}

// formatFileSize is now imported from download.js

/**
 * Render parameter UI from extracted parameters
 * @param {Object} extractedParams - Output from extractParameters()
 * @param {HTMLElement} container - Container to render into
 * @param {Function} onChange - Called when parameter changes
 * @param {Object} [initialValues] - Optional initial values to override defaults
 * @returns {Object} Current parameter values
 */
export function renderParameterUI(
  extractedParams,
  container,
  onChange,
  initialValues = null
) {
  container.innerHTML = '';

  const { groups, parameters } = extractedParams;
  const currentValues = {};

  // Reset stored limits and metadata when re-rendering
  originalParameterLimits = {};
  parameterMetadata = {};

  // Group parameters by group
  const paramsByGroup = {};
  Object.values(parameters).forEach((param) => {
    if (!paramsByGroup[param.group]) {
      paramsByGroup[param.group] = [];
    }
    // Use initialValues if provided, otherwise use default
    const effectiveDefault =
      initialValues && initialValues[param.name] !== undefined
        ? initialValues[param.name]
        : param.default;
    // Create a copy of param with the effective default
    const paramWithValue = { ...param, default: effectiveDefault };
    paramsByGroup[param.group].push(paramWithValue);
    currentValues[param.name] = effectiveDefault;

    // Store the original default value (from schema, not initialValues)
    defaultParameterValues[param.name] = param.default;

    // Store metadata for search functionality
    parameterMetadata[param.name] = {
      label: formatParamName(param.name),
      description: param.description || '',
      group: param.group,
      type: param.type,
      uiType: param.uiType,
    };
  });

  // Store current values for dependency checking
  currentParameterValues = { ...currentValues };

  // Sort groups by order
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  // Populate the jump-to-group dropdown
  populateGroupJumpSelect(sortedGroups);

  // Track if first group has been rendered (for auto-open)
  let isFirstGroup = true;

  // Render each group
  sortedGroups.forEach((group) => {
    const groupParams = paramsByGroup[group.id] || [];
    if (groupParams.length === 0) return;

    // Sort parameters by order
    groupParams.sort((a, b) => a.order - b.order);

    const details = document.createElement('details');
    details.className = 'param-group';
    // Open first group by default for better discoverability (WCAG/COGA)
    details.open = isFirstGroup;
    isFirstGroup = false;
    // Add data attribute for jump-to navigation
    details.dataset.groupId = group.id;

    const summary = document.createElement('summary');
    summary.textContent = group.label;
    details.appendChild(summary);

    groupParams.forEach((param) => {
      let control;

      // Create onChange handler that also updates dependent parameters
      const handleChange = (name, value) => {
        currentValues[name] = value;
        currentParameterValues[name] = value;
        // Update dependent parameters visibility
        updateDependentParameters(name, value);
        onChange(currentValues);
      };

      switch (param.uiType) {
        case 'slider':
          control = createSliderControl(param, handleChange);
          break;

        case 'select':
          control = createSelectControl(param, handleChange);
          break;

        case 'toggle':
          control = createToggleControl(param, handleChange);
          break;

        case 'color':
          control = createColorControl(param, handleChange);
          break;

        case 'file':
          control = createFileControl(param, handleChange);
          break;

        case 'input':
        default:
          if (param.type === 'integer' || param.type === 'number') {
            control = createNumberInput(param, handleChange);
          } else {
            control = createTextInput(param, handleChange);
          }
          break;
      }

      // Apply dependency attributes and initial visibility
      applyDependency(control, param, currentValues);

      details.appendChild(control);
    });

    container.appendChild(details);
  });

  // Initialize parameter search after rendering
  initParameterSearch();

  return currentValues;
}

/**
 * Render parameter UI from JSON Schema
 * This is the schema-driven rendering entry point
 * @public
 * @param {Object} schema - JSON Schema with x-* extensions
 * @param {HTMLElement} container - Container to render into
 * @param {Function} onChange - Called when parameter changes
 * @param {Object} [initialValues] - Optional initial values to override defaults
 * @returns {Object} Current parameter values
 * @note Currently not integrated into main workflow, but exported as part of the
 *       public API for schema-based UI generation. Planned for future integration.
 */
export function renderFromSchema(
  schema,
  container,
  onChange,
  initialValues = null
) {
  // Lazy import to avoid circular dependency
  // The schema-generator module is imported dynamically
  return import('./schema-generator.js').then(({ fromJsonSchema }) => {
    const extracted = fromJsonSchema(schema);
    return renderParameterUI(extracted, container, onChange, initialValues);
  });
}

/**
 * Synchronous version of renderFromSchema
 * Requires schema-generator to be pre-imported
 * @public
 * @param {Object} schema - JSON Schema with x-* extensions
 * @param {Function} converter - The fromJsonSchema function
 * @param {HTMLElement} container - Container to render into
 * @param {Function} onChange - Called when parameter changes
 * @param {Object} [initialValues] - Optional initial values to override defaults
 * @returns {Object} Current parameter values
 * @note Currently not integrated into main workflow, but exported as part of the
 *       public API for schema-based UI generation. Planned for future integration.
 */
export function renderFromSchemaSync(
  schema,
  converter,
  container,
  onChange,
  initialValues = null
) {
  const extracted = converter(schema);
  return renderParameterUI(extracted, container, onChange, initialValues);
}
