/**
 * Tests for the F35 Phase A folder-sync controller.
 *
 * The controller is a thin orchestrator over four pluggable seams
 * (`showDirectoryPicker`, `getStoredHandle`, `persistHandle`,
 * `forgetHandle`) so we can exercise every state transition without
 * touching real browser APIs.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FolderSyncController,
  getFolderSyncController,
  resetFolderSyncController,
} from '../../src/js/folder-sync-controller.js';

// Mock the storage layer so the controller's default deps don't try to
// touch real IndexedDB during these tests.
vi.mock('../../src/js/folder-handle-store.js', () => ({
  isFolderHandleStorageSupported: () => true,
  loadFolderHandle: vi.fn(async () => null),
  saveFolderHandle: vi.fn(async () => {}),
  clearFolderHandle: vi.fn(async () => {}),
}));

/**
 * @param {{ name?: string, perm?: string }} [opts]
 */
function makeFakeHandle({ name = 'project', perm = 'granted' } = {}) {
  return {
    name,
    kind: 'directory',
    queryPermission: vi.fn(async () => perm),
    requestPermission: vi.fn(async () => perm),
  };
}

describe('FolderSyncController (F35 Phase A)', () => {
  beforeEach(() => {
    resetFolderSyncController();
  });

  describe('initial state', () => {
    it('starts idle with no handle', () => {
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(),
        getStoredHandle: vi.fn(),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      expect(ctrl.getState()).toBe('idle');
      expect(ctrl.getHandle()).toBeNull();
      expect(ctrl.getFolderName()).toBeNull();
    });

    it('reflects support detection', () => {
      const ctrl = new FolderSyncController();
      expect(ctrl.isSupported()).toBe(true);
    });
  });

  describe('subscribe', () => {
    it('fires once immediately with the current state', () => {
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(),
        getStoredHandle: vi.fn(),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      const fn = vi.fn();
      ctrl.subscribe(fn);
      expect(fn).toHaveBeenCalledWith('idle', null);
    });

    it('is a no-op for non-function args', () => {
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(),
        getStoredHandle: vi.fn(),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      expect(() => ctrl.subscribe(null)).not.toThrow();
    });

    it('returns an unsubscribe function', async () => {
      const handle = makeFakeHandle({ name: 'a' });
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(async () => handle),
        getStoredHandle: vi.fn(),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      const fn = vi.fn();
      const off = ctrl.subscribe(fn);
      fn.mockClear();
      off();
      await ctrl.connect();
      expect(fn).not.toHaveBeenCalled();
    });

    it('absorbs subscriber exceptions so other listeners still fire', async () => {
      const handle = makeFakeHandle({ name: 'b' });
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(async () => handle),
        getStoredHandle: vi.fn(),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const noisy = vi.fn(() => {
        throw new Error('boom');
      });
      const quiet = vi.fn();
      ctrl.subscribe(noisy);
      ctrl.subscribe(quiet);
      noisy.mockClear();
      quiet.mockClear();

      await ctrl.connect();
      expect(noisy).toHaveBeenCalled();
      expect(quiet).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('connect', () => {
    it('happy path: picks, persists, transitions to connected', async () => {
      const picker = vi.fn(async () => makeFakeHandle({ name: 'design' }));
      const persist = vi.fn(async () => {});
      const ctrl = new FolderSyncController({
        showDirectoryPicker: picker,
        getStoredHandle: vi.fn(),
        persistHandle: persist,
        forgetHandle: vi.fn(),
      });
      const result = await ctrl.connect();
      expect(picker).toHaveBeenCalledWith({ mode: 'readwrite' });
      expect(persist).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
      expect(result.state).toBe('connected');
      expect(result.folderName).toBe('design');
      expect(ctrl.getState()).toBe('connected');
      expect(ctrl.getFolderName()).toBe('design');
    });

    it('asks the picker for readwrite mode', async () => {
      const picker = vi.fn(async () => makeFakeHandle());
      const ctrl = new FolderSyncController({
        showDirectoryPicker: picker,
        getStoredHandle: vi.fn(),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      await ctrl.connect();
      expect(picker).toHaveBeenCalledWith({ mode: 'readwrite' });
    });

    it('user-cancelled (AbortError) leaves state idle', async () => {
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(async () => {
          const e = new Error('User aborted');
          e.name = 'AbortError';
          throw e;
        }),
        getStoredHandle: vi.fn(),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      const result = await ctrl.connect();
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('cancelled');
      expect(ctrl.getState()).toBe('idle');
    });

    it('permission denied transitions to denied without persisting', async () => {
      const handle = makeFakeHandle({ name: 'denied-folder', perm: 'denied' });
      const persist = vi.fn();
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(async () => handle),
        getStoredHandle: vi.fn(),
        persistHandle: persist,
        forgetHandle: vi.fn(),
      });
      const result = await ctrl.connect();
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('permission-denied');
      expect(ctrl.getState()).toBe('denied');
      expect(persist).not.toHaveBeenCalled();
    });

    it('returns unsupported on browsers without the API', async () => {
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(),
        getStoredHandle: vi.fn(),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      vi.spyOn(ctrl, 'isSupported').mockReturnValue(false);
      const result = await ctrl.connect();
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('unsupported');
    });

    it('surfaces unexpected picker errors via reason field', async () => {
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(async () => {
          throw new Error('disk on fire');
        }),
        getStoredHandle: vi.fn(),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await ctrl.connect();
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('disk on fire');
      warnSpy.mockRestore();
    });
  });

  describe('hydrateFromStorage', () => {
    it('does nothing when no handle is stored', async () => {
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(),
        getStoredHandle: vi.fn(async () => null),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      await ctrl.hydrateFromStorage();
      expect(ctrl.getState()).toBe('idle');
      expect(ctrl.getHandle()).toBeNull();
    });

    it('transitions to pending-restore when a handle exists', async () => {
      const stored = makeFakeHandle({ name: 'restored' });
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(),
        getStoredHandle: vi.fn(async () => stored),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      await ctrl.hydrateFromStorage();
      expect(ctrl.getState()).toBe('pending-restore');
      expect(ctrl.getHandle()).toBe(stored);
    });

    it('does NOT call requestPermission during hydration', async () => {
      const stored = makeFakeHandle({ name: 'restored' });
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(),
        getStoredHandle: vi.fn(async () => stored),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      await ctrl.hydrateFromStorage();
      expect(stored.requestPermission).not.toHaveBeenCalled();
    });

    it('falls through silently when storage throws', async () => {
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(),
        getStoredHandle: vi.fn(async () => {
          throw new Error('IDB nope');
        }),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(ctrl.hydrateFromStorage()).resolves.toBeUndefined();
      expect(ctrl.getState()).toBe('idle');
      warnSpy.mockRestore();
    });
  });

  describe('restoreFromStored', () => {
    it('happy path: queryPermission already granted, no prompt fired', async () => {
      const stored = makeFakeHandle({ name: 'stored', perm: 'granted' });
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(),
        getStoredHandle: vi.fn(async () => stored),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      const result = await ctrl.restoreFromStored();
      expect(result.ok).toBe(true);
      expect(result.state).toBe('connected');
      expect(stored.queryPermission).toHaveBeenCalledWith({
        mode: 'readwrite',
      });
      expect(stored.requestPermission).not.toHaveBeenCalled();
      expect(ctrl.getState()).toBe('connected');
    });

    it('prompts via requestPermission when queryPermission returns "prompt"', async () => {
      const stored = {
        name: 'needs-prompt',
        kind: 'directory',
        queryPermission: vi.fn(async () => 'prompt'),
        requestPermission: vi.fn(async () => 'granted'),
      };
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(),
        getStoredHandle: vi.fn(async () => stored),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      const result = await ctrl.restoreFromStored();
      expect(stored.requestPermission).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
      expect(result.state).toBe('connected');
    });

    it('transitions to denied when permission is declined', async () => {
      const stored = {
        name: 'declined',
        kind: 'directory',
        queryPermission: vi.fn(async () => 'prompt'),
        requestPermission: vi.fn(async () => 'denied'),
      };
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(),
        getStoredHandle: vi.fn(async () => stored),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      const result = await ctrl.restoreFromStored();
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('permission-denied');
      expect(ctrl.getState()).toBe('denied');
    });

    it('returns no-stored-handle when IDB is empty', async () => {
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(),
        getStoredHandle: vi.fn(async () => null),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      const result = await ctrl.restoreFromStored();
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no-stored-handle');
    });

    it('reuses the in-memory handle from hydrateFromStorage when available', async () => {
      const stored = makeFakeHandle({ name: 'cached', perm: 'prompt' });
      stored.requestPermission.mockResolvedValueOnce('granted');
      const getStored = vi.fn(async () => stored);
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(),
        getStoredHandle: getStored,
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(),
      });
      await ctrl.hydrateFromStorage();
      getStored.mockClear();
      const result = await ctrl.restoreFromStored();
      expect(getStored).not.toHaveBeenCalled(); // already in memory
      expect(result.ok).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('clears in-memory handle and forwards to forgetHandle', async () => {
      const handle = makeFakeHandle({ name: 'project' });
      const forget = vi.fn(async () => {});
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(async () => handle),
        getStoredHandle: vi.fn(),
        persistHandle: vi.fn(),
        forgetHandle: forget,
      });
      await ctrl.connect();
      await ctrl.disconnect();
      expect(forget).toHaveBeenCalledTimes(1);
      expect(ctrl.getState()).toBe('idle');
      expect(ctrl.getHandle()).toBeNull();
    });

    it('still completes when forgetHandle throws', async () => {
      const ctrl = new FolderSyncController({
        showDirectoryPicker: vi.fn(),
        getStoredHandle: vi.fn(),
        persistHandle: vi.fn(),
        forgetHandle: vi.fn(async () => {
          throw new Error('disk error');
        }),
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(ctrl.disconnect()).resolves.toBeUndefined();
      expect(ctrl.getState()).toBe('idle');
      warnSpy.mockRestore();
    });
  });

  describe('singleton', () => {
    it('returns the same instance across calls', () => {
      const a = getFolderSyncController();
      const b = getFolderSyncController();
      expect(a).toBe(b);
    });

    it('reset returns a fresh instance on next access', () => {
      const a = getFolderSyncController();
      resetFolderSyncController();
      const b = getFolderSyncController();
      expect(a).not.toBe(b);
    });
  });
});
