/**
 * File Handler
 * Manages file upload processing, ZIP extraction, folder import, example
 * loading, and the core handleFile mega-function that transitions the app
 * from the welcome screen to the active editor. Extracted from main.js
 * for maintainability.
 * @license GPL-3.0-or-later
 */

import { stateManager } from './state.js';
import { extractParameters } from './parser.js';
import { renderParameterUI } from './ui-generator.js';
import {
  extractZipFiles,
  validateZipFile,
  getZipStats,
  buildPresetCompanionMap,
} from './zip-handler.js';
import {
  runPreflightCheck,
  formatMissingDependencies,
} from './dependency-checker.js';
import {
  analyzeComplexity,
  getAdaptiveQualityConfig,
} from './quality-tiers.js';
import { PreviewManager } from './preview.js';
import { PREVIEW_STATE } from './auto-preview-controller.js';
import { LIBRARY_DEFINITIONS } from './library-manager.js';
import { presetManager } from './preset-manager.js';
import { closeModal } from './modal-manager.js';
import { themeManager } from './theme-manager.js';
import { getUIModeController } from './ui-mode-controller.js';
import {
  detectIncludeUse,
  detectRequiredCompanionFiles,
} from './companion-files-controller.js';
import { getErrorLogPanel, ERROR_LOG_TYPE } from './error-log-panel.js';
import * as SharedImageStore from './shared-image-store.js';
import { getAppPrefKey } from './storage-keys.js';
import { importProjectFromFiles } from './storage-manager.js';
import { showMissingDependenciesDialog } from './dialogs.js';
import { announceError as _announceError } from './announcer.js';
import { showErrorModal, showErrorToast } from './error-translator.js';
import { closeTutorial } from './tutorial-sandbox.js';
import {
  sanitizeUrlParams,
  applyToolbarModeVisibility,
} from './hfm-controller.js';

const STORAGE_KEY_MODEL_COLOR = getAppPrefKey('model-color');

// ---------------------------------------------------------------------------
// Example definitions
// ---------------------------------------------------------------------------

export const EXAMPLE_DEFINITIONS = {
  'simple-box': {
    path: '/examples/simple-box/simple_box.scad',
    name: 'simple_box.scad',
  },
  cylinder: {
    path: '/examples/parametric-cylinder/parametric_cylinder.scad',
    name: 'parametric_cylinder.scad',
  },
  'library-test': {
    path: '/examples/library-test/library_test.scad',
    name: 'library_test.scad',
  },
  'colored-box': {
    path: '/examples/colored-box/colored_box.scad',
    name: 'colored_box.scad',
  },
  'multi-file-box': {
    path: '/examples/multi-file-box.zip',
    name: 'multi-file-box.zip',
  },
  'cable-organizer': {
    path: '/examples/cable-organizer/cable_organizer.scad',
    name: 'cable_organizer.scad',
  },
  'honeycomb-grid': {
    path: '/examples/honeycomb-grid/honeycomb_grid.scad',
    name: 'honeycomb_grid.scad',
  },
};

// ---------------------------------------------------------------------------
// Standalone utility: processing overlay
// ---------------------------------------------------------------------------

/**
 * Show a full-screen processing overlay for long operations.
 *
 * IMPORTANT: This overlay renders at z-index 10000, which is ABOVE all
 * modals (z-index 1000). Callers MUST ensure no blocking modal (especially
 * the first-visit disclosure) is open when invoking this function, or the
 * modal's buttons will be unreachable. Always await
 * waitForFirstVisitAcceptance() before calling this.
 *
 * @param {string} message - Primary message
 * @param {Object} [opts]
 * @param {string} [opts.hint] - Secondary hint text
 * @param {number} [opts.delayMs=0] - Delay before showing (0 = immediate)
 * @returns {Function} dismiss callback (safe to call multiple times)
 */
export function showProcessingOverlay(message, opts = {}) {
  const { hint = 'Please do not close or refresh the page.', delayMs = 0 } =
    typeof opts === 'string' ? { hint: opts } : opts;
  let dismissed = false;
  let timerId = null;

  const show = () => {
    if (dismissed) return;
    let overlay = document.getElementById('processingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'processingOverlay';
      overlay.className = 'processing-overlay';
      overlay.setAttribute('role', 'alert');
      overlay.setAttribute('aria-live', 'assertive');
      overlay.innerHTML = `
        <div class="processing-spinner"></div>
        <div class="processing-message"></div>
        <div class="processing-hint"></div>
      `;
      document.body.appendChild(overlay);
    }
    overlay.querySelector('.processing-message').textContent = message;
    overlay.querySelector('.processing-hint').textContent = hint;
  };

  if (delayMs > 0) {
    timerId = setTimeout(show, delayMs);
  } else {
    show();
  }

  return () => {
    dismissed = true;
    if (timerId) clearTimeout(timerId);
    const el = document.getElementById('processingOverlay');
    if (el) el.remove();
  };
}

// ---------------------------------------------------------------------------
// File handler controller
// ---------------------------------------------------------------------------

