/**
 * Linked-folders list for the welcome screen (sub-plan H, phase H2).
 *
 * The folder-sync store has always been an N-key map, but the UI only ever
 * showed one slot. This module turns those stored handles into a list the
 * user can see and act on: every linked folder is listed, exactly ONE is
 * connected at a time (D-33), and the watcher / write-back keep following
 * whichever that is.
 *
 * Two things make this safe to render before any permission re-grant:
 * `handle.name` is readable without one, and `isSameEntry()` runs on
 * un-granted handles (rejections are treated as "not a match", the same
 * contract `storage-manager.js` relies on). So no DB migration is needed
 * to name a folder — see D-33.
 *
 * This module owns no dialogs and no storage calls. The host injects
 * `onOpen` / `onRemove`, does the work, and announces the outcome; the
 * module re-renders and puts focus somewhere sensible afterwards.
 *
 * @license GPL-3.0-or-later
 */

import { listFolderHandles, ROOT_KEY } from './folder-handle-store.js';

/**
 * @typedef {Object} LinkedFolderEntry
 * @property {string} key Handle-store key — {@link ROOT_KEY} or an `fh-*` ref.
 * @property {string} name Folder name on disk (`handle.name`).
 * @property {FileSystemDirectoryHandle} handle
 * @property {string|null} projectId Saved folder-link record, when one exists.
 * @property {string|null} projectName
 * @property {boolean} isLegacy True when no folder-link record points here —
 *   the pre-multi-folder root slot, or a handle whose record is gone.
 * @property {boolean} isConnected True for the single active folder.
 */

/**
 * `isSameEntry` on a revoked handle rejects; the store treats that as
 * "not the same folder" rather than an error, and so do we.
 *
 * @param {FileSystemDirectoryHandle} a
 * @param {FileSystemDirectoryHandle} b
 * @returns {Promise<boolean>}
 */
async function isSameFolder(a, b) {
  if (!a || !b || typeof a.isSameEntry !== 'function') return false;
  try {
    return await a.isSameEntry(b);
  } catch {
    return false;
  }
}

/**
 * @param {LinkedFolderEntry[]} entries
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<LinkedFolderEntry|null>}
 */
async function findEntryForHandle(entries, handle) {
  for (const entry of entries) {
    if (await isSameFolder(entry.handle, handle)) return entry;
  }
  return null;
}

/**
 * Build the list model: every stored folder-link handle, plus the legacy
 * root slot when it is not already one of them.
 *
 * Order is the store's own key order and never changes as folders are
 * used, so a keyboard user's rows stay where they were.
 *
 * @param {Object} [deps]
 * @param {() => Promise<{key: string, handle: any}[]>} [deps.listHandles]
 * @param {() => Promise<Object[]>} deps.listProjects Saved-project records.
 * @param {() => (FileSystemDirectoryHandle|null)} [deps.getActiveHandle]
 * @returns {Promise<LinkedFolderEntry[]>}
 */
export async function buildLinkedFolderModel(deps = {}) {
  const listHandles = deps.listHandles ?? listFolderHandles;
  const listProjects = deps.listProjects;
  const getActiveHandle = deps.getActiveHandle ?? (() => null);

  const stored = await listHandles();
  if (stored.length === 0) return [];

  /** @type {Map<string, Object>} */
  const projectsByRef = new Map();
  try {
    const projects = (await listProjects?.()) ?? [];
    for (const project of projects) {
      if (project?.kind === 'folder-link' && project.folderRef) {
        projectsByRef.set(project.folderRef, project);
      }
    }
  } catch (err) {
    // A folder with no record still opens (it re-links on open), so list
    // what we have rather than dropping the section entirely.
    console.warn('[LinkedFolders] Could not read saved projects:', err);
  }

  /** @type {LinkedFolderEntry[]} */
  const entries = [];
  let rootHandle = null;
  for (const { key, handle } of stored) {
    if (key === ROOT_KEY) {
      rootHandle = handle;
      continue;
    }
    const project = projectsByRef.get(key) ?? null;
    entries.push({
      key,
      name: typeof handle.name === 'string' ? handle.name : '',
      handle,
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      isLegacy: !project,
      isConnected: false,
    });
  }

  // The root slot is where every connection is mirrored, so it is usually
  // a duplicate of a folder already listed. List it only when it is not.
  if (rootHandle && !(await findEntryForHandle(entries, rootHandle))) {
    entries.push({
      key: ROOT_KEY,
      name: typeof rootHandle.name === 'string' ? rootHandle.name : '',
      handle: rootHandle,
      projectId: null,
      projectName: null,
      isLegacy: true,
      isConnected: false,
    });
  }

  const active = getActiveHandle();
  if (active) {
    const match = await findEntryForHandle(entries, active);
    if (match) match.isConnected = true;
  }

  return entries;
}

