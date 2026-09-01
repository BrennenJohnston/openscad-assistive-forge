/**
 * UI Generator - Renders form controls from schema
 * @license GPL-3.0-or-later
 */

import { formatFileSize } from './download.js';
import { announceChange, announceImmediate } from './announcer.js';
import { reapplyDetailLevel } from './param-detail-controller.js';
import { isRasterImageFile } from './file-param-resolver.js';
import {
  convertImageDataToSvg,
  loadImageData,
  validateImageDimensions,
} from './image-import.js';
import { isEnabled } from './feature-flags.js';
import {
  prepareSvg,
  needsPreparation,
  analyzeSvg,
  measureSvgAspect,
  parseSvgElements,
  classifyElements,
  flattenLayers,
  flattenSilhouette,
  flattenToCompoundPath,
  LAYER_EMIT_CAP,
} from './svg-preparer.js';
import {
  buildNestingTree,
  suggestLayers,
  layerLimit,
  boundsOf,
} from './svg-nesting.js';
import {
  createSvgPrepWorkspace,
  extractSvgMeta,
} from './svg-preparer-workspace.js';
import { checkHolePlacement } from './hole-placement.js';
import { STENCIL_PLATE_CAP, JIG_DEFAULTS } from './stencil-limits.js';
import { buildBridges, bridgesToPathData } from './stencil-bridges.js';
import { svgToDataUrl, dataUrlToText } from './svg-text-encoding.js';
import {
  loadOpenGroupIds,
  saveOpenGroupIds,
} from './customizer-group-state.js';
import {
  normalizeStarterList,
  resolveStarterParameters,
  starterViewApplies,
  starterAnnouncement,
  starterHint,
  SHOW_ALL_LABEL,
  SHOW_STARTER_LABEL,
} from './starter-parameters.js';

// Active fileId for the Customizer pane. Set when a project is loaded
// so subsequent group toggles (including programmatic Expand/Collapse
// All) can persist per-file state without every re-render call site
// needing to know about it. F5.
let _activeCustomizerFileId = null;

/**
 * Tell the Customizer pane which project file is currently active.
 * Set to `null` to disable per-file persistence (e.g. on welcome screen).
 *
 * @param {string|null} fileId
 */
export function setCustomizerFileId(fileId) {
  _activeCustomizerFileId =
    typeof fileId === 'string' && fileId.length > 0 ? fileId : null;
}

/**
 * @returns {string|null}
 */
export function getCustomizerFileId() {
  return _activeCustomizerFileId;
}

// The starter subset a manifest declared, and the project it declared it for.
// Keyed by file so it cannot survive into the next project somebody opens:
// a starter list belongs to the design it came with. IR-9.
let _starterDeclaration = { names: [], fileKey: null };

/**
 * Tell the Customizer which parameters this project says to show first.
 *
 * @param {unknown} names    `defaults.starterParameters` from a manifest
 * @param {string|null} fileKey  The main file this list belongs to
 */
export function setStarterParameters(names, fileKey = null) {
  _starterDeclaration = {
    names: normalizeStarterList(names),
    fileKey: typeof fileKey === 'string' && fileKey ? fileKey : null,
  };
}

/**
 * @returns {{names: string[], fileKey: string|null}}
 */
export function getStarterParameters() {
  return { ..._starterDeclaration, names: [..._starterDeclaration.names] };
}

/** Forget any declared starter subset. */
export function clearStarterParameters() {
  _starterDeclaration = { names: [], fileKey: null };
}

/**
 * Read the currently-expanded group IDs from a Customizer container.
 * Useful when a re-render needs to preserve user-driven UI state.
 *
 * @param {HTMLElement|null} container
 * @returns {Set<string>}
 */
export function getOpenGroupIdsFromDOM(container) {
  const out = new Set();
  if (!container) return out;
  const groups = container.querySelectorAll('details.param-group');
  groups.forEach((d) => {
    if (d.open && d.dataset.groupId) out.add(d.dataset.groupId);
  });
  return out;
}

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

/**
 * Optionally prepare an SVG for OpenSCAD import when the svg_preparer
 * feature flag is enabled. Multi-element SVGs are flattened into a single
 * compound path. Single-element SVGs pass through unchanged.
 * @param {string} svgText - Raw SVG markup
 * @returns {string} Prepared SVG or the original if no preparation needed
 */
function maybePrepareForOpenScad(svgText) {
  try {
    if (isEnabled('svg_preparer') && needsPreparation(svgText)) {
      const prepared = prepareSvg(svgText);
      console.log(
        '[SVG Preparer] Auto-prepared multi-element SVG for OpenSCAD'
      );
      return prepared;
    }
  } catch (err) {
    console.warn('[SVG Preparer] Preparation failed, using original:', err);
  }
  return svgText;
}

// Gallery options for file parameters (populated by example manifest loading)
let galleryOptionsMap = {};

// Per-param references to gallery listbox DOM nodes for dynamic insertion
const galleryListboxRefs = {};

// Optional listener called when a user uploads an SVG via the file picker
let fileUploadListener = null;

// SVG preparation metadata keyed by filename — persisted to saved projects
// so that reopening a project restores the exact preparation state.
let svgPrepMetadataByFile = {};

/**
 * Register bundled SVG gallery options for a file parameter.
 * Called when loading an example whose manifest declares an svgLibrary.
 * @param {string} paramName - File parameter name
 * @param {Array<{file: string, label: string, url: string}>} options - Gallery entries
 */
export function setGalleryOptions(paramName, options) {
  galleryOptionsMap[paramName] = options;
}

/**
 * Clear all gallery options (called when switching examples or clearing files).
 */
export function clearGalleryOptions() {
  galleryOptionsMap = {};
  for (const key of Object.keys(galleryListboxRefs)) {
    delete galleryListboxRefs[key];
  }
  svgPrepMetadataByFile = {};
}

/**
 * Get stored SVG preparation metadata for a given filename.
 * Returns the metadata object or null if none is stored.
 * @param {string} fileName
 * @returns {{rawSvg: string, preparedSvg: string|null, prepOverrides: string[]|null, prepOffsets: number[]|null, prepDeleted: number[]|null, prepLayers: number[]|null, prepAnalysis: Object|null}|null}
 */
export function getSvgPrepMetadata(fileName) {
  return svgPrepMetadataByFile[fileName] || null;
}

/**
 * Store SVG preparation metadata for a given filename.
 * Pass null to clear metadata for the file.
 * @param {string} fileName
 * @param {{rawSvg: string, preparedSvg: string|null, prepOverrides: string[]|null, prepOffsets: number[]|null, prepDeleted: number[]|null, prepLayers: number[]|null}|null} metadata
 */
export function setSvgPrepMetadata(fileName, metadata) {
  if (metadata) {
    svgPrepMetadataByFile[fileName] = metadata;
  } else {
    delete svgPrepMetadataByFile[fileName];
  }
}

/**
 * Clear all stored SVG preparation metadata.
 */
export function clearSvgPrepMetadata() {
  svgPrepMetadataByFile = {};
}

/**
 * Return the parameter names that currently have gallery options registered.
 * @returns {string[]}
 */
export function getGalleryParamNames() {
  return Object.keys(galleryOptionsMap);
}

/**
 * Set a listener that is called when the user uploads an SVG via a file picker.
 * @param {Function|null} fn - Callback `(paramName, fileObj) => void`
 */
export function setFileUploadListener(fn) {
  fileUploadListener = fn;
}

/**
 * Dynamically append a user-uploaded SVG option to a live gallery.
 * If the gallery DOM is not rendered, the option is only added to the options map
 * so it appears on next render.
 * @param {string} paramName - File parameter name
 * @param {{file: string, label: string, url: string, userUpload?: boolean}} svgOpt
 */
