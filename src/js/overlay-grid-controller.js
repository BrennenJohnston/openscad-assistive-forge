/**
 * Overlay/Grid Controller
 * Manages grid display settings, reference overlay controls, and auto-rotate
 * functionality. Extracted from main.js for maintainability.
 * @license GPL-3.0-or-later
 */

import { stateManager } from './state.js';
import { announceImmediate } from './announcer.js';
import { escapeHtml } from './html-utils.js';
import * as SharedImageStore from './shared-image-store.js';
import { getAppPrefKey } from './storage-keys.js';

const STORAGE_KEY_OVERLAY_ENABLED = getAppPrefKey('overlay-enabled');
const STORAGE_KEY_OVERLAY_OPACITY = getAppPrefKey('overlay-opacity');
const STORAGE_KEY_OVERLAY_SOURCE = getAppPrefKey('overlay-source');
const STORAGE_KEY_OVERLAY_SVG_COLOR = getAppPrefKey('overlay-svg-color');
const STORAGE_KEY_OVERLAY_AUTO_COLOR = getAppPrefKey('overlay-auto-color');
const STORAGE_KEY_OVERLAY_WIDTH = getAppPrefKey('overlay-width');
const STORAGE_KEY_OVERLAY_HEIGHT = getAppPrefKey('overlay-height');
const STORAGE_KEY_AUTO_ROTATE = getAppPrefKey('auto-rotate');
const STORAGE_KEY_ROTATE_SPEED = getAppPrefKey('rotate-speed');

/**
 * Initialize the overlay/grid controller.
 * @param {Object} deps
 * @param {Function} deps.getPreviewManager - Returns current PreviewManager instance (may be null)
 * @param {Function} deps.updateStatus - Status message callback (message, type)
 * @returns {Object} Controller API
 */