/**
 * A button whose visible word is short but whose accessible name names its
 * row, so a screen-reader user sweeping the list hears "Open switch-mount"
 * rather than four buttons all called "Open". The visible text stays the
 * start of the accessible name (WCAG 2.5.3), which an `aria-label` here
 * would break.
 *
 * @param {string} visibleText
 * @param {string} folderName
 * @param {string} className
 * @returns {HTMLButtonElement}
 */
function makeRowButton(visibleText, folderName, className) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn btn-sm btn-outline ${className}`;
  btn.append(document.createTextNode(visibleText));
  const suffix = document.createElement('span');
  suffix.className = 'sr-only';
  suffix.textContent = ` ${folderName}`;
  btn.appendChild(suffix);
  return btn;
}

/**
 * Render the model into a `<ul>`. Rebuilds the list wholesale — the caller
 * restores focus, because only it knows what the user just did.
 *
 * @param {HTMLElement} listEl
 * @param {LinkedFolderEntry[]} entries
 * @param {Object} handlers
 * @param {(entry: LinkedFolderEntry) => void} handlers.onOpen
 * @param {(entry: LinkedFolderEntry) => void} handlers.onRemove
 */
export function renderLinkedFolders(listEl, entries, handlers = {}) {
  if (!listEl) return;
  listEl.replaceChildren();

  for (const entry of entries) {
    const item = document.createElement('li');
    item.className = 'linked-folder';
    item.dataset.folderKey = entry.key;
    if (entry.isConnected) item.dataset.connected = 'true';

    const name = document.createElement('span');
    name.className = 'linked-folder-name';
    name.textContent = entry.name;
    item.appendChild(name);

    if (entry.isConnected) {
      const badge = document.createElement('span');
      badge.className = 'linked-folder-badge';
      badge.textContent = 'Connected';
      item.appendChild(badge);
    }

    if (entry.isLegacy) {
      const hint = document.createElement('span');
      hint.className = 'linked-folder-hint';
      hint.textContent = 'No project card yet';
      item.appendChild(hint);
    }

    const actions = document.createElement('span');
    actions.className = 'linked-folder-actions';

    const openBtn = makeRowButton('Open', entry.name, 'linked-folder-open');
    openBtn.addEventListener('click', () => handlers.onOpen?.(entry));
    actions.appendChild(openBtn);

    const removeBtn = makeRowButton(
      'Remove',
      entry.name,
      'linked-folder-remove'
    );
    removeBtn.addEventListener('click', () => handlers.onRemove?.(entry));
    actions.appendChild(removeBtn);

    item.appendChild(actions);
    listEl.appendChild(item);
  }
}

/**
 * Wire the list to its host.
 *
 * @param {Object} deps
 * @param {HTMLElement} deps.listEl The `<ul>` that holds the rows.
 * @param {HTMLElement} [deps.sectionEl] Hidden when nothing is linked.
 * @param {() => Promise<Object[]>} deps.listProjects
 * @param {() => (FileSystemDirectoryHandle|null)} [deps.getActiveHandle]
 * @param {() => Promise<{key: string, handle: any}[]>} [deps.listHandles]
 * @param {(entry: LinkedFolderEntry) => Promise<any>} [deps.onOpen]
 * @param {(entry: LinkedFolderEntry) => Promise<boolean>} [deps.onRemove]
 *   Resolves true when the folder was removed, so focus can move on.
 * @param {() => void} [deps.onEmptyFocus] Where focus goes when the last
 *   row is removed — the host knows what is still on screen.
 * @returns {{refresh: () => Promise<void>}}
 */
export function createLinkedFoldersUi(deps = {}) {
  const { listEl, sectionEl } = deps;

  async function refresh() {
    if (!listEl) return;
    const entries = await buildLinkedFolderModel({
      listHandles: deps.listHandles,
      listProjects: deps.listProjects,
      getActiveHandle: deps.getActiveHandle,
    });
    renderLinkedFolders(listEl, entries, {
      onOpen: (entry) => deps.onOpen?.(entry),
      onRemove: (entry) => handleRemove(entry),
    });
    if (sectionEl) sectionEl.hidden = entries.length === 0;
  }

  /**
   * Removing a row destroys the button that had focus, so focus has to be
   * placed deliberately: the row that took its position, else the last
   * row, else back out to whatever the host nominates.
   */
  async function handleRemove(entry) {
    const rows = [...listEl.querySelectorAll('.linked-folder')];
    const index = rows.findIndex((row) => row.dataset.folderKey === entry.key);

    const removed = await deps.onRemove?.(entry);
    if (!removed) return;

    await refresh();

    const remaining = [...listEl.querySelectorAll('.linked-folder')];
    if (remaining.length === 0) {
      deps.onEmptyFocus?.();
      return;
    }
    const next = remaining[Math.min(index, remaining.length - 1)];
    next?.querySelector('.linked-folder-remove')?.focus();
  }

  return { refresh };
}
