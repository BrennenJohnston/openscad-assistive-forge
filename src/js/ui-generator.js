/**
 * UI Generator - Renders form controls from schema
 * @license GPL-3.0-or-later
 */

import { formatFileSize } from './download.js';
import { announceChange } from './announcer.js';
import { reapplyDetailLevel } from './param-detail-controller.js';

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
    labelText.className = 'param-label-text';
    labelText.textContent = formatParamName(param.name);
    labelContainer.appendChild(labelText);
  }

  // Add visible description element (visibility controlled by data-detail-level CSS)
  if (param.description) {
    labelContainer.dataset.hasDescription = 'true';
    const descEl = document.createElement('span');
    descEl.className = 'param-description';
    descEl.textContent = param.description;
    labelContainer.appendChild(descEl);
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
const defaultParameterValues = {};

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

    // Update number inputs (including slider spinboxes)
    const numberInputs = control.querySelectorAll('input[type="number"]');
    numberInputs.forEach((numberInput) => {
      if (unlocked) {
        numberInput.removeAttribute('min');
        numberInput.removeAttribute('max');
        control.classList.add('limits-unlocked');
      } else {
        if (limits.min !== undefined) numberInput.min = limits.min;
        if (limits.max !== undefined) numberInput.max = limits.max;
        control.classList.remove('limits-unlocked');
      }
    });
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
    const strVal = String(value).toLowerCase();
    input.checked = strVal === 'yes' || strVal === 'true' || value === true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (input.tagName === 'SELECT') {
    input.value = String(value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (input.type === 'range') {
    input.value = String(value);
    // Also update paired spinbox if present
    const spinbox = control.querySelector('.slider-spinbox');
    if (spinbox) {
      spinbox.value = String(value);
    }
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
      const strVal = String(defaultValue).toLowerCase();
      input.checked = strVal === 'yes' || strVal === 'true';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.type === 'range') {
      input.value = defaultValue;
      // Also update paired spinbox if present
      const spinbox = control.querySelector('.slider-spinbox');
      if (spinbox) {
        spinbox.value = defaultValue;
      }
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
        control.classList.remove('hidden');
        control.setAttribute('aria-hidden', 'false');

        // Re-enable inputs for accessibility
        const inputs = control.querySelectorAll('input, select, textarea');
        inputs.forEach((input) => input.removeAttribute('tabindex'));

        // Announce to screen readers
        announceChange(`${formatParamName(paramName)} is now visible`);
      } else {
        control.classList.add('hidden');
        control.setAttribute('aria-hidden', 'true');

        // Move focus to a visible element if the hidden control was focused
        if (control.contains(document.activeElement)) {
          // Find next visible sibling or parent summary
          const group = control.closest('.param-group');
          const nextVisible = control.nextElementSibling?.matches(':not(.hidden)')
            ? control.nextElementSibling
            : group?.querySelector('summary');
          if (nextVisible) {
            const focusable = nextVisible.querySelector('input, select, textarea, button') || nextVisible;
            focusable.focus();
          }
        }

        // Remove from tab order when hidden
        const inputs = control.querySelectorAll('input, select, textarea');
        inputs.forEach((input) => input.setAttribute('tabindex', '-1'));

        announceChange(`${formatParamName(paramName)} is now hidden`);
      }
    }
  });
}

// announceChange is now imported from ./announcer.js for centralized screen reader announcements

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
    container.classList.add('hidden');
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
 * Classify whether a parameter group belongs to the Simple tier.
 *
 * Classification heuristic (works for ANY .scad file):
 *   1. Annotation override: if group.annotation === 'advanced', return false
 *   2. Mounting-keyword rule: groups whose names contain mounting terms are Advanced
 *   3. Threshold: if <= 7 groups total, all are Simple
 *   4. First 7 groups (by document order) are Simple; rest are Advanced
 *
 * @param {Object} group - Group definition with id, label, annotation, etc.
 * @param {Array} allGroups - All groups in sort order
 * @param {number} index - This group's index in allGroups
 * @returns {boolean} true if the group belongs to the Simple tier
 */
export function isSimpleGroup(group, allGroups, index) {
  // 1. Explicit annotation overrides everything
  if (group.annotation === 'advanced') return false;

  // 2. Mounting-keyword groups default to Advanced
  const mountingKeywords = /velcro|clip|post|shelf|tab|strap/i;
  if (mountingKeywords.test(group.label)) return false;

  // 3. Threshold: if <= 7 groups total, all are Simple
  if (allGroups.length <= 7) return true;

  // 4. First 7 groups (by document order) are Simple
  return index < 7;
}