export function appendUserSvgToGallery(paramName, svgOpt) {
  if (!galleryOptionsMap[paramName]) {
    galleryOptionsMap[paramName] = [];
  }
  const opts = galleryOptionsMap[paramName];

  if (opts.some((o) => o.file === svgOpt.file && o.userUpload)) return;

  opts.push(svgOpt);

  const ref = galleryListboxRefs[paramName];
  if (!ref) return;

  const { listbox, onSelectFn, paramDef } = ref;

  // Insert a "Your uploads" heading before the first user upload
  if (!listbox.parentNode.querySelector('.svg-gallery-user-heading')) {
    const heading = document.createElement('span');
    heading.className = 'svg-gallery-heading svg-gallery-user-heading';
    heading.textContent = 'Your uploads';
    listbox.parentNode.insertBefore(heading, listbox.nextSibling);
    const userListbox = document.createElement('div');
    userListbox.className = 'svg-gallery-listbox svg-gallery-user-listbox';
    userListbox.setAttribute('role', 'listbox');
    userListbox.setAttribute('aria-label', 'Your uploaded designs');
    heading.parentNode.insertBefore(userListbox, heading.nextSibling);
    ref.userListbox = userListbox;
  }

  const targetListbox = ref.userListbox || listbox;
  const userCount = targetListbox.querySelectorAll('[role="option"]').length;

  const option = document.createElement('button');
  option.type = 'button';
  option.className = 'svg-gallery-option';
  option.setAttribute('role', 'option');
  option.setAttribute('aria-selected', 'false');
  option.id = `gallery-user-${paramDef.name}-${userCount}`;
  option.title = svgOpt.label;

  const thumb = document.createElement('img');
  thumb.src = svgOpt.url;
  thumb.alt = svgOpt.label;
  thumb.className = 'svg-gallery-thumb';
  thumb.loading = 'lazy';
  thumb.setAttribute('aria-hidden', 'true');
  option.appendChild(thumb);

  const label = document.createElement('span');
  label.className = 'svg-gallery-label';
  label.textContent = svgOpt.label;
  option.appendChild(label);

  option.addEventListener('click', () => {
    fetch(svgOpt.url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch ${svgOpt.file}`);
        return res.text();
      })
      .then((svgText) => {
        const toUse = isEnabled('svg_preparer')
          ? svgText
          : maybePrepareForOpenScad(svgText);
        const svgDataUrl = svgToDataUrl(toUse);
        announceChange(`Selected design: ${svgOpt.label}`);
        onSelectFn(paramDef.name, {
          name: svgOpt.file.split('/').pop(),
          size: toUse.length,
          type: 'image/svg+xml',
          data: svgDataUrl,
          _rawSvg: svgText,
        });
      })
      .catch((err) => {
        console.error('[SvgGallery] user upload fetch error:', err);
      });
  });

  targetListbox.appendChild(option);
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
          const nextVisible = control.nextElementSibling?.matches(
            ':not(.hidden)'
          )
            ? control.nextElementSibling
            : group?.querySelector('summary');
          if (nextVisible) {
            const focusable =
              nextVisible.querySelector('input, select, textarea, button') ||
              nextVisible;
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
        // IR-9: the jump list offers every group, including ones the starter
        // wall is hiding. Jumping to one has to bring it back, or the jump
        // lands on nothing.
        if (groupElement.classList.contains('starter-empty')) {
          setStarterViewExpanded(
            document.getElementById('parametersContainer'),
            true,
            { announce: false }
          );
        }
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
  // IR-9: a search that cannot find a parameter the design HAS is a lie, and
  // the starter wall would make it one. Searching drops the wall and says so.
  // It stays down afterwards: raising it again under someone who just went
  // looking for something would be worse than leaving it open.
  if (query) {
    const container = document.getElementById('parametersContainer');
    if (isStarterViewActive(container)) {
      setStarterViewExpanded(container, true, { announce: true });
    }
  }

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
  input.setAttribute('aria-label', `${formatParamName(param.name)} slider`);

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
  spinbox.setAttribute(
    'inputmode',
    param.type === 'integer' ? 'numeric' : 'decimal'
  );
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
  spinbox.addEventListener(
    'wheel',
    (e) => {
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

      spinbox.value =
        param.type === 'integer' ? Math.round(newValue) : newValue;
      spinbox.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { passive: false }
  );

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
  const isChecked = isBoolean ? defaultStr === 'true' : defaultStr === 'yes';

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
      ? e.target.checked
        ? 'true'
        : 'false'
      : e.target.checked
        ? 'yes'
        : 'no';
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

  const applyHint = document.createElement('span');
  applyHint.id = `${input.id}-apply-hint`;
  applyHint.className = 'param-hint';
  applyHint.textContent = 'Press Enter to apply';
  container.appendChild(applyHint);

  const describedBy = [input.getAttribute('aria-describedby'), applyHint.id]
    .filter(Boolean)
    .join(' ');
  input.setAttribute('aria-describedby', describedBy);

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
 * Create an accessible SVG gallery picker for file parameters with bundled options.
 * Implements WCAG listbox pattern with arrow key navigation and focus management.
 *
 * @param {Array<{file: string, label: string, url: string}>} options - Gallery entries
 * @param {Object} param - Parameter definition
 * @param {Function} onSelect - Called with file-like object when a design is selected
 * @returns {HTMLElement} Gallery container element
 */
function createSvgGallery(options, param, onSelect) {
  const gallery = document.createElement('div');
  gallery.className = 'svg-gallery';

  const heading = document.createElement('span');
  heading.className = 'svg-gallery-heading';
  heading.textContent = 'Choose a design';
  heading.id = `gallery-heading-${param.name}`;
  gallery.appendChild(heading);

  const listbox = document.createElement('div');
  listbox.className = 'svg-gallery-listbox';
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-labelledby', heading.id);
  listbox.setAttribute('tabindex', '0');

  let activeIndex = -1;

  function setActiveOption(index) {
    const items = listbox.querySelectorAll('[role="option"]');
    items.forEach((item, i) => {
      const isActive = i === index;
      item.classList.toggle('svg-gallery-option--active', isActive);
      item.setAttribute('aria-selected', String(isActive));
    });
    if (items[index]) {
      listbox.setAttribute('aria-activedescendant', items[index].id);
      if (typeof items[index].scrollIntoView === 'function') {
        items[index].scrollIntoView({ block: 'nearest' });
      }
    }
    activeIndex = index;
  }

  function selectOption(index) {
    const opt = options[index];
    if (!opt) return;
    setActiveOption(index);

    fetch(opt.url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch ${opt.file}`);
        return res.text();
      })
      .then((svgText) => {
        const toUse = isEnabled('svg_preparer')
          ? svgText
          : maybePrepareForOpenScad(svgText);
        const svgDataUrl = svgToDataUrl(toUse);
        announceChange(`Selected design: ${opt.label}`);
        onSelect(param.name, {
          name: opt.file.split('/').pop(),
          size: toUse.length,
          type: 'image/svg+xml',
          data: svgDataUrl,
          _rawSvg: svgText,
        });
      })
      .catch((err) => {
        console.error('[SvgGallery] fetch error:', err);
        announceChange(`Failed to load design: ${opt.label}`);
      });
  }

  // Pre-select the option matching the parameter's current default so
  // users can see which design is loaded.
  const defaultBasename = String(param.default || '')
    .split('/')
    .pop();

  options.forEach((opt, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'svg-gallery-option';
    option.setAttribute('role', 'option');
    const isDefault =
      defaultBasename !== '' && opt.file.split('/').pop() === defaultBasename;
    if (isDefault) {
      option.classList.add('svg-gallery-option--active');
      activeIndex = index;
    }
    option.setAttribute('aria-selected', String(isDefault));
    option.id = `gallery-${param.name}-${index}`;
    option.title = opt.label;

    const thumb = document.createElement('img');
    thumb.src = opt.url;
    thumb.alt = opt.label;
    thumb.className = 'svg-gallery-thumb';
    thumb.loading = 'lazy';
    thumb.setAttribute('aria-hidden', 'true');
    option.appendChild(thumb);

    const label = document.createElement('span');
    label.className = 'svg-gallery-label';
    label.textContent = opt.label;
    option.appendChild(label);

    option.addEventListener('click', () => selectOption(index));

    listbox.appendChild(option);
  });

  if (activeIndex >= 0) {
    listbox.setAttribute(
      'aria-activedescendant',
      `gallery-${param.name}-${activeIndex}`
    );
  }

  // Arrow key navigation within the listbox
  listbox.addEventListener('keydown', (e) => {
    const count = options.length;
    if (!count) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = activeIndex < count - 1 ? activeIndex + 1 : 0;
      setActiveOption(next);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = activeIndex > 0 ? activeIndex - 1 : count - 1;
      setActiveOption(prev);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (activeIndex >= 0) selectOption(activeIndex);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveOption(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveOption(count - 1);
    }
  });

  gallery.appendChild(listbox);

  galleryListboxRefs[param.name] = {
    listbox,
    onSelectFn: onSelect,
    paramDef: param,
  };

  return gallery;
}

/**
 * Create a file upload control with optional image preview and
 * automatic PNG/JPG-to-SVG conversion when the parameter accepts SVG.
 * @param {Object} param - Parameter definition
 * @param {Function} onChange - Change handler
 * @returns {HTMLElement} Control element
 */
/**
 * True when a parameter is the auto-measured aspect companion of a file
 * parameter: named "<file_param>_aspect" where <file_param> exists and is a
 * file control. Companions carry the uploaded design's width/height ratio
 * so the model can contain-fit it; they are set by the file control, never
 * by hand, and are hidden from the generated UI.
 *
 * @param {string} name - Parameter name to test
 * @param {Object} parameters - All extracted parameters, keyed by name
 * @returns {boolean}
 */
export function isAspectCompanionParam(name, parameters) {
  if (!name.endsWith('_aspect')) return false;
  const base = parameters[name.slice(0, -'_aspect'.length)];
  return !!base && base.uiType === 'file';
}

/**
 * The per-layer companions a layered tile declares (DP-7).
 *
 * A file parameter named `design_file` looks for `design_layer_1`,
 * `design_layer_2`, `design_layer_3` and their `_aspect` companions - the
 * names the plan fixed. A tile that declares none is not a layered tile and
 * nothing below this ever runs for it.
 *
 * @param {Object} param - The file parameter
 * @param {Object} parameters - All extracted parameters, keyed by name
 * @returns {Array<{file: Object, aspect: Object|null, layer: number}>}
 */
/**
 * The stencil plates a layered tile declares (DP-12).
 *
 * A file parameter looks for `stencil_plate_1..3` beside it. A tile that
 * declares none is not a layered stencil and nothing below this runs for it.
 *
 * @param {Object} parameters - All extracted parameters, keyed by name
 * @returns {Array<{file: Object, plate: number}>}
 */
export function findLaserParam(parameters) {
  const p = parameters && parameters.stencil_laser_file;
  return p && p.uiType === 'file' ? p : null;
}

/**
 * Everything that turns a drawing into stencil plates, loaded on demand.
 *
 * ★ IT IS A LAZY CHUNK BECAUSE IT DOES NOT FIT. The colour model, the ring
 * geometry, the plate builder and the jig come to a little over 4 KB gzipped,
 * and the core bundle had 704 bytes left. MEASURED: in the core, 516,052 B
 * against a 512,000 budget; with the colour model alone split out, 513,070,
 * still over; with the whole engine split out, 511,384 and passing. Most
 * people never open a stencil, so this is where it belongs anyway.
 *
 * The load starts as soon as a tile with plate parameters builds its
 * controls, which is seconds before anybody can choose a file. If a drawing
 * somehow arrives first, the plates are emitted again the moment the chunk
 * lands rather than half-emitted from a module that is not there.
 */
