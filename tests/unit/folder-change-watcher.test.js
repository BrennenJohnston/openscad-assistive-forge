/**
 * Unit tests for the folder change watcher (C5.2) and write-back (C5.3).
 *
 * The critical contract under test: write-back must update the watcher
 * BEFORE writing so the app's own writes never re-trigger a render
 * (self-trigger loop prevention).
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
import {
  FolderChangeWatcher,
  getFileFromHandle,
} from '../../src/js/folder-change-watcher.js';
import { FolderWriteBack } from '../../src/js/folder-write-back.js';

const HANDLE = { name: 'MyProject' };

function makeFile(lastModified, size) {
  return { lastModified, size, text: () => Promise.resolve('x'.repeat(size)) };
}

function makeWatcher(overrides = {}) {
  const files = overrides.files ?? new Map();
  const onChange = overrides.onChange ?? vi.fn();
  const onPermissionLost = overrides.onPermissionLost ?? vi.fn();
  const watcher = new FolderChangeWatcher({
    getHandle: () => HANDLE,
    getWatchPaths: () => Array.from(files.keys()),
    onChange,
    onPermissionLost,
    isRenderInFlight: overrides.isRenderInFlight ?? (() => false),
    isHidden: overrides.isHidden ?? (() => false),
    statFile: async (_handle, path) => {
      const entry = files.get(path);
      if (entry instanceof Error) throw entry;
      return entry ?? null;
    },
  });
  return { watcher, files, onChange, onPermissionLost };
}

describe('FolderChangeWatcher', () => {
  it('reports a change when lastModified moves', async () => {
    const { watcher, files, onChange } = makeWatcher({
      files: new Map([['MyProject/design.scad', makeFile(1000, 50)]]),
    });
    await watcher.primeSnapshot();

    await watcher.tick();
    expect(onChange).not.toHaveBeenCalled();

    files.set('MyProject/design.scad', makeFile(2000, 50));
    const changes = await watcher.tick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('MyProject/design.scad');
  });

  it('reports a change when only the size moves', async () => {
    const { watcher, files, onChange } = makeWatcher({
      files: new Map([['MyProject/openings.txt', makeFile(1000, 10)]]),
    });
    await watcher.primeSnapshot();
    files.set('MyProject/openings.txt', makeFile(1000, 11));
    await watcher.tick();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not fire while the tab is hidden', async () => {
    let hidden = true;
    const { watcher, files, onChange } = makeWatcher({
      files: new Map([['MyProject/design.scad', makeFile(1000, 50)]]),
      isHidden: () => hidden,
    });
    await watcher.primeSnapshot();
    files.set('MyProject/design.scad', makeFile(2000, 50));

    await watcher.tick();
    expect(onChange).not.toHaveBeenCalled();

    hidden = false;
    await watcher.tick();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not fire while a render is in flight', async () => {
    let rendering = true;
    const { watcher, files, onChange } = makeWatcher({
      files: new Map([['MyProject/design.scad', makeFile(1000, 50)]]),
      isRenderInFlight: () => rendering,
    });
    await watcher.primeSnapshot();
    files.set('MyProject/design.scad', makeFile(2000, 50));

    await watcher.tick();
    expect(onChange).not.toHaveBeenCalled();

    rendering = false;
    await watcher.tick();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('stops and reports when permission is lost', async () => {
    const denied = Object.assign(new Error('denied'), {
      name: 'NotAllowedError',
    });
    const { watcher, files, onChange, onPermissionLost } = makeWatcher({
      files: new Map([['MyProject/design.scad', makeFile(1000, 50)]]),
    });
    await watcher.primeSnapshot();
    watcher.start();

    files.set('MyProject/design.scad', denied);
    await watcher.tick();

    expect(onChange).not.toHaveBeenCalled();
    expect(onPermissionLost).toHaveBeenCalledTimes(1);
    expect(watcher.active).toBe(false);
  });

  it('treats a vanished file as no change (not an error)', async () => {
    const { watcher, files, onChange } = makeWatcher({
      files: new Map([['MyProject/design.scad', makeFile(1000, 50)]]),
    });
    await watcher.primeSnapshot();
    files.set('MyProject/design.scad', null);
    await watcher.tick();
    expect(onChange).not.toHaveBeenCalled();
  });

  describe('self-write loop prevention (C5.3 contract)', () => {
    it('ignores stat changes between beginSelfWrite and endSelfWrite', async () => {
      const { watcher, files, onChange } = makeWatcher({
        files: new Map([['MyProject/design.json', makeFile(1000, 20)]]),
      });
      await watcher.primeSnapshot();

      watcher.beginSelfWrite('MyProject/design.json');
      // Our own write lands on disk mid-flight
      files.set('MyProject/design.json', makeFile(5000, 99));
      await watcher.tick();
      expect(onChange).not.toHaveBeenCalled();

      // endSelfWrite records the post-write stats…
      watcher.endSelfWrite('MyProject/design.json', {
        lastModified: 5000,
        size: 99,
      });
      // …so the next poll still sees no change
      await watcher.tick();
      expect(onChange).not.toHaveBeenCalled();

      // A REAL external edit after that is still detected
      files.set('MyProject/design.json', makeFile(9000, 42));
      await watcher.tick();
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('resumes watching after a failed self-write (endSelfWrite(null))', async () => {
      const { watcher, files, onChange } = makeWatcher({
        files: new Map([['MyProject/design.json', makeFile(1000, 20)]]),
      });
      await watcher.primeSnapshot();

      watcher.beginSelfWrite('MyProject/design.json');
      watcher.endSelfWrite('MyProject/design.json', null);

      files.set('MyProject/design.json', makeFile(2000, 21));
      await watcher.tick();
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });
});

describe('getFileFromHandle', () => {
  function makeTree() {
    const file = {
      getFile: () => Promise.resolve(makeFile(1234, 7)),
    };
    const sub = {
      getDirectoryHandle: vi.fn(() => Promise.reject(new Error('no'))),
      getFileHandle: vi.fn((name) =>
        name === 'openings.txt'
          ? Promise.resolve(file)
          : Promise.reject(
              Object.assign(new Error('nf'), { name: 'NotFoundError' })
            )
      ),
    };
    const root = {
      name: 'MyProject',
      getDirectoryHandle: vi.fn((name) =>
        name === 'sub'
          ? Promise.resolve(sub)
          : Promise.reject(
              Object.assign(new Error('nf'), { name: 'NotFoundError' })
            )
      ),
      getFileHandle: vi.fn(() =>
        Promise.reject(Object.assign(new Error('nf'), { name: 'NotFoundError' }))
      ),
    };
    return { root, sub };
  }

  it('strips the leading root-folder segment and walks subdirectories', async () => {
    const { root } = makeTree();
    const file = await getFileFromHandle(root, 'MyProject/sub/openings.txt');
    expect(file).not.toBeNull();
    expect(file.size).toBe(7);
    expect(root.getDirectoryHandle).toHaveBeenCalledWith('sub');
  });

  it('returns null for a missing file', async () => {
    const { root } = makeTree();
    const file = await getFileFromHandle(root, 'MyProject/sub/missing.txt');
    expect(file).toBeNull();
  });

  it('rethrows permission errors', async () => {
    const root = {
      name: 'MyProject',
      getFileHandle: () =>
        Promise.reject(
          Object.assign(new Error('nope'), { name: 'NotAllowedError' })
        ),
    };
    await expect(getFileFromHandle(root, 'MyProject/a.scad')).rejects.toThrow(
      'nope'
    );
  });
});

describe('FolderWriteBack', () => {
  it('brackets the write with beginSelfWrite/endSelfWrite in order', async () => {
    const calls = [];
    const watcher = {
      beginSelfWrite: vi.fn(() => calls.push('begin')),
      endSelfWrite: vi.fn(() => calls.push('end')),
    };
    const writable = {
      write: vi.fn(() => calls.push('write')),
      close: vi.fn(() => calls.push('close')),
    };
    const fileHandle = {
      createWritable: () => Promise.resolve(writable),
      getFile: () => Promise.resolve(makeFile(7777, 12)),
    };
    const writeBack = new FolderWriteBack({
      getHandle: () => HANDLE,
      getWatcher: () => watcher,
      resolveFileHandle: () => Promise.resolve(fileHandle),
    });

    const result = await writeBack.writeFile('MyProject/design.json', '{}');

    expect(result.ok).toBe(true);
    expect(result.size).toBe(12);
    expect(calls).toEqual(['begin', 'write', 'close', 'end']);
    expect(watcher.endSelfWrite).toHaveBeenCalledWith('MyProject/design.json', {
      lastModified: 7777,
      size: 12,
    });
  });

  it('still calls endSelfWrite(null) when the write fails', async () => {
    const watcher = {
      beginSelfWrite: vi.fn(),
      endSelfWrite: vi.fn(),
    };
    const writeBack = new FolderWriteBack({
      getHandle: () => HANDLE,
      getWatcher: () => watcher,
      resolveFileHandle: () => Promise.reject(new Error('disk full')),
    });

    await expect(
      writeBack.writeFile('MyProject/design.json', '{}')
    ).rejects.toThrow('disk full');
    expect(watcher.beginSelfWrite).toHaveBeenCalled();
    expect(watcher.endSelfWrite).toHaveBeenCalledWith(
      'MyProject/design.json',
      null
    );
  });

  it('throws when no folder is connected', async () => {
    const writeBack = new FolderWriteBack({ getHandle: () => null });
    await expect(writeBack.writeFile('a.json', '{}')).rejects.toThrow(
      'No local folder connected'
    );
  });
});