/**
 * Populate the jump-to-group dropdown with all groups.
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
 * Create a range slider control with editable spinbox
 * Users need to enter precise pixel values (0-10000 range)
 * Sliders alone make it impossible to enter discrete values accurately.
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
    `${formatParamName(param.name)} slider`
  );

  // Create editable spinbox for precise value entry
  const spinbox = document.createElement('input');
  spinbox.type = 'number';
  spinbox.id = `param-${param.name}-spinbox`;
  spinbox.className = 'slider-spinbox';
  spinbox.min = limitsUnlocked ? '' : param.minimum;
  spinbox.max = limitsUnlocked ? '' : param.maximum;
  // Spinbox step is INDEPENDENT of slider step (desktop OpenSCAD parity)
  // For integers: step=1 so user can type any whole number (e.g., 1234 for [0:50:10000])
  // For floats: step="any" so user can type precise decimal values (e.g., 3.14 for [0:0.5:10])
  spinbox.step = param.type === 'integer' ? 1 : 'any';
  spinbox.value = param.default;
  spinbox.setAttribute('inputmode', param.type === 'integer' ? 'numeric' : 'decimal');
  spinbox.setAttribute(
    'aria-label',
    `${formatParamName(param.name)} value${param.unit ? ' in ' + param.unit : ''}, editable`
  );
  // Link slider and spinbox for screen readers
  spinbox.setAttribute('aria-describedby', `param-${param.name}`);

  // Display value with unit if available
  const formatValueWithUnit = (val) => {
    return param.unit ? `${val} ${param.unit}` : val;
  };

  // Unit label (display only, not editable)
  const unitLabel = param.unit
    ? (() => {
        const span = document.createElement('span');
        span.className = 'slider-unit';
        span.textContent = param.unit;
        span.setAttribute('aria-hidden', 'true');
        return span;
      })()
    : null;

  // Shared update logic
  const updateValue = (value, source) => {
    const parsedValue =
      param.type === 'integer' ? parseInt(value) : parseFloat(value);
    
    if (isNaN(parsedValue)) return;

    // Update both controls bidirectionally
    if (source !== 'slider') {
      input.value = parsedValue;
      input.setAttribute('aria-valuenow', parsedValue);
    }
    if (source !== 'spinbox') {
      spinbox.value = parsedValue;
    }

    // Check if value is out of original range
    const limits = originalParameterLimits[param.name];
    if (limits && (parsedValue < limits.min || parsedValue > limits.max)) {
      container.classList.add('out-of-range');
    } else {
      container.classList.remove('out-of-range');
    }

    // Update reset button state
    updateResetButtonState(param.name, parsedValue);

    return parsedValue;
  };

  // Slider input event - updates spinbox in real-time
  input.addEventListener('input', (e) => {
    const value = updateValue(e.target.value, 'slider');
    if (value !== undefined) {
      onChange(param.name, value);
    }
  });

  // Spinbox input event - updates slider in real-time for visual feedback
  spinbox.addEventListener('input', (e) => {
    updateValue(e.target.value, 'spinbox');
    // Don't trigger onChange on every keystroke - wait for change event
  });

  // Spinbox change event - triggers preview update (on Enter or blur)
  spinbox.addEventListener('change', (e) => {
    const value = updateValue(e.target.value, 'spinbox');
    if (value !== undefined) {
      onChange(param.name, value);
    }
  });

  // Independent spinbox step for keyboard/wheel interactions
  // Uses 1 for integers, 0.1 for floats (not the slider's coarse step)
  const spinboxStep = param.type === 'integer' ? 1 : 0.1;

  // Keyboard enhancements for spinbox
  spinbox.addEventListener('keydown', (e) => {
    const currentVal = parseFloat(spinbox.value) || 0;
    
    // Shift+Arrow for 10x step increment (power user feature)
    if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const multiplier = e.key === 'ArrowUp' ? 10 : -10;
      const newValue = currentVal + spinboxStep * multiplier;
      
      // Respect limits unless unlocked
      const limits = originalParameterLimits[param.name];
      if (!limitsUnlocked && limits) {
        if (newValue < limits.min || newValue > limits.max) return;
      }
      
      spinbox.value = newValue;
      spinbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // Wheel event handler for spinbox (desktop OpenSCAD parity: scroll wheel changes value)
  spinbox.addEventListener('wheel', (e) => {
    // Only handle wheel when spinbox is focused (don't hijack page scroll)
    if (document.activeElement !== spinbox) return;
    e.preventDefault();

    const currentVal = parseFloat(spinbox.value) || 0;
    // Shift+wheel for 10x step (matching Shift+Arrow behavior)
    const effectiveStep = e.shiftKey ? spinboxStep * 10 : spinboxStep;
    const direction = e.deltaY < 0 ? 1 : -1; // Scroll up = increment
    const newValue = currentVal + effectiveStep * direction;

    // Respect limits unless unlocked
    const limits = originalParameterLimits[param.name];
    if (!limitsUnlocked && limits) {
      if (newValue < limits.min || newValue > limits.max) return;
    }

    spinbox.value = param.type === 'integer' ? Math.round(newValue) : newValue;
    spinbox.dispatchEvent(new Event('change', { bubbles: true }));
  }, { passive: false });

  sliderContainer.appendChild(input);
  sliderContainer.appendChild(spinbox);
  if (unitLabel) {
    sliderContainer.appendChild(unitLabel);
  }

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

  param.enum.forEach((item) => {
    const option = document.createElement('option');
    // Support both new labeled format { value, label } and legacy string format
    const value = typeof item === 'object' ? item.value : item;
    const label = typeof item === 'object' ? item.label : item;
    
    option.value = value;
    option.textContent = label;
    
    // Check for selected - compare with string version of default
    const defaultStr = String(param.default);
    if (value === defaultStr || value === param.default) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  select.addEventListener('change', (e) => {
    let value = e.target.value;
    if (param.type === 'integer') {
      const n = parseInt(value, 10);
      if (!isNaN(n)) value = n;
    } else if (param.type === 'number') {
      const n = parseFloat(value);
      if (!isNaN(n)) value = n;
    }
    onChange(param.name, value);
  });

  container.appendChild(select);

  return container;
}

/**
 * Create a toggle switch control
 * Supports both yes/no enums and true/false booleans
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

  // Determine if this is a boolean (true/false) or yes/no toggle
  const isBoolean = param.type === 'boolean';
  const defaultStr = String(param.default).toLowerCase();
  const isChecked = isBoolean
    ? defaultStr === 'true'
    : defaultStr === 'yes';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = `param-${param.name}`;
  input.setAttribute('role', 'switch');
  input.checked = isChecked;
  input.setAttribute('aria-label', `Toggle ${formatParamName(param.name)}`);
  input.setAttribute('aria-checked', String(isChecked));

  const label = document.createElement('label');
  label.htmlFor = `param-${param.name}`;
  label.className = 'toggle-label';
  label.textContent = formatParamName(param.name);

  input.addEventListener('change', (e) => {
    // Return appropriate value type based on parameter type
    const value = isBoolean
      ? (e.target.checked ? 'true' : 'false')
      : (e.target.checked ? 'yes' : 'no');
    input.setAttribute('aria-checked', String(e.target.checked));
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

  // Apply maxLength if specified (OpenSCAD Customizer format: //8)
  if (param.maxLength && param.maxLength > 0) {
    input.maxLength = param.maxLength;
    input.setAttribute('aria-describedby', `${input.id}-hint`);
    
    // Add a hint about the character limit for accessibility
    const hint = document.createElement('span');
    hint.id = `${input.id}-hint`;
    hint.className = 'param-hint';
    hint.textContent = `(max ${param.maxLength} characters)`;
    labelContainer.appendChild(hint);
  }

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
    const hex = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
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
 * Create a vector parameter control with individual component inputs
 * @param {Object} param - Parameter definition with components array
 * @param {Function} onChange - Change handler
 * @returns {HTMLElement} Control element
 */
