/**
 * Unit tests for the folder-link (pointer-model) flow: contentless records,
 * reconnect dedupe via isSameEntry, folder-link update semantics, and
 * handle-key cleanup on delete.
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../src/js/folder-handle-store.js', () => ({
  loadFolderHandle: vi.fn(async () => null),
  saveFolderHandle: vi.fn(async () => {}),
  clearFolderHandle: vi.fn(async () => {}),
  isFolderHandleStorageSupported: () => true,
}));

// ---------------------------------------------------------------------------
// Minimal IDB mock: a working `projects` store plus enough of the
// `projectFiles` store surface for the manager's batching checks.
// ---------------------------------------------------------------------------
function makeProjectsDb() {
  const projects = new Map();

  return {
    onerror: null,
    onversionchange: null,
    objectStoreNames: {
      contains: (name) =>
        ['projects', 'folders', 'projectFiles', 'assets'].includes(name),
    },
    transaction: (storeNames) => {
      const storeName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
      const request = () => {
        const req = { result: undefined, onsuccess: null, onerror: null };
        return req;
      };
      const resolveReq = (req, result) => {
        req.result = result;
        Promise.resolve().then(() => {
          if (req.onsuccess) req.onsuccess();
        });
        return req;
      };
      const store = {
        put: (item, key) =>
          storeName === 'projects'
            ? resolveReq(request(), projects.set(item.id ?? key, item) && item.id)
            : resolveReq(request(), undefined),
        get: (id) =>
          resolveReq(
            request(),
            storeName === 'projects' ? projects.get(id) : undefined
          ),
        getAll: () =>
          resolveReq(
            request(),
            storeName === 'projects' ? [...projects.values()] : []
          ),
        delete: (id) => {
          if (storeName === 'projects') projects.delete(id);
          return resolveReq(request(), undefined);
        },
        index: () => ({
          getAll: () => resolveReq(request(), []),
        }),
      };
      const tx = {
        onerror: null,
        oncomplete: null,
        onabort: null,
        objectStore: () => store,
      };
      Promise.resolve().then(() => {
        if (tx.oncomplete) tx.oncomplete();
      });
      return tx;
    },
    close: vi.fn(),
    _projects: projects,
  };
}

function stubIdb(dbInstance) {
  const mockOpen = vi.fn(() => {
    const req = {
      result: dbInstance,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null,
    };
    Promise.resolve().then(() => {
      if (req.onsuccess) req.onsuccess();
    });
    return req;
  });
  vi.stubGlobal('indexedDB', { open: mockOpen });
}

function makeFakeFile(relPath, content) {
  return {
    name: relPath.split('/').pop(),
    webkitRelativePath: relPath,
    size: content.length,
    text: async () => content,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  };
}

const KEYGUARD_FILES = [
  makeFakeFile('MyKeyguard/keyguard.scad', '// keyguard main'),
  makeFakeFile('MyKeyguard/openings_and_additions.txt', '// openings'),
  makeFakeFile('MyKeyguard/notes/readme.txt', 'docs'),
];

async function importFresh() {
  const manager = await import('../../src/js/saved-projects-manager.js');
  const storage = await import('../../src/js/storage-manager.js');
  const handleStore = await import('../../src/js/folder-handle-store.js');
  return { manager, storage, handleStore };
}

describe('folder-link flow (pointer model)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    localStorage.clear();
  });

  it('linkProjectFromFiles creates a contentless folder-link record', async () => {
    vi.resetModules();
    localStorage.clear();
    const db = makeProjectsDb();
    stubIdb(db);
    const { manager, storage } = await importFresh();
    await manager.initSavedProjectsDB();

    const result = await storage.linkProjectFromFiles(
      KEYGUARD_FILES,
      'MyKeyguard/keyguard.scad',
      { folderRef: 'fh-test-1' }
    );

    expect(result.success).toBe(true);
    expect(result.mainContent).toBe('// keyguard main');
    expect(result.projectFiles['keyguard.scad']).toBe('// keyguard main');
    expect(result.mainRelPath).toBe('keyguard.scad');

    const record = db._projects.get(result.id);
    expect(record.kind).toBe('folder-link');
    expect(record.content).toBe('');
    expect(record.projectFiles).toBeNull();
    expect(record.folderRef).toBe('fh-test-1');
    expect(record.fileSummary.fileCount).toBe(3);
    expect(record.fileSummary.totalBytes).toBeGreaterThan(0);
  });

  it('linkProjectFromFiles with existingId refreshes metadata without a new record', async () => {
    vi.resetModules();
    localStorage.clear();
    const db = makeProjectsDb();
    stubIdb(db);
    const { manager, storage } = await importFresh();
    await manager.initSavedProjectsDB();

    const first = await storage.linkProjectFromFiles(
      KEYGUARD_FILES,
      'MyKeyguard/keyguard.scad',
      { folderRef: 'fh-test-1' }
    );
    await manager.updateProject({ id: first.id, notes: 'my notes' });

    const moreFiles = [
      ...KEYGUARD_FILES,
      makeFakeFile('MyKeyguard/extra.scad', '// extra'),
    ];
    const second = await storage.linkProjectFromFiles(
      moreFiles,
      'MyKeyguard/keyguard.scad',
      { folderRef: 'fh-test-1', existingId: first.id }
    );

    expect(second.success).toBe(true);
    expect(second.id).toBe(first.id);
    expect(db._projects.size).toBe(1);
    const record = db._projects.get(first.id);
    expect(record.fileSummary.fileCount).toBe(4);
    expect(record.notes).toBe('my notes');
    expect(record.content).toBe('');
  });

  it('updateProject ignores content and projectFiles for folder-link records', async () => {
    vi.resetModules();
    localStorage.clear();
    const db = makeProjectsDb();
    stubIdb(db);
    const { manager, storage } = await importFresh();
    await manager.initSavedProjectsDB();

    const linked = await storage.linkProjectFromFiles(
      KEYGUARD_FILES,
      'MyKeyguard/keyguard.scad',
      { folderRef: 'fh-test-2' }
    );

    const res = await manager.updateProject({
      id: linked.id,
      content: '// should be ignored',
      projectFiles: { 'x.scad': '// nope' },
      notes: 'kept',
    });
    expect(res.success).toBe(true);

    const record = db._projects.get(linked.id);
    expect(record.content).toBe('');
    expect(record.projectFiles).toBeNull();
    expect(record.notes).toBe('kept');
  });

  it('deleteProject clears the folder-link handle key', async () => {
    vi.resetModules();
    localStorage.clear();
    const db = makeProjectsDb();
    stubIdb(db);
    const { manager, storage, handleStore } = await importFresh();
    await manager.initSavedProjectsDB();

    const linked = await storage.linkProjectFromFiles(
      KEYGUARD_FILES,
      'MyKeyguard/keyguard.scad',
      { folderRef: 'fh-delete-me' }
    );

    const del = await manager.deleteProject(linked.id);
    expect(del.success).toBe(true);
    expect(handleStore.clearFolderHandle).toHaveBeenCalledWith({
      key: 'fh-delete-me',
    });
  });

  it('findLinkedProjectForHandle matches via isSameEntry and skips revoked handles', async () => {
    vi.resetModules();
    localStorage.clear();
    const db = makeProjectsDb();
    stubIdb(db);
    const { manager, storage } = await importFresh();
    await manager.initSavedProjectsDB();

    const a = await storage.linkProjectFromFiles(
      KEYGUARD_FILES,
      'MyKeyguard/keyguard.scad',
      { folderRef: 'fh-a' }
    );
    const otherFiles = [makeFakeFile('Other/main.scad', '// other')];
    await storage.linkProjectFromFiles(otherFiles, 'Other/main.scad', {
      folderRef: 'fh-b',
    });

    const targetHandle = { name: 'MyKeyguard', kind: 'directory' };
    const storedHandles = {
      'fh-a': {
        name: 'MyKeyguard',
        isSameEntry: async (h) => h === targetHandle,
      },
      'fh-b': {
        name: 'Other',
        isSameEntry: async () => {
          throw new DOMException('revoked', 'InvalidStateError');
        },
      },
    };

    const match = await storage.findLinkedProjectForHandle(targetHandle, {
      loadHandle: async (key) => storedHandles[key] ?? null,
    });
    expect(match).toEqual({ id: a.id, folderRef: 'fh-a' });

    const noMatch = await storage.findLinkedProjectForHandle(
      { name: 'Unrelated' },
      { loadHandle: async (key) => storedHandles[key] ?? null }
    );
    expect(noMatch).toBeNull();
  });
});