export function initOverlayGridController({ getPreviewManager, updateStatus }) {
  // ---- DOM element queries ----
  const gridColorPicker = document.getElementById('gridColorPicker');
  const resetGridColorBtn = document.getElementById('resetGridColorBtn');
  const gridOpacityInput = document.getElementById('gridOpacityInput');
  const gridOpacityValue = document.getElementById('gridOpacityValue');
  const gridPresetSelect = document.getElementById('gridPresetSelect');
  const gridWidthInput = document.getElementById('gridWidthInput');
  const gridHeightInput = document.getElementById('gridHeightInput');
  const gridPresetSaveRow = document.getElementById('gridPresetSaveRow');
  const gridPresetNameInput = document.getElementById('gridPresetNameInput');
  const saveGridPresetBtn = document.getElementById('saveGridPresetBtn');
  const gridPresetSaveError = document.getElementById('gridPresetSaveError');
  const gridPresetDeleteRow = document.getElementById('gridPresetDeleteRow');
  const deleteGridPresetBtn = document.getElementById('deleteGridPresetBtn');
  const gridSizeDims = document.getElementById('gridSizeDims');

  const overlaySourceSelect = document.getElementById('overlaySourceSelect');
  const overlayToggle = document.getElementById('overlayToggle');
  const overlayOpacityInput = document.getElementById('overlayOpacityInput');
  const overlayOpacityValue = document.getElementById('overlayOpacityValue');
  const overlayColorInput = document.getElementById('overlayColorInput');
  const overlayAutoColorToggle = document.getElementById(
    'overlayAutoColorToggle'
  );
  const overlayFitModelBtn = document.getElementById('overlayFitModelBtn');
  const overlayCenterBtn = document.getElementById('overlayCenterBtn');
  const overlayWidthInput = document.getElementById('overlayWidthInput');
  const overlayHeightInput = document.getElementById('overlayHeightInput');
  const overlayAspectLockBtn = document.getElementById('overlayAspectLockBtn');
  const overlayOffsetXInput = document.getElementById('overlayOffsetXInput');
  const overlayOffsetYInput = document.getElementById('overlayOffsetYInput');
  const overlayRotationInput = document.getElementById('overlayRotationInput');
  const overlayRotationValue = document.getElementById('overlayRotationValue');
  const overlayStatus = document.getElementById('overlayStatus');
  const overlayFileInput = document.getElementById('overlayFileInput');
  const overlayManualOverrideToggle = document.getElementById(
    'overlayManualOverrideToggle'
  );
  const overlayCalibrationFieldset = document.getElementById(
    'overlayCalibrationFieldset'
  );
  const overlayDimensionsValue = document.getElementById(
    'overlayDimensionsValue'
  );
  const overlayMeasurementsToggle = document.getElementById(
    'overlayMeasurementsToggle'
  );

  const autoRotateToggle = document.getElementById('autoRotateToggle');
  const mobileAutoRotateToggle = document.getElementById(
    'mobileAutoRotateToggle'
  );
  const rotationSpeedInput = document.getElementById('rotationSpeedInput');
  const rotationSpeedValue = document.getElementById('rotationSpeedValue');

  // ---- Local state ----
  const uploadedOverlayFiles = new Map();
  const USER_GRID_PREFIX = 'user:';
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  );

  // ============================================================================
  // Grid Controls
  // ============================================================================

  function syncGridColorPicker() {
    if (!gridColorPicker || !getPreviewManager()) return;
    const previewManager = getPreviewManager();
    const custom = previewManager.getGridColor();
    if (custom) {
      gridColorPicker.value = custom;
    } else {
      const themeKey = previewManager.currentTheme || 'light';
      const PREVIEW_COLORS_MAP = {
        light: '#cccccc',
        dark: '#404040',
        'light-hc': '#000000',
        'dark-hc': '#ffffff',
        mono: '#00ff00',
        'mono-light': '#ffb000',
      };
      gridColorPicker.value = PREVIEW_COLORS_MAP[themeKey] || '#cccccc';
    }
  }

  if (gridColorPicker) {
    syncGridColorPicker();
    gridColorPicker.addEventListener('input', () => {
      const previewManager = getPreviewManager();
      if (previewManager) {
        previewManager.setGridColor(gridColorPicker.value);
      }
    });
  }

  if (resetGridColorBtn) {
    resetGridColorBtn.addEventListener('click', () => {
      const previewManager = getPreviewManager();
      if (previewManager) {
        previewManager.resetGridColor();
        syncGridColorPicker();
        updateStatus('Grid color reset to theme default');
      }
    });
  }

  function syncGridOpacitySlider() {
    if (!gridOpacityInput || !getPreviewManager()) return;
    const val = getPreviewManager().getGridOpacity();
    gridOpacityInput.value = String(val);
    if (gridOpacityValue) gridOpacityValue.textContent = `${val}%`;
  }

  if (gridOpacityInput) {
    syncGridOpacitySlider();
    gridOpacityInput.addEventListener('input', () => {
      const v = parseInt(gridOpacityInput.value, 10);
      if (gridOpacityValue) gridOpacityValue.textContent = `${v}%`;
      const previewManager = getPreviewManager();
      if (previewManager) previewManager.setGridOpacity(v);
    });
  }

  // ---- Grid size preset selector, custom inputs, and user-saved custom presets ----

  function applyGridSize(widthMm, heightMm) {
    const previewManager = getPreviewManager();
    if (!previewManager) return;
    previewManager.setGridSize(widthMm, heightMm);
    if (gridWidthInput) gridWidthInput.value = widthMm;
    if (gridHeightInput) gridHeightInput.value = heightMm;
    updateStatus(`Grid size updated to ${widthMm} × ${heightMm} mm`);
  }

  function _populateCustomGridPresets() {
    const previewManager = getPreviewManager();
    if (!gridPresetSelect || !previewManager) return;

    const existing = gridPresetSelect.querySelector(
      'optgroup[data-user-presets]'
    );
    if (existing) existing.remove();

    const userPresets = previewManager.loadCustomGridPresets();
    if (userPresets.length === 0) return;

    const group = document.createElement('optgroup');
    group.label = 'My presets';
    group.setAttribute('data-user-presets', 'true');

    for (const p of userPresets) {
      const opt = document.createElement('option');
      opt.value = `${USER_GRID_PREFIX}${p.name}`;
      opt.textContent = `${p.name} (${p.widthMm}×${p.heightMm} mm)`;
      group.appendChild(opt);
    }

    const customOpt = gridPresetSelect.querySelector('option[value="custom"]');
    if (customOpt) {
      gridPresetSelect.insertBefore(group, customOpt);
    } else {
      gridPresetSelect.appendChild(group);
    }
  }

  function _updateGridPresetActionRows() {
    if (!gridPresetSelect) return;
    const val = gridPresetSelect.value;
    const isCustom = val === 'custom';
    const isUserPreset = val.startsWith(USER_GRID_PREFIX);

    if (gridSizeDims) gridSizeDims.hidden = !isCustom;
    if (gridPresetSaveRow) gridPresetSaveRow.hidden = !isCustom;
    if (gridPresetDeleteRow) gridPresetDeleteRow.hidden = !isUserPreset;
    if (gridPresetSaveError) gridPresetSaveError.textContent = '';
  }

  if (gridPresetSelect) {
    const previewManager = getPreviewManager();
    if (previewManager) {
      const saved = previewManager.getGridSize();
      if (gridWidthInput) gridWidthInput.value = saved.widthMm;
      if (gridHeightInput) gridHeightInput.value = saved.heightMm;
    }

    _populateCustomGridPresets();

    gridPresetSelect.addEventListener('change', () => {
      const val = gridPresetSelect.value;
      if (val === 'custom') {
        _updateGridPresetActionRows();
        return;
      }
      if (val.startsWith(USER_GRID_PREFIX)) {
        const pm = getPreviewManager();
        if (pm) {
          const name = val.slice(USER_GRID_PREFIX.length);
          const presets = pm.loadCustomGridPresets();
          const found = presets.find((p) => p.name === name);
          if (found) applyGridSize(found.widthMm, found.heightMm);
        }
        _updateGridPresetActionRows();
        return;
      }
      const [w, h] = val.split('x').map(Number);
      if (w && h) applyGridSize(w, h);
      _updateGridPresetActionRows();
    });
  }

  if (gridWidthInput) {
    gridWidthInput.addEventListener('change', () => {
      const w = parseInt(gridWidthInput.value, 10);
      const h = parseInt(gridHeightInput?.value || '220', 10);
      if (!isNaN(w) && !isNaN(h)) {
        if (gridPresetSelect) gridPresetSelect.value = 'custom';
        applyGridSize(w, h);
        _updateGridPresetActionRows();
      }
    });
  }

  if (gridHeightInput) {
    gridHeightInput.addEventListener('change', () => {
      const w = parseInt(gridWidthInput?.value || '220', 10);
      const h = parseInt(gridHeightInput.value, 10);
      if (!isNaN(w) && !isNaN(h)) {
        if (gridPresetSelect) gridPresetSelect.value = 'custom';
        applyGridSize(w, h);
        _updateGridPresetActionRows();
      }
    });
  }

  if (saveGridPresetBtn) {
    saveGridPresetBtn.addEventListener('click', () => {
      const previewManager = getPreviewManager();
      if (!previewManager) {
        if (gridPresetSaveError)
          gridPresetSaveError.textContent =
            'Preview not ready yet. Please load a model first.';
        return;
      }
      const name = gridPresetNameInput?.value || '';
      const w = parseInt(gridWidthInput?.value || '0', 10);
      const h = parseInt(gridHeightInput?.value || '0', 10);
      const result = previewManager.saveCustomGridPreset(name, w, h);
      if (!result.success) {
        if (gridPresetSaveError) gridPresetSaveError.textContent = result.error;
        return;
      }
      if (gridPresetSaveError) gridPresetSaveError.textContent = '';
      if (gridPresetNameInput) gridPresetNameInput.value = '';
      _populateCustomGridPresets();
      const newValue = `${USER_GRID_PREFIX}${name.trim()}`;
      if (gridPresetSelect) {
        gridPresetSelect.value = newValue;
      }
      _updateGridPresetActionRows();
      updateStatus(`Custom grid preset "${name.trim()}" saved`);
    });
  }

  if (deleteGridPresetBtn) {
    deleteGridPresetBtn.addEventListener('click', () => {
      const previewManager = getPreviewManager();
      if (!previewManager) return;
      const val = gridPresetSelect?.value || '';
      if (!val.startsWith(USER_GRID_PREFIX)) return;
      const name = val.slice(USER_GRID_PREFIX.length);
      if (!confirm(`Delete custom grid preset "${name}"?`)) return;
      previewManager.deleteCustomGridPreset(name);
      _populateCustomGridPresets();
      if (gridPresetSelect) gridPresetSelect.value = 'custom';
      _updateGridPresetActionRows();
      updateStatus(`Custom grid preset "${name}" deleted`);
    });
  }

  // ============================================================================
  // Reference Overlay Controls
  // ============================================================================

  function updateOverlaySourceDropdown() {
    if (!overlaySourceSelect) return;

    const previousVal = overlaySourceSelect.value;
    const state = stateManager.getState();
    const projectFiles = state.projectFiles;

    overlaySourceSelect.innerHTML =
      '<option value="">-- Select file --</option>';

    if (!projectFiles || projectFiles.size === 0) {
      overlaySourceSelect.disabled = true;
    } else {
      overlaySourceSelect.disabled = false;

      const imageExtensions = ['svg', 'png', 'jpg', 'jpeg'];
      const imageFiles = Array.from(projectFiles.keys())
        .filter((path) => {
          const ext = path.split('.').pop()?.toLowerCase();
          return imageExtensions.includes(ext);
        })
        .sort();

      if (imageFiles.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '-- No image files --';
        option.disabled = true;
        overlaySourceSelect.appendChild(option);
      } else {
        imageFiles.forEach((path) => {
          const option = document.createElement('option');
          option.value = path;
          option.textContent = path;
          overlaySourceSelect.appendChild(option);
        });
      }
    }

    const imgs = SharedImageStore.getImages();
    for (const [, rec] of imgs) {
      const opt = document.createElement('option');
      opt.value = `screenshot:${rec.name}`;
      opt.textContent = `\uD83D\uDCF7 ${rec.name}`;
      opt.dataset.shared = '1';
      overlaySourceSelect.appendChild(opt);
    }

    if (previousVal) {
      overlaySourceSelect.value = previousVal;
    }
  }

  async function loadOverlayFromProjectFile(fileName) {
    const previewManager = getPreviewManager();
    if (!previewManager || !fileName) {
      if (previewManager) {
        await previewManager.setReferenceOverlaySource({
          kind: null,
          name: null,
          dataUrlOrText: null,
        });
      }
      updateOverlayStatus();
      return;
    }

    if (uploadedOverlayFiles.has(fileName)) {
      await loadOverlayFromUploadedFile(fileName);
      return;
    }

    const state = stateManager.getState();
    const projectFiles = state.projectFiles;

    if (!projectFiles || !projectFiles.has(fileName)) {
      console.warn(`[App] Overlay file not found: ${fileName}`);
      return;
    }

    const content = projectFiles.get(fileName);
    const ext = fileName.split('.').pop()?.toLowerCase();

    try {
      if (ext === 'svg') {
        await previewManager.setReferenceOverlaySource({
          kind: 'svg',
          name: fileName,
          dataUrlOrText: content,
        });
      } else {
        let dataUrl = content;
        if (!content.startsWith('data:')) {
          const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
          const blob = new Blob([content], { type: mimeType });
          dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        }
        await previewManager.setReferenceOverlaySource({
          kind: 'raster',
          name: fileName,
          dataUrlOrText: dataUrl,
        });
      }

      updateOverlayUIFromConfig();
      localStorage.setItem(STORAGE_KEY_OVERLAY_SOURCE, fileName);
      console.log(`[App] Overlay loaded: ${fileName}`);
    } catch (error) {
      console.error('[App] Failed to load overlay:', error);
      updateStatus(`Failed to load overlay: ${error.message}`, 'error');
    }
  }

  function applyHiddenGroups(container, modelName) {
    if (!container || !modelName) return;

    const HIDDEN_KEY = `openscad-forge-hidden-groups-${modelName}`;

    function loadHidden() {
      try {
        return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'));
      } catch {
        return new Set();
      }
    }

    function saveHidden(set) {
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set]));
      } catch (_) {
        /* storage full */
      }
    }

    function refreshShowAll() {
      const existing = container.querySelector('.param-groups-show-all');
      const hiddenGroups = container.querySelectorAll('.param-group[hidden]');
      const count = hiddenGroups.length;
      if (count === 0) {
        existing?.remove();
        return;
      }
      if (!existing) {
        const link = document.createElement('button');
        link.className = 'param-groups-show-all btn btn-sm btn-outline';
        link.type = 'button';
        link.setAttribute('aria-live', 'polite');
        container.appendChild(link);
        link.addEventListener('click', () => {
          container.querySelectorAll('.param-group[hidden]').forEach((el) => {
            el.removeAttribute('hidden');
            const btn = el.querySelector('.param-group-hide-btn');
            if (btn) btn.setAttribute('aria-pressed', 'false');
          });
          saveHidden(new Set());
          refreshShowAll();
          announceImmediate('All parameter groups shown');
        });
      }
      container.querySelector('.param-groups-show-all').textContent =
        `${count} group${count !== 1 ? 's' : ''} hidden — Show all`;
    }

    const hidden = loadHidden();
    container
      .querySelectorAll('.param-group[data-group-id]')
      .forEach((details) => {
        if (hidden.has(details.dataset.groupId)) {
          details.setAttribute('hidden', '');
          const btn = details.querySelector('.param-group-hide-btn');
          if (btn) btn.setAttribute('aria-pressed', 'true');
        }
      });
    refreshShowAll();

    container.addEventListener('group-hide', (e) => {
      const { groupId, groupLabel } = e.detail;
      const groupEl = container.querySelector(
        `.param-group[data-group-id="${groupId}"]`
      );
      if (!groupEl) return;
      groupEl.setAttribute('hidden', '');
      const btn = groupEl.querySelector('.param-group-hide-btn');
      if (btn) btn.setAttribute('aria-pressed', 'true');
      const hiddenSet = loadHidden();
      hiddenSet.add(groupId);
      saveHidden(hiddenSet);
      refreshShowAll();
      announceImmediate(`${groupLabel} group hidden`);
    });
  }

  /**
   * Auto-size the reference overlay from SCAD parameters.
   * Priority: explicit screen_width/height_mm > keyguard case opening dims.
   * @param {Object} paramValues - Current parameter values
   */
  function autoApplyScreenDimensionsFromParams(paramValues) {
    const previewManager = getPreviewManager();
    if (!previewManager || !paramValues) return;

    const sw = parseFloat(paramValues['screen_width_mm']);
    const sh = parseFloat(paramValues['screen_height_mm']);
    if (!isNaN(sw) && !isNaN(sh) && sw > 0 && sh > 0) {
      previewManager.fitOverlayToScreenDimensions(sw, sh);
      console.log(
        `[App] Overlay auto-sized from screen_width/height_mm: ${sw} × ${sh} mm`
      );
      return;
    }

    let cw = parseFloat(paramValues['width_of_opening_in_case']);
    let ch = parseFloat(paramValues['height_of_opening_in_case']);
    if (!isNaN(cw) && !isNaN(ch) && cw > 0 && ch > 0) {
      const orientation = (paramValues['orientation'] || '').toLowerCase();
      if (orientation === 'landscape' && ch > cw) {
        [cw, ch] = [ch, cw];
      } else if (orientation === 'portrait' && cw > ch) {
        [cw, ch] = [ch, cw];
      }
      previewManager.fitOverlayToScreenDimensions(cw, ch);
      console.log(
        `[App] Overlay auto-sized from case opening: ${cw} × ${ch} mm (${orientation || 'default'})`
      );
      return;
    }
  }

  function updateOverlayStatus() {
    if (!overlayStatus) return;
    const previewManager = getPreviewManager();
    const config = previewManager?.getOverlayConfig();
    const isEnabled = config?.enabled && config?.sourceFileName;
    overlayStatus.textContent = isEnabled ? 'On' : 'Off';
    overlayStatus.classList.toggle('active', isEnabled);
  }

  function updateOverlayUIFromConfig() {
    const previewManager = getPreviewManager();
    if (!previewManager) return;

    const config = previewManager.getOverlayConfig();

    if (overlayToggle) {
      overlayToggle.checked = config.enabled;
    }

    if (overlayOpacityInput) {
      const opacityPercent = Math.round(config.opacity * 100);
      overlayOpacityInput.value = opacityPercent;
      if (overlayOpacityValue) {
        overlayOpacityValue.textContent = `${opacityPercent}%`;
      }
    }

    if (overlayWidthInput) {
      overlayWidthInput.value = parseFloat(config.width.toFixed(1));
    }

    if (overlayHeightInput) {
      overlayHeightInput.value = parseFloat(config.height.toFixed(1));
    }

    if (overlayOffsetXInput) {
      overlayOffsetXInput.value = Math.round(config.offsetX);
    }

    if (overlayOffsetYInput) {
      overlayOffsetYInput.value = Math.round(config.offsetY);
    }

    if (overlayRotationInput) {
      overlayRotationInput.value = Math.round(config.rotationDeg);
      if (overlayRotationValue) {
        overlayRotationValue.textContent = `${Math.round(config.rotationDeg)}°`;
      }
    }

    if (overlayAspectLockBtn) {
      overlayAspectLockBtn.setAttribute(
        'aria-pressed',
        config.lockAspect ? 'true' : 'false'
      );
    }

    if (overlaySourceSelect && config.sourceFileName) {
      overlaySourceSelect.value = config.sourceFileName;
    }

    if (overlayDimensionsValue) {
      const w = Math.round(config.width);
      const h = Math.round(config.height);
      overlayDimensionsValue.textContent = `${w} × ${h} mm`;
    }

    updateOverlayStatus();
  }

  // Wire overlay source select
  if (overlaySourceSelect) {
    overlaySourceSelect.addEventListener('change', async () => {
      const fileName = overlaySourceSelect.value;
      if (fileName.startsWith('screenshot:')) {
        const imageName = fileName.slice('screenshot:'.length);
        const rec = SharedImageStore.getImageByName(imageName);
        const previewManager = getPreviewManager();
        if (rec && previewManager) {
          try {
            await previewManager.setReferenceOverlaySource({
              kind: 'raster',
              name: imageName,
              dataUrlOrText: rec.dataUrl,
            });
            if (!overlayToggle?.checked) {
              overlayToggle.checked = true;
              previewManager.setOverlayEnabled(true);
            }
            updateOverlayUIFromConfig();
            overlaySourceSelect.value = fileName;
            localStorage.setItem(STORAGE_KEY_OVERLAY_SOURCE, fileName);
            console.log(`[App] Screenshot overlay loaded: ${imageName}`);
          } catch (error) {
            console.error('[App] Failed to load screenshot overlay:', error);
          }
        }
        return;
      }

      await loadOverlayFromProjectFile(fileName);
    });
  }

  // Wire overlay file upload input
  if (overlayFileInput) {
    overlayFileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const fileName = file.name;
      const ext = fileName.split('.').pop()?.toLowerCase();
      const isSvg = ext === 'svg' || file.type === 'image/svg+xml';

      try {
        let content;
        if (isSvg) {
          content = await file.text();
        } else {
          content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
          });
        }

        uploadedOverlayFiles.set(fileName, { content, isSvg });

        if (overlaySourceSelect) {
          let optionExists = false;
          for (const opt of overlaySourceSelect.options) {
            if (opt.value === fileName) {
              optionExists = true;
              break;
            }
          }
          if (!optionExists) {
            const option = document.createElement('option');
            option.value = fileName;
            option.textContent = `📤 ${fileName}`;
            overlaySourceSelect.appendChild(option);
          }
          overlaySourceSelect.value = fileName;
        }

        await loadOverlayFromUploadedFile(fileName);
        updateStatus(`Overlay image loaded: ${fileName}`);
      } catch (error) {
        console.error('[App] Failed to load overlay file:', error);
        updateStatus(`Failed to load overlay: ${error.message}`, 'error');
      }

      overlayFileInput.value = '';
    });
  }

  async function loadOverlayFromUploadedFile(fileName) {
    const previewManager = getPreviewManager();
    if (!previewManager || !fileName) return;

    const uploadedFile = uploadedOverlayFiles.get(fileName);
    if (!uploadedFile) {
      await loadOverlayFromProjectFile(fileName);
      return;
    }

    const { content, isSvg } = uploadedFile;

    try {
      await previewManager.setReferenceOverlaySource({
        kind: isSvg ? 'svg' : 'raster',
        name: fileName,
        dataUrlOrText: content,
      });

      if (!overlayToggle?.checked) {
        overlayToggle.checked = true;
        previewManager.setOverlayEnabled(true);
      }

      updateOverlayUIFromConfig();
      localStorage.setItem(STORAGE_KEY_OVERLAY_SOURCE, fileName);
      console.log(`[App] Overlay loaded from upload: ${fileName}`);
    } catch (error) {
      console.error('[App] Failed to load overlay:', error);
      throw error;
    }
  }

  // Wire overlay toggle
  if (overlayToggle) {
    overlayToggle.addEventListener('change', () => {
      const enabled = overlayToggle.checked;
      const previewManager = getPreviewManager();
      if (previewManager) {
        previewManager.setOverlayEnabled(enabled);
        updateOverlayStatus();
        localStorage.setItem(
          STORAGE_KEY_OVERLAY_ENABLED,
          enabled ? 'true' : 'false'
        );
      }
      console.log(
        `[App] Reference overlay ${enabled ? 'enabled' : 'disabled'}`
      );
    });
  }

  // Wire overlay measurements toggle
  if (overlayMeasurementsToggle) {
    overlayMeasurementsToggle.addEventListener('change', () => {
      const enabled = overlayMeasurementsToggle.checked;
      const previewManager = getPreviewManager();
      if (previewManager) {
        previewManager.toggleOverlayMeasurements(enabled);
      }
      console.log(
        `[App] Overlay measurements ${enabled ? 'enabled' : 'disabled'}`
      );
    });
  }

  // Wire overlay opacity slider
  if (overlayOpacityInput) {
    overlayOpacityInput.addEventListener('input', () => {
      const opacityPercent = parseInt(overlayOpacityInput.value, 10);
      if (overlayOpacityValue) {
        overlayOpacityValue.textContent = `${opacityPercent}%`;
      }
      const previewManager = getPreviewManager();
      if (previewManager) {
        previewManager.setOverlayOpacity(opacityPercent / 100);
        localStorage.setItem(
          STORAGE_KEY_OVERLAY_OPACITY,
          opacityPercent.toString()
        );
      }
    });
  }

  // SVG overlay color — auto-adapts to theme
  function getThemeAwareSvgColor() {
    const root = document.documentElement;
    const explicit = root.getAttribute('data-theme');
    const prefersDark = window.matchMedia?.(
      '(prefers-color-scheme: dark)'
    )?.matches;
    const isDark = explicit === 'dark' || (!explicit && prefersDark);
    return isDark ? '#ffffff' : '#000000';
  }

  function applyOverlaySvgColor() {
    const autoColor = overlayAutoColorToggle?.checked ?? true;
    const color = autoColor
      ? getThemeAwareSvgColor()
      : overlayColorInput?.value || '#000000';
    if (overlayColorInput && autoColor) {
      overlayColorInput.value = color;
    }
    const previewManager = getPreviewManager();
    if (previewManager) {
      previewManager.setOverlaySvgColor(color);
    }
    localStorage.setItem(STORAGE_KEY_OVERLAY_SVG_COLOR, color);
    localStorage.setItem(
      STORAGE_KEY_OVERLAY_AUTO_COLOR,
      autoColor ? 'true' : 'false'
    );
  }

  if (overlayColorInput) {
    overlayColorInput.addEventListener('input', () => {
      if (overlayAutoColorToggle) {
        overlayAutoColorToggle.checked = false;
        overlayColorInput.classList.remove('overlay-color-auto');
      }
      applyOverlaySvgColor();
    });
  }

  if (overlayAutoColorToggle) {
    overlayAutoColorToggle.addEventListener('change', () => {
      if (overlayColorInput) {
        overlayColorInput.classList.toggle(
          'overlay-color-auto',
          overlayAutoColorToggle.checked
        );
      }
      applyOverlaySvgColor();
    });
  }

  // Re-apply SVG color when theme changes
  const themeObserver = new MutationObserver(() => {
    if (overlayAutoColorToggle?.checked) {
      applyOverlaySvgColor();
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-high-contrast'],
  });

  // Wire manual calibration override toggle
  if (overlayManualOverrideToggle && overlayCalibrationFieldset) {
    overlayManualOverrideToggle.addEventListener('change', () => {
      const enabled = overlayManualOverrideToggle.checked;
      overlayCalibrationFieldset.disabled = !enabled;
      console.log(
        `[App] Overlay manual calibration ${enabled ? 'enabled' : 'disabled'}`
      );
    });
  }

  // Wire fit to model button
  if (overlayFitModelBtn) {
    overlayFitModelBtn.addEventListener('click', () => {
      const previewManager = getPreviewManager();
      if (previewManager) {
        previewManager.fitOverlayToModelXY();
        updateOverlayUIFromConfig();
      }
    });
  }

  // Wire tablet device selector for overlay auto-sizing
  const overlayTabletSelect = document.getElementById('overlayTabletSelect');
  if (overlayTabletSelect) {
    let tabletDb = null;
    async function loadTabletDb() {
      if (tabletDb) return tabletDb;
      try {
        const resp = await fetch('/data/tablets.json');
        const data = await resp.json();
        tabletDb = data.tablets || [];
        overlayTabletSelect.innerHTML = tabletDb
          .map(
            (t) =>
              `<option value="${escapeHtml(String(t.id))}" data-w="${escapeHtml(String(t.screenWidthMm ?? ''))}" data-h="${escapeHtml(String(t.screenHeightMm ?? ''))}">${escapeHtml(t.label)}</option>`
          )
          .join('');
      } catch (err) {
        console.warn('[App] Could not load tablet database:', err);
        tabletDb = [];
      }
      return tabletDb;
    }

    overlayTabletSelect.addEventListener('focus', () => loadTabletDb());
    overlayTabletSelect.addEventListener('change', async () => {
      await loadTabletDb();
      const opt = overlayTabletSelect.selectedOptions[0];
      if (!opt) return;
      const w = parseFloat(opt.dataset.w);
      const h = parseFloat(opt.dataset.h);
      const previewManager = getPreviewManager();
      if (!isNaN(w) && !isNaN(h) && previewManager) {
        previewManager.fitOverlayToScreenDimensions(w, h);
        updateOverlayUIFromConfig();
        updateStatus(`Overlay sized to ${opt.text}: ${w} × ${h} mm`);
      }
    });
  }

  // Wire center button
  if (overlayCenterBtn) {
    overlayCenterBtn.addEventListener('click', () => {
      const previewManager = getPreviewManager();
      if (previewManager) {
        previewManager.setOverlayTransform({ offsetX: 0, offsetY: 0 });
        updateOverlayUIFromConfig();
      }
    });
  }

  // Wire width input
  if (overlayWidthInput) {
    overlayWidthInput.addEventListener('change', () => {
      const width = parseFloat(overlayWidthInput.value);
      const previewManager = getPreviewManager();
      if (!isNaN(width) && previewManager) {
        previewManager.setOverlaySize({ width });
        updateOverlayUIFromConfig();
        localStorage.setItem(STORAGE_KEY_OVERLAY_WIDTH, String(width));
      }
    });
  }

  // Wire height input
  if (overlayHeightInput) {
    overlayHeightInput.addEventListener('change', () => {
      const height = parseFloat(overlayHeightInput.value);
      const previewManager = getPreviewManager();
      if (!isNaN(height) && previewManager) {
        previewManager.setOverlaySize({ height });
        updateOverlayUIFromConfig();
        localStorage.setItem(STORAGE_KEY_OVERLAY_HEIGHT, String(height));
      }
    });
  }

  // Wire aspect lock button
  if (overlayAspectLockBtn) {
    overlayAspectLockBtn.addEventListener('click', () => {
      const isCurrentlyLocked =
        overlayAspectLockBtn.getAttribute('aria-pressed') === 'true';
      const newLocked = !isCurrentlyLocked;
      overlayAspectLockBtn.setAttribute(
        'aria-pressed',
        newLocked ? 'true' : 'false'
      );
      const previewManager = getPreviewManager();
      if (previewManager) {
        previewManager.setOverlayAspectLock(newLocked);
      }
    });
  }

  // Wire offset X input
  if (overlayOffsetXInput) {
    overlayOffsetXInput.addEventListener('change', () => {
      const offsetX = parseFloat(overlayOffsetXInput.value);
      const previewManager = getPreviewManager();
      if (!isNaN(offsetX) && previewManager) {
        previewManager.setOverlayTransform({ offsetX });
      }
    });
  }

  // Wire offset Y input
  if (overlayOffsetYInput) {
    overlayOffsetYInput.addEventListener('change', () => {
      const offsetY = parseFloat(overlayOffsetYInput.value);
      const previewManager = getPreviewManager();
      if (!isNaN(offsetY) && previewManager) {
        previewManager.setOverlayTransform({ offsetY });
      }
    });
  }

  // Wire rotation slider
  if (overlayRotationInput) {
    overlayRotationInput.addEventListener('input', () => {
      const rotationDeg = parseInt(overlayRotationInput.value, 10);
      if (overlayRotationValue) {
        overlayRotationValue.textContent = `${rotationDeg}°`;
      }
      const previewManager = getPreviewManager();
      if (previewManager) {
        previewManager.setOverlayTransform({ rotationDeg });
      }
    });
  }

  // ============================================================================
  // Auto-Rotate Controls
  // ============================================================================

  function syncAutoRotateToggles(enabled) {
    const toggles = [autoRotateToggle, mobileAutoRotateToggle];
    toggles.forEach((toggle) => {
      if (toggle) {
        toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        toggle.classList.toggle('active', enabled);
      }
    });
  }

  function setAutoRotation(enabled) {
    if (enabled && prefersReducedMotion.matches) {
      console.log('[App] Auto-rotate blocked: user prefers reduced motion');
      announceImmediate(
        'Auto-rotation is disabled because you prefer reduced motion'
      );
      return;
    }

    const previewManager = getPreviewManager();
    if (previewManager) {
      previewManager.setAutoRotate(enabled);
    }
    syncAutoRotateToggles(enabled);
    localStorage.setItem(STORAGE_KEY_AUTO_ROTATE, enabled ? 'true' : 'false');
    announceImmediate(`Auto-rotation ${enabled ? 'enabled' : 'disabled'}`);
    console.log(`[App] Auto-rotate ${enabled ? 'enabled' : 'disabled'}`);
  }

  const savedRotateSpeed = localStorage.getItem(STORAGE_KEY_ROTATE_SPEED);

  function updateRotationSpeedDisplay(speed) {
    if (rotationSpeedValue) {
      rotationSpeedValue.textContent = `${speed.toFixed(1)}°/s`;
    }
    if (rotationSpeedInput) {
      rotationSpeedInput.setAttribute('aria-valuenow', speed.toFixed(1));
    }
  }

  if (savedRotateSpeed && rotationSpeedInput) {
    const speed = parseFloat(savedRotateSpeed);
    if (!isNaN(speed) && speed >= 0.1 && speed <= 3) {
      rotationSpeedInput.value = speed;
      updateRotationSpeedDisplay(speed);
    } else {
      updateRotationSpeedDisplay(0.5);
    }
  } else if (rotationSpeedInput) {
    updateRotationSpeedDisplay(0.5);
  }

  // Wire desktop auto-rotate toggle
  if (autoRotateToggle) {
    autoRotateToggle.addEventListener('click', () => {
      const currentState =
        autoRotateToggle.getAttribute('aria-pressed') === 'true';
      setAutoRotation(!currentState);
    });
  }

  // Wire mobile auto-rotate toggle
  if (mobileAutoRotateToggle) {
    mobileAutoRotateToggle.addEventListener('click', () => {
      const currentState =
        mobileAutoRotateToggle.getAttribute('aria-pressed') === 'true';
      setAutoRotation(!currentState);
    });
  }

  // Wire rotation speed slider
  if (rotationSpeedInput) {
    rotationSpeedInput.addEventListener('input', () => {
      let speed = parseFloat(rotationSpeedInput.value);
      speed = Math.max(0.1, Math.min(3, speed));
      updateRotationSpeedDisplay(speed);
      const previewManager = getPreviewManager();
      if (previewManager) {
        previewManager.setAutoRotateSpeed(speed);
      }
    });

    rotationSpeedInput.addEventListener('change', () => {
      const speed = parseFloat(rotationSpeedInput.value);
      localStorage.setItem(STORAGE_KEY_ROTATE_SPEED, speed.toString());
      console.log(`[App] Auto-rotate speed set to ${speed.toFixed(1)} deg/s`);
    });
  }

  // Listen for prefers-reduced-motion changes
  prefersReducedMotion.addEventListener('change', (e) => {
    const previewManager = getPreviewManager();
    if (e.matches && previewManager?.isAutoRotateEnabled()) {
      setAutoRotation(false);
      console.log(
        '[App] Auto-rotate disabled: user now prefers reduced motion'
      );
    }
  });

  // ============================================================================
  // Late initialization — called once previewManager is created
  // ============================================================================

  /**
   * Connect to PreviewManager and restore persisted overlay/grid/rotate settings.
   * Call this once after PreviewManager is instantiated.
   * @param {Object} pm - The PreviewManager instance
   */
  function connectPreviewManager(pm) {
    // Sync grid size inputs
    const savedGrid = pm.getGridSize();
    if (gridWidthInput) gridWidthInput.value = savedGrid.widthMm;
    if (gridHeightInput) gridHeightInput.value = savedGrid.heightMm;

    syncGridOpacitySlider();

    // Restore overlay opacity
    const savedOverlayOpacity = localStorage.getItem(STORAGE_KEY_OVERLAY_OPACITY);
    if (savedOverlayOpacity) {
      const opacity = parseInt(savedOverlayOpacity, 10);
      if (!isNaN(opacity) && opacity >= 0 && opacity <= 100) {
        pm.setOverlayOpacity(opacity / 100);
        if (overlayOpacityInput) {
          overlayOpacityInput.value = opacity;
        }
        if (overlayOpacityValue) {
          overlayOpacityValue.textContent = `${opacity}%`;
        }
      }
    }

    // Restore overlay width/height
    const savedOverlayWidth = localStorage.getItem(STORAGE_KEY_OVERLAY_WIDTH);
    const savedOverlayHeight = localStorage.getItem(STORAGE_KEY_OVERLAY_HEIGHT);
    if (savedOverlayWidth || savedOverlayHeight) {
      const sizeUpdate = {};
      if (savedOverlayWidth) {
        const w = parseFloat(savedOverlayWidth);
        if (!isNaN(w) && w > 0) sizeUpdate.width = w;
      }
      if (savedOverlayHeight) {
        const h = parseFloat(savedOverlayHeight);
        if (!isNaN(h) && h > 0) sizeUpdate.height = h;
      }
      if (Object.keys(sizeUpdate).length > 0) {
        pm.setOverlaySize(sizeUpdate);
        updateOverlayUIFromConfig();
      }
    }

    // Restore overlay SVG color
    const savedAutoColor = localStorage.getItem(STORAGE_KEY_OVERLAY_AUTO_COLOR);
    const isAutoColor = savedAutoColor !== 'false';
    if (overlayAutoColorToggle) {
      overlayAutoColorToggle.checked = isAutoColor;
    }
    if (overlayColorInput) {
      overlayColorInput.classList.toggle('overlay-color-auto', isAutoColor);
    }
    if (isAutoColor) {
      const themeColor = getThemeAwareSvgColor();
      if (overlayColorInput) overlayColorInput.value = themeColor;
      pm.overlayConfig.svgColor = themeColor;
    } else {
      const savedColor = localStorage.getItem(STORAGE_KEY_OVERLAY_SVG_COLOR);
      if (savedColor && overlayColorInput) {
        overlayColorInput.value = savedColor;
      }
      pm.overlayConfig.svgColor = savedColor || '#000000';
    }

    // Restore auto-rotate settings
    const savedAutoRotatePref = localStorage.getItem(STORAGE_KEY_AUTO_ROTATE);
    const savedRotateSpeedPref = localStorage.getItem(STORAGE_KEY_ROTATE_SPEED);

    if (savedRotateSpeedPref) {
      const speed = parseFloat(savedRotateSpeedPref);
      if (!isNaN(speed) && speed >= 0.1 && speed <= 3) {
        pm.setAutoRotateSpeed(speed);
      }
    }

    if (savedAutoRotatePref === 'true' && !prefersReducedMotion.matches) {
      pm.setAutoRotate(true);
      syncAutoRotateToggles(true);
    }
  }

  // ---- Public API ----
  return {
    syncGridColorPicker,
    syncGridOpacitySlider,
    updateOverlaySourceDropdown,
    loadOverlayFromProjectFile,
    applyHiddenGroups,
    autoApplyScreenDimensionsFromParams,
    updateOverlayStatus,
    updateOverlayUIFromConfig,
    getThemeAwareSvgColor,
    syncAutoRotateToggles,
    setAutoRotation,
    connectPreviewManager,
  };
}