let stencilEngine = null;
let stencilEnginePromise = null;

function loadStencilEngine() {
  if (!stencilEnginePromise) {
    stencilEnginePromise = Promise.all([
      import('./stencil-plates.js'),
      import('./stencil-colours.js'),
      import('./stencil-jig.js'),
    ])
      .then(([plates, colours, jig]) => {
        stencilEngine = { ...plates, ...colours, ...jig };
        return stencilEngine;
      })
      .catch((err) => {
        // Not swallowed: without this chunk the layered mode cannot work, and
        // saying nothing would leave a person waiting for plates that are
        // never coming.
        console.error('The stencil engine could not be loaded:', err);
        stencilEnginePromise = null;
        throw err;
      });
  }
  return stencilEnginePromise;
}

export function findPlateParams(parameters) {
  if (!parameters) return [];
  const out = [];
  // Up to STENCIL_PLATE_CAP, which is NOT the charm engine's LAYER_EMIT_CAP:
  // one is how many paint colours a stencil may have (eight, the owner's
  // number) and the other is how many relief passes a tiered charm builds
  // (three). Walking the wrong one capped a six-colour cat at three plates.
  for (let n = 1; n <= STENCIL_PLATE_CAP; n++) {
    const file = parameters[`stencil_plate_${n}`];
    if (!file || file.uiType !== 'file') break;
    out.push({ file, plate: n });
  }
  return out;
}

export function findSilhouetteParams(param, parameters) {
  if (!param || !parameters) return null;
  const base = param.name.endsWith('_file')
    ? param.name.slice(0, -'_file'.length)
    : param.name;
  const file = parameters[`${base}_silhouette`];
  if (!file || file.uiType !== 'file') return null;
  return { file, aspect: parameters[`${base}_silhouette_aspect`] || null };
}

export function findLayerParams(param, parameters) {
  if (!param || !parameters) return [];
  const base = param.name.endsWith('_file')
    ? param.name.slice(0, -'_file'.length)
    : param.name;
  const out = [];
  for (let n = 1; n <= LAYER_EMIT_CAP; n++) {
    const file = parameters[`${base}_layer_${n}`];
    if (!file || file.uiType !== 'file') break;
    out.push({
      file,
      aspect: parameters[`${base}_layer_${n}_aspect`] || null,
      layer: n,
    });
  }
  return out;
}

/**
 * Whether a parameter is a per-layer companion the app writes for itself.
 *
 * Like the aspect companions, these get a value but no control: they are
 * derived from the design and the Layer column, never typed.
 *
 * @param {string} name - Parameter name to test
 * @param {Object} parameters - All extracted parameters, keyed by name
 * @returns {boolean}
 */
export function isLayerCompanionParam(name, parameters) {
  if (/^stencil_plate_\d+$/.test(name)) return true;
  const m = /^(.*)_(?:layer_\d+|silhouette)(_aspect)?$/.exec(name);
  if (!m) return false;
  const base = parameters[`${m[1]}_file`] || parameters[m[1]];
  return !!base && base.uiType === 'file';
}

/**
 * A file name with its extension removed, for naming layer companions after
 * the design they were cut from.
 *
 * @param {string} name
 * @returns {string}
 */
function layerFileStem(name) {
  const safe = String(name || 'design');
  const dot = safe.lastIndexOf('.');
  return dot > 0 ? safe.slice(0, dot) : safe;
}

/**
 * Where the hole warning is shown, if this model can have one (DP-11).
 *
 * One region for the whole model rather than one per control: the warning is
 * about a PLACE, and the three numbers that decide it (across, up, and the
 * hole's size) each move it. Announcing from three different controls would
 * say the same sentence three times.
 */
let holeWarningEl = null;
let lastHoleWarning = null;

export function resetHolePlacementRegion() {
  holeWarningEl = null;
  lastHoleWarning = null;
}

function ensureHoleWarningRegion(container) {
  if (holeWarningEl && holeWarningEl.isConnected) return holeWarningEl;
  holeWarningEl = document.createElement('p');
  holeWarningEl.className = 'hole-placement-warning';
  holeWarningEl.setAttribute('role', 'status');
  holeWarningEl.setAttribute('aria-live', 'polite');
  holeWarningEl.hidden = true;
  container.prepend(holeWarningEl);
  return holeWarningEl;
}

/**
 * Check the hole against the design's outline and say so, once.
 *
 * NOTHING IS MOVED and nothing is blocked: the person is told, with the
 * numbers, and decides. Silently relocating a ring on a pendant shaped like
 * their own drawing would be a change they never made and never saw.
 *
 * @param {Object} values - Current parameter values
 * @param {Object} parameters - The model's parameter table
 */
export function reportHolePlacement(values, parameters) {
  if (!holeWarningEl || !values || !parameters) return;
  const outlineParam = Object.keys(parameters).find((n) =>
    n.endsWith('_silhouette')
  );
  if (!outlineParam) return;

  const outline = values[outlineParam];
  const svgText =
    outline && typeof outline === 'object' && outline.data
      ? dataUrlToText(outline.data)
      : null;

  const result = checkHolePlacement({
    outlineSvg: svgText,
    widthMm: Number(values.charm_width) || 0,
    holeDiameterMm: Number(values.hole_diameter) || 0,
    offsetXMm: Number(values.attachment_x) || 0,
    offsetYMm: Number(values.attachment_y) || 0,
  });

  const attached = values.attachment_type && values.attachment_type !== 'none';
  const message = attached && !result.ok ? result.message : null;
  if (message === lastHoleWarning) return;
  lastHoleWarning = message;

  holeWarningEl.textContent = message || '';
  holeWarningEl.hidden = !message;
  if (message) announceChange(message);
}

/**
 * The bridge warning: a shape that will fall out when the sheet is cut.
 *
 * NOT DISMISSIBLE, on purpose. The failure is invisible until the material is
 * cut and the piece is on the floor, so there is no moment at which hiding it
 * helps. It shares the one warning region, because a model is either a pendant
 * or a stencil and never both.
 *
 * @param {string|null} message
 */
export function reportBridgeWarning(message) {
  if (!holeWarningEl) return;
  if (message === lastHoleWarning) return;
  lastHoleWarning = message;
  holeWarningEl.textContent = message || '';
  holeWarningEl.hidden = !message;
  if (message) announceChange(message);
}

