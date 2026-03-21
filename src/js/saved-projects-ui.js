/**
 * Saved Projects UI Controller
 * Manages the saved projects list, folder navigation, project CRUD modals,
 * and file manager for ZIP projects. Extracted from main.js for maintainability.
 * @license GPL-3.0-or-later
 */

import { stateManager } from './state.js';
import { escapeHtml, setupNotesCounter } from './html-utils.js';
import { formatFileSize } from './download.js';
import { openModal, closeModal } from './modal-manager.js';
import {
  buildNestedTree,
  getNodeAtPath,
  countFilesRecursive,
} from './zip-handler.js';
import {
  listSavedProjects,
  saveProject,
  getProject,
  touchProject,
  updateProject,
  deleteProject,
  getFolder,
  listFolders,
  renameFolder,
  deleteFolder,
  getFolderTree,
  getFolderBreadcrumbs,
  moveProject,
  getProjectsInFolder,
} from './saved-projects-manager.js';
import { getUIModeController } from './ui-mode-controller.js';
import { showErrorModal, showErrorToast } from './error-translator.js';

/**
 * Initialize the saved projects UI controller.
 * @param {Object} deps
 * @param {Function} deps.showConfirmDialog - Accessible confirmation dialog
 * @param {Function} deps.showProcessingOverlay - Processing overlay (returns dismiss function)
 * @param {Function} deps.handleFile - File loading pipeline
 * @param {Function} deps.updateStatus - Status bar message callback
 * @param {Function} deps.updateCompanionSaveButton - Companion save button state updater
 * @param {Function} deps.downloadSingleProject - Single project ZIP download
 * @param {Function} deps.setCurrentSavedProjectId - Setter for the shared currentSavedProjectId
 * @returns {Object} Controller API
 */