/**
 * Initialize the file handler controller.
 * @param {Object} deps
 * @param {Function} deps.getPreviewManager - Returns current PreviewManager (may be null)
 * @param {Function} deps.setPreviewManager - Sets the PreviewManager instance
 * @param {Function} deps.getAutoPreviewController - Returns current AutoPreviewController (may be null)
 * @param {Function} deps.getAutoPreviewEnabled - Returns whether auto-preview is enabled
 * @param {Function} deps.setCurrentSavedProjectId - Sets current saved project ID
 * @param {Function} deps.setPresetCompanionMap - Sets preset companion map
 * @param {Function} deps.getFileSizeLimits - Returns FILE_SIZE_LIMITS object
 * @param {Function} deps.getValidateFileUpload - Returns validateFileUpload validator
 * @param {Function} deps.getCameraPanelController - Returns camera panel controller (may be null)
 * @param {Function} deps.getOverlayGridCtrl - Returns overlay/grid controller instance
 * @param {Function} deps.getCompanionFilesCtrl - Returns companion files controller instance
 * @param {Function} deps.getHfmCtrl - Returns HFM controller instance
 * @param {Function} deps.getSavedProjectsUI - Returns saved projects UI controller
 * @param {Function} deps.getFileActionsController - Returns file actions controller
 * @param {Function} deps.getLibraryManager - Returns library manager instance
 * @param {Function} deps.getPreviewContainer - Returns preview container DOM element
 * @param {Function} deps.getPreviewStateIndicator - Returns preview state indicator element
 * @param {Function} deps.getRenderingOverlay - Returns rendering overlay element
 * @param {Function} deps.updateStatus - Status bar update callback
 * @param {Function} deps.updatePreviewDrawer - Preview drawer update callback
 * @param {Function} deps.updatePrimaryActionButton - Primary action button update callback
 * @param {Function} deps.updateColorLegend - Color legend update callback
 * @param {Function} deps.updatePreviewStateUI - Preview state indicator update callback
 * @param {Function} deps.clearPresetSelection - Clear preset selection callback
 * @param {Function} deps.forceClearPresetSelection - Force clear preset selection callback
 * @param {Function} deps.updatePresetDropdown - Update preset dropdown callback
 * @param {Function} deps.syncPreviewModelColorOverride - Sync model color override callback
 * @param {Function} deps.syncPreviewAppearanceOverride - Sync appearance override callback
 * @param {Function} deps.initAutoPreviewController - Initialize auto-preview controller callback
 * @param {Function} deps.setCanonicalProjectFiles - Update canonical project files snapshot
 * @param {Function} deps.renderLibraryUI - Render library controls UI
 * @param {Function} deps.getEnabledLibrariesForRender - Returns enabled library mount paths
 * @returns {Object} Controller API: { handleFile, handleFolderImport, loadExampleByKey }
 */
