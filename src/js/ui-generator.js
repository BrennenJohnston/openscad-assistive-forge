/**
 * UI Generator - Renders form controls from schema
 * @license GPL-3.0-or-later
 */

/**
 * Create a help tooltip button
 * @param {Object} param - Parameter definition
 * @returns {HTMLElement|null} Help button element with tooltip
 */
function createHelpTooltip(param) {
  if (!param.description) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'param-help-wrapper';

  const button = document.createElement('button');
  button.className = 'param-help-button';
  button.type = 'button';
  button.setAttribute('aria-label', `Help for ${param.name}`);
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '?';

  const tooltip = document.createElement('div');
  tooltip.className = 'param-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.id = `tooltip-${param.name}`;
  tooltip.textContent = param.description;
  tooltip.style.display = 'none';

  // Toggle tooltip on click
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isVisible = tooltip.style.display === 'block';

    // Hide all other tooltips
    document.querySelectorAll('.param-tooltip').forEach(t => {
      t.style.display = 'none';
    });
    document.querySelectorAll('.param-help-button').forEach(b => {
      b.setAttribute('aria-expanded', 'false');
    });

    // Toggle this tooltip
    tooltip.style.display = isVisible ? 'none' : 'block';
    button.setAttribute('aria-expanded', !isVisible);
  });

  // Keyboard support: Escape to close
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tooltip.style.display === 'block') {
      tooltip.style.display = 'none';
      button.setAttribute('aria-expanded', 'false');
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
    document.querySelectorAll('.param-tooltip').forEach(t => {
      t.style.display = 'none';
    });
    document.querySelectorAll('.param-help-button').forEach(b => {
      b.setAttribute('aria-expanded', 'false');
    });
  }
});

/**
 * Create a range slider control
 * @param {Object} param - Parameter definition
 * @param {Function} onChange - Change handler
 * @returns {HTMLElement} Control element
 */