export function initSavedProjectsUI({
  showConfirmDialog,
  showProcessingOverlay,
  handleFile,
  updateStatus,
  updateCompanionSaveButton,
  downloadSingleProject,
  setCurrentSavedProjectId,
}) {
  let currentFolderId = null;

  /**
   * Format relative time (e.g., "2 days ago")
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @returns {string}
   */
  function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
    if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
    return `${years} year${years !== 1 ? 's' : ''} ago`;
  }

  /**
   * Linkify URLs in text (convert http/https URLs to clickable links)
   * @param {string} text - Plain text with URLs
   * @returns {string} - HTML string with links
   */
  function linkifyText(text) {
    if (!text) return '';

    const escaped = escapeHtml(text);
    const urlPattern = /(https?:\/\/[^\s]+)/g;

    return escaped.replace(urlPattern, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
  }

  /**
   * Render saved projects list on welcome screen (v2 with folder tree)
   */
  async function renderSavedProjectsList() {
    const savedProjectsList = document.getElementById('savedProjectsList');
    const savedProjectsEmpty = document.getElementById('savedProjectsEmpty');
    const folderTree = document.getElementById('folderTree');
    const breadcrumbNav = document.getElementById('folderBreadcrumbs');
    const breadcrumbList = document.getElementById('breadcrumbList');

    if (!savedProjectsList || !savedProjectsEmpty) return;

    // Get folder tree structure
    let folders, rootProjects, allProjects;
    try {
      const treeResult = await getFolderTree();
      folders = treeResult.folders;
      rootProjects = treeResult.rootProjects;
      allProjects = await listSavedProjects();
    } catch (error) {
      console.error('[Saved Projects] Error rendering list:', error);
      return;
    }

    // Determine what to show based on current folder
    let projectsToShow = [];
    let foldersToShow = [];

    if (currentFolderId) {
      // Show contents of current folder
      projectsToShow = allProjects.filter(
        (p) => p.folderId === currentFolderId
      );
      foldersToShow = folders.filter((f) => f.parentId === currentFolderId);

      // Also get nested folders
      const findNestedFolders = (parentId) => {
        const nested = [];
        for (const folder of folders) {
          if (folder.parentId === parentId) {
            nested.push(folder);
          }
        }
        return nested;
      };
      foldersToShow = findNestedFolders(currentFolderId);

      // Update breadcrumbs
      if (breadcrumbNav && breadcrumbList) {
        const breadcrumbs = await getFolderBreadcrumbs(currentFolderId);
        breadcrumbNav.classList.remove('hidden');
        breadcrumbList.innerHTML = `
          <li class="breadcrumb-item">
            <button class="breadcrumb-link" data-folder-id="" aria-label="Go to root">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              Root
            </button>
          </li>
          ${breadcrumbs
            .map(
              (folder, index) => `
            <li class="breadcrumb-item">
              <button class="breadcrumb-link ${index === breadcrumbs.length - 1 ? 'current' : ''}" 
                      data-folder-id="${folder.id}"
                      ${index === breadcrumbs.length - 1 ? 'aria-current="page"' : ''}>
                ${escapeHtml(folder.name)}
              </button>
            </li>
          `
            )
            .join('')}
        `;

        // Wire up breadcrumb navigation
        breadcrumbList.querySelectorAll('.breadcrumb-link').forEach((link) => {
          link.addEventListener('click', () => {
            const folderId = link.dataset.folderId || null;
            navigateToFolder(folderId);
          });
        });
      }
    } else {
      // Show root level
      projectsToShow = rootProjects;
      foldersToShow = folders.filter((f) => !f.parentId);
      if (breadcrumbNav) {
        breadcrumbNav.classList.add('hidden');
      }
    }

    // Check if empty
    if (allProjects.length === 0 && folders.length === 0) {
      savedProjectsList.innerHTML = '';
      if (folderTree) folderTree.innerHTML = '';
      savedProjectsEmpty.classList.remove('hidden');
      return;
    }

    savedProjectsEmpty.classList.add('hidden');

    // Render folder tree (if at root level)
    if (folderTree) {
      if (currentFolderId === null) {
        folderTree.innerHTML = renderFolders(
          foldersToShow,
          folders,
          allProjects
        );
        wireUpFolderEvents(folderTree);
      } else {
        // When inside a folder, show subfolders inline
        folderTree.innerHTML = renderFolders(
          foldersToShow,
          folders,
          allProjects
        );
        wireUpFolderEvents(folderTree);
      }
    }

    // Render project cards
    const cardsHtml = projectsToShow
      .map((project) => renderProjectCard(project))
      .join('');

    savedProjectsList.innerHTML = cardsHtml;
    wireUpProjectCardEvents(savedProjectsList);
  }

  /**
   * Render folders recursively
   */
  function renderFolders(foldersToRender, allFolders, allProjects) {
    return foldersToRender
      .map((folder) => {
        const childCount = allProjects.filter(
          (p) => p.folderId === folder.id
        ).length;
        const childFolders = allFolders.filter((f) => f.parentId === folder.id);
        const totalItems = childCount + childFolders.length;
        const colorDot = folder.color
          ? `<span class="folder-color-dot" style="background: ${folder.color}"></span>`
          : '';

        return `
        <div class="folder-item" data-folder-id="${folder.id}">
          <div class="folder-header" 
               role="treeitem" 
               tabindex="0"
               aria-expanded="false"
               aria-label="${escapeHtml(folder.name)} folder, ${totalItems} items">
            <svg class="folder-expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            ${colorDot}
            <svg class="folder-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="folder-name">${escapeHtml(folder.name)}</span>
            <span class="folder-count">${totalItems}</span>
            <div class="folder-actions">
              <button class="btn btn-sm btn-icon btn-rename-folder" data-folder-id="${folder.id}" aria-label="Rename folder" title="Rename">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="btn btn-sm btn-icon btn-delete-folder" data-folder-id="${folder.id}" aria-label="Delete folder" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="folder-contents" id="folder-contents-${folder.id}">
            <!-- Contents loaded on expand -->
          </div>
        </div>
      `;
      })
      .join('');
  }

  /**
   * Render a single project card
   */
  function renderProjectCard(project) {
    const notesPreview = project.notes
      ? `<div class="saved-project-notes-preview">${linkifyText(project.notes)}</div>`
      : '';

    const savedTime = formatRelativeTime(project.savedAt);
    const loadedTime =
      project.lastLoadedAt !== project.savedAt
        ? formatRelativeTime(project.lastLoadedAt)
        : null;

    const isZip = project.kind === 'zip';
    const iconPath = isZip
      ? '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>'
      : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>';

    return `
      <div class="saved-project-card" role="listitem" data-project-id="${project.id}" draggable="true">
        <div class="saved-project-header">
          <svg class="saved-project-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            ${iconPath}
          </svg>
          <div class="saved-project-info">
            <h4 class="saved-project-name">${escapeHtml(project.name)}</h4>
            <div class="saved-project-meta">
              <span class="saved-project-date">Saved ${savedTime}</span>
              ${loadedTime ? `<span class="saved-project-date">Opened ${loadedTime}</span>` : ''}
            </div>
          </div>
        </div>
        ${notesPreview}
        <div class="saved-project-actions">
            <button class="btn btn-primary btn-load-project" data-project-id="${project.id}">
              Load
            </button>
            ${
              isZip
                ? `<button class="btn btn-secondary btn-manage-files" data-project-id="${project.id}" title="View and manage project files">
              Files
            </button>`
                : ''
            }
            <button class="btn btn-secondary btn-edit-project" data-project-id="${project.id}">
              Edit
            </button>
            <button class="btn btn-secondary btn-download-project" data-project-id="${project.id}" title="Download this project as a ZIP">
              Export
            </button>
            <button class="btn btn-danger btn-delete-project" data-project-id="${project.id}">
              Delete
            </button>
          </div>
        </div>
    `;
  }

  /**
   * Wire up event listeners for folder tree
   */
  function wireUpFolderEvents(container) {
    // Folder expand/collapse
    container.querySelectorAll('.folder-header').forEach((header) => {
      header.addEventListener('click', async (e) => {
        if (e.target.closest('.folder-actions')) return;

        const folderItem = header.closest('.folder-item');
        const folderId = folderItem.dataset.folderId;
        const contents = folderItem.querySelector('.folder-contents');
        const isExpanded = header.getAttribute('aria-expanded') === 'true';

        if (isExpanded) {
          // Collapse
          header.setAttribute('aria-expanded', 'false');
          contents.classList.remove('expanded');
        } else {
          // Expand and load contents
          header.setAttribute('aria-expanded', 'true');
          contents.classList.add('expanded');
          await loadFolderContents(folderId, contents);
        }
      });

      // Double-click to navigate into folder
      header.addEventListener('dblclick', (e) => {
        if (e.target.closest('.folder-actions')) return;
        const folderId = header.closest('.folder-item').dataset.folderId;
        navigateToFolder(folderId);
      });

      // Keyboard navigation
      header.addEventListener('keydown', (e) => {
        const folderId = header.closest('.folder-item').dataset.folderId;
        if (e.key === 'Enter') {
          e.preventDefault();
          navigateToFolder(folderId);
        } else if (e.key === ' ') {
          e.preventDefault();
          header.click(); // Toggle expand
        }
      });
    });

    // Rename folder buttons
    container.querySelectorAll('.btn-rename-folder').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const folderId = btn.dataset.folderId;
        await showRenameFolderDialog(folderId);
      });
    });

    // Delete folder buttons
    container.querySelectorAll('.btn-delete-folder').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const folderId = btn.dataset.folderId;
        await handleDeleteFolder(folderId);
      });
    });
  }

  /**
   * Wire up event listeners for project cards
   */
  function wireUpProjectCardEvents(container) {
    container.querySelectorAll('.btn-load-project').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        loadSavedProject(btn.dataset.projectId);
      });
    });

    container.querySelectorAll('.btn-manage-files').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showProjectFileManager(btn.dataset.projectId);
      });
    });

    container.querySelectorAll('.btn-edit-project').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showEditProjectModal(btn.dataset.projectId);
      });
    });

    container.querySelectorAll('.btn-download-project').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadSingleProject(btn.dataset.projectId);
      });
    });

    container.querySelectorAll('.btn-delete-project').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSavedProject(btn.dataset.projectId);
      });
    });

    // Make cards clickable to load
    container.querySelectorAll('.saved-project-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        loadSavedProject(card.dataset.projectId);
      });

      card.setAttribute('tabindex', '0');
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          loadSavedProject(card.dataset.projectId);
        }
      });

      // Drag and drop support
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.dataset.projectId);
        e.dataTransfer.setData(
          'application/x-project-id',
          card.dataset.projectId
        );
        card.classList.add('dragging');
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });
    });
  }

  /**
   * Load folder contents dynamically
   */
  async function loadFolderContents(folderId, container) {
    const allProjects = await listSavedProjects();
    const allFolders = await listFolders();

    const projectsInFolder = allProjects.filter((p) => p.folderId === folderId);
    const subfoldersInFolder = allFolders.filter(
      (f) => f.parentId === folderId
    );

    let html = '';

    // Render subfolders
    if (subfoldersInFolder.length > 0) {
      html += `<div class="folder-tree">${renderFolders(subfoldersInFolder, allFolders, allProjects)}</div>`;
    }

    // Render projects
    if (projectsInFolder.length > 0) {
      html += `<div class="saved-projects-list">${projectsInFolder.map((p) => renderProjectCard(p)).join('')}</div>`;
    }

    if (!html) {
      html = '<p class="folder-empty">This folder is empty</p>';
    }

    container.innerHTML = html;

    // Wire up events for new content
    const subFolderTree = container.querySelector('.folder-tree');
    if (subFolderTree) {
      wireUpFolderEvents(subFolderTree);
    }

    const projectsList = container.querySelector('.saved-projects-list');
    if (projectsList) {
      wireUpProjectCardEvents(projectsList);
    }

    // Setup folder as drop target
    setupFolderDropTarget(container.closest('.folder-item'));
  }

  /**
   * Navigate to a folder
   */
  async function navigateToFolder(folderId) {
    currentFolderId = folderId;
    await renderSavedProjectsList();
  }

  /**
   * Setup folder as drop target for projects
   */
  function setupFolderDropTarget(folderItem) {
    if (!folderItem) return;

    const header = folderItem.querySelector('.folder-header');
    const folderId = folderItem.dataset.folderId;

    header.addEventListener('dragover', (e) => {
      e.preventDefault();
      folderItem.classList.add('drag-over');
    });

    header.addEventListener('dragleave', () => {
      folderItem.classList.remove('drag-over');
    });

    header.addEventListener('drop', async (e) => {
      e.preventDefault();
      folderItem.classList.remove('drag-over');

      const projectId = e.dataTransfer.getData('application/x-project-id');
      if (projectId) {
        const result = await moveProject(projectId, folderId);
        if (result.success) {
          await renderSavedProjectsList();
          stateManager.announceChange('Project moved to folder');
        } else {
          showErrorToast({ title: 'Move Failed', message: result.error });
        }
      }
    });
  }

  /**
   * Show dialog to rename a folder
   */
  async function showRenameFolderDialog(folderId) {
    const folder = await getFolder(folderId);
    if (!folder) return;

    const newName = prompt('Enter new folder name:', folder.name);
    if (newName && newName.trim() && newName !== folder.name) {
      const result = await renameFolder(folderId, newName.trim());
      if (result.success) {
        await renderSavedProjectsList();
        stateManager.announceChange(`Folder renamed to ${newName.trim()}`);
      } else {
        showErrorToast({ title: 'Rename Failed', message: result.error });
      }
    }
  }

  /**
   * Handle folder deletion
   */
  async function handleDeleteFolder(folderId) {
    const folder = await getFolder(folderId);
    if (!folder) return;

    const projectsInFolder = await getProjectsInFolder(folderId);
    const hasContents = projectsInFolder.length > 0;

    let message = `Delete folder "${folder.name}"?`;
    if (hasContents) {
      message = `Delete folder "${folder.name}"?\n\nThis folder contains ${projectsInFolder.length} project(s). They will be moved to the root level.`;
    }

    if (confirm(message)) {
      const result = await deleteFolder(folderId, false); // Don't delete contents, move to root
      if (result.success) {
        if (currentFolderId === folderId) {
          currentFolderId = null; // Navigate back to root if we deleted current folder
        }
        await renderSavedProjectsList();
        stateManager.announceChange(`Folder "${folder.name}" deleted`);
      } else {
        showErrorToast({ title: 'Delete Failed', message: result.error });
      }
    }
  }

  /**
   * Show Project File Manager modal for ZIP projects
   * @param {string} projectId - The project ID
   */
  async function showProjectFileManager(projectId) {
    const project = await getProject(projectId);
    if (!project) {
      showErrorToast({ title: 'Not Found', message: 'The requested project could not be found.' });
      return;
    }

    if (project.kind !== 'zip' || !project.projectFiles) {
      showErrorToast({ title: 'Not Available', message: 'File management is only available for ZIP projects.' });
      return;
    }

    // currentFiles is a plain object (path → content) kept in sync with DB
    let currentFiles =
      typeof project.projectFiles === 'string'
        ? JSON.parse(project.projectFiles)
        : { ...project.projectFiles };

    // Navigation path local to this modal closure — cleaned up when modal closes
    let fmCurrentPath = [];

    const modal = document.createElement('div');
    modal.className = 'preset-modal file-manager-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'fileManagerTitle');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="preset-modal-content">
        <div class="preset-modal-header">
          <h3 id="fileManagerTitle" class="preset-modal-title">Project Files: ${escapeHtml(project.name)}</h3>
          <button class="preset-modal-close" id="fileManagerXCloseBtn" aria-label="Close file manager">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="preset-modal-body">
          <div class="file-manager-toolbar">
            <button type="button" class="btn btn-sm btn-outline" id="addFileToProjectBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add File
            </button>
            <button type="button" class="btn btn-sm btn-outline" id="addFolderToProjectBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                <line x1="12" y1="11" x2="12" y2="17"></line>
                <line x1="9" y1="14" x2="15" y2="14"></line>
              </svg>
              New Folder
            </button>
            <span class="file-manager-count" id="fmFileCount"></span>
          </div>

          <div id="fmBreadcrumbs"></div>
          <div class="file-manager-tree" id="fmTree"></div>
        </div>

        <div class="preset-modal-footer">
          <button class="btn btn-secondary" id="fileManagerCloseBtn">Close</button>
          <button class="btn btn-primary" id="fileManagerLoadBtn">Load Project</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    openModal(modal);

    const dismissFileManager = () => {
      closeModal(modal);
      document.body.removeChild(modal);
    };

    // ------------------------------------------------------------------ //
    // renderFmView — re-renders breadcrumbs + tree without closing modal  //
    // ------------------------------------------------------------------ //
    function renderFmView() {
      const fileMap = new Map(Object.entries(currentFiles));
      const tree = buildNestedTree(fileMap);

      // Validate path still exists after mutations
      if (getNodeAtPath(tree, fmCurrentPath) === null) {
        fmCurrentPath = [];
      }
      const node = getNodeAtPath(tree, fmCurrentPath) || tree;

      const totalFiles = Object.keys(currentFiles).filter(
        (p) => !p.endsWith('/.folder')
      ).length;
      const countEl = modal.querySelector('#fmFileCount');
      if (countEl)
        countEl.textContent = `${totalFiles} file${totalFiles !== 1 ? 's' : ''}`;

      // --- Breadcrumbs ---
      const breadcrumbsEl = modal.querySelector('#fmBreadcrumbs');
      if (fmCurrentPath.length > 0) {
        const crumbItems = fmCurrentPath.map((seg, idx) => {
          return `<li class="file-nav-breadcrumb-item">
            <button class="file-nav-breadcrumb-btn" data-depth="${idx + 1}" aria-label="Navigate to ${escapeHtml(seg)}">${escapeHtml(seg)}</button>
          </li>`;
        });
        breadcrumbsEl.innerHTML = `
          <nav class="file-nav-breadcrumbs file-nav-breadcrumbs--modal" aria-label="Folder navigation">
            <ol class="file-nav-breadcrumb-list">
              <li class="file-nav-breadcrumb-item">
                <button class="file-nav-breadcrumb-btn file-nav-breadcrumb-home" data-depth="0" aria-label="Navigate to root">\u{1F3E0} Root</button>
              </li>
              ${crumbItems.join('')}
            </ol>
          </nav>`;
        breadcrumbsEl
          .querySelectorAll('.file-nav-breadcrumb-btn')
          .forEach((btn) => {
            btn.addEventListener('click', () => {
              fmCurrentPath = fmCurrentPath.slice(
                0,
                parseInt(btn.dataset.depth, 10)
              );
              renderFmView();
            });
          });
      } else {
        breadcrumbsEl.innerHTML = '';
      }

      // --- Folder rows ---
      const sortedFolders = [...node.folders.entries()].sort((a, b) =>
        a[0].localeCompare(b[0])
      );

      // Build the full path prefix for a folder at current depth
      const makeFolderFullPath = (name) => [...fmCurrentPath, name].join('/');

      const folderRowsHtml = sortedFolders
        .map(([folderName, childNode]) => {
          const count = countFilesRecursive(childNode);
          const fullPath = makeFolderFullPath(folderName);
          return `
          <div class="file-manager-item file-nav-folder-row" role="button" tabindex="0"
               data-folder-enter="${escapeHtml(folderName)}"
               aria-label="Open folder ${escapeHtml(folderName)}, ${count} file${count !== 1 ? 's' : ''}">
            <svg class="file-manager-item-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="file-manager-item-path">${escapeHtml(folderName)}</span>
            <span class="file-manager-item-size file-nav-folder-count">${count} file${count !== 1 ? 's' : ''}</span>
            <div class="file-manager-item-actions">
              <button class="btn btn-sm btn-icon btn-rename-project-folder" data-folder="${escapeHtml(fullPath)}" aria-label="Rename folder ${escapeHtml(folderName)}" title="Rename">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="btn btn-sm btn-icon btn-delete-project-folder" data-folder="${escapeHtml(fullPath)}" aria-label="Delete folder ${escapeHtml(folderName)}" title="Delete folder">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
              <span class="file-nav-folder-chevron" aria-hidden="true">\u203A</span>
            </div>
          </div>`;
        })
        .join('');

      // --- File rows ---
      const sortedFiles = [...node.files].sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      const fileRowsHtml = sortedFiles
        .map((file) => {
          const isMain = file.path === project.mainFilePath;
          const size = new Blob([file.content]).size;
          const iconClass = isMain ? 'main-file' : '';
          return `
          <div class="file-manager-item" data-path="${escapeHtml(file.path)}">
            <svg class="file-manager-item-icon ${iconClass}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              ${
                isMain
                  ? '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line>'
                  : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>'
              }
            </svg>
            <span class="file-manager-item-path">${escapeHtml(file.name)}</span>
            <span class="file-manager-item-size">${formatFileSize(size)}</span>
            <div class="file-manager-item-actions">
              ${
                isMain
                  ? '<span class="file-manager-main-badge">Main</span>'
                  : `<button class="btn btn-sm btn-icon btn-set-main-file" data-path="${escapeHtml(file.path)}" aria-label="Set as main file" title="Set as main">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </button>`
              }
              <button class="btn btn-sm btn-icon btn-preview-file" data-path="${escapeHtml(file.path)}" aria-label="Preview file" title="Preview">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <button class="btn btn-sm btn-icon btn-rename-project-file" data-path="${escapeHtml(file.path)}" aria-label="Rename file" title="Rename">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="btn btn-sm btn-icon btn-delete-project-file${isMain ? ' btn-disabled' : ''}" data-path="${escapeHtml(file.path)}" aria-label="Delete file" title="${isMain ? 'Cannot delete main file' : 'Delete'}"${isMain ? ' disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>`;
        })
        .join('');

      const treeEl = modal.querySelector('#fmTree');
      treeEl.innerHTML =
        folderRowsHtml + fileRowsHtml ||
        '<p class="text-muted">No files in this folder</p>';

      // --- Wire folder navigation ---
      treeEl.querySelectorAll('[data-folder-enter]').forEach((row) => {
        const folderName = row.dataset.folderEnter;
        const enter = () => {
          fmCurrentPath = [...fmCurrentPath, folderName];
          renderFmView();
        };
        row.addEventListener('click', (e) => {
          // Don't navigate if a button inside the row was clicked
          if (e.target.closest('button')) return;
          enter();
        });
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            enter();
          } else if (e.key === 'Escape' && fmCurrentPath.length > 0) {
            e.preventDefault();
            fmCurrentPath = fmCurrentPath.slice(0, -1);
            renderFmView();
          }
        });
      });

      // --- Preview file buttons ---
      treeEl.querySelectorAll('.btn-preview-file').forEach((btn) => {
        btn.addEventListener('click', () => {
          const path = btn.dataset.path;
          showFilePreviewModal(path, currentFiles[path]);
        });
      });

      // --- Set main file buttons ---
      treeEl.querySelectorAll('.btn-set-main-file').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const path = btn.dataset.path;
          project.mainFilePath = path;
          const result = await updateProject({
            id: projectId,
            mainFilePath: path,
          });
          if (result.success) {
            stateManager.announceChange(`Main file set to ${path}`);
            renderFmView();
          }
        });
      });

      // --- Rename folder buttons ---
      treeEl.querySelectorAll('.btn-rename-project-folder').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const oldFullPath = btn.dataset.folder; // e.g. "Cases/iPad 7,8,9"
          const oldName = oldFullPath.split('/').pop();
          const newName = prompt(`Rename folder "${oldName}" to:`, oldName);
          if (!newName || !newName.trim() || newName.trim() === oldName) return;
          const safeName = newName.trim().replace(/[\\/:*?"<>|]/g, '_');
          const parentPrefix = oldFullPath.includes('/')
            ? oldFullPath.slice(0, oldFullPath.lastIndexOf('/') + 1)
            : '';
          const newFullPath = parentPrefix + safeName;
          const oldPrefix = oldFullPath + '/';
          const newPrefix = newFullPath + '/';

          const conflict = Object.keys(currentFiles).some(
            (p) => p.startsWith(newPrefix) && !p.startsWith(oldPrefix)
          );
          if (conflict) {
            showErrorToast({ title: 'Name Conflict', message: `Folder "${safeName}" already exists.` });
            return;
          }

          const updatedFiles = {};
          for (const [path, content] of Object.entries(currentFiles)) {
            updatedFiles[
              path.startsWith(oldPrefix)
                ? newPrefix + path.slice(oldPrefix.length)
                : path
            ] = content;
          }

          let newMainFilePath = project.mainFilePath;
          if (newMainFilePath && newMainFilePath.startsWith(oldPrefix)) {
            newMainFilePath =
              newPrefix + newMainFilePath.slice(oldPrefix.length);
          }

          const result = await updateProject({
            id: projectId,
            projectFiles: JSON.stringify(updatedFiles),
            mainFilePath: newMainFilePath,
          });

          if (result.success) {
            currentFiles = updatedFiles;
            project.mainFilePath = newMainFilePath;
            // If we renamed a folder we're currently inside, update path
            fmCurrentPath = fmCurrentPath.map((seg, idx) => {
              const prefix = fmCurrentPath.slice(0, idx + 1).join('/');
              return prefix === oldFullPath ? safeName : seg;
            });
            stateManager.announceChange(`Folder renamed to "${safeName}"`);
            renderFmView();
          } else {
            showErrorToast({ title: 'Rename Failed', message: result.error });
          }
        });
      });

      // --- Rename file buttons ---
      treeEl.querySelectorAll('.btn-rename-project-file').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const oldPath = btn.dataset.path;
          const parts = oldPath.split('/');
          const oldName = parts[parts.length - 1];
          const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';

          const newName = prompt(`Rename "${oldName}" to:`, oldName);
          if (!newName || !newName.trim() || newName.trim() === oldName) return;
          const safeName = newName.trim().replace(/[\\/:*?"<>|]/g, '_');
          const newPath = folder ? `${folder}/${safeName}` : safeName;

          if (newPath === oldPath) return;
          if (currentFiles[newPath] !== undefined) {
            showErrorToast({
              title: 'Name Conflict',
              message: `A file named "${safeName}" already exists${folder ? ` in ${folder}` : ''}.`,
            });
            return;
          }

          const updatedFiles = {};
          for (const [path, content] of Object.entries(currentFiles)) {
            updatedFiles[path === oldPath ? newPath : path] = content;
          }

          let newMainFilePath = project.mainFilePath;
          if (newMainFilePath === oldPath) newMainFilePath = newPath;

          const result = await updateProject({
            id: projectId,
            projectFiles: JSON.stringify(updatedFiles),
            mainFilePath: newMainFilePath,
          });

          if (result.success) {
            currentFiles = updatedFiles;
            project.mainFilePath = newMainFilePath;
            stateManager.announceChange(`File renamed to "${safeName}"`);
            renderFmView();
          } else {
            showErrorToast({ title: 'Rename Failed', message: result.error });
          }
        });
      });

      // --- Delete file buttons ---
      treeEl.querySelectorAll('.btn-delete-project-file').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const filePath = btn.dataset.path;
          if (filePath === project.mainFilePath) return;

          const fileName = filePath.split('/').pop();
          if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return;

          const updatedFiles = { ...currentFiles };
          delete updatedFiles[filePath];

          const result = await updateProject({
            id: projectId,
            projectFiles: JSON.stringify(updatedFiles),
          });

          if (result.success) {
            currentFiles = updatedFiles;
            stateManager.announceChange(`Deleted file "${fileName}"`);
            renderFmView();
          } else {
            showErrorToast({ title: 'Delete Failed', message: result.error });
          }
        });
      });

      // --- Delete folder buttons ---
      treeEl.querySelectorAll('.btn-delete-project-folder').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const folderFullPath = btn.dataset.folder;
          const folderName = folderFullPath.split('/').pop();
          const folderPrefix = folderFullPath + '/';

          if (
            project.mainFilePath &&
            project.mainFilePath.startsWith(folderPrefix)
          ) {
            showErrorToast({
              title: 'Cannot Delete Folder',
              message: `Folder "${folderName}" contains the main file. Move or change the main file first.`,
            });
            return;
          }

          const fileCount = Object.keys(currentFiles).filter(
            (p) => p.startsWith(folderPrefix) && !p.endsWith('/.folder')
          ).length;
          const message =
            fileCount > 0
              ? `Delete folder "${folderName}" and its ${fileCount} file${fileCount !== 1 ? 's' : ''}? This cannot be undone.`
              : `Delete empty folder "${folderName}"?`;

          if (!confirm(message)) return;

          const updatedFiles = {};
          for (const [path, content] of Object.entries(currentFiles)) {
            if (!path.startsWith(folderPrefix)) updatedFiles[path] = content;
          }

          const result = await updateProject({
            id: projectId,
            projectFiles: JSON.stringify(updatedFiles),
          });

          if (result.success) {
            currentFiles = updatedFiles;
            // If we deleted a folder we're inside, navigate up
            const deletedPathStr = folderFullPath;
            const currentPathStr = fmCurrentPath.join('/');
            if (
              currentPathStr === deletedPathStr ||
              currentPathStr.startsWith(deletedPathStr + '/')
            ) {
              fmCurrentPath = folderFullPath.includes('/')
                ? folderFullPath.split('/').slice(0, -1)
                : [];
            }
            stateManager.announceChange(`Deleted folder "${folderName}"`);
            renderFmView();
          } else {
            showErrorToast({ title: 'Delete Failed', message: result.error });
          }
        });
      });
    }

    // Initial render
    renderFmView();

    // Wire up static modal buttons
    modal
      .querySelector('#fileManagerXCloseBtn')
      .addEventListener('click', dismissFileManager);
    modal
      .querySelector('#fileManagerCloseBtn')
      .addEventListener('click', dismissFileManager);
    modal.querySelector('#fileManagerLoadBtn').addEventListener('click', () => {
      dismissFileManager();
      loadSavedProject(projectId);
    });

    // Add file button
    const addFileBtn = modal.querySelector('#addFileToProjectBtn');
    if (addFileBtn) {
      addFileBtn.addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.accept = '.scad,.json,.svg,.png,.jpg,.jpeg,.stl,.txt';

        fileInput.addEventListener('change', async (e) => {
          const files = Array.from(e.target.files || []);
          if (files.length === 0) return;

          let addedCount = 0;
          const updatedFiles = { ...currentFiles };
          // Place new files in the currently viewed folder
          const folderPrefix =
            fmCurrentPath.length > 0 ? fmCurrentPath.join('/') + '/' : '';

          for (const file of files) {
            try {
              const ext = file.name.split('.').pop().toLowerCase();
              const isText = ['scad', 'json', 'txt', 'svg'].includes(ext);
              let content;
              if (isText) {
                content = await file.text();
              } else {
                content = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result);
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
              }
              updatedFiles[folderPrefix + file.name] = content;
              addedCount++;
            } catch (err) {
              console.error(
                `[FileManager] Error reading file ${file.name}:`,
                err
              );
            }
          }

          if (addedCount > 0) {
            const result = await updateProject({
              id: projectId,
              projectFiles: JSON.stringify(updatedFiles),
            });
            if (result.success) {
              currentFiles = updatedFiles;
              stateManager.announceChange(
                `Added ${addedCount} file${addedCount !== 1 ? 's' : ''} to project`
              );
              renderFmView();
            } else {
              showErrorToast({ title: 'Add Files Failed', message: result.error });
            }
          }
        });

        fileInput.click();
      });
    }

    // New folder button — creates folder inside currently viewed folder
    const addFolderBtn = modal.querySelector('#addFolderToProjectBtn');
    if (addFolderBtn) {
      addFolderBtn.addEventListener('click', async () => {
        const folderName = prompt('Enter folder name:');
        if (!folderName || !folderName.trim()) return;
        const safeName = folderName.trim().replace(/[\\/:*?"<>|]/g, '_');
        const parentPrefix =
          fmCurrentPath.length > 0 ? fmCurrentPath.join('/') + '/' : '';
        const newFolderPrefix = parentPrefix + safeName + '/';

        const exists = Object.keys(currentFiles).some((p) =>
          p.startsWith(newFolderPrefix)
        );
        if (exists) {
          showErrorToast({ title: 'Name Conflict', message: `Folder "${safeName}" already exists.` });
          return;
        }

        const updatedFiles = { ...currentFiles };
        updatedFiles[`${newFolderPrefix}.folder`] = '';

        const result = await updateProject({
          id: projectId,
          projectFiles: JSON.stringify(updatedFiles),
        });

        if (result.success) {
          currentFiles = updatedFiles;
          stateManager.announceChange(`Created folder "${safeName}"`);
          renderFmView();
        } else {
          showErrorToast({ title: 'Create Folder Failed', message: result.error });
        }
      });
    }
  }

  /**
   * Show file preview modal
   */
  function showFilePreviewModal(path, content) {
    const modal = document.createElement('div');
    modal.className = 'preset-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'filePreviewTitle');
    modal.setAttribute('aria-modal', 'true');

    const ext = path.split('.').pop().toLowerCase();
    const isCode = ['scad', 'json', 'txt', 'md'].includes(ext);

    modal.innerHTML = `
      <div class="preset-modal-content">
        <div class="preset-modal-header">
          <h3 id="filePreviewTitle" class="preset-modal-title">${escapeHtml(path)}</h3>
        </div>

        <div class="preset-modal-body">
          ${
            isCode
              ? `<pre style="max-height: 400px; overflow: auto; background: var(--color-bg-secondary); padding: var(--space-md); border-radius: var(--border-radius-sm); font-size: var(--font-size-sm);"><code>${escapeHtml(content)}</code></pre>`
              : `<p class="text-muted">Binary file - preview not available</p>`
          }
        </div>

        <div class="preset-modal-footer">
          <button class="btn btn-secondary" id="filePreviewCloseBtn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    openModal(modal);

    const dismissPreview = () => {
      closeModal(modal);
      document.body.removeChild(modal);
    };

    modal
      .querySelector('#filePreviewCloseBtn')
      .addEventListener('click', dismissPreview);
  }

  /**
   * Load a saved project
   * @param {string} projectId
   */
  async function loadSavedProject(projectId) {
    let dismissOverlay = () => {};
    try {
      const project = await getProject(projectId);
      if (!project) {
        showErrorToast({ title: 'Not Found', message: 'The requested project could not be found.' });
        return;
      }

      // If a file is already uploaded, confirm before replacing
      const state = stateManager.getState();
      if (state.uploadedFile) {
        const confirmed = await showConfirmDialog(
          'Load this project? Your current file will be replaced.\n\nAny unsaved changes will be lost.',
          'Load Saved Project',
          'Load Project',
          'Cancel'
        );
        if (!confirmed) return;
      }

      dismissOverlay = showProcessingOverlay(`Loading "${project.name}"\u2026`, {
        hint: 'Large projects may take a moment to open.',
      });

      // Yield to allow the browser to paint the overlay before heavy work begins
      await new Promise((r) => setTimeout(r, 0));

      // Reconstruct file data
      const content = project.content;
      const fileName = project.originalName;
      const projectFiles = project.projectFiles
        ? new Map(Object.entries(project.projectFiles))
        : null;
      const mainFilePath =
        projectFiles && projectFiles.size > 0 ? project.mainFilePath : null;

      // Update last loaded timestamp
      await touchProject(projectId);

      // Track which saved project is loaded (for companion file auto-save)
      setCurrentSavedProjectId(projectId);

      // Load the file (reuse existing handleFile logic)
      await handleFile(
        { name: fileName },
        content,
        projectFiles,
        mainFilePath,
        'saved',
        project.name
      );

      // Apply per-project UI preferences from the project record (authoritative
      // source). This overrides whatever handleFile loaded from the legacy
      // openscad-forge-ui-prefs-{fileName} localStorage key.
      if (project.uiPreferences != null) {
        try {
          getUIModeController().importPreferences(project.uiPreferences, {
            applyImmediately: true,
          });
          console.log(
            `[App] Applied per-project UI preferences from project record: ${project.name}`
          );
        } catch (prefsErr) {
          console.warn(
            '[App] Could not apply project UI preferences:',
            prefsErr
          );
        }
      }

      dismissOverlay();

      // Update companion save button after loading
      updateCompanionSaveButton();

      // Announce success
      stateManager.announceChange(`Loaded saved design: ${project.name}`);
      updateStatus(`Loaded: ${project.name}`);

      // Re-render list to update "last opened" time
      await renderSavedProjectsList();
    } catch (error) {
      dismissOverlay();
      console.error('Error loading saved project:', error);
      showErrorModal({
        title: 'Project Load Failed',
        message: 'The saved project could not be loaded.',
        suggestion: 'The project data may be corrupted. Try deleting and re-saving it.',
        technical: error.message,
      });
    }
  }

  /**
   * Show opt-in save prompt after file upload
   * @param {Object} fileData - Current file state
   */
  async function showSaveProjectPrompt(fileData, { preSave = false } = {}) {
    const { uploadedFile, projectFiles, mainFilePath } = fileData;

    if (!uploadedFile) return;

    const kind = projectFiles ? 'zip' : 'scad';
    const fileName = uploadedFile.name || 'untitled.scad';

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'preset-modal save-project-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'saveProjectTitle');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="preset-modal-content">
        <div class="preset-modal-header">
          <h3 id="saveProjectTitle" class="preset-modal-title">Save this file for quick access?</h3>
          <button class="preset-modal-close" aria-label="Close dialog">&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: var(--space-md); color: var(--color-text-secondary);">
            Saved projects are stored in this browser. Clearing cache/site data will remove them.
          </p>
          <div class="save-project-checkbox-wrapper">
            <input type="checkbox" id="saveProjectCheckbox" />
            <label for="saveProjectCheckbox">Save this file to Saved Projects</label>
          </div>
          <div class="edit-project-field">
            <label for="saveProjectName">Project Name</label>
            <input type="text" id="saveProjectName" value="${escapeHtml(fileName)}" />
          </div>
          <div class="save-project-notes-field">
            <label for="saveProjectNotes">Notes (optional - you can paste links)</label>
            <textarea id="saveProjectNotes" placeholder="Add notes about this project..."></textarea>
            <div class="save-project-notes-counter">
              <span id="saveProjectNotesCount">0</span> / 5000 characters
            </div>
          </div>
          <div id="saveProjectDuplicateWarning" style="display:none; margin-top: var(--space-md); padding: var(--space-sm) var(--space-md); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--color-warning, #f59e0b) 15%, transparent); border: 1px solid var(--color-warning, #f59e0b);">
            <p style="margin: 0 0 var(--space-sm); font-weight: 600; color: var(--color-text-primary);">
              \u26A0 A project named &ldquo;<span id="saveProjectDuplicateName"></span>&rdquo; already exists.
            </p>
            <p style="margin: 0; color: var(--color-text-secondary); font-size: var(--text-sm);">
              Do you want to overwrite it, or save this as a new copy?
            </p>
          </div>
        </div>
        <div class="preset-modal-footer" id="saveProjectFooter">
          <button class="btn btn-secondary" id="saveProjectNotNow">Not now</button>
          <button class="btn btn-primary" id="saveProjectSave" disabled>Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Get elements
    const checkbox = modal.querySelector('#saveProjectCheckbox');
    const nameInput = modal.querySelector('#saveProjectName');
    const notesTextarea = modal.querySelector('#saveProjectNotes');
    const notesCount = modal.querySelector('#saveProjectNotesCount');
    const saveBtn = modal.querySelector('#saveProjectSave');
    const notNowBtn = modal.querySelector('#saveProjectNotNow');
    const closeBtn = modal.querySelector('.preset-modal-close');
    const footer = modal.querySelector('#saveProjectFooter');
    const duplicateWarning = modal.querySelector(
      '#saveProjectDuplicateWarning'
    );
    const duplicateNameSpan = modal.querySelector('#saveProjectDuplicateName');

    // When called from an explicit Save/Save As action, pre-check the box
    if (preSave) {
      checkbox.checked = true;
      saveBtn.disabled = false;
    }

    // Update save button state based on checkbox
    checkbox.addEventListener('change', () => {
      saveBtn.disabled = !checkbox.checked;
    });

    // Setup character counter for notes with validation
    const counter = modal.querySelector('.save-project-notes-counter');
    setupNotesCounter(notesTextarea, notesCount, counter, {
      maxLength: 5000,
      warningThreshold: 4500,
      onValidChange: (isValid) => {
        if (isValid) {
          saveBtn.disabled = !checkbox.checked;
        } else {
          saveBtn.disabled = true;
        }
      },
    });

    async function doSave(overwriteProject) {
      const projectName = nameInput.value.trim() || fileName;
      const notes = notesTextarea.value.trim();
      const projectFilesObj = projectFiles
        ? Object.fromEntries(projectFiles)
        : null;

      let result;
      if (overwriteProject) {
        result = await updateProject({
          id: overwriteProject.id,
          notes,
          content: uploadedFile.content,
          projectFiles:
            projectFilesObj !== null
              ? JSON.stringify(projectFilesObj)
              : undefined,
        });
        if (result.success) {
          setCurrentSavedProjectId(overwriteProject.id);
        }
      } else {
        result = await saveProject({
          name: projectName,
          originalName: fileName,
          kind,
          mainFilePath: mainFilePath || fileName,
          content: uploadedFile.content,
          projectFiles: projectFilesObj,
          notes,
        });
        if (result.success) {
          setCurrentSavedProjectId(result.id);
        }
      }

      if (result.success) {
        updateCompanionSaveButton();
        stateManager.announceChange(`Project saved: ${projectName}`);
        updateStatus(`Saved: ${projectName}`);
        await renderSavedProjectsList();
      } else {
        showErrorModal({
          title: 'Save Failed',
          message: 'The project could not be saved.',
          suggestion: 'Check available browser storage space and try again.',
          technical: result.error,
        });
      }

      closeModal(modal);
      modal.remove();
    }

    // Handle save — shows inline duplicate confirmation when needed
    saveBtn.addEventListener('click', async () => {
      if (!checkbox.checked) return;

      const projectName = nameInput.value.trim() || fileName;
      const existingProjects = await listSavedProjects();
      const duplicate = existingProjects.find((p) => p.name === projectName);

      if (duplicate) {
        // Show inline confirmation — no native dialog
        duplicateNameSpan.textContent = projectName;
        duplicateWarning.style.display = 'block';

        // Replace footer buttons with overwrite / new copy choices
        footer.innerHTML = `
          <button class="btn btn-secondary" id="saveProjectNewCopy">Save as New Copy</button>
          <button class="btn btn-danger" id="saveProjectOverwrite">Overwrite Existing</button>
        `;
        footer
          .querySelector('#saveProjectOverwrite')
          .addEventListener('click', () => doSave(duplicate));
        footer
          .querySelector('#saveProjectNewCopy')
          .addEventListener('click', () => doSave(null));
      } else {
        await doSave(null);
      }
    });

    // Handle close
    const closeHandler = () => {
      closeModal(modal);
      modal.remove();
    };

    notNowBtn.addEventListener('click', closeHandler);
    closeBtn.addEventListener('click', closeHandler);

    // Open modal with focus management
    openModal(modal);

    // Focus the project name input for easy editing
    nameInput.focus();
    nameInput.select();
  }

  /**
   * Show edit project modal
   * @param {string} projectId
   */
  async function showEditProjectModal(projectId) {
    try {
      const project = await getProject(projectId);
      if (!project) {
        showErrorToast({ title: 'Not Found', message: 'The requested project could not be found.' });
        return;
      }

      // Create modal
      const modal = document.createElement('div');
      modal.className = 'preset-modal edit-project-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-labelledby', 'editProjectTitle');
      modal.setAttribute('aria-modal', 'true');

      modal.innerHTML = `
        <div class="preset-modal-content">
          <div class="preset-modal-header">
            <h3 id="editProjectTitle" class="preset-modal-title">Edit Project</h3>
            <button class="preset-modal-close" aria-label="Close dialog">&times;</button>
          </div>
          <div class="modal-body">
            <div class="edit-project-field">
              <label for="editProjectName">Project Name</label>
              <input type="text" id="editProjectName" value="${escapeHtml(project.name)}" />
            </div>
            <div class="edit-project-field">
              <label for="editProjectNotes">Notes</label>
              <textarea id="editProjectNotes">${escapeHtml(project.notes || '')}</textarea>
              <div class="save-project-notes-counter">
                <span id="editProjectNotesCount">${(project.notes || '').length}</span> / 5000 characters
              </div>
            </div>
          </div>
          <div class="preset-modal-footer">
            <button class="btn btn-secondary" id="editProjectCancel">Cancel</button>
            <button class="btn btn-primary" id="editProjectSave">Save Changes</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Get elements
      const nameInput = modal.querySelector('#editProjectName');
      const notesTextarea = modal.querySelector('#editProjectNotes');
      const notesCount = modal.querySelector('#editProjectNotesCount');
      const saveBtn = modal.querySelector('#editProjectSave');
      const cancelBtn = modal.querySelector('#editProjectCancel');
      const closeBtn = modal.querySelector('.preset-modal-close');

      // Setup character counter for notes with validation
      const counter = modal.querySelector('.save-project-notes-counter');
      setupNotesCounter(notesTextarea, notesCount, counter, {
        maxLength: 5000,
        warningThreshold: 4500,
        submitButton: saveBtn, // Disable save button when over limit
      });

      // Handle save
      saveBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        const notes = notesTextarea.value.trim();

        if (!name) {
          showErrorToast({ title: 'Name Required', message: 'Project name cannot be empty.' });
          return;
        }

        const result = await updateProject({
          id: projectId,
          name,
          notes,
        });

        if (result.success) {
          stateManager.announceChange(`Project updated: ${name}`);
          updateStatus(`Updated: ${name}`);
          await renderSavedProjectsList();
        } else {
          showErrorToast({ title: 'Update Failed', message: result.error });
        }

        closeModal(modal);
        modal.remove();
      });

      // Handle close
      const closeHandler = () => {
        closeModal(modal);
        modal.remove();
      };

      cancelBtn.addEventListener('click', closeHandler);
      closeBtn.addEventListener('click', closeHandler);

      // Open modal with focus management
      openModal(modal);
      nameInput.focus();
      nameInput.select();
    } catch (error) {
      console.error('Error showing edit modal:', error);
      showErrorModal({
        title: 'Project Load Failed',
        message: 'Could not load project details for editing.',
        technical: error.message,
      });
    }
  }

  /**
   * Delete a saved project (with confirmation)
   * @param {string} projectId
   */
  async function deleteSavedProject(projectId) {
    try {
      const project = await getProject(projectId);
      if (!project) {
        showErrorToast({ title: 'Not Found', message: 'The requested project could not be found.' });
        return;
      }

      const confirmed = await showConfirmDialog(
        `Delete "${project.name}"?\n\nThis cannot be undone.`,
        'Delete Saved Design',
        'Delete',
        'Cancel'
      );

      if (!confirmed) return;

      const result = await deleteProject(projectId);

      if (result.success) {
        stateManager.announceChange(`Deleted project: ${project.name}`);
        updateStatus(`Deleted: ${project.name}`);
        await renderSavedProjectsList();
      } else {
        showErrorToast({ title: 'Delete Failed', message: result.error });
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      showErrorToast({ title: 'Delete Failed', message: error.message });
    }
  }

  // ---- Public API ----
  return {
    renderSavedProjectsList,
    showSaveProjectPrompt,
    loadSavedProject,
  };
}