export function initFileHandler({
  getPreviewManager,
  setPreviewManager,
  getAutoPreviewController,
  getAutoPreviewEnabled,
  setCurrentSavedProjectId,
  setPresetCompanionMap,
  getFileSizeLimits,
  getValidateFileUpload,
  getCameraPanelController,
  getOverlayGridCtrl,
  getCompanionFilesCtrl,
  getHfmCtrl,
  getSavedProjectsUI,
  getFileActionsController,
  getLibraryManager,
  getPreviewContainer,
  getPreviewStateIndicator,
  getRenderingOverlay,
  updateStatus,
  updatePreviewDrawer,
  updatePrimaryActionButton,
  updateColorLegend,
  updatePreviewStateUI,
  clearPresetSelection,
  forceClearPresetSelection,
  updatePresetDropdown,
  syncPreviewModelColorOverride,
  syncPreviewAppearanceOverride,
  initAutoPreviewController,
  setCanonicalProjectFiles,
  renderLibraryUI,
  getEnabledLibrariesForRender,
}) {
  // ------------------------------------------------------------------
  // Folder import helpers
  // ------------------------------------------------------------------

  async function _collectFilesFromDir(dirHandle, basePath, out) {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        const relPath = `${basePath}/${entry.name}`;
        Object.defineProperty(file, 'webkitRelativePath', {
          value: relPath,
          writable: false,
        });
        out.push(file);
      } else if (entry.kind === 'directory') {
        await _collectFilesFromDir(entry, `${basePath}/${entry.name}`, out);
      }
    }
  }

  /**
   * Show a modal prompting the user to select one .scad file from a list.
   * @param {string[]} paths - webkitRelativePath values to choose from
   * @param {string} prompt - Heading text
   * @returns {Promise<string|null>} Selected path, or null if cancelled
   */
  async function _promptScadSelection(paths, prompt) {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.className = 'folder-scad-select-dialog';
      dialog.setAttribute('aria-labelledby', 'scadSelectTitle');

      const optionsHtml = paths
        .map(
          (p, i) =>
            `<label class="import-mode-option">
              <input type="radio" name="scadFile" value="${p}"${i === 0 ? ' checked' : ''} />
              <span>${p.split('/').pop()}</span>
            </label>`
        )
        .join('');

      dialog.innerHTML = `
        <form method="dialog" class="import-mode-form">
          <h3 id="scadSelectTitle" class="import-mode-title">${prompt}</h3>
          <fieldset class="import-mode-fieldset">
            <legend class="import-mode-legend">Select main .scad file</legend>
            ${optionsHtml}
          </fieldset>
          <div class="import-mode-actions">
            <button type="submit" value="ok" class="btn btn-primary">Import</button>
            <button type="submit" value="cancel" class="btn btn-outline">Cancel</button>
          </div>
        </form>`;

      document.body.appendChild(dialog);
      dialog.showModal();

      dialog.addEventListener(
        'close',
        () => {
          const returnValue = dialog.returnValue;
          const selected =
            dialog.querySelector('input[name="scadFile"]:checked')?.value ||
            null;
          document.body.removeChild(dialog);
          resolve(returnValue === 'ok' ? selected : null);
        },
        { once: true }
      );
    });
  }

  /**
   * Handle a folder selection from the webkitdirectory input or showDirectoryPicker.
   * @param {FileList|File[]} files - FileList or array of Files with webkitRelativePath
   */
  async function handleFolderImport(files) {
    const fileArr = Array.from(files);
    let dismissOverlay = () => {};

    dismissOverlay = showProcessingOverlay(
      `Processing ${fileArr.length} files from folder\u2026`,
      'Analyzing project structure. Please do not close or refresh the page.'
    );

    const MAX_FILES = 500;
    const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
    const WARN_FILES = 200;

    const totalBytes = fileArr.reduce((sum, f) => sum + f.size, 0);

    if (fileArr.length > MAX_FILES) {
      dismissOverlay();
      showErrorToast({
        title: 'Too Many Files',
        message: `The selected folder contains ${fileArr.length} files (limit: ${MAX_FILES}). Please select a smaller project folder.`,
      });
      return;
    }

    if (totalBytes > MAX_BYTES) {
      dismissOverlay();
      const mb = (totalBytes / 1024 / 1024).toFixed(1);
      showErrorToast({
        title: 'Folder Too Large',
        message: `The selected folder is ${mb} MB (limit: 100 MB). Please select a smaller project folder.`,
      });
      return;
    }

    if (fileArr.length > WARN_FILES) {
      console.warn(
        `[FolderImport] ${fileArr.length} files selected \u2014 large project folder.`
      );
    }

    const rootDir = fileArr[0]?.webkitRelativePath?.split('/')[0] || '';

    const scadInRoot = fileArr.filter((f) => {
      const rel = f.webkitRelativePath || f.name;
      const parts = rel.split('/');
      return parts.length === 2 && parts[1].endsWith('.scad');
    });

    const scadAnywhere = fileArr.filter((f) =>
      (f.webkitRelativePath || f.name).endsWith('.scad')
    );

    let mainFilePath = null;

    if (scadInRoot.length === 1) {
      mainFilePath = scadInRoot[0].webkitRelativePath;
    } else if (scadInRoot.length > 1) {
      dismissOverlay();
      mainFilePath = await _promptScadSelection(
        scadInRoot.map((f) => f.webkitRelativePath),
        'Multiple .scad files found in the folder root. Select the main file:'
      );
    } else if (scadAnywhere.length > 0) {
      dismissOverlay();
      mainFilePath = await _promptScadSelection(
        scadAnywhere.map((f) => f.webkitRelativePath),
        'No .scad files found in the folder root. Select the main file:'
      );
    } else {
      dismissOverlay();
      showErrorToast({ title: 'No .scad Files', message: 'No OpenSCAD (.scad) files found in the selected folder.' });
      return;
    }

    if (!mainFilePath) return;

    const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
    dismissOverlay = showProcessingOverlay(
      `Importing folder "${rootDir}" (${fileArr.length} files, ${totalMB} MB)\u2026`,
      'This may take a moment for large projects. Please do not close or refresh the page.'
    );

    try {
      const result = await importProjectFromFiles(files, mainFilePath);

      dismissOverlay();

      if (result.success) {
        updateStatus(`Folder imported: ${rootDir || mainFilePath}`);
        const savedProjectsUI = getSavedProjectsUI();
        await savedProjectsUI.renderSavedProjectsList();
        if (result.id) {
          await savedProjectsUI.loadSavedProject(result.id);
        }
      } else {
        showErrorToast({ title: 'Folder Import Failed', message: result.error });
      }
    } catch (err) {
      dismissOverlay();
      showErrorToast({ title: 'Folder Import Failed', message: err.message });
    }
  }

  // ------------------------------------------------------------------
  // Core file handler
  // ------------------------------------------------------------------

  async function handleFile(
    file,
    content = null,
    extractedFiles = null,
    mainFilePathArg = null,
    source = 'user',
    originalFileNameArg = null
  ) {
    if (!file && !content) return;

    const rawFileName =
      typeof file?.name === 'string' && file.name.trim().length > 0
        ? file.name
        : '';
    let fileName = rawFileName || 'example.scad';
    let fileContent = content;
    let projectFiles = extractedFiles;
    let mainFilePath = mainFilePathArg;
    const originalFileName = originalFileNameArg || fileName;

    if (file) {
      const fileNameLower = fileName.toLowerCase();
      const isZip = fileNameLower.endsWith('.zip');
      const isScad = fileNameLower.endsWith('.scad');
      const isActualFileUpload = !content && file instanceof File;

      if (isActualFileUpload) {
        if (!isZip && !isScad) {
          showErrorToast({
            title: 'Invalid File Type',
            message: 'Please upload a .scad or .zip file.',
          });
          return;
        }

        const validateFileUpload = getValidateFileUpload();
        const FILE_SIZE_LIMITS = getFileSizeLimits();

        const fileMeta = {
          name: fileNameLower,
          size: file.size,
        };

        const isValid = validateFileUpload(fileMeta);
        if (!isValid) {
          const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
          const isZipName = fileNameLower.endsWith('.zip');
          const isScadName = fileNameLower.endsWith('.scad');
          let userMsg;
          if (isZipName) {
            const limitMB = (FILE_SIZE_LIMITS.ZIP_FILE / (1024 * 1024)).toFixed(
              0
            );
            userMsg = `ZIP file is too large (${fileSizeMB} MB). Maximum allowed size is ${limitMB} MB.`;
          } else if (isScadName) {
            const limitMB = (
              FILE_SIZE_LIMITS.SCAD_FILE /
              (1024 * 1024)
            ).toFixed(0);
            userMsg = `.scad file is too large (${fileSizeMB} MB). Maximum allowed size is ${limitMB} MB.`;
          } else {
            userMsg = 'Please upload a .scad or .zip file.';
          }
          showErrorToast({ title: 'File Too Large', message: userMsg });
          console.error(
            '[File Upload] Validation failed:',
            validateFileUpload.errors
          );
          return;
        }
      }

      if (isZip && !content && !extractedFiles) {
        const validation = validateZipFile(file);
        if (!validation.valid) {
          showErrorToast({ title: 'Invalid ZIP File', message: validation.error });
          return;
        }

        let dismissOverlay = () => {};
        try {
          const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
          dismissOverlay = showProcessingOverlay(
            `Opening project (${fileSizeMB} MB)\u2026`,
            'This may take a moment for large files. Please do not close or refresh the page.'
          );
          updateStatus('Extracting ZIP file...');
          const { files, mainFile } = await extractZipFiles(file);

          const stats = getZipStats(files);
          console.log('[ZIP] Statistics:', stats);

          fileContent = files.get(mainFile);
          fileName = mainFile;
          mainFilePath = mainFile;

          projectFiles = new Map(files);

          console.log(
            `[ZIP] Loaded multi-file project: ${mainFile} (${stats.totalFiles} files)`
          );

          const uploadedFilenames = Array.from(files.keys());
          const preflight = runPreflightCheck(fileContent, uploadedFilenames, {
            availableLibraries: new Set(
              Object.keys(LIBRARY_DEFINITIONS).map((k) => k.toLowerCase())
            ),
          });

          if (!preflight.success) {
            console.warn(
              '[ZIP] Missing dependencies detected:',
              preflight.missing
            );
            dismissOverlay();

            const result = await showMissingDependenciesDialog(
              preflight.missing,
              file.name
            );

            if (result.action === 'cancel') {
              updateStatus('Upload cancelled - missing dependencies');
              return;
            }

            if (result.action === 'add-files' && result.addedFiles?.size > 0) {
              for (const [name, addedContent] of result.addedFiles) {
                files.set(name, addedContent);
                projectFiles.set(name, addedContent);
              }
              console.log(
                `[ZIP] User added ${result.addedFiles.size} missing file(s):`,
                Array.from(result.addedFiles.keys())
              );
            }

            dismissOverlay = showProcessingOverlay(
              `Opening project\u2026`,
              result.action === 'add-files'
                ? 'Loading with added files.'
                : 'Continuing with available files.'
            );

            if (result.action === 'continue') {
              console.warn(
                '[ZIP] Continuing despite missing files:',
                formatMissingDependencies(preflight.missing)
              );
            }
          }

          dismissOverlay();
          const zipFileName = file.name;
          handleFile(
            null,
            fileContent,
            projectFiles,
            mainFilePath,
            source,
            zipFileName
          );
          return;
        } catch (error) {
          dismissOverlay();
          console.error('[ZIP] Extraction failed:', error);
          updateStatus('Failed to extract ZIP file');
          showErrorModal({
            title: 'ZIP Extraction Failed',
            message:
              'Could not extract files from the uploaded ZIP archive.',
            suggestion:
              'Verify the ZIP file is not corrupted and contains valid .scad files.',
            technical: error.message,
          });
          return;
        }
      }

      const FILE_SIZE_LIMITS = getFileSizeLimits();
      if (file.size > FILE_SIZE_LIMITS.SCAD_FILE) {
        const limitMB = FILE_SIZE_LIMITS.SCAD_FILE / (1024 * 1024);
        showErrorToast({ title: 'File Too Large', message: `File size exceeds the ${limitMB} MB limit.` });
        return;
      }
    }

    if (file && !content) {
      const origName = fileName;
      const reader = new FileReader();
      reader.onload = (e) => {
        handleFile(
          { name: origName },
          e.target.result,
          extractedFiles,
          mainFilePath,
          source
        );
      };
      reader.readAsText(file);
      return;
    }

    console.log('File loaded:', fileName, fileContent.length, 'bytes');

    if (!extractedFiles) {
      const singleFilePreflight = runPreflightCheck(fileContent, [fileName], {
        availableLibraries: new Set(
          Object.keys(LIBRARY_DEFINITIONS).map((k) => k.toLowerCase())
        ),
      });
      if (!singleFilePreflight.success) {
        const allMissingFiles = [
          ...singleFilePreflight.missing.includes,
          ...singleFilePreflight.missing.uses,
          ...singleFilePreflight.missing.imports,
        ].join(', ');
        console.warn(
          '[Upload] Single-file upload references missing companion files:',
          singleFilePreflight.missing
        );
        getErrorLogPanel().addEntry({
          type: ERROR_LOG_TYPE.WARNING,
          group: 'Import',
          file: fileName,
          line: null,
          message: `Missing companion files: ${allMissingFiles} \u2014 upload the full project folder or ZIP to include all dependencies`,
          timestamp: Date.now(),
        });
      }
    }

    updateStatus('Extracting parameters...');
    try {
      const extracted = extractParameters(fileContent);
      console.log('Extracted parameters:', extracted);

      const paramCount = Object.keys(extracted.parameters).length;
      console.log(
        `Found ${paramCount} parameters in ${extracted.groups.length} groups`
      );
      const colorParamNames = Object.values(extracted.parameters)
        .filter((param) => param.uiType === 'color')
        .map((param) => param.name);

      const complexityAnalysis = analyzeComplexity(fileContent, {});
      const adaptiveConfig = getAdaptiveQualityConfig(fileContent, {});

      console.log('[Complexity] Analysis:', {
        tier: adaptiveConfig.tierName,
        score: complexityAnalysis.score,
        curvedFeatures: complexityAnalysis.estimatedCurvedFeatures,
        hardware: adaptiveConfig.hardware.level,
        warnings: complexityAnalysis.warnings,
      });

      if (complexityAnalysis.warnings.length > 0) {
        complexityAnalysis.warnings.forEach((w) =>
          console.warn('[Complexity]', w)
        );
      }

      const paramTypes = {};
      for (const [pName, pDef] of Object.entries(extracted.parameters || {})) {
        paramTypes[pName] = pDef.type || 'string';
      }

      stateManager.setState({
        uploadedFile: { name: originalFileName, content: fileContent },
        projectFiles: projectFiles || null,
        mainFilePath: mainFilePath || fileName,
        schema: extracted,
        paramTypes,
        parameters: {},
        defaults: {},
        complexityTier: adaptiveConfig.tier,
        complexityAnalysis: complexityAnalysis,
        adaptiveQualityConfig: adaptiveConfig,
      });
      setCanonicalProjectFiles(projectFiles || null);

      stateManager.clearHistory();

      forceClearPresetSelection();
      setPresetCompanionMap(null);

      let previewManager = getPreviewManager();
      if (previewManager) {
        previewManager.setReferenceOverlaySource({
          kind: null,
          name: null,
          dataUrlOrText: null,
        });
        previewManager.setOverlayEnabled(false);
      }
      const overlayToggle = document.getElementById('overlayToggle');
      const overlaySourceSelect = document.getElementById('overlaySourceSelect');
      if (overlayToggle) overlayToggle.checked = false;
      if (overlaySourceSelect) overlaySourceSelect.value = '';

      if (source !== 'saved') {
        setCurrentSavedProjectId(null);
      }

      const outputFormatSelect = document.getElementById('outputFormat');
      if (outputFormatSelect && outputFormatSelect.value !== 'stl') {
        outputFormatSelect.value = 'stl';
        outputFormatSelect.dispatchEvent(new Event('change'));
      }
      stateManager.setState({ outputFormat: 'stl' });

      const welcomeScreen = document.getElementById('welcomeScreen');
      const mainInterface = document.getElementById('mainInterface');
      welcomeScreen.classList.add('hidden');
      mainInterface.classList.remove('hidden');

      updatePreviewDrawer([]);
      if (typeof window.clearConsoleState === 'function') {
        window.clearConsoleState();
      }
      const appEl = document.getElementById('app');
      if (appEl) appEl.scrollTop = 0;
      const appMainEl = document.getElementById('main-content');
      if (appMainEl) appMainEl.scrollTop = 0;
      const previewContentEl = document.querySelector('.preview-content');
      if (previewContentEl) previewContentEl.scrollTop = 0;
      requestAnimationFrame(() => {
        const pm = getPreviewManager();
        if (pm) pm.handleResize();
      });

      const fileInfoSummaryEl = document.getElementById('fileInfoSummary');
      if (fileInfoSummaryEl && fileName) {
        fileInfoSummaryEl.textContent = fileName;
      }

      applyToolbarModeVisibility(getUIModeController().getMode());

      let includeUseWarning = '';
      if (!projectFiles || projectFiles.size <= 1) {
        const detection = detectIncludeUse(fileContent);
        if (detection.hasIncludes || detection.hasUse) {
          const fileList = detection.files.join(', ');
          includeUseWarning = `\n\u26A0\uFE0F Note: This file references external files (${fileList}). For multi-file projects, upload a ZIP containing all files.`;
          console.warn(
            '[Upload] Single-file upload with include/use detected:',
            detection.files
          );
        }
      }

      const appHeader = document.querySelector('.app-header');
      if (appHeader) {
        appHeader.classList.add('compact');
      }

      const complexityTierLabel = document.getElementById(
        'complexityTierLabel'
      );
      if (complexityTierLabel) {
        const tierName = adaptiveConfig.tierName;
        complexityTierLabel.textContent = tierName;
        complexityTierLabel.className = `complexity-tier-label tier-${adaptiveConfig.tier}`;
        complexityTierLabel.title =
          `${adaptiveConfig.tierDescription}\n` +
          `Curved features: ~${complexityAnalysis.estimatedCurvedFeatures}\n` +
          `Hardware: ${adaptiveConfig.hardware.level}\n` +
          `Preview: ${adaptiveConfig.defaultPreviewLevel}, Export: ${adaptiveConfig.defaultExportLevel}`;
      }

      if (includeUseWarning) {
        updateStatus(`File loaded. ${includeUseWarning.trim()}`);
      }

      const detectedLibraries = extracted.libraries || [];
      console.log('Detected libraries:', detectedLibraries);
      stateManager.setState({
        detectedLibraries,
      });

      const libraryManager = getLibraryManager();
      if (detectedLibraries.length > 0) {
        const autoEnabled = libraryManager.autoEnable(fileContent);
        if (autoEnabled.length > 0) {
          console.log('Auto-enabled libraries:', autoEnabled);
          updateStatus(`Enabled ${autoEnabled.length} required libraries`);
        }
      }

      renderLibraryUI(detectedLibraries);

      const parametersContainer = document.getElementById(
        'parametersContainer'
      );
      const currentValues = renderParameterUI(
        extracted,
        parametersContainer,
        (values) => {
          stateManager.recordParameterState();
          stateManager.setState({ parameters: values });
          clearPresetSelection(values);
          if (getAutoPreviewController()) {
            getAutoPreviewController().onParameterChange(values);
          }
          updatePrimaryActionButton();
          updateColorLegend();
          getCompanionFilesCtrl().syncOverlayWithScreenshotParam(values);
        }
      );

      stateManager.setState({
        parameters: currentValues,
        defaults: { ...currentValues },
      });

      try {
        const projectPrefsKey = `openscad-forge-ui-prefs-${fileName}`;
        const savedProjectPrefs = localStorage.getItem(projectPrefsKey);
        if (savedProjectPrefs) {
          const prefs = JSON.parse(savedProjectPrefs);
          getUIModeController().importPreferences(prefs, {
            applyImmediately: false,
          });
          console.log(
            `[App] Loaded per-project UI preferences for: ${fileName}`
          );
        } else {
          getUIModeController().setProjectHiddenPanels(null);
        }
      } catch {
        getUIModeController().setProjectHiddenPanels(null);
      }
      getUIModeController().applyCurrentMode();

      getFileActionsController().trackOpen(fileName);

      getOverlayGridCtrl().applyHiddenGroups(parametersContainer, extracted?.modelName || fileName);

      getOverlayGridCtrl().autoApplyScreenDimensionsFromParams(currentValues);

      if (projectFiles && projectFiles.size > 0) {
        console.debug(
          '[WASM FS] Companion files mounted:',
          Array.from(projectFiles.entries()).map(([path, c]) => ({
            path,
            sizeBytes: c.length,
          }))
        );

        let autoImportedCount = 0;
        const paramSchema = {};
        for (const [pName, pDef] of Object.entries(
          extracted.parameters || {}
        )) {
          paramSchema[pName] = { type: pDef.type || 'string' };
        }

        for (const [filePath, fileContentStr] of projectFiles.entries()) {
          if (
            filePath.toLowerCase().endsWith('.json') &&
            !filePath.toLowerCase().endsWith('.scad')
          ) {
            try {
              console.log(`[ZIP] Auto-importing presets from: ${filePath}`);
              console.debug(
                `[ZIP] JSON content preview (first 200 chars): ${fileContentStr.substring(0, 200)}`
              );
              const hiddenParamNamesForImport = Object.keys(
                extracted.hiddenParameters || {}
              );
              const importResult = presetManager.importPreset(
                fileContentStr,
                originalFileName,
                paramSchema,
                hiddenParamNamesForImport
              );
              if (importResult.success && importResult.imported > 0) {
                autoImportedCount += importResult.imported;
                console.log(
                  `[ZIP] Auto-imported ${importResult.imported} preset(s) from ${filePath}`
                );
                console.debug(`[ZIP] Import result details:`, importResult);
              } else if (!importResult.success) {
                console.warn(
                  `[ZIP] Failed to auto-import presets from ${filePath}:`,
                  importResult.error
                );
              }
            } catch (jsonError) {
              console.warn(
                `[ZIP] Error auto-importing presets from ${filePath}:`,
                jsonError.message
              );
            }
          }
        }

        if (autoImportedCount > 0) {
          const companionCount = Array.from(projectFiles.keys()).filter(
            (p) =>
              !p.toLowerCase().endsWith('.scad') &&
              !p.toLowerCase().endsWith('.json')
          ).length;
          const companionText =
            companionCount > 0
              ? ` + ${companionCount} companion file${companionCount > 1 ? 's' : ''}`
              : '';
          updateStatus(
            `Loaded: ${fileName}${companionText} + ${autoImportedCount} preset${autoImportedCount > 1 ? 's' : ''}`
          );
          updatePresetDropdown();

          const importedPresets =
            presetManager.getPresetsForModel(originalFileName);
          if (importedPresets.length > 0) {
            const parameterSetsForMap = Object.fromEntries(
              importedPresets.map((p) => [p.name, p.parameters])
            );
            const scadRefs = detectRequiredCompanionFiles(fileContent);
            const companionTargets = [
              ...new Set(
                (scadRefs?.files || [])
                  .filter(
                    (f) =>
                      f.required &&
                      (f.type === 'include' || f.type === 'import')
                  )
                  .map((f) => f.path.split('/').pop())
              ),
            ].filter((basename) => {
              let count = 0;
              for (const key of projectFiles.keys()) {
                if (key.split('/').pop() === basename) count++;
              }
              return count > 1;
            });
            const newMap = buildPresetCompanionMap(
              projectFiles,
              parameterSetsForMap,
              { companionTargets }
            );
            setPresetCompanionMap(newMap);
            console.log(
              `[ZIP] Built preset companion map for ${newMap.size} presets` +
                (companionTargets.length > 0
                  ? ` (generic targets: ${companionTargets.join(', ')})`
                  : ' (legacy path)')
            );
          }
        }
      }

      const urlParams = stateManager.loadFromURL();
      if (urlParams && Object.keys(urlParams).length > 0) {
        console.log('Loaded parameters from URL:', urlParams);

        const { sanitized, adjustments } = sanitizeUrlParams(
          extracted,
          urlParams
        );

        const updatedValues = renderParameterUI(
          extracted,
          parametersContainer,
          (values) => {
            stateManager.recordParameterState();
            stateManager.setState({ parameters: values });
            clearPresetSelection(values);
            if (getAutoPreviewController()) {
              getAutoPreviewController().onParameterChange(values);
            }
            updatePrimaryActionButton();
          },
          sanitized
        );

        stateManager.setState({ parameters: updatedValues });

        if (Object.keys(adjustments).length > 0) {
          updateStatus(
            'Some URL parameters were adjusted to fit allowed ranges.'
          );
        }

        if (getAutoPreviewController()) {
          getAutoPreviewController().onParameterChange(updatedValues);
        }

        updateStatus(
          `Ready - ${paramCount} parameters loaded (${Object.keys(urlParams).length} from URL)`
        );
      } else {
        updateStatus(`Ready - ${paramCount} parameters loaded`);
      }

      const presetControlsEl = document.getElementById('presetControls');
      if (presetControlsEl && !presetControlsEl.open) {
        presetControlsEl.open = true;
      }

      requestAnimationFrame(() => {
        const firstInput = parametersContainer?.querySelector(
          'input:not([type="hidden"]), select, textarea'
        );
        if (firstInput) {
          firstInput.focus({ preventScroll: true });
        }
      });

      previewManager = getPreviewManager();
      if (!previewManager) {
        const previewContainer = getPreviewContainer();
        previewManager = new PreviewManager(previewContainer);
        setPreviewManager(previewManager);
        await previewManager.init();

        if (!document.getElementById('rendered2dPreview')) {
          const preview2d = document.createElement('div');
          preview2d.id = 'rendered2dPreview';
          preview2d.className = 'rendered-2d-preview hidden';
          preview2d.setAttribute('role', 'img');
          preview2d.setAttribute('aria-label', 'Rendered 2D SVG preview');
          previewContainer.appendChild(preview2d);
        }

        previewContainer.style.position = 'relative';
        previewContainer.appendChild(getPreviewStateIndicator());
        previewContainer.appendChild(getRenderingOverlay());

        syncPreviewModelColorOverride();
        syncPreviewAppearanceOverride();

        const measurementsToggle = document.getElementById('measurementsToggle');
        if (measurementsToggle) {
          measurementsToggle.checked = previewManager.measurementsEnabled;
        }

        const gridToggle = document.getElementById('gridToggle');
        if (gridToggle) {
          gridToggle.checked = previewManager.gridEnabled;
        }

        getOverlayGridCtrl().connectPreviewManager(previewManager);

        const autoBedToggle = document.getElementById('autoBedToggle');
        if (autoBedToggle) {
          autoBedToggle.checked = previewManager.autoBedEnabled;
        }

        syncPreviewAppearanceOverride();

        const cameraPanelController = getCameraPanelController();
        if (cameraPanelController) {
          cameraPanelController.setPreviewManager(previewManager);
        }

        const hfmCtrl = getHfmCtrl();
        if (hfmCtrl.isUnlocked() && !document.getElementById('_hfmToggle')) {
          hfmCtrl.injectAltToggle();
        }

        if (hfmCtrl.isPendingEnable()) {
          const toggleBtn = document.getElementById('_hfmToggle');
          if (toggleBtn) {
            await hfmCtrl.enableAltViewWithPreview(toggleBtn);
          }
        }

        syncPreviewModelColorOverride();
        syncPreviewAppearanceOverride();

        themeManager.addListener((theme, activeTheme, highContrast) => {
          const pm = getPreviewManager();
          if (pm) {
            pm.updateTheme(activeTheme, highContrast);

            const modelColorPicker =
              document.getElementById('modelColorPicker');
            const hasSavedColor = localStorage.getItem(STORAGE_KEY_MODEL_COLOR);
            if (modelColorPicker && !hasSavedColor) {
              const themeKey = highContrast ? `${activeTheme}-hc` : activeTheme;
              const PREVIEW_COLORS = {
                light: 0x2196f3,
                dark: 0x4d9fff,
                'light-hc': 0x0052cc,
                'dark-hc': 0x66b3ff,
              };
              const colorHex = PREVIEW_COLORS[themeKey] || PREVIEW_COLORS.light;
              modelColorPicker.value =
                '#' + colorHex.toString(16).padStart(6, '0');
            }
          }

          getOverlayGridCtrl().syncGridColorPicker();

          const root = document.documentElement;
          if (root.getAttribute('data-ui-variant') === 'mono') {
            getHfmCtrl().refreshVariantAssets();
          }
        });
      }

      let autoPreviewController = getAutoPreviewController();
      if (!autoPreviewController) {
        await initAutoPreviewController(true);
        autoPreviewController = getAutoPreviewController();
      }
      if (autoPreviewController) {
        autoPreviewController.setColorParamNames(colorParamNames);
        autoPreviewController.setParamTypes(paramTypes);
        autoPreviewController.setSchema(extracted || null);
      }

      updateColorLegend(colorParamNames);

      if (autoPreviewController) {
        autoPreviewController.setScadContent(fileContent);
        autoPreviewController.setProjectFiles(projectFiles, mainFilePath);
        const libsForRender = getEnabledLibrariesForRender();
        autoPreviewController.setEnabledLibraries(libsForRender);
        updatePreviewStateUI(PREVIEW_STATE.IDLE);
      }

      getCompanionFilesCtrl().updateProjectFilesUI();

      if (projectFiles) {
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
        for (const [path, imgContent] of projectFiles) {
          const ext = path.split('.').pop()?.toLowerCase();
          if (
            imageExts.includes(ext) &&
            typeof imgContent === 'string' &&
            imgContent.startsWith('data:')
          ) {
            const name = path.includes('/') ? path.split('/').pop() : path;
            SharedImageStore.addImageFromDataUrl(name, imgContent).catch(() => {
              console.warn(`[App] Failed to restore image: ${path}`);
            });
          }
        }
      }

      if (autoPreviewController) {
        if (getAutoPreviewEnabled()) {
          autoPreviewController
            .forcePreview(stateManager.getState().parameters)
            .then((initiated) => {
              if (initiated) {
                console.log('[Init] Initial preview render started');
              } else {
                console.warn('[Init] Initial preview render was skipped');
              }
            })
            .catch((error) => {
              console.error('[Init] Initial preview render failed:', error);
              updatePreviewStateUI(PREVIEW_STATE.ERROR, {
                error: error.message,
              });
              updateStatus(`Initial preview failed: ${error.message}`);
            });
        }
      }

      if (source === 'user') {
        try {
          const state = stateManager.getState();
          await getSavedProjectsUI().showSaveProjectPrompt(state);
        } catch (error) {
          console.error('[Saved Projects] Error showing save prompt:', error);
        }
      }
    } catch (error) {
      console.error('Failed to extract parameters:', error);
      updateStatus('Error: Failed to extract parameters');
      showErrorModal({
        title: 'Parameter Extraction Failed',
        message: 'Could not read parameters from the uploaded file.',
        suggestion:
          'Check that the file is a valid OpenSCAD (.scad) file with properly formatted parameters.',
        technical: error.message,
      });
    }
  }

  // ------------------------------------------------------------------
  // Example loader
  // ------------------------------------------------------------------

  async function loadExampleByKey(
    exampleKey,
    { closeFeaturesGuideModal = false } = {}
  ) {
    const example = EXAMPLE_DEFINITIONS[exampleKey];
    if (!example) {
      console.error('Unknown example type:', exampleKey);
      return;
    }

    try {
      closeTutorial();
    } catch {
      // tutorial module may not be initialized
    }

    const state = stateManager.getState();
    if (state.uploadedFile) {
      if (!confirm('Load example? This will replace the current file.')) {
        return;
      }
    }

    try {
      updateStatus('Loading example...');
      const response = await fetch(example.path);
      if (!response.ok) throw new Error('Failed to fetch example');

      if (closeFeaturesGuideModal) {
        const featuresGuideModal =
          document.getElementById('featuresGuideModal');
        if (featuresGuideModal) {
          closeModal(featuresGuideModal);
        }
      }

      if (example.path.toLowerCase().endsWith('.zip')) {
        const blob = await response.blob();
        const zipFile = new File([blob], example.name, {
          type: 'application/zip',
        });
        handleFile(zipFile, null, null, null, 'example');
        return;
      }

      const exampleContent = await response.text();
      console.log('Example loaded:', example.name, exampleContent.length, 'bytes');

      let exProjectFiles = null;
      let exMainFilePath = null;

      if (example.additionalFiles && example.additionalFiles.length > 0) {
        console.log(
          `[Example] Multi-file package: ${example.additionalFiles.length} additional file(s)`
        );

        exProjectFiles = new Map();

        const mainFileName = example.path.split('/').pop();
        exMainFilePath = mainFileName;
        exProjectFiles.set(mainFileName, exampleContent);

        const additionalPromises = example.additionalFiles.map(
          async (filePath) => {
            try {
              const fileResponse = await fetch(filePath);
              if (!fileResponse.ok) {
                console.warn(
                  `[Example] Failed to load additional file: ${filePath}`
                );
                return null;
              }
              const addFileContent = await fileResponse.text();
              const addFileName = filePath.split('/').pop();
              return { fileName: addFileName, content: addFileContent };
            } catch (fetchError) {
              console.warn(
                `[Example] Error loading additional file ${filePath}:`,
                fetchError
              );
              return null;
            }
          }
        );

        const additionalResults = await Promise.all(additionalPromises);
        for (const result of additionalResults) {
          if (result) {
            exProjectFiles.set(result.fileName, result.content);
            console.log(`[Example] Loaded additional file: ${result.fileName}`);
          }
        }

        console.log(`[Example] Total files in package: ${exProjectFiles.size}`);
      }

      handleFile(
        { name: example.name },
        exampleContent,
        exProjectFiles,
        exMainFilePath,
        'example'
      );
    } catch (error) {
      console.error('Failed to load example:', error);
      updateStatus('Error loading example');
      showErrorModal({
        title: 'Example Load Failed',
        message: 'The example file could not be loaded.',
        suggestion:
          'Check your internet connection and try again. The file may not be available.',
        technical: error.message,
      });
    }
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  return {
    handleFile,
    handleFolderImport,
    loadExampleByKey,
    /** @internal Exposed for folder picker wiring in main.js */
    collectFilesFromDir: _collectFilesFromDir,
  };
}