function createSliderControl(param, onChange) {
  const container = document.createElement('div');
  container.className = 'param-control';

  // Label container with help tooltip
  const labelContainer = document.createElement('div');
  labelContainer.className = 'param-label-container';

  const label = document.createElement('label');
  label.htmlFor = `param-${param.name}`;
  const paramLabel = param.name.replace(/_/g, ' ');
  label.textContent = paramLabel;

  labelContainer.appendChild(label);

  // Add help tooltip if description exists
  const helpTooltip = createHelpTooltip(param);
  if (helpTooltip) {
    labelContainer.appendChild(helpTooltip);
  }

  container.appendChild(labelContainer);

  const sliderContainer = document.createElement('div');
  sliderContainer.className = 'slider-container';

  const input = document.createElement('input');
  input.type = 'range';
  input.id = `param-${param.name}`;
  input.min = param.minimum;
  input.max = param.maximum;
  input.step = param.step || 1;
  input.value = param.default;
  input.setAttribute('aria-valuemin', param.minimum);
  input.setAttribute('aria-valuemax', param.maximum);
  input.setAttribute('aria-valuenow', param.default);
  input.setAttribute('aria-label', `${param.name.replace(/_/g, ' ')}: ${param.default}`);

  const output = document.createElement('output');
  output.htmlFor = `param-${param.name}`;
  output.className = 'slider-value';
  output.textContent = param.default;

  input.addEventListener('input', (e) => {
    const value = param.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value);
    output.textContent = value;
    input.setAttribute('aria-valuenow', value);
    input.setAttribute('aria-label', `${param.name.replace(/_/g, ' ')}: ${value}`);
    onChange(param.name, value);
  });

  sliderContainer.appendChild(input);
  sliderContainer.appendChild(output);

  container.appendChild(sliderContainer);

  return container;
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

  // Label container with help tooltip
  const labelContainer = document.createElement('div');
  labelContainer.className = 'param-label-container';

  const label = document.createElement('label');
  label.htmlFor = `param-${param.name}`;
  label.textContent = param.name.replace(/_/g, ' ');

  labelContainer.appendChild(label);

  // Add help tooltip if description exists
  const helpTooltip = createHelpTooltip(param);
  if (helpTooltip) {
    labelContainer.appendChild(helpTooltip);
  }

  container.appendChild(labelContainer);

  const input = document.createElement('input');
  input.type = 'number';
  input.id = `param-${param.name}`;
  input.value = param.default;
  input.setAttribute('aria-label', `Enter ${param.name.replace(/_/g, ' ')}`);
  
  if (param.minimum !== undefined) {
    input.min = param.minimum;
    input.setAttribute('aria-valuemin', param.minimum);
  }
  if (param.maximum !== undefined) {
    input.max = param.maximum;
    input.setAttribute('aria-valuemax', param.maximum);
  }
  if (param.step !== undefined) input.step = param.step;

  input.addEventListener('change', (e) => {
    const value = param.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value);
    onChange(param.name, value);
  });

  container.appendChild(input);

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

  // Label container with help tooltip
  const labelContainer = document.createElement('div');
  labelContainer.className = 'param-label-container';

  const label = document.createElement('label');
  label.htmlFor = `param-${param.name}`;
  label.textContent = param.name.replace(/_/g, ' ');

  labelContainer.appendChild(label);

  // Add help tooltip if description exists
  const helpTooltip = createHelpTooltip(param);
  if (helpTooltip) {
    labelContainer.appendChild(helpTooltip);
  }

  container.appendChild(labelContainer);

  const select = document.createElement('select');
  select.id = `param-${param.name}`;
  select.setAttribute('aria-label', `Select ${param.name.replace(/_/g, ' ')}`);

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

  // Label container with help tooltip
  const labelContainer = document.createElement('div');
  labelContainer.className = 'param-label-container';

  const labelText = document.createElement('span');
  labelText.textContent = param.name.replace(/_/g, ' ');

  labelContainer.appendChild(labelText);

  // Add help tooltip if description exists
  const helpTooltip = createHelpTooltip(param);
  if (helpTooltip) {
    labelContainer.appendChild(helpTooltip);
  }

  container.appendChild(labelContainer);

  const toggleContainer = document.createElement('div');
  toggleContainer.className = 'toggle-switch';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = `param-${param.name}`;
  input.setAttribute('role', 'switch');
  input.checked = param.default.toLowerCase() === 'yes';
  input.setAttribute('aria-label', `Toggle ${param.name.replace(/_/g, ' ')}`);
  input.setAttribute('aria-checked', param.default.toLowerCase() === 'yes');

  const label = document.createElement('label');
  label.htmlFor = `param-${param.name}`;
  label.className = 'toggle-label';
  label.textContent = param.name.replace(/_/g, ' ');

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

  // Label container with help tooltip
  const labelContainer = document.createElement('div');
  labelContainer.className = 'param-label-container';

  const label = document.createElement('label');
  label.htmlFor = `param-${param.name}`;
  label.textContent = param.name.replace(/_/g, ' ');

  labelContainer.appendChild(label);

  // Add help tooltip if description exists
  const helpTooltip = createHelpTooltip(param);
  if (helpTooltip) {
    labelContainer.appendChild(helpTooltip);
  }

  container.appendChild(labelContainer);

  const input = document.createElement('input');
  input.type = 'text';
  input.id = `param-${param.name}`;
  input.value = param.default;
  input.setAttribute('aria-label', `Enter ${param.name.replace(/_/g, ' ')}`);

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
  const labelContainer = document.createElement('div');
  labelContainer.className = 'param-label-container';

  const label = document.createElement('label');
  label.htmlFor = `param-${param.name}`;
  label.textContent = param.name.replace(/_/g, ' ');

  labelContainer.appendChild(label);

  // Add help tooltip if description exists
  const helpTooltip = createHelpTooltip(param);
  if (helpTooltip) {
    labelContainer.appendChild(helpTooltip);
  }

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
    hexValue = '#' + hexValue[1] + hexValue[1] + hexValue[2] + hexValue[2] + hexValue[3] + hexValue[3];
  }

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.id = `param-${param.name}`;
  colorInput.value = hexValue;
  colorInput.className = 'color-picker';
  colorInput.setAttribute('aria-label', `Select color for ${param.name.replace(/_/g, ' ')}`);

  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'color-hex-input';
  hexInput.value = hexValue.substring(1).toUpperCase(); // Remove # for display
  hexInput.placeholder = 'RRGGBB';
  hexInput.maxLength = 6;
  hexInput.setAttribute('aria-label', `Hex color code for ${param.name.replace(/_/g, ' ')}`);

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
  const labelContainer = document.createElement('div');
  labelContainer.className = 'param-label-container';

  const label = document.createElement('label');
  label.htmlFor = `param-${param.name}`;
  label.textContent = param.name.replace(/_/g, ' ');

  labelContainer.appendChild(label);

  // Add help tooltip if description exists
  const helpTooltip = createHelpTooltip(param);
  if (helpTooltip) {
    labelContainer.appendChild(helpTooltip);
  }

  container.appendChild(labelContainer);

  const fileContainer = document.createElement('div');
  fileContainer.className = 'file-upload-container';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = `param-${param.name}`;
  fileInput.className = 'file-input';
  fileInput.setAttribute('aria-label', `Upload file for ${param.name.replace(/_/g, ' ')}`);
  
  // Set accepted file types if specified
  if (param.acceptedExtensions && param.acceptedExtensions.length > 0) {
    fileInput.accept = param.acceptedExtensions.map(ext => `.${ext}`).join(',');
  }

  const fileButton = document.createElement('button');
  fileButton.type = 'button';
  fileButton.className = 'file-upload-button';
  fileButton.textContent = '📁 Choose File';
  fileButton.setAttribute('aria-label', `Choose file for ${param.name.replace(/_/g, ' ')}`);

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
  clearButton.setAttribute('aria-label', `Clear file for ${param.name.replace(/_/g, ' ')}`);
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
            data: dataUrl
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

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Render parameter UI from extracted parameters
 * @param {Object} extractedParams - Output from extractParameters()
 * @param {HTMLElement} container - Container to render into
 * @param {Function} onChange - Called when parameter changes
 * @param {Object} [initialValues] - Optional initial values to override defaults
 * @returns {Object} Current parameter values
 */
