/**
 * Companion Files Controller
 * Manages companion file detection, rendering, editing, and persistence
 * for multi-file OpenSCAD projects. Extracted from main.js for maintainability.
 * @license GPL-3.0-or-later
 */

import { stateManager } from './state.js';
import { announceImmediate } from './announcer.js';
import { escapeHtml } from './html-utils.js';
import { formatFileSize } from './download.js';
import { openModal, closeModal } from './modal-manager.js';
import {
  buildNestedTree,
  getNodeAtPath,
  countFilesRecursive,
  resolveProjectFile,
} from './zip-handler.js';
import { updateProject } from './saved-projects-manager.js';
import { LIBRARY_DEFINITIONS } from './library-manager.js';
import { getAppPrefKey } from './storage-keys.js';
import * as SharedImageStore from './shared-image-store.js';

/**
 * Detect include/use statements in SCAD content.
 * @param {string} scadContent - OpenSCAD source code
 * @returns {Object} Detection result with includes, uses, and combined files
 */
export function detectIncludeUse(scadContent) {
  const includePattern = /^\s*include\s*<([^>]+)>/gm;
  const usePattern = /^\s*use\s*<([^>]+)>/gm;

  const includes = [];
  const uses = [];

  let match;
  while ((match = includePattern.exec(scadContent)) !== null) {
    includes.push(match[1]);
  }

  while ((match = usePattern.exec(scadContent)) !== null) {
    uses.push(match[1]);
  }

  return {
    hasIncludes: includes.length > 0,
    hasUse: uses.length > 0,
    includes,
    uses,
    files: [...includes, ...uses],
  };
}

/**
 * Detect required companion files from SCAD content.
 * Scans for include/use statements, import() calls, and file variable patterns.
 * @param {string} scadContent - OpenSCAD source code
 * @returns {Object} Detection result with all referenced files
 */