function createVectorControl(param, onChange) {
  const container = document.createElement('fieldset');
  container.className = 'param-control vector-parameter';
  container.dataset.paramName = param.name;

  // Create legend (acts like label for fieldset)
  const legend = document.createElement('legend');
  legend.className = 'parameter-label';
  legend.textContent = formatParamName(param.name);

  // Add help button if description exists
  const helpTooltip = createHelpTooltip(param);
  if (helpTooltip) {
    legend.appendChild(helpTooltip);
  }

  container.appendChild(legend);

  // Add description paragraph if exists
  if (param.description) {
    const descId = `${param.name}-desc`;
    const descPara = document.createElement('p');
    descPara.className = 'parameter-description';
    descPara.id = descId;
    descPara.textContent = param.description;
    container.appendChild(descPara);
  }

  // Create vector inputs container
  const vectorInputs = document.createElement('div');
  vectorInputs.className = 'vector-inputs';
  vectorInputs.setAttribute('role', 'group');
  vectorInputs.setAttribute(
    'aria-label',
    `Vector parameter ${formatParamName(param.name)}`
  );

  // Store original limits for unlock functionality
  if (param.minimum !== undefined || param.maximum !== undefined) {
    originalParameterLimits[param.name] = {
      min: param.minimum,
      max: param.maximum,
      step: param.step,
    };
  }

  // Create input for each component
  const values = Array.isArray(param.default) ? [...param.default] : [];
  const components = param.components || [];

  components.forEach((comp, index) => {
    const compContainer = document.createElement('div');
    compContainer.className = 'vector-component';

    const inputId = `${param.name}-${index}`;
    const rangeId = `${inputId}-range`;

    // Component label
    const label = document.createElement('label');
    label.htmlFor = inputId;
    label.className = 'component-label';
    label.textContent = comp.label || `[${index}]`;
    compContainer.appendChild(label);

    // Number input
    const input = document.createElement('input');
    input.type = 'number';
    input.id = inputId;
    input.name = `${param.name}[${index}]`;
    input.value = comp.value ?? values[index] ?? 0;
    input.className = 'vector-input';

    // Build aria-describedby
    const describedBy = [];
    if (param.description) describedBy.push(`${param.name}-desc`);
    describedBy.push(rangeId);
    input.setAttribute('aria-describedby', describedBy.join(' '));

    // Set constraints
    if (comp.minimum !== undefined) {
      input.min = comp.minimum;
      input.setAttribute('aria-valuemin', comp.minimum);
    } else if (param.minimum !== undefined) {
      input.min = param.minimum;
      input.setAttribute('aria-valuemin', param.minimum);
    }

    if (comp.maximum !== undefined) {
      input.max = comp.maximum;
      input.setAttribute('aria-valuemax', comp.maximum);
    } else if (param.maximum !== undefined) {
      input.max = param.maximum;
      input.setAttribute('aria-valuemax', param.maximum);
    }

    if (comp.step !== undefined) {
      input.step = comp.step;
    } else if (param.step !== undefined) {
      input.step = param.step;
    }

    // Input event handler
    input.addEventListener('input', () => {
      const newValue = parseFloat(input.value);
      values[index] = isNaN(newValue) ? 0 : newValue;

      // Announce change for screen readers
      announceChange(
        `${comp.label || `Component ${index + 1}`}: ${values[index]}${comp.unit ? ' ' + comp.unit : ''}`
      );

      // Trigger onChange with the full vector
      onChange(param.name, [...values]);
    });

    // Keyboard navigation: arrow keys increment/decrement
    input.addEventListener('keydown', (e) => {
      const step =
        comp.step !== undefined
          ? comp.step
          : param.step !== undefined
            ? param.step
            : 1;
      const currentVal = parseFloat(input.value) || 0;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newVal = currentVal + step;
        const maxVal =
          comp.maximum !== undefined
            ? comp.maximum
            : param.maximum !== undefined
              ? param.maximum
              : Infinity;
        if (newVal <= maxVal) {
          input.value = newVal;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newVal = currentVal - step;
        const minVal =
          comp.minimum !== undefined
            ? comp.minimum
            : param.minimum !== undefined
              ? param.minimum
              : -Infinity;
        if (newVal >= minVal) {
          input.value = newVal;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (e.key === 'Escape') {
        // Reset to default
        const defaultVal = param.default?.[index] ?? 0;
        input.value = defaultVal;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    compContainer.appendChild(input);

    // Range hint below input
    const rangeHint = document.createElement('span');
    rangeHint.id = rangeId;
    rangeHint.className = 'range-hint';
    const min =
      comp.minimum !== undefined
        ? comp.minimum
        : param.minimum !== undefined
          ? param.minimum
          : null;
    const max =
      comp.maximum !== undefined
        ? comp.maximum
        : param.maximum !== undefined
          ? param.maximum
          : null;
    if (min !== null && max !== null) {
      rangeHint.textContent = `${min} - ${max}`;
    } else if (min !== null) {
      rangeHint.textContent = `≥ ${min}`;
    } else if (max !== null) {
      rangeHint.textContent = `≤ ${max}`;
    }
    compContainer.appendChild(rangeHint);

    vectorInputs.appendChild(compContainer);
  });

  container.appendChild(vectorInputs);

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
 * Create a raw/read-only parameter control for unparseable values
 * @param {Object} param - Parameter definition with rawValue
 * @param {Function} onChange - Change handler
 * @returns {HTMLElement} Control element
 */
function createRawControl(param, onChange) {
  const container = document.createElement('div');
  container.className = 'param-control raw-parameter';
  container.dataset.paramName = param.name;

  // Label container with help tooltip
  const labelContainer = createLabelContainer(param);
  container.appendChild(labelContainer);

  const rawContainer = document.createElement('div');
  rawContainer.className = 'raw-value-container';

  // Create text input for raw editing
  const input = document.createElement('input');
  input.type = 'text';
  input.id = `param-${param.name}`;
  input.className = 'raw-input';
  input.value =
    param.rawValue ||
    (Array.isArray(param.default) ? JSON.stringify(param.default) : param.default);
  input.setAttribute(
    'aria-label',
    `Enter ${formatParamName(param.name)} as OpenSCAD expression`
  );

  // Add warning if parsing failed
  if (param.parseFailureReason) {
    const warning = document.createElement('span');
    warning.className = 'raw-warning';
    warning.textContent = 'Contains expressions - edit as text';
    warning.setAttribute('role', 'note');
    rawContainer.appendChild(warning);
  }

  input.addEventListener('change', (e) => {
    const value = e.target.value;
    // Try to parse as JSON array, fallback to string
    try {
      const parsed = JSON.parse(value);
      onChange(param.name, parsed);
    } catch {
      // Keep as string - will be passed to OpenSCAD as-is
      onChange(param.name, value);
    }
  });

  rawContainer.appendChild(input);
  container.appendChild(rawContainer);

  return container;
}

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
  // Also collect global parameters (isGlobal: true) to show on all tabs (OpenSCAD Customizer spec)
  const paramsByGroup = {};
  const globalParams = [];
  
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
    
    // Collect global parameters separately (they'll be shown on ALL groups)
    if (param.isGlobal) {
      globalParams.push(paramWithValue);
    } else {
      paramsByGroup[param.group].push(paramWithValue);
    }
    
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

  // Populate the jump-to-group dropdown (all groups visible)
  populateGroupJumpSelect(sortedGroups);

  // Track if first group has been rendered (for auto-open)
  let isFirstGroup = true;

  // Render each group
  sortedGroups.forEach((group, index) => {
    const groupParams = paramsByGroup[group.id] || [];
    
    // Skip groups with no params (unless there are global params to show)
    if (groupParams.length === 0 && globalParams.length === 0) return;

    // Combine global params (shown at top of every group) with group-specific params
    // Global params are sorted by their order, then group params by their order
    const sortedGlobalParams = [...globalParams].sort((a, b) => a.order - b.order);
    const sortedGroupParams = [...groupParams].sort((a, b) => a.order - b.order);
    const allGroupParams = [...sortedGlobalParams, ...sortedGroupParams];

    const details = document.createElement('details');
    details.className = 'param-group forge-disclosure';
    // Open first group by default for better discoverability (WCAG/COGA)
    details.open = isFirstGroup;
    isFirstGroup = false;
    // Add data attribute for jump-to navigation
    details.dataset.groupId = group.id;

    // Tag group with its settings level classification (metadata only, all groups visible)
    const simple = isSimpleGroup(group, sortedGroups, index);
    details.dataset.settingsLevel = simple ? 'simple' : 'advanced';

    const summary = document.createElement('summary');
    summary.className = 'param-group-summary';

    const summaryLabel = document.createElement('span');
    summaryLabel.textContent = group.label;
    summary.appendChild(summaryLabel);

    // Hide group button — keyboard accessible with aria-pressed
    const hideBtn = document.createElement('button');
    hideBtn.className = 'param-group-hide-btn';
    hideBtn.type = 'button';
    hideBtn.setAttribute('aria-label', `Hide ${group.label} group`);
    hideBtn.setAttribute('aria-pressed', 'false');
    hideBtn.title = 'Hide this group';
    hideBtn.innerHTML = '&#x2715;'; // × character
    hideBtn.addEventListener('click', (e) => {
      // Prevent the summary toggle from firing
      e.stopPropagation();
      e.preventDefault();
      // Dispatch custom event so main.js can persist the hidden state
      details.dispatchEvent(new CustomEvent('group-hide', {
        bubbles: true,
        detail: { groupId: group.id, groupLabel: group.label },
      }));
    });
    summary.appendChild(hideBtn);

    details.appendChild(summary);

    allGroupParams.forEach((param) => {
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

        case 'vector':
          control = createVectorControl(param, handleChange);
          break;

        case 'raw':
          control = createRawControl(param, handleChange);
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

  // Re-apply detail level to newly rendered parameters
  reapplyDetailLevel();

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