export function renderParameterUI(extractedParams, container, onChange, initialValues = null) {
  container.innerHTML = '';

  const { groups, parameters } = extractedParams;
  const currentValues = {};

  // Group parameters by group
  const paramsByGroup = {};
  Object.values(parameters).forEach((param) => {
    if (!paramsByGroup[param.group]) {
      paramsByGroup[param.group] = [];
    }
    // Use initialValues if provided, otherwise use default
    const effectiveDefault = initialValues && initialValues[param.name] !== undefined 
      ? initialValues[param.name] 
      : param.default;
    // Create a copy of param with the effective default
    const paramWithValue = { ...param, default: effectiveDefault };
    paramsByGroup[param.group].push(paramWithValue);
    currentValues[param.name] = effectiveDefault;
  });

  // Sort groups by order
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  // Render each group
  sortedGroups.forEach((group) => {
    const groupParams = paramsByGroup[group.id] || [];
    if (groupParams.length === 0) return;

    // Sort parameters by order
    groupParams.sort((a, b) => a.order - b.order);

    const details = document.createElement('details');
    details.className = 'param-group';
    details.open = true;

    const summary = document.createElement('summary');
    summary.textContent = group.label;
    details.appendChild(summary);

    groupParams.forEach((param) => {
      let control;

      switch (param.uiType) {
        case 'slider':
          control = createSliderControl(param, (name, value) => {
            currentValues[name] = value;
            onChange(currentValues);
          });
          break;

        case 'select':
          control = createSelectControl(param, (name, value) => {
            currentValues[name] = value;
            onChange(currentValues);
          });
          break;

        case 'toggle':
          control = createToggleControl(param, (name, value) => {
            currentValues[name] = value;
            onChange(currentValues);
          });
          break;

        case 'color':
          control = createColorControl(param, (name, value) => {
            currentValues[name] = value;
            onChange(currentValues);
          });
          break;

        case 'file':
          control = createFileControl(param, (name, value) => {
            currentValues[name] = value;
            onChange(currentValues);
          });
          break;

        case 'input':
        default:
          if (param.type === 'integer' || param.type === 'number') {
            control = createNumberInput(param, (name, value) => {
              currentValues[name] = value;
              onChange(currentValues);
            });
          } else {
            control = createTextInput(param, (name, value) => {
              currentValues[name] = value;
              onChange(currentValues);
            });
          }
          break;
      }

      details.appendChild(control);
    });

    container.appendChild(details);
  });

  return currentValues;
}