function createFileControl(
  param,
  onChange,
  aspectParam = null,
  layerParams = [],
  silhouetteParams = null,
  plateParams = [],
  laserParam = null
) {
  // Start the stencil engine on its way now. A person needs seconds at least
  // to choose a drawing, and by then the chunk is here.
  if (plateParams.length > 0) loadStencilEngine().catch(() => {});

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
  // A default can be a string or a file OBJECT (the shape a saved plate
  // value travels in). The object's name is the honest text; anything
  // else printed "[object Object]" to the person and the screen reader.
  const defaultFileLabel =
    typeof param.default === 'string'
      ? param.default
      : typeof param.default?.name === 'string'
        ? param.default.name
        : '';
  fileInfo.textContent = defaultFileLabel || 'No file selected';
  fileInfo.setAttribute('role', 'status');
  fileInfo.setAttribute('aria-live', 'polite');

  // Image preview thumbnail (hidden until a raster image is uploaded)
  const preview = document.createElement('img');
  preview.className = 'file-preview-thumbnail';
  preview.style.display = 'none';
  preview.setAttribute('role', 'img');
  preview.alt = '';

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

  let currentRawSvg = null;
  let currentFileName = null;
  let currentSvgAnalysis = null;

  const acceptsSvg = param.acceptedExtensions?.includes('svg');

  /**
   * Every change to this parameter's file value goes through here so the
   * aspect companion (when the model declares one) always travels in the
   * SAME state update: the design and its measured width/height ratio can
   * never be seen apart by the renderer or by undo.
   * @param {Object|null} value - File object {name, data, ...} or null
   */
  /**
   * The per-layer companion values for one design (DP-7).
   *
   * Runs on the RAW svg, because by the time a value reaches emitFileValue it
   * is a single compound path and the element identities the layers are cut
   * from are gone.
   *
   * Every layer param the model declares gets a value on every emit, INCLUDING
   * null when there is nothing to build at that depth. Leaving a stale layer
   * file behind would print the previous design's second pass on top of this
   * one.
   *
   * @param {Object|null} value - The file value being emitted
   * @param {Array<number>|null} assignments - The editor's Layer column, by
   *   original index; null means use the depth suggestion
   * @returns {Object} Parameter names to values, for the SAME state update
   */
  function buildLayerCompanions(value, assignments) {
    const out = {};
    for (const { file, aspect } of layerParams) {
      out[file.name] = null;
      if (aspect) out[aspect.name] = aspect.default ?? 1;
    }
    if (!value || !currentRawSvg) return out;

    let svgs = [];
    try {
      const elements = classifyElements(parseSvgElements(currentRawSvg));
      const tree = buildNestingTree(elements);
      const limit = layerLimit(tree);
      const layers = Array.isArray(assignments)
        ? elements.map((_, i) => assignments[i] || 1)
        : suggestLayers(tree).map((v) => v || 1);
      const meta = extractSvgMeta(currentRawSvg);
      svgs = flattenLayers(elements, layers, limit, meta);
    } catch (err) {
      // A design the layer analysis cannot read still uploads: the ordinary
      // single-file path is unaffected, and the layer params stay null rather
      // than carrying half a stack.
      console.warn('Per-layer emission failed:', err);
      return out;
    }

    layerParams.forEach(({ file, aspect, layer }) => {
      const svg = svgs[layer - 1];
      if (!svg) return;
      const name = `${layerFileStem(value.name)}_layer_${layer}.svg`;
      out[file.name] = {
        name,
        data: svgToDataUrl(svg),
        type: 'image/svg+xml',
      };
      if (aspect) {
        out[aspect.name] = measureSvgAspect(svg) ?? aspect.default ?? 1;
      }
    });
    return out;
  }

  /**
   * The design's outline, for a model that can take its shape from it (DP-11).
   *
   * Cut from the RAW svg for the same reason the layers are: by the time a
   * value reaches emitFileValue it is one compound path. And from the raw
   * GEOMETRY specifically - an outline drawn as a stroke would otherwise come
   * back as a thin band and the pendant would print as a hollow ring.
   *
   * @param {Object|null} value - The file value being emitted
   * @returns {Object} Parameter names to values, for the SAME state update
   */
  function buildSilhouetteCompanion(value) {
    const { file, aspect } = silhouetteParams;
    const out = { [file.name]: null };
    if (aspect) out[aspect.name] = aspect.default ?? 1;
    if (!value || !currentRawSvg) return out;
    try {
      const raw = parseSvgElements(currentRawSvg);
      const roles = classifyElements(raw).map((el) => el.role);
      const svg = flattenSilhouette(raw, roles, extractSvgMeta(currentRawSvg));
      if (!svg) return out;
      out[file.name] = {
        name: `${layerFileStem(value.name)}_outline.svg`,
        data: svgToDataUrl(svg),
        type: 'image/svg+xml',
      };
      if (aspect)
        out[aspect.name] = measureSvgAspect(svg) ?? aspect.default ?? 1;
    } catch (err) {
      // A design whose outline cannot be read still uploads as an ordinary
      // design; only the shape-from-design option is unavailable.
      console.warn('Silhouette emission failed:', err);
    }
    return out;
  }

  /**
   * The stencil plates, for a tile that builds them (DP-12, DP-17).
   *
   * A CONTRACT with public/examples/stencil-maker/stencil_maker.scad: the
   * plate size is read from `plate_width`, `plate_height` and `margin`, and
   * the jig from `registration` and its five numbers, because the app writes
   * plates that are already mm-true and the model is a dumb extruder. Change
   * those names in the model and change them here.
   *
   * ★ A PLATE IS A COLOUR NOW, not a nesting depth (DP-16). The regions of the
   * drawing are found, given colours, put in a paint order, and each plate
   * cuts what its rule says. Until the editor exists, a drawing with no
   * colours of its own gets ONE colour - the base coat - and therefore one
   * plate cutting the whole silhouette. That is the honest answer to "what
   * colours does this line drawing have", and it is an answer a person changes
   * by painting regions rather than one the app guesses from nesting depth.
   *
   * @param {Object|null} value - The design being emitted
   * @param {Object} values - Current parameter values, for the plate size
   * @returns {Object} Parameter names to values, for the SAME state update
   */
  function buildPlateCompanions(value, values) {
    const out = {};
    for (const { file } of plateParams) out[file.name] = null;
    if (laserParam) out[laserParam.name] = null;
    if (!value || !currentRawSvg) return out;

    if (!stencilEngine) {
      // The chunk is still on its way. Emit nothing rather than half of it,
      // and do the whole emission again when it lands, so a plate is never in
      // a different state update from the design it was cut from (D-108).
      loadStencilEngine().then(() => {
        if (currentRawSvg) emitFileValue(value);
      });
      return out;
    }
    const {
      buildStencilPlate,
      buildLaserSheet,
      fitRingsToPlate,
      buildRegions,
      paletteFromFills,
      autoAssign,
      defaultOrder,
      platesFor,
      jigFits,
    } = stencilEngine;

    try {
      const els = classifyElements(parseSvgElements(currentRawSvg));
      const meta = extractSvgMeta(currentRawSvg);

      const plateW = Number(values.plate_width) || 200;
      const plateH = Number(values.plate_height) || 200;
      const marginMm = Number(values.margin) || 15;
      const scalePercent = Number(values.design_scale) || 100;
      const registration = String(values.registration || 'crosses');
      const wantPegs = registration === 'pegs' || registration === 'both';
      const wantCrosses =
        values.marks !== 'no' &&
        (registration === 'crosses' || registration === 'both');
      const askedPegs = wantPegs
        ? {
            pegDiameter:
              Number(values.peg_diameter) || JIG_DEFAULTS.pegDiameter,
            keyWidth: Number(values.key_width) || JIG_DEFAULTS.keyWidth,
            keyDepth: Number(values.key_depth) || JIG_DEFAULTS.keyDepth,
            featureInset:
              Number(values.feature_inset) || JIG_DEFAULTS.featureInset,
            holeClearance:
              values.hole_clearance === undefined
                ? JIG_DEFAULTS.holeClearance
                : Number(values.hole_clearance),
          }
        : null;
      // A jig that would break the plate edge or reach into the design is not
      // drawn at all: half a registration hole is worse than none. The model
      // asserts the same thing, so the two cannot disagree about it.
      const jigOk = askedPegs
        ? jigFits({ plateW, plateH, marginMm, ...askedPegs })
        : null;
      if (jigOk && !jigOk.ok) console.warn('Stencil jig:', jigOk.reason);
      const pegs = jigOk && jigOk.ok ? askedPegs : null;

      const { regions, silhouette, lineMode } = buildRegions(els);
      // The person's plan when they have applied one, the automatic first
      // pass otherwise. Same regions, same keys, either way.
      const planned = currentPlan
        ? stencilEngine.applySavedPlan(currentPlan, regions)
        : null;
      const palette = planned?.palette || paletteFromFills(regions);
      const assignment = planned?.assignment || autoAssign(regions, palette);
      const order = (
        planned?.order || defaultOrder(regions, assignment, palette)
      ).slice(0, STENCIL_PLATE_CAP);
      const plan = {
        palette,
        order,
        assignment,
        rule: planned?.rule || 'stacked',
        lineMode,
      };
      const cuts = platesFor(plan, regions, silhouette);
      const names = new Map(palette.map((c) => [c.id, c.name]));

      // ONE content box for every plate and for the laser sheet, so the
      // colours land on each other, and ONE fit from it onto the plate. That
      // is the whole of D-122, said in two lines.
      const contentBox = boundsOf(
        [...(silhouette || []), ...cuts.flatMap((c) => c.rings)].flat()
      );
      if (!contentBox) return out;
      const plateSpec = { plateW, plateH, marginMm, scalePercent };

      if (laserParam) {
        const whole = flattenToCompoundPath(els, meta);
        const wholeD = whole ? (/ d="([^"]*)"/.exec(whole)?.[1] ?? null) : null;
        let ribD = '';
        let warning = null;
        if (values.bridges !== 'no') {
          const b = buildBridges(els, buildNestingTree(els), {
            count: Number(values.bridge_count) || 2,
            widthMm: Number(values.bridge_width) || undefined,
          });
          ribD = bridgesToPathData(b.rects);
          warning = b.message;
        }
        const sheet = buildLaserSheet({
          cutPathData: wholeD,
          // The whole-design flatten and the bridges are both in the design's
          // own units, so they take the same move onto the shared box that
          // the plates take.
          cutTransform: {
            scale: 1,
            dx: -contentBox.minX,
            dy: -contentBox.minY,
          },
          bridgePathData: ribD,
          canvasSpan: contentBox.maxX - contentBox.minX,
          canvasHeight: contentBox.maxY - contentBox.minY,
          plateW,
          plateH,
          marginMm,
          scalePercent,
          marks: wantCrosses,
        });
        out[laserParam.name] = {
          name: `${layerFileStem(value.name)}_laser.svg`,
          data: svgToDataUrl(sheet.svg),
          type: 'image/svg+xml',
        };
        reportBridgeWarning(warning);
      }

      plateParams.forEach(({ file, plate }) => {
        const cut = cuts[plate - 1];
        if (!cut) return;
        const { svg } = buildStencilPlate({
          rings: fitRingsToPlate(cut.rings, contentBox, plateSpec),
          plateW,
          plateH,
          marginMm,
          scalePercent,
          marks: wantCrosses,
          pegs,
          layer: plate,
          layerCount: cuts.length,
          colourName: names.get(cut.colourId) || null,
        });
        out[file.name] = {
          name: `${layerFileStem(value.name)}_plate_${plate}.svg`,
          data: svgToDataUrl(svg),
          type: 'image/svg+xml',
        };
      });
    } catch (err) {
      // A design the plate builder cannot read still uploads as an ordinary
      // single-sheet stencil; only the layered mode is unavailable.
      console.warn('Stencil plate emission failed:', err);
    }
    return out;
  }

  function emitFileValue(value, assignments = null) {
    let extra = null;
    if (aspectParam) {
      let aspect = null;
      const isSvgValue =
        value &&
        typeof value === 'object' &&
        value.data &&
        (value.type === 'image/svg+xml' ||
          (value.name || '').toLowerCase().endsWith('.svg'));
      if (isSvgValue) {
        aspect = measureSvgAspect(dataUrlToText(value.data));
      }
      // Cleared or unmeasurable: back to the declared default so the
      // model's fallback stays deterministic.
      extra = { [aspectParam.name]: aspect ?? aspectParam.default ?? 1 };
    }
    // D-108's law generalized: every layer file and every layer aspect rides
    // in the SAME state update as the design itself, so the renderer and undo
    // can never see a stack half-changed.
    if (layerParams.length > 0) {
      extra = { ...(extra || {}), ...buildLayerCompanions(value, assignments) };
    }
    if (silhouetteParams) {
      extra = { ...(extra || {}), ...buildSilhouetteCompanion(value) };
    }
    if (plateParams.length > 0) {
      extra = {
        ...(extra || {}),
        ...buildPlateCompanions(value, currentParameterValues),
      };
    }
    onChange(param.name, value, extra);
  }

  // ── SVG analysis status card ───────────────────────────────────────────
  const statusCard = document.createElement('div');
  statusCard.className = 'svg-prep-status';
  statusCard.style.display = 'none';
  statusCard.setAttribute('role', 'status');
  statusCard.setAttribute('aria-live', 'polite');

  // ── Ink controls, for a picture that had to be traced ──────────────────
  // Built only when a raster file arrives, and kept with its pixels so a mode
  // change re-reads the same picture instead of the file.
  const inkControlsContainer = document.createElement('div');
  inkControlsContainer.className = 'ink-controls-container';
  inkControlsContainer.hidden = true;
  let inkControls = null;
  let inkSourceImageData = null;
  let inkSourceFileName = null;
  let inkRetraceTimer = null;

  // ── The drawing editor (DP-19) ─────────────────────────────────────────
  // It lives in the PREVIEW AREA now, not in a block inside this control. The
  // container below survives for the case where there is no preview area to
  // take - a unit test mounting this generator on its own - so the editing
  // still works and nothing has to know which it got.
  const workspaceContainer = document.createElement('div');
  workspaceContainer.className = 'svg-prep-workspace-container';

  let workspace = null;
  // The colour plan the person applied in the editor (stencil purpose), as
  // `serialisePlan` wrote it. Session only until DP-20 saves it with the
  // project; null means the plates follow the automatic first pass.
  let currentPlan = null;

  /**
   * The editor, built on first use. The surface and everything it pulls in
   * is a lazy chunk: a person who never opens it never downloads it.
   */
  async function getEditor() {
    if (!acceptsSvg) return null;
    // The preview rebuilds its container when it re-initialises, and an
    // editor built inside the old one is a tree nothing is attached to.
    if (workspace && workspace._root && !workspace._root.isConnected) {
      workspace.destroy();
      workspace = null;
    }
    if (workspace) return workspace;
    const surfaceEl = document.getElementById('drawingEditorSurface');
    if (surfaceEl) {
      const { createDrawingEditor } =
        await import('./drawing-editor/surface.js');
      // Two uploads in quick succession can both be waiting on the chunk.
      if (workspace) return workspace;
      workspace = createDrawingEditor({
        surfaceEl,
        announce: announceChange,
        // The preview manager lives in main.js and this module does not
        // reach for it: the surface says it is opening and whoever owns the
        // preview decides what that means for the canvas.
        onOpen: () =>
          window.dispatchEvent(new CustomEvent('drawing-editor:open')),
        onClose: () =>
          window.dispatchEvent(new CustomEvent('drawing-editor:close')),
      });
    } else {
      workspace = createSvgPrepWorkspace(workspaceContainer);
    }
    return workspace;
  }

  /** What the editor needs to reopen the current drawing as it was left. */
  function editorOptions(extra = {}) {
    const storedMeta = currentFileName
      ? getSvgPrepMetadata(currentFileName)
      : null;
    return {
      purpose: plateParams.length > 0 ? 'stencil' : 'relief',
      onApply: handleEditorApply,
      onKeepOriginal: handleEditorKeep,
      sourceName: currentFileName,
      initialOverrides: storedMeta?.prepOverrides || null,
      initialOffsets: storedMeta?.prepOffsets || null,
      // DP-4: restored BEFORE the roles above, because the editor reopens on
      // the raw SVG and re-analyses it - so everything saved is expressed in
      // the ORIGINAL element indices, the only numbering a delete leaves
      // meaningful. Absent in older saved projects, which is exactly right:
      // nothing was deleted then.
      initialDeleted: storedMeta?.prepDeleted || null,
      // DP-7. The column exists only for a tile that declares layer params.
      layersEnabled: layerParams.length > 0,
      initialLayers: storedMeta?.prepLayers || null,
      // DP-20. The colour plan a person applied, keyed by region (a property
      // of the shape) so it survives the regions being found again. Absent
      // in older saves and in a drawing nobody has coloured yet, which means
      // what it always did: the automatic first pass.
      initialPlan: currentPlan || storedMeta?.prepPlan || null,
      ...extra,
    };
  }

  /** Open the editor on the current drawing; the surface says so itself. */
  function openEditor(extra = {}) {
    const svg = currentRawSvg;
    const analysis = currentSvgAnalysis;
    if (!svg || !analysis) return Promise.resolve(false);
    return getEditor().then((editor) => {
      // The drawing may have been replaced while the chunk was coming.
      if (!editor || currentRawSvg !== svg) return false;
      editor.open(svg, analysis, editorOptions(extra));
      return true;
    });
  }

  /**
   * Does the drawing bring colours of its own? Two distinct fills at least;
   * a line drawing is all black or all unfilled and brings none.
   */
  function hasOwnColours(analysis) {
    const fills = new Set();
    for (const el of analysis?.elements || []) {
      const hex = (el.fill || '').trim().toLowerCase();
      if (/^#[0-9a-f]{3,8}$/.test(hex)) fills.add(hex);
    }
    return fills.size >= 2;
  }

  function createStatusEditButton() {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'svg-prep-edit-btn btn btn-ghost';
    // STRINGS: owner review pending (DP-R2 text pack). "Edit" did not say what
    // it opened, and on a stencil tile what it opens is the whole task.
    editBtn.textContent = 'Open the drawing editor';
    editBtn.setAttribute('aria-label', 'Open the drawing editor');
    editBtn.addEventListener('click', () => {
      openEditor();
    });
    return editBtn;
  }

  function updateStatusCard(analysis, extraWarnings = null) {
    statusCard.innerHTML = '';
    const badge = document.createElement('span');
    badge.className = 'svg-prep-status-badge';
    const count = analysis.elements.length;

    if (analysis.recommendation === 'pass_through') {
      // ★ D-124. "Using original, OpenSCAD merges these automatically" is
      // true for a charm, where a merge is the whole answer, and it is the
      // wrong sentence entirely for a stencil, where merging every shape into
      // one is how the owner's cat came out as a single silhouette hole. On a
      // tile that makes plates, the same drawing gets a sentence that says
      // there is something to decide and a way to go and decide it.
      badge.textContent =
        plateParams.length > 0
          ? `${count} shapes, no colours yet. Open the editor to say what each one gets.`
          : count > 1
            ? `Using original (${count} shapes) \u2014 OpenSCAD merges these automatically`
            : 'SVG Ready';
      badge.dataset.level = 'ready';
      statusCard.appendChild(badge);
      statusCard.appendChild(createStatusEditButton());
    } else if (analysis.recommendation === 'auto_prepare') {
      badge.textContent = `Simplified ${count} shapes for 3D printing`;
      badge.dataset.level = 'ready';
      statusCard.appendChild(badge);
      statusCard.appendChild(createStatusEditButton());
    } else if (analysis.status === 'needs_review') {
      badge.textContent = `Needs review (${count} elements)`;
      badge.dataset.level = 'review';
      statusCard.appendChild(badge);
      statusCard.appendChild(createStatusEditButton());
    } else if (analysis.status === 'unsupported') {
      badge.textContent = 'Unsupported features';
      badge.dataset.level = 'unsupported';
      statusCard.appendChild(badge);

      if (analysis.warnings && analysis.warnings.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'svg-prep-status-warnings';
        analysis.warnings.forEach((w) => {
          const li = document.createElement('li');
          li.textContent = w;
          ul.appendChild(li);
        });
        statusCard.appendChild(ul);
      }
      statusCard.appendChild(createStatusEditButton());
    } else if (analysis.status === 'too_complex') {
      badge.textContent = `Too complex (${analysis.elementCount ?? '?'} elements)`;
      badge.dataset.level = 'error';
      statusCard.appendChild(badge);

      if (analysis.warnings && analysis.warnings.length > 0) {
        const guidance = document.createElement('p');
        guidance.className = 'svg-prep-status-guidance';
        guidance.textContent = analysis.warnings[0];
        statusCard.appendChild(guidance);
      }
    }

    if (extraWarnings && extraWarnings.length > 0) {
      const ul = document.createElement('ul');
      ul.className = 'svg-prep-status-warnings';
      extraWarnings.forEach((w) => {
        const li = document.createElement('li');
        li.textContent = w;
        ul.appendChild(li);
      });
      statusCard.appendChild(ul);
    }

    // The Design card's summary line: what the plates will be, once a plan
    // has been applied. A colour can be painted twice, so the two counts are
    // not the same number.
    if (currentPlan) {
      const summary = document.createElement('p');
      summary.className = 'svg-prep-status-plan';
      const colours = currentPlan.palette.length;
      const plates = currentPlan.order.length;
      // STRINGS: owner review pending (DP-R2 text pack).
      summary.textContent =
        `${colours} ${colours === 1 ? 'colour' : 'colours'}, ` +
        `${plates} ${plates === 1 ? 'plate' : 'plates'}.`;
      statusCard.appendChild(summary);
    }
  }

  function handleEditorApply(result) {
    if (!result) return;
    // The stencil purpose's colour plan rides with the drawing, so the
    // plates that come out follow what the person said and not the automatic
    // first pass. Null for a relief tile, which has no plan.
    currentPlan =
      workspace && typeof workspace.getPlan === 'function'
        ? workspace.getPlan()
        : null;
    if (currentSvgAnalysis) updateStatusCard(currentSvgAnalysis);
    const overrides = workspace ? workspace.getRoleOverrides() : null;
    const offsetOverrides = workspace ? workspace.getOffsetOverrides() : null;
    const deleted = workspace ? workspace.getDeletedIndices() : null;
    // DP-7. The Layer column travels with the roles and offsets, in the same
    // ORIGINAL-index numbering, so reopening the design finds the layers the
    // person set rather than re-suggesting over the top of them.
    const layerResult = workspace ? workspace.getLayerAssignments() : null;
    const prepLayers = layerResult?.limit ? layerResult.layers : null;
    if (currentFileName) {
      setSvgPrepMetadata(currentFileName, {
        rawSvg: currentRawSvg,
        preparedSvg: result,
        prepOverrides: overrides,
        prepOffsets: offsetOverrides,
        prepDeleted: deleted,
        prepLayers,
        prepPlan: currentPlan,
      });
    }
    const svgDataUrl = svgToDataUrl(result);
    const fileObj = {
      name: currentFileName || 'prepared.svg',
      size: result.length,
      type: 'image/svg+xml',
      data: svgDataUrl,
    };
    emitFileValue(fileObj, prepLayers);
    if (fileUploadListener) fileUploadListener(param.name, fileObj);
    announceChange('SVG prepared for OpenSCAD');
  }

  function handleEditorKeep() {
    if (!currentRawSvg) return;
    currentPlan = null;
    if (currentSvgAnalysis) updateStatusCard(currentSvgAnalysis);
    if (currentFileName) {
      setSvgPrepMetadata(currentFileName, {
        rawSvg: currentRawSvg,
        preparedSvg: null,
        prepOverrides: null,
        prepOffsets: null,
        prepDeleted: null,
        prepLayers: null,
        prepPlan: null,
      });
    }
    const svgDataUrl = svgToDataUrl(currentRawSvg);
    const fileObj = {
      name: currentFileName || 'original.svg',
      size: currentRawSvg.length,
      type: 'image/svg+xml',
      data: svgDataUrl,
    };
    emitFileValue(fileObj);
    if (fileUploadListener) fileUploadListener(param.name, fileObj);
    announceChange('Keeping original SVG');
  }

  /**
   * Analyze and optionally prepare an SVG when the svg_preparer flag is on.
   * Shows the status card and opens the editor for complex/ambiguous SVGs.
   * Falls back to the legacy silent-prep when the flag is off.
   * @param {string} rawSvgText
   * @returns {string} SVG text to use (prepared or original)
   */
  /**
   * Build the ink-mode panel, once, on the first picture that needs it.
   * Lazily imported: a project with no image parameter never loads it.
   */
  async function ensureInkControls() {
    if (inkControls) {
      inkControlsContainer.hidden = false;
      return inkControls;
    }
    const { createInkControls } = await import('./ink-controls.js');
    inkControls = createInkControls({
      idPrefix: `ink-${param.name}`,
      announce: announceChange,
      onChange: (settings) => {
        clearTimeout(inkRetraceTimer);
        inkRetraceTimer = setTimeout(() => {
          // applyTracedImage re-throws after reporting (D-119), and this call
          // is a timer callback with nobody to await it. The catch exists only
          // so a re-trace failure cannot become an unhandled rejection - the
          // user has already been shown and told, in applyTracedImage itself.
          applyTracedImage(settings, { announceResult: false }).catch(() => {});
        }, 180);
      },
    });
    inkControlsContainer.appendChild(inkControls.element);
    inkControlsContainer.hidden = false;
    return inkControls;
  }

  /**
   * Trace the held pixels with the given ink settings and mount the result as
   * this parameter's value.
   *
   * @param {Object} settings - From the ink panel
   * @param {Object} [options]
   * @param {boolean} [options.announceResult]
   */
  async function applyTracedImage(settings, { announceResult = false } = {}) {
    if (!inkSourceImageData) return;
    if (inkControls) inkControls.setBusy(true);
    try {
      const { svg, summary } = await convertImageDataToSvg(inkSourceImageData, {
        ink: settings,
      });
      currentFileName = inkSourceFileName;
      const processedSvg = processSvgForOpenScad(svg);
      const svgDataUrl = svgToDataUrl(processedSvg);

      const pathCount = (svg.match(/<path/g) || []).length;
      if (inkControls) {
        // The Colours mode has its own sentence: the ink summary is about how
        // much of a picture counted as a line, which is not a question this
        // mode asks. It also feeds the wall-colour list, which cannot be
        // offered until the colours are known.
        if (summary && summary.mode === 'colours') {
          inkControls.setColourResult(summary.colours, {
            factor: summary.downscale ? summary.downscale.factor : null,
          });
        } else {
          inkControls.setSummary(summary, pathCount);
        }
      }

      const convertedFile = {
        name: inkSourceFileName,
        size: processedSvg.length,
        type: 'image/svg+xml',
        data: svgDataUrl,
      };
      emitFileValue(convertedFile);
      if (fileUploadListener) {
        fileUploadListener(param.name, convertedFile);
      }
      if (announceResult) {
        announceChange(
          `Image converted to vector format: ${inkSourceFileName}`
        );
      }
    } catch (err) {
      const shown = `Conversion failed: ${err.message}`;
      fileInfo.textContent = shown;
      fileInfo.className = 'file-info file-info--error';
      // setBusy wrote "Re-reading the picture…" and only setSummary clears it,
      // so without this the ink panel would still claim work was under way.
      if (inkControls) inkControls.setFailed(shown);
      announceChange(`Image conversion failed: ${err.message}`);
      console.error('[ImageImport] Conversion error:', err);
      // D-119: this used to swallow the failure and return normally, so the
      // awaiting caller ran on and OVERWROTE the message above with
      // "<name>.svg (converted from <name>.png)". MEASURED with a 7.99 MP
      // file against the 2 MP cap: the control claimed success while wearing
      // the error class, the model parameter was left empty, the preview
      // badge said "Preview ready" over the PREVIOUS design, and no visible
      // alert appeared in 28 samples over 14 seconds. Re-throwing lets the
      // caller's own catch do its job, which is what it was written for.
      throw err;
    }
  }

  function processSvgForOpenScad(rawSvgText) {
    currentRawSvg = rawSvgText;
    // A new drawing has no plan yet; the plates start from the first pass.
    currentPlan = null;

    // Picking a new design must never leave a stale editor open.
    // dismiss() skips the keep-original callback — the old file is
    // being replaced, not kept.
    if (workspace) workspace.dismiss();

    if (!isEnabled('svg_preparer')) {
      statusCard.style.display = 'none';
      currentSvgAnalysis = null;
      return maybePrepareForOpenScad(rawSvgText);
    }

    try {
      const stored = currentFileName
        ? getSvgPrepMetadata(currentFileName)
        : null;
      if (stored && stored.rawSvg === rawSvgText) {
        // Always re-analyze: persisted analyses lose their DOM references
        // through JSON serialization and crash the editor on restore.
        currentSvgAnalysis = analyzeSvg(rawSvgText);
        // DP-20. The plan the person applied comes back before the plates
        // are emitted, so a reopened project cuts what it cut when it was
        // saved and not the automatic first pass.
        currentPlan = stored.prepPlan || null;
        updateStatusCard(currentSvgAnalysis);
        statusCard.style.display = '';
        return stored.preparedSvg || rawSvgText;
      }

      const analysis = analyzeSvg(rawSvgText);

      currentSvgAnalysis = analysis;
      updateStatusCard(analysis);
      statusCard.style.display = '';

      if (analysis.recommendation === 'pass_through') {
        // \u2605 D-124. For a charm there is nothing to decide about a plain
        // drawing: OpenSCAD fills every shape it is given. On a tile that
        // makes plates, a drawing with no colours of its own IS the task -
        // every region is base coat until somebody says otherwise - so the
        // editor opens on it, saying so. A drawing that brings its colours
        // (a traced picture, a filled SVG) already has a first pass worth
        // looking at, and the card's button is the way in.
        if (plateParams.length > 0 && !hasOwnColours(analysis)) {
          // The surface says what it found as it opens ("21 regions found,
          // no colours yet: every one starts as the base coat"), so there is
          // no second sentence to write here.
          openEditor();
        }
        return rawSvgText;
      }

      if (analysis.recommendation === 'reject') {
        announceChange(
          analysis.warnings?.[0] || 'SVG is too complex to prepare'
        );
        return rawSvgText;
      }

      if (analysis.recommendation === 'open_editor') {
        // Keep the original until the user explicitly applies a
        // prepared version from the editor.
        openEditor({
          openedSentence:
            'Drawing editor open. This drawing needs a look before it is used.',
        });
        return rawSvgText;
      }

      const prepWarnings = [];
      const prepared = prepareSvg(rawSvgText, { warningsOut: prepWarnings });
      if (prepWarnings.length > 0) {
        updateStatusCard(analysis, prepWarnings);
      }

      return prepared;
    } catch (err) {
      console.error('[SVG Preparer] Processing failed:', err);
      currentSvgAnalysis = null;

      statusCard.innerHTML = '';
      const badge = document.createElement('span');
      badge.className = 'svg-prep-status-badge';
      badge.textContent = 'Preparation failed';
      badge.dataset.level = 'error';
      statusCard.appendChild(badge);

      const guidance = document.createElement('p');
      guidance.className = 'svg-prep-status-guidance';
      guidance.textContent =
        'An error occurred while analyzing this SVG. ' +
        'Try a simpler file or use a vector editor to clean up the SVG.';
      statusCard.appendChild(guidance);
      statusCard.style.display = '';

      announceChange('SVG preparation failed \u2014 try a simpler file');
      return rawSvgText;
    }
  }

  // Button triggers file input
  fileButton.addEventListener('click', () => {
    fileInput.click();
  });

  // Handle file selection
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target.result;

      // Show image preview for raster uploads
      if (isRasterImageFile(file.name)) {
        preview.src = dataUrl;
        preview.alt = `Preview of ${file.name}`;
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
        preview.alt = '';
      }

      // Auto-convert raster images to SVG when the param accepts SVG
      if (isRasterImageFile(file.name) && acceptsSvg) {
        try {
          fileInfo.textContent = 'Converting to SVG\u2026';
          fileInfo.setAttribute('aria-busy', 'true');
          fileButton.disabled = true;

          // Validate before starting conversion
          const img = new Image();
          const dimCheck = await new Promise((resolve, reject) => {
            img.onload = () =>
              resolve(validateImageDimensions(img.width, img.height));
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = dataUrl;
          });

          if (dimCheck.warning) {
            fileInfo.textContent = `Converting\u2026 ${dimCheck.warning}`;
            announceChange(dimCheck.warning);
          }

          const svgName = file.name.replace(/\.[^.]+$/, '.svg');
          inkSourceImageData = await loadImageData(dataUrl);
          inkSourceFileName = svgName;
          await ensureInkControls();

          await applyTracedImage(inkControls.getSettings(), {
            announceResult: true,
          });

          fileInfo.textContent = `${svgName} (converted from ${file.name})`;
          fileInfo.title = svgName;
          fileInfo.removeAttribute('aria-busy');
          fileButton.disabled = false;
          clearButton.style.display = 'inline-block';
        } catch (err) {
          fileInfo.textContent = `Conversion failed: ${err.message}`;
          fileInfo.className = 'file-info file-info--error';
          fileInfo.removeAttribute('aria-busy');
          fileButton.disabled = false;
          preview.style.display = 'none';
          announceChange(`Image conversion failed: ${err.message}`);
          console.error('[ImageImport] Conversion error:', err);
        }
        return;
      }

      // Standard file upload path (non-raster or no SVG conversion needed)
      fileInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;
      fileInfo.title = file.name;
      clearButton.style.display = 'inline-block';

      const uploadedFileObj = {
        name: file.name,
        size: file.size,
        type: file.type,
        data: dataUrl,
      };
      const isSvgFile =
        file.type === 'image/svg+xml' ||
        file.name.toLowerCase().endsWith('.svg');
      if (isSvgFile) {
        const rawSvgText = dataUrlToText(dataUrl);
        currentFileName = file.name;
        const processed = processSvgForOpenScad(rawSvgText);
        if (processed !== rawSvgText) {
          uploadedFileObj.data = svgToDataUrl(processed);
          uploadedFileObj.size = processed.length;
        }
      } else {
        currentRawSvg = null;
        currentFileName = null;
        currentSvgAnalysis = null;
        statusCard.style.display = 'none';
      }
      emitFileValue(uploadedFileObj);
      if (fileUploadListener && isSvgFile) {
        fileUploadListener(param.name, uploadedFileObj);
      }
    };
    reader.onerror = () => {
      fileInfo.textContent = 'Error reading file';
      fileInfo.className = 'file-info file-info--error';
    };
    reader.readAsDataURL(file);
  });

  // Clear file
  clearButton.addEventListener('click', () => {
    if (currentFileName) setSvgPrepMetadata(currentFileName, null);
    fileInput.value = '';
    fileInfo.textContent = 'No file selected';
    fileInfo.className = 'file-info';
    clearButton.style.display = 'none';
    statusCard.style.display = 'none';
    if (workspace) workspace.dismiss();
    currentRawSvg = null;
    currentFileName = null;
    currentSvgAnalysis = null;
    currentPlan = null;
    preview.style.display = 'none';
    preview.alt = '';
    emitFileValue(null);
  });

  // SVG gallery picker (rendered when bundled options are registered)
  const galleryOptions = galleryOptionsMap[param.name];
  if (galleryOptions && galleryOptions.length > 0) {
    const gallery = createSvgGallery(galleryOptions, param, (name, fileObj) => {
      if (fileObj._rawSvg) {
        const rawSvg = fileObj._rawSvg;
        delete fileObj._rawSvg;
        currentFileName = fileObj.name;
        const processed = processSvgForOpenScad(rawSvg);
        if (processed !== rawSvg) {
          fileObj.data = svgToDataUrl(processed);
          fileObj.size = processed.length;
        }
      } else {
        currentRawSvg = null;
        currentFileName = null;
        currentSvgAnalysis = null;
        statusCard.style.display = 'none';
      }
      fileInfo.textContent = `${fileObj.name} (design library)`;
      fileInfo.title = fileObj.name;
      clearButton.style.display = 'inline-block';
      preview.style.display = 'none';
      preview.alt = '';
      emitFileValue(fileObj);
    });
    fileContainer.appendChild(gallery);
  }

  fileContainer.appendChild(fileButton);
  fileContainer.appendChild(preview);
  fileContainer.appendChild(fileInfo);
  fileContainer.appendChild(clearButton);
  fileContainer.appendChild(statusCard);
  fileContainer.appendChild(fileInput);

  container.appendChild(fileContainer);
  if (acceptsSvg) {
    container.appendChild(inkControlsContainer);
    container.appendChild(workspaceContainer);
  }

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
    (Array.isArray(param.default)
      ? JSON.stringify(param.default)
      : param.default);
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
 * Render parameter UI from extracted parameters.
 *
 * F5 group-collapse semantics:
 *   1. If `options.openGroupIds` is supplied, those exact groups render
 *      expanded and everything else collapses. Pass an empty Set to
 *      force "all collapsed" explicitly.
 *   2. Otherwise, if `options.useStoredState` is true, the per-file
 *      remembered state (loaded from localStorage via the active fileId)
 *      is used. This is the "first render after file load" path.
 *   3. Otherwise, the current DOM state of the container is preserved
 *      (so a theme change / preset apply / dependency re-render keeps
 *      the user's expand/collapse choices intact).
 *   4. If none of the above yields any groups, the default is
 *      "all collapsed" (F5 spec, stakeholder feedback 2026-05-15).
 *
 * Group toggles are persisted automatically when an active fileId has
 * been set via {@link setCustomizerFileId}.
 *
 * @param {Object} extractedParams - Output from extractParameters()
 * @param {HTMLElement} container - Container to render into
 * @param {Function} onChange - Called when parameter changes
 * @param {Object} [initialValues] - Optional initial values to override defaults
 * @param {Object} [options]
 * @param {Set<string>|null} [options.openGroupIds]
 * @param {boolean}          [options.useStoredState]
 * @param {(groupId: string, isOpen: boolean) => void} [options.onGroupToggle]
 * @returns {Object} Current parameter values
 */
export function renderParameterUI(
  extractedParams,
  container,
  onChange,
  initialValues = null,
  options = {}
) {
  const {
    openGroupIds = null,
    useStoredState = false,
    onGroupToggle = null,
  } = options || {};

  // Resolve which groups should be open before we wipe the container.
  let resolvedOpenIds;
  if (openGroupIds instanceof Set) {
    resolvedOpenIds = openGroupIds;
  } else if (useStoredState && _activeCustomizerFileId) {
    resolvedOpenIds = loadOpenGroupIds(_activeCustomizerFileId) ?? new Set();
  } else {
    // Preserve the user's current expand/collapse state across an
    // automatic re-render (theme change, preset apply, etc.).
    resolvedOpenIds = getOpenGroupIdsFromDOM(container);
  }
  container.innerHTML = '';

  const { groups, parameters } = extractedParams;

  // DP-11. One warning region for the model, built only when this model can
  // take its shape from a design and therefore can have a hole in mid-air.
  resetHolePlacementRegion();
  if (
    Object.keys(parameters).some(
      (n) => n.endsWith('_silhouette') || n === 'stencil_laser_file'
    )
  ) {
    ensureHoleWarningRegion(container);
  }
  const currentValues = initialValues ? { ...initialValues } : {};

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

    currentValues[param.name] = effectiveDefault;

    // Store the original default value (from schema, not initialValues)
    defaultParameterValues[param.name] = param.default;

    // A "<file_param>_aspect" companion is set automatically by its file
    // control (measured from the uploaded design), so it gets a value but
    // no control and no search entry.
    if (isAspectCompanionParam(param.name, parameters)) return;

    // Per-layer design companions are written by the file control from the
    // Layer column, so they too get a value but no control.
    if (isLayerCompanionParam(param.name, parameters)) return;

    // Create a copy of param with the effective default
    const paramWithValue = { ...param, default: effectiveDefault };

    // Collect global parameters separately (they'll be shown on ALL groups)
    if (param.isGlobal) {
      globalParams.push(paramWithValue);
    } else {
      paramsByGroup[param.group].push(paramWithValue);
    }

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

  // Render each group
  sortedGroups.forEach((group, index) => {
    const groupParams = paramsByGroup[group.id] || [];

    // Skip groups with no params (unless there are global params to show)
    if (groupParams.length === 0 && globalParams.length === 0) return;

    // Combine global params (shown at top of every group) with group-specific params
    // Global params are sorted by their order, then group params by their order
    const sortedGlobalParams = [...globalParams].sort(
      (a, b) => a.order - b.order
    );
    const sortedGroupParams = [...groupParams].sort(
      (a, b) => a.order - b.order
    );
    const allGroupParams = [...sortedGlobalParams, ...sortedGroupParams];

    const details = document.createElement('details');
    details.className = 'param-group forge-disclosure';
    details.open = resolvedOpenIds.has(group.id);
    details.dataset.groupId = group.id;

    // Persist per-file group state on every user toggle (F5). The
    // <details> 'toggle' event fires for both user clicks and our own
    // programmatic Expand/Collapse-All flips, so a single listener
    // covers both cases.
    details.addEventListener('toggle', () => {
      if (_activeCustomizerFileId) {
        saveOpenGroupIds(
          _activeCustomizerFileId,
          getOpenGroupIdsFromDOM(container)
        );
      }
      if (typeof onGroupToggle === 'function') {
        onGroupToggle(group.id, details.open);
      }
    });

    // Tag group with its settings level classification (metadata only, all groups visible)
    const simple = isSimpleGroup(group, sortedGroups, index);
    details.dataset.settingsLevel = simple ? 'simple' : 'advanced';

    const summary = document.createElement('summary');
    summary.className = 'param-group-summary';

    const summaryLabel = document.createElement('span');
    summaryLabel.textContent = group.label;
    summary.appendChild(summaryLabel);

    // UF-35: the Hide button used to live inside this <summary>, which made
    // it a control inside the disclosure's own control — axe's
    // nested-interactive, once per group, so the count grew with the model.
    // It moves to an actions layer stacked over the header, and a slot of the
    // same size keeps this row's layout identical. Q-64 (owner, 2026-08-17):
    // the layer comes first in source order, so Tab reaches Hide one stop
    // before its header rather than behind every parameter in the group.
    const hideSlot = document.createElement('span');
    hideSlot.className = 'param-group-hide-slot';
    hideSlot.setAttribute('aria-hidden', 'true');
    summary.appendChild(hideSlot);

    // Hide group button — keyboard accessible with aria-pressed
    const hideBtn = document.createElement('button');
    hideBtn.className = 'param-group-hide-btn';
    hideBtn.type = 'button';
    hideBtn.setAttribute('aria-label', `Hide ${group.label} group`);
    hideBtn.setAttribute('aria-pressed', 'false');
    hideBtn.title = 'Hide this group';
    hideBtn.innerHTML = '&#x2715;'; // × character
    hideBtn.addEventListener('click', (e) => {
      // The button sits outside the <summary> now, so it can no longer toggle
      // the disclosure by bubbling; these keep the click from reaching any
      // other listener on the way up.
      e.stopPropagation();
      e.preventDefault();
      // Dispatch custom event so main.js can persist the hidden state
      details.dispatchEvent(
        new CustomEvent('group-hide', {
          bubbles: true,
          detail: { groupId: group.id, groupLabel: group.label },
        })
      );
    });

    details.appendChild(summary);

    allGroupParams.forEach((param) => {
      let control;

      // Create onChange handler that also updates dependent parameters.
      // extraValues lets a control commit companion values (e.g. a design's
      // measured aspect) in the SAME state snapshot as its own change.
      const handleChange = (name, value, extraValues) => {
        currentValues[name] = value;
        currentParameterValues[name] = value;
        if (extraValues) {
          for (const [extraName, extraValue] of Object.entries(extraValues)) {
            currentValues[extraName] = extraValue;
            currentParameterValues[extraName] = extraValue;
          }
        }
        // Update dependent parameters visibility
        updateDependentParameters(name, value);
        // DP-11: a hole on a design-shaped body can land on a wingtip or on
        // nothing at all, and neither shows in a preview.
        reportHolePlacement(currentValues, parameters);
        // Pass a shallow copy so callers (e.g. stateManager.setState) never
        // hold a reference to our mutable currentValues object — this is
        // critical for undo/redo: recordParameterState() must snapshot the
        // *previous* state.parameters before the next mutation.
        onChange({ ...currentValues });
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
          control = createFileControl(
            param,
            handleChange,
            parameters[`${param.name}_aspect`] || null,
            findLayerParams(param, parameters),
            findSilhouetteParams(param, parameters),
            findPlateParams(parameters),
            findLaserParam(parameters)
          );
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

    // Actions layer first, so Tab reaches Hide immediately before the header
    // it belongs to (Q-64). The row only stacks the two — .param-group keeps
    // every class, id and attribute the rest of the app matches on.
    const row = document.createElement('div');
    row.className = 'forge-disclosure-row';
    const actions = document.createElement('div');
    actions.className =
      'forge-disclosure-actions forge-disclosure-actions--no-chevron';
    actions.appendChild(hideBtn);
    row.appendChild(actions);
    row.appendChild(details);

    container.appendChild(row);
  });

  // IR-9: if this project declared a starter subset, show it and put the rest
  // one button away. Applied AFTER the groups exist, because it is a decision
  // about what is on screen, not about what is built.
  applyStarterView(container, extractedParams);

  // Initialize parameter search after rendering
  initParameterSearch();

  // Re-apply detail level to newly rendered parameters
  reapplyDetailLevel();

  return { ...currentValues };
}

/**
 * Put the starter subset on screen with one control that reveals the rest.
 *
 * Nothing is removed. Every control stays in the DOM and comes back on the
 * reveal; the wall is a class, the same idiom the parameter search already
 * uses, and it hides things from everybody equally rather than from assistive
 * technology only.
 *
 * @param {HTMLElement} container
 * @param {Object} extractedParams
 * @returns {{applied: boolean, shown: number, total: number, unknown: string[]}}
 */
function applyStarterView(container, extractedParams) {
  const declaration = _starterDeclaration;
  const { known, unknown, groupIds, total } = resolveStarterParameters(
    extractedParams,
    declaration.names
  );

  if (!starterViewApplies(declaration, _activeCustomizerFileId, known.length)) {
    return { applied: false, shown: 0, total, unknown };
  }

  if (unknown.length > 0) {
    console.warn(
      `[Starter] This project lists ${unknown.length} starting parameter(s) it does not have:`,
      unknown
    );
  }

  const starterSet = new Set(known);
  const controls = container.querySelectorAll(
    '.param-control[data-param-name]'
  );
  controls.forEach((control) => {
    const isStarter = starterSet.has(control.dataset.paramName);
    control.classList.toggle('is-starter', isStarter);
    control.classList.toggle('starter-hidden', !isStarter);
  });

  container.querySelectorAll('.param-group').forEach((group) => {
    const hasStarter = groupIds.has(group.dataset.groupId);
    group.classList.toggle('starter-empty', !hasStarter);
    // A starter group collapsed is a starter group nobody can see.
    if (hasStarter) group.open = true;
  });

  container.insertBefore(
    createStarterReveal(container, known.length, total),
    container.firstChild
  );

  return { applied: true, shown: known.length, total, unknown };
}

/**
 * The reveal control.
 *
 * It is a TOGGLE, not a button that vanishes when used. A control that removes
 * itself takes the keyboard focus with it, and the way back to a shorter
 * screen should not be "reload the page".
 *
 * @param {HTMLElement} container
 * @param {number} shown
 * @param {number} total
 * @returns {HTMLElement}
 */
function createStarterReveal(container, shown, total) {
  const wrap = document.createElement('div');
  wrap.className = 'starter-reveal';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'starter-reveal-btn';
  button.id = 'starterRevealBtn';
  button.textContent = SHOW_ALL_LABEL;
  button.setAttribute('aria-expanded', 'false');
  if (container.id) button.setAttribute('aria-controls', container.id);

  const hint = document.createElement('p');
  hint.className = 'starter-reveal-hint';
  hint.id = 'starterRevealHint';
  hint.textContent = starterHint(shown, total);
  button.setAttribute('aria-describedby', hint.id);

  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    setStarterViewExpanded(container, !expanded, { announce: true });
  });

  wrap.appendChild(button);
  wrap.appendChild(hint);
  return wrap;
}

/**
 * Show every parameter, or go back to the starter subset.
 *
 * @param {HTMLElement|null} container
 * @param {boolean} expanded
 * @param {{announce?: boolean}} [options]
 */
export function setStarterViewExpanded(container, expanded, options = {}) {
  const root = container || document.getElementById('parametersContainer');
  if (!root) return;
  const button = root.querySelector('.starter-reveal-btn');
  if (!button) return;

  root.classList.toggle('starter-revealed', expanded);
  root.querySelectorAll('.param-control.starter-hidden').forEach((control) => {
    control.classList.toggle('starter-wall-open', expanded);
  });
  root.querySelectorAll('.param-group.starter-empty').forEach((group) => {
    group.classList.toggle('starter-wall-open', expanded);
  });

  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  button.textContent = expanded ? SHOW_STARTER_LABEL : SHOW_ALL_LABEL;

  const hint = root.querySelector('.starter-reveal-hint');
  const shown = root.querySelectorAll('.param-control.is-starter').length;
  const total = root.querySelectorAll('.param-control[data-param-name]').length;
  if (hint) {
    hint.textContent = expanded
      ? starterHint(total, total)
      : starterHint(shown, total);
  }

  if (options.announce) {
    // announceImmediate, not announceChange. MEASURED: a polite announcement
    // is debounced 350 ms, and any other polite announcement inside that
    // window CANCELS it - watching the live region through a reveal showed
    // "Rendering preview..." arriving at 204 ms and this sentence never
    // reaching the region at all. Pressing this button is a discrete action
    // somebody took on purpose, which is exactly what announceImmediate is
    // for.
    announceImmediate(starterAnnouncement(expanded, shown, total));
  }
}

/**
 * Is a starter wall currently standing in this container?
 *
 * @param {HTMLElement|null} container
 * @returns {boolean}
 */
export function isStarterViewActive(container) {
  const root = container || document.getElementById('parametersContainer');
  if (!root) return false;
  const button = root.querySelector('.starter-reveal-btn');
  return Boolean(button) && button.getAttribute('aria-expanded') !== 'true';
}