export function detectRequiredCompanionFiles(scadContent) {
  const files = new Set();

  const includePattern = /^\s*include\s*<([^>]+)>/gm;
  const usePattern = /^\s*use\s*<([^>]+)>/gm;
  const importPattern = /import\s*\(\s*(?:file\s*=\s*)?["']([^"']+)["']/gi;
  const fileVarPatterns = [
    /(\w*_?file\w*)\s*=\s*["']([^"']+\.\w+)["']/gi,
    /(\w*_?filename\w*)\s*=\s*["']([^"']+\.\w+)["']/gi,
    /(\w*_?path\w*)\s*=\s*["']([^"']+\.\w+)["']/gi,
  ];
  const surfacePattern = /surface\s*\(\s*(?:file\s*=\s*)?["']([^"']+)["']/gi;

  let match;

  while ((match = includePattern.exec(scadContent)) !== null) {
    files.add({ path: match[1], type: 'include', required: true });
  }

  while ((match = usePattern.exec(scadContent)) !== null) {
    files.add({ path: match[1], type: 'use', required: true });
  }

  while ((match = importPattern.exec(scadContent)) !== null) {
    files.add({ path: match[1], type: 'import', required: true });
  }

  while ((match = surfacePattern.exec(scadContent)) !== null) {
    files.add({ path: match[1], type: 'surface', required: true });
  }

  for (const pattern of fileVarPatterns) {
    while ((match = pattern.exec(scadContent)) !== null) {
      const varName = match[1];
      const fileName = match[2];
      if (!fileName.includes('.') || fileName.startsWith('http')) continue;
      files.add({
        path: fileName,
        type: 'variable',
        variableName: varName,
        required: false,
      });
    }
  }

  const uniqueFiles = [];
  const seenPaths = new Set();
  for (const file of files) {
    if (!seenPaths.has(file.path)) {
      seenPaths.add(file.path);
      uniqueFiles.push(file);
    }
  }

  return {
    files: uniqueFiles,
    requiredCount: uniqueFiles.filter((f) => f.required).length,
    optionalCount: uniqueFiles.filter((f) => !f.required).length,
  };
}

/**
 * Get icon for file type.
 * @param {string} ext - File extension
 * @returns {string} Icon emoji
 */
function getFileIcon(ext) {
  const icons = {
    scad: '\u{1F4D0}',
    txt: '\u{1F4DD}',
    csv: '\u{1F4CA}',
    json: '\u{1F4CB}',
    svg: '\u{1F3A8}',
    stl: '\u{1F9CA}',
    png: '\u{1F5BC}\uFE0F',
    jpg: '\u{1F5BC}\uFE0F',
    jpeg: '\u{1F5BC}\uFE0F',
  };
  return icons[ext] || '\u{1F4CE}';
}

/**
 * Initialize the companion files controller.
 * @param {Object} deps
 * @param {Function} deps.getPreviewManager - Returns current PreviewManager instance (may be null)
 * @param {Function} deps.getAutoPreviewController - Returns current AutoPreviewController (may be null)
 * @param {Object} deps.overlayGridCtrl - Overlay/grid controller instance
 * @param {Function} deps.updateStatus - Status message callback (message, type)
 * @param {Function} deps.getCurrentSavedProjectId - Returns current saved project ID (may be null)
 * @param {Function} deps.setCanonicalProjectFiles - Updates the canonical project files snapshot
 * @returns {Object} Controller API
 */
export function initCompanionFilesController({
  getPreviewManager,
  getAutoPreviewController,
  overlayGridCtrl,
  updateStatus,
  getCurrentSavedProjectId,
  setCanonicalProjectFiles,
}) {
  let companionCurrentPath = [];

  // ---- DOM element queries ----
  const overlaySourceSelect = document.getElementById('overlaySourceSelect');
  const overlayToggle = document.getElementById('overlayToggle');

  /**
   * Auto-save companion files to the current saved project (if tracked).
   */
  async function autoSaveCompanionFiles() {
    const currentSavedProjectId = getCurrentSavedProjectId();
    if (!currentSavedProjectId) return;
    const state = stateManager.getState();
    const { projectFiles, mainFilePath, uploadedFile } = state;
    if (!uploadedFile || !projectFiles) return;

    try {
      const projectFilesObj = Object.fromEntries(projectFiles);
      const kind = projectFiles.size > 1 ? 'zip' : 'scad';
      await updateProject({
        id: currentSavedProjectId,
        projectFiles: projectFilesObj,
        mainFilePath: mainFilePath || uploadedFile.name,
        kind,
      });
      updateStatus('Project updated', 'success');
      console.log(
        '[CompanionFiles] Auto-saved companion files to project:',
        currentSavedProjectId
      );
    } catch (error) {
      console.error('[CompanionFiles] Auto-save failed:', error);
    }
  }

  /**
   * Update the companion files Save/Update button text and visibility.
   */
  function updateCompanionSaveButton() {
    const saveBtn = document.getElementById('companionSaveBtn');
    if (!saveBtn) return;
    const state = stateManager.getState();
    if (!state.uploadedFile) {
      saveBtn.classList.add('hidden');
      return;
    }
    saveBtn.classList.remove('hidden');
    const currentSavedProjectId = getCurrentSavedProjectId();
    if (currentSavedProjectId) {
      saveBtn.textContent = 'Update Saved Project';
      saveBtn.setAttribute(
        'aria-label',
        'Update companion files in the saved project'
      );
    } else {
      saveBtn.textContent = 'Save as Project';
      saveBtn.setAttribute(
        'aria-label',
        'Save this file and companion files as a project'
      );
    }
  }

  /**
   * Handle project file action (edit/remove).
   * @param {Event} event - Click event
   */
  function handleProjectFileAction(event) {
    const btn = event.currentTarget;
    const action = btn.dataset.action;
    const path = btn.dataset.path;

    if (action === 'edit') {
      editProjectFile(path);
    } else if (action === 'remove') {
      removeProjectFile(path);
    }
  }

  /**
   * Render the project files list in the UI.
   * @param {Map<string, string>} projectFiles - Map of file paths to content
   * @param {string} mainFilePath - Path to the main .scad file
   * @param {Object} requiredFiles - Detection result from detectRequiredCompanionFiles
   */
  function renderProjectFilesList(
    projectFiles,
    mainFilePath,
    requiredFiles = null
  ) {
    const container = document.getElementById('projectFilesList');
    const breadcrumbHost = document.getElementById('projectFilesBreadcrumbs');
    const badge = document.getElementById('projectFilesBadge');
    const controls = document.getElementById('projectFilesControls');
    const warning = document.getElementById('projectFilesWarning');
    const warningText = document.getElementById('projectFilesWarningText');

    if (!container || !controls) return;

    const emptyState = document.getElementById('companionEmptyState');
    const helpText = document.getElementById('projectFilesHelp');
    const saveBtn = document.getElementById('companionSaveBtn');

    const state = stateManager.getState();
    if (!state.uploadedFile) {
      controls.classList.add('hidden');
      return;
    }
    controls.classList.remove('hidden');

    // Once per render, before the count decides anything: this used to sit
    // inside the no-companions branch only, so Save as Project stayed hidden
    // in exactly the case it exists for — a multi-file project not yet saved.
    if (saveBtn) {
      updateCompanionSaveButton();
    }

    const companionFiles = projectFiles
      ? new Map(
          Array.from(projectFiles.entries()).filter(
            ([path]) => path !== mainFilePath
          )
        )
      : new Map();
    const companionCount = companionFiles.size;

    if (emptyState) {
      emptyState.style.display = companionCount === 0 ? '' : 'none';
    }
    if (helpText) {
      helpText.style.display = companionCount > 0 ? '' : 'none';
    }

    if (companionCount === 0) {
      if (badge) badge.textContent = '0';
      container.innerHTML = '';
      if (breadcrumbHost) breadcrumbHost.innerHTML = '';
      if (warning && warningText) {
        const missingFiles = [];
        if (requiredFiles && requiredFiles.files) {
          for (const reqFile of requiredFiles.files) {
            if (
              reqFile.required &&
              (!projectFiles || !projectFiles.has(reqFile.path))
            ) {
              missingFiles.push(reqFile.path);
            }
          }
        }
        if (missingFiles.length > 0) {
          warning.classList.remove('hidden');
          warningText.textContent = `Missing files: ${missingFiles.join(', ')}`;
        } else {
          warning.classList.add('hidden');
        }
      }
      return;
    }

    controls.classList.remove('hidden');

    if (badge) {
      badge.textContent = projectFiles.size;
    }

    const missingFiles = [];
    if (requiredFiles && requiredFiles.files) {
      for (const reqFile of requiredFiles.files) {
        if (reqFile.required && !projectFiles.has(reqFile.path)) {
          missingFiles.push(reqFile.path);
        }
      }
    }

    if (warning && warningText) {
      if (missingFiles.length > 0) {
        warning.classList.remove('hidden');
        warningText.textContent = `Missing files: ${missingFiles.join(', ')}`;
      } else {
        warning.classList.add('hidden');
      }
    }

    const tree = buildNestedTree(projectFiles);

    if (getNodeAtPath(tree, companionCurrentPath) === null) {
      companionCurrentPath = [];
    }

    const currentNode = getNodeAtPath(tree, companionCurrentPath) || tree;

    const crumbItems = companionCurrentPath.map((segment, idx) => {
      const targetDepth = idx;
      return `<li class="file-nav-breadcrumb-item">
        <button class="file-nav-breadcrumb-btn" data-depth="${targetDepth + 1}" aria-label="Navigate to ${escapeHtml(segment)}">${escapeHtml(segment)}</button>
      </li>`;
    });

    const breadcrumbHtml =
      companionCurrentPath.length > 0
        ? `<nav class="file-nav-breadcrumbs" aria-label="Folder navigation">
            <ol class="file-nav-breadcrumb-list">
              <li class="file-nav-breadcrumb-item">
                <button class="file-nav-breadcrumb-btn file-nav-breadcrumb-home" data-depth="0" aria-label="Navigate to root">\u{1F3E0}</button>
              </li>
              ${crumbItems.join('')}
            </ol>
          </nav>`
        : '';

    const sortedFolders = [...currentNode.folders.entries()].sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    // A folder row is a real <button> inside a listitem wrapper. It cannot be
    // both the list's item and its own control: axe refuses role="button" as a
    // child of role="list" (D-38), and a native button also carries Enter,
    // Space and focusability without a tabindex/keydown pair of its own.
    const folderItems = sortedFolders.map(([folderName, childNode]) => {
      const count = countFilesRecursive(childNode);
      return `
        <div class="project-file-listitem" role="listitem">
          <button type="button" class="project-file-item file-nav-folder-row"
               data-folder-enter="${escapeHtml(folderName)}"
               aria-label="Open folder ${escapeHtml(folderName)}, ${count} file${count !== 1 ? 's' : ''}">
            <span class="project-file-icon" aria-hidden="true">\u{1F4C2}</span>
            <span class="project-file-name">${escapeHtml(folderName)}</span>
            <span class="project-file-size file-nav-folder-count">${count} file${count !== 1 ? 's' : ''}</span>
            <span class="file-nav-folder-chevron" aria-hidden="true">\u203A</span>
          </button>
        </div>`;
    });

    const sortedFiles = [...currentNode.files].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const fileItems = sortedFiles.map(({ path, name }) => {
      const isMain = path === mainFilePath;
      const content = projectFiles.get(path);
      const size =
        typeof content === 'string'
          ? formatFileSize(new Blob([content]).size)
          : '\u2014';
      const ext = name.split('.').pop().toLowerCase();
      const isEditable = ['txt', 'csv', 'json', 'scad'].includes(ext);
      const icon = getFileIcon(ext);

      const mainBadge = isMain
        ? '<span class="project-file-badge">main</span>'
        : '';
      const editBtn =
        isEditable && !isMain
          ? `<button class="project-file-btn" data-action="edit" data-path="${escapeHtml(path)}" aria-label="Edit ${escapeHtml(name)}">\u270F\uFE0F</button>`
          : '';
      const removeBtn = !isMain
        ? `<button class="project-file-btn btn-danger" data-action="remove" data-path="${escapeHtml(path)}" aria-label="Remove ${escapeHtml(name)}">\u2715</button>`
        : '';

      const itemClass = isMain
        ? 'project-file-item main-file'
        : 'project-file-item';

      // tabindex="-1" so a navigation can hand focus to the row itself. It
      // stays out of the Tab order; only the buttons inside it are reachable
      // by Tab, exactly as before.
      return `
        <div class="${itemClass}" role="listitem" tabindex="-1">
          <span class="project-file-icon" aria-hidden="true">${icon}</span>
          <span class="project-file-name" title="${escapeHtml(path)}">${escapeHtml(name)}</span>
          ${mainBadge}
          <span class="project-file-size">${size}</span>
          <div class="project-file-actions">
            ${editBtn}
            ${removeBtn}
          </div>
        </div>`;
    });

    // The list owns listitems and nothing else. The breadcrumb bar is a <nav>
    // and lives in its own host above the list (D-38); it also stops scrolling
    // away with the rows now that it is outside the scroll box.
    if (breadcrumbHost) breadcrumbHost.innerHTML = breadcrumbHtml;
    container.innerHTML = folderItems.join('') + fileItems.join('');

    const breadcrumbScope = breadcrumbHost || container;

    /**
     * Put focus somewhere sensible after the tree redraws for a navigation the
     * user asked for (D-54).
     *
     * The list is rebuilt with innerHTML, so the row they just pressed is
     * detached by the time this runs and focus has already fallen to <body> —
     * UF-23's mechanism on the navigation path. Only the three navigation
     * handlers call this; a background re-render must never move focus.
     *
     * @param {string|null} folderLeft - Folder the user stepped OUT of, whose
     *   row is now on screen again. Null when stepping in.
     */
    function focusAfterTreeNavigation(folderLeft = null) {
      // Match on dataset rather than a selector, so a folder name containing
      // quotes cannot break the lookup (the UF-23 rule).
      const rows = [...container.querySelectorAll('.project-file-item')];
      const target = folderLeft
        ? rows.find((row) => row.dataset.folderEnter === folderLeft) || rows[0]
        : rows[0];
      const fallback =
        breadcrumbScope.querySelector('.file-nav-breadcrumb-home') ||
        document.querySelector('#projectFilesControls .project-files-summary');
      (target || fallback)?.focus();
    }

    // Breadcrumb navigation
    breadcrumbScope
      .querySelectorAll('.file-nav-breadcrumb-btn')
      .forEach((btn) => {
        const depth = parseInt(btn.dataset.depth, 10);
        const activate = () => {
          // The segment being dropped is the folder the user is stepping out
          // of, and its row is on screen again once the redraw lands.
          const folderLeft = companionCurrentPath[depth] || null;
          companionCurrentPath = companionCurrentPath.slice(0, depth);
          renderProjectFilesList(projectFiles, mainFilePath, requiredFiles);
          focusAfterTreeNavigation(folderLeft);
        };
        btn.addEventListener('click', activate);
        btn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activate();
          }
        });
      });

    // Folder row navigation
    container.querySelectorAll('[data-folder-enter]').forEach((row) => {
      const folderName = row.dataset.folderEnter;
      const enter = () => {
        companionCurrentPath = [...companionCurrentPath, folderName];
        renderProjectFilesList(projectFiles, mainFilePath, requiredFiles);
        focusAfterTreeNavigation();
      };
      row.addEventListener('click', enter);
      // Enter and Space are the button's own now. Escape still has to be
      // bound: it is this tree's way back up one level.
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && companionCurrentPath.length > 0) {
          e.preventDefault();
          const folderLeft =
            companionCurrentPath[companionCurrentPath.length - 1];
          companionCurrentPath = companionCurrentPath.slice(0, -1);
          renderProjectFilesList(projectFiles, mainFilePath, requiredFiles);
          focusAfterTreeNavigation(folderLeft);
        }
      });
    });

    // File action buttons
    container.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', handleProjectFileAction);
    });

    overlayGridCtrl.updateOverlaySourceDropdown();
    autoSelectOverlaySource(requiredFiles);
  }

  /**
   * Sync overlay visibility with the include_screenshot SCAD parameter.
   * @param {Object} parameters - Current parameter values
   */
  function syncOverlayWithScreenshotParam(parameters) {
    const previewManager = getPreviewManager();
    if (!overlayToggle || !previewManager || !parameters) return;

    const includeFlag = parameters.include_screenshot;
    if (includeFlag === undefined) return;

    const shouldShow =
      includeFlag === 'yes' || includeFlag === true || includeFlag === 'true';
    const state = stateManager.getState();
    const projectFiles = state.projectFiles;

    if (shouldShow) {
      // COMPATIBILITY FALLBACK — Phase 8 removal candidate:
      // 'default.svg' when screenshot_file param exists but is empty/unset.
      const screenshotFile = parameters.screenshot_file || 'default.svg';
      const resolved = resolveProjectFile(projectFiles, screenshotFile);
      if (resolved) {
        if (overlaySourceSelect) overlaySourceSelect.value = resolved.key;
        overlayGridCtrl
          .loadOverlayFromProjectFile(resolved.key)
          .then(() => {
            overlayGridCtrl.autoApplyScreenDimensionsFromParams(parameters);
            overlayToggle.checked = true;
            previewManager.setOverlayEnabled(true);
            overlayGridCtrl.updateOverlayUIFromConfig();
            overlayGridCtrl.updateOverlayStatus?.();
          })
          .catch((err) => {
            console.warn(
              '[App] Overlay enable via include_screenshot failed:',
              err
            );
          });
      } else {
        console.warn(
          `[App] syncOverlayWithScreenshotParam: "${screenshotFile}" not found ` +
            'or ambiguous in projectFiles — overlay not displayed.'
        );
      }
    } else {
      overlayToggle.checked = false;
      previewManager.setOverlayEnabled(false);
      overlayGridCtrl.updateOverlayStatus?.();
    }
  }

  /**
   * Auto-select overlay source based on screenshot_file variable detection.
   * @param {Object} requiredFiles - Detection result from detectRequiredCompanionFiles
   */
  function autoSelectOverlaySource(requiredFiles) {
    const previewManager = getPreviewManager();
    if (!overlaySourceSelect || !previewManager) return;

    const state = stateManager.getState();
    const projectFiles = state.projectFiles;
    if (!projectFiles || projectFiles.size === 0) return;

    const currentSource = overlaySourceSelect.value;
    if (currentSource && projectFiles.has(currentSource)) return;

    const savedSource = localStorage.getItem(getAppPrefKey('overlay-source'));
    if (savedSource && projectFiles.has(savedSource)) {
      overlaySourceSelect.value = savedSource;
      return;
    }

    let screenshotFile = null;
    if (requiredFiles && requiredFiles.files) {
      const OVERLAY_EXTS = ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
      const overlayVars = requiredFiles.files.filter(
        (f) =>
          f.type === 'variable' &&
          OVERLAY_EXTS.some((ext) => f.path.toLowerCase().endsWith(ext))
      );
      if (overlayVars.length > 0) {
        const preferred =
          overlayVars.find((v) => v.variableName === 'screenshot_file') ||
          overlayVars[0];
        const resolved = resolveProjectFile(projectFiles, preferred.path);
        if (resolved) screenshotFile = resolved.key;
      }
    }

    // COMPATIBILITY FALLBACK — Phase 8 removal candidate.
    if (!screenshotFile) {
      const resolved = resolveProjectFile(projectFiles, 'default.svg');
      if (resolved) screenshotFile = resolved.key;
    }

    if (screenshotFile) {
      overlaySourceSelect.value = screenshotFile;
      console.log(`[App] Auto-selected overlay source: ${screenshotFile}`);
      overlayGridCtrl
        .loadOverlayFromProjectFile(screenshotFile)
        .then(() => {
          const currentParams = stateManager.getState().parameters;
          overlayGridCtrl.autoApplyScreenDimensionsFromParams(currentParams);
          if (overlayToggle && !overlayToggle.checked) {
            overlayToggle.checked = true;
            previewManager?.setOverlayEnabled(true);
            overlayGridCtrl.updateOverlayUIFromConfig();
            overlayGridCtrl.updateOverlayStatus?.();
            console.log(
              '[App] Overlay auto-enabled for screenshot companion file'
            );
          }
        })
        .catch((err) => {
          console.warn('[App] Auto-enable overlay failed:', err);
        });
    }
  }

  /**
   * Add companion file to project.
   * @param {File} file - File to add
   */
  async function handleAddCompanionFile(file) {
    const state = stateManager.getState();
    let { projectFiles, mainFilePath, uploadedFile } = state;

    if (!uploadedFile) {
      updateStatus('No project loaded', 'error');
      return;
    }

    try {
      // AF-4: a file lands where you are STANDING in the tree, not always at
      // the root. companionCurrentPath is the folder the tree is showing.
      const targetPath = [...companionCurrentPath, file.name].join('/');
      const fileName = targetPath;
      const ext = file.name.split('.').pop()?.toLowerCase();
      const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);

      let content;
      if (isImage) {
        content = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Failed to read image file'));
          reader.readAsDataURL(file);
        });
      } else {
        content = await file.text();
      }

      if (!projectFiles) {
        projectFiles = new Map();
        const mainPath = mainFilePath || uploadedFile.name;
        projectFiles.set(mainPath, uploadedFile.content);
        mainFilePath = mainPath;
      }

      if (projectFiles.has(fileName)) {
        const overwrite = confirm(
          `File "${fileName}" already exists. Overwrite?`
        );
        if (!overwrite) return;
      }

      projectFiles.set(fileName, content);

      stateManager.setState({
        projectFiles,
        mainFilePath,
      });
      setCanonicalProjectFiles(projectFiles);

      if (isImage) {
        await SharedImageStore.addImageFromDataUrl(fileName, content);
      }

      const requiredFiles = detectRequiredCompanionFiles(uploadedFile.content);
      renderProjectFilesList(projectFiles, mainFilePath, requiredFiles);

      const autoPreviewController = getAutoPreviewController();
      if (autoPreviewController) {
        autoPreviewController.setProjectFiles(projectFiles, mainFilePath);
        await autoPreviewController.forcePreview(
          stateManager.getState().parameters
        );
      }

      updateStatus(`Added file: ${fileName}`, 'success');
      console.log(`[ProjectFiles] Added companion file: ${fileName}`);

      await autoSaveCompanionFiles();

      const currentParams = stateManager.getState().parameters;
      const includeFlag = currentParams?.include_screenshot;
      if (
        (includeFlag === 'yes' ||
          includeFlag === true ||
          includeFlag === 'true') &&
        overlayToggle &&
        !overlayToggle.checked
      ) {
        syncOverlayWithScreenshotParam(currentParams);
      }
    } catch (error) {
      console.error('[ProjectFiles] Error adding file:', error);
      updateStatus(`Failed to add file: ${error.message}`, 'error');
    }
  }

  /**
   * Remove a companion file from the project.
   * @param {string} path - Path to the file to remove
   */
  async function removeProjectFile(path) {
    const state = stateManager.getState();
    const { projectFiles, mainFilePath, uploadedFile } = state;

    if (!projectFiles || !projectFiles.has(path)) {
      updateStatus('File not found', 'error');
      return;
    }

    if (path === mainFilePath) {
      updateStatus('Cannot remove the main file', 'error');
      return;
    }

    const confirmed = confirm(`Remove "${path}" from the project?`);
    if (!confirmed) return;

    projectFiles.delete(path);

    stateManager.setState({ projectFiles });
    setCanonicalProjectFiles(projectFiles);

    const requiredFiles = uploadedFile
      ? detectRequiredCompanionFiles(uploadedFile.content)
      : null;
    renderProjectFilesList(projectFiles, mainFilePath, requiredFiles);

    const autoPreviewController = getAutoPreviewController();
    if (autoPreviewController) {
      autoPreviewController.setProjectFiles(projectFiles, mainFilePath);
      await autoPreviewController.forcePreview(
        stateManager.getState().parameters
      );
    }

    updateStatus(`Removed file: ${path}`, 'success');
    console.log(`[ProjectFiles] Removed file: ${path}`);

    await autoSaveCompanionFiles();
  }

  /**
   * Open the text file editor modal for a companion file.
   * @param {string} path - Path to the file to edit
   */
  function editProjectFile(path) {
    const state = stateManager.getState();
    const { projectFiles } = state;

    if (!projectFiles || !projectFiles.has(path)) {
      updateStatus('File not found', 'error');
      return;
    }

    const content = projectFiles.get(path);

    const modal = document.getElementById('textFileEditorModal');
    const fileNameEl = document.getElementById('textFileEditorFileName');
    const textarea = document.getElementById('textFileEditorContent');

    if (!modal || !textarea) {
      console.error('[ProjectFiles] Text editor modal not found');
      return;
    }

    if (fileNameEl) fileNameEl.textContent = path;
    textarea.value = content;
    textarea.dataset.editingPath = path;

    openModal(modal, {
      focusTarget: textarea,
    });
  }

  /**
   * Put focus back on the row of the file that was just saved.
   *
   * closeModal cannot do this on its own: saving rebuilds the whole list with
   * innerHTML, so the button it captured as the opening trigger is detached by
   * the time it tries to restore, and focus() on a detached node is a no-op
   * that leaves focus on <body>. Re-find the equivalent button instead. Match
   * on dataset rather than a selector so paths containing quotes cannot break
   * the lookup.
   *
   * @param {string} path - Path of the file that was saved
   */
  function restoreFocusToFileRow(path) {
    const container = document.getElementById('projectFilesList');
    const editButtons = container
      ? [...container.querySelectorAll('button[data-action="edit"]')]
      : [];
    const target =
      editButtons.find((btn) => btn.dataset.path === path) ||
      document.querySelector('#projectFilesControls .project-files-summary');
    if (target) target.focus();
  }

  /**
   * Apply text file editor changes and trigger preview.
   */
  async function applyTextFileEditorChanges() {
    const textarea = document.getElementById('textFileEditorContent');
    const modal = document.getElementById('textFileEditorModal');

    if (!textarea || !modal) return;

    const path = textarea.dataset.editingPath;
    const newContent = textarea.value;

    const state = stateManager.getState();
    const { projectFiles, mainFilePath } = state;

    if (!projectFiles || !path) {
      closeModal(modal);
      return;
    }

    projectFiles.set(path, newContent);

    stateManager.setState({ projectFiles });
    setCanonicalProjectFiles(projectFiles);

    const requiredFiles = state.uploadedFile
      ? detectRequiredCompanionFiles(state.uploadedFile.content)
      : null;
    renderProjectFilesList(projectFiles, mainFilePath, requiredFiles);

    closeModal(modal);
    restoreFocusToFileRow(path);
    // Immediate, not debounced: the preview this is about to await announces
    // "Rendering preview..." within the debounce window and swallows it
    // otherwise. Measured swallowed before this was changed.
    announceImmediate(`Saved ${path}`);

    const autoPreviewController = getAutoPreviewController();
    if (autoPreviewController) {
      autoPreviewController.setProjectFiles(projectFiles, mainFilePath);
      await autoPreviewController.forcePreview(
        stateManager.getState().parameters
      );
    }

    // announce:false because the save was already spoken above, the moment it
    // happened, rather than after the render this awaited. updateStatus speaks
    // by default, and pairing the two says the same event twice.
    updateStatus(`Updated file: ${path}`, 'success', { announce: false });
    console.log(`[ProjectFiles] Updated file: ${path}`);

    await autoSaveCompanionFiles();
  }

  /**
   * Update the project files UI after file load.
   */
  function updateProjectFilesUI() {
    const state = stateManager.getState();
    const { projectFiles, mainFilePath, uploadedFile } = state;

    if (!uploadedFile) {
      const controls = document.getElementById('projectFilesControls');
      if (controls) controls.classList.add('hidden');
      return;
    }

    const requiredFiles = detectRequiredCompanionFiles(uploadedFile.content);
    renderProjectFilesList(projectFiles, mainFilePath, requiredFiles);

    if (
      requiredFiles?.files &&
      typeof window.updateConsoleOutput === 'function'
    ) {
      const knownLibraryIdSet = new Set(
        Object.keys(LIBRARY_DEFINITIONS).map((id) => id.toLowerCase())
      );
      const projectBasenames = projectFiles
        ? new Set(
            Array.from(projectFiles.keys()).map((p) =>
              p.split('/').pop().toLowerCase()
            )
          )
        : new Set();
      const missing = requiredFiles.files.filter((f) => {
        if (!f.required) return false;
        if (typeof f.path !== 'string' || f.path.trim() === '') return false;
        const normalizedPath = f.path.trim().replace(/^\/+/, '');
        const pathParts = normalizedPath.split('/');
        const firstSegment = pathParts[0].toLowerCase();
        const isLibraryReference =
          pathParts.length > 1 && knownLibraryIdSet.has(firstSegment);
        if (isLibraryReference) return false;
        if (!projectFiles) return true;
        if (projectFiles.has(f.path)) return false;
        const baseName = pathParts[pathParts.length - 1].toLowerCase();
        return !projectBasenames.has(baseName);
      });
      if (missing.length > 0) {
        const warnings = missing
          .map((f) => `WARNING: Can't open include file '${f.path}'.`)
          .join('\n');
        window.updateConsoleOutput(warnings);
      }
    }
  }

  return {
    autoSaveCompanionFiles,
    updateCompanionSaveButton,
    renderProjectFilesList,
    syncOverlayWithScreenshotParam,
    autoSelectOverlaySource,
    handleAddCompanionFile,
    removeProjectFile,
    editProjectFile,
    applyTextFileEditorChanges,
    updateProjectFilesUI,
    handleProjectFileAction,
  };
}
