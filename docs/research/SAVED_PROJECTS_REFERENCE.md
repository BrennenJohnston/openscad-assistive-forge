# Saved Projects Feature - Open Source Reference Research

> Research compiled: January 27, 2026
> Purpose: Architecture decisions and debugging reference for the Saved Projects feature implementation

## Executive Summary

This document catalogs open source projects and libraries that implement browser-based file/project persistence similar to our planned Saved Projects feature. These can serve as architecture references and debugging aids.

---

## Recommended Libraries (Pick One)

### Option A: idb-keyval (Recommended for Simplicity)

**Repository**: [github.com/jakearchibald/idb-keyval](https://github.com/jakearchibald/idb-keyval)  
**Size**: ~250 bytes (brotli'd) for get/set, ~534 bytes with all methods  
**License**: Apache-2.0  
**Stars**: 3k+

**Why consider it**:
- Extremely lightweight - minimal bundle impact
- Promise-based API matches our existing async patterns
- Tree-shakeable - only include what you use
- Zero dependencies
- TypeScript support built-in
- Created by Jake Archibald (Google Chrome team)

**API Example**:
```javascript
import { get, set, del, keys, clear } from 'idb-keyval';

// Store project
await set('project-uuid-123', {
  id: 'uuid-123',
  name: 'keyguard_v74MW.scad',
  content: '// SCAD content...',
  notes: 'https://example.com/source',
  savedAt: Date.now()
});

// Retrieve
const project = await get('project-uuid-123');

// List all keys
const allKeys = await keys(); // ['project-uuid-123', ...]

// Delete
await del('project-uuid-123');
```

**Custom stores** (for isolating saved projects from other IndexedDB data):
```javascript
import { createStore, set, get } from 'idb-keyval';

const savedProjectsStore = createStore('openscad-forge-saved-projects', 'projects');
await set('key', value, savedProjectsStore);
```

**Reference**: [Custom Stores Documentation](https://github.com/jakearchibald/idb-keyval/blob/HEAD/custom-stores.md)

---

### Option B: localForage (More Features, Larger)

**Repository**: [github.com/localForage/localForage](https://github.com/localForage/localForage)  
**Size**: ~7KB  
**License**: Apache-2.0  
**Stars**: 25.7k

**Why consider it**:
- Automatic fallback: IndexedDB → WebSQL → localStorage
- Handles older browsers with broken IndexedDB gracefully
- Well-documented with many plugins
- Battle-tested in production at scale

**API Example**:
```javascript
import localforage from 'localforage';

// Configure a separate instance for saved projects
const savedProjectsStore = localforage.createInstance({
  name: 'openscad-forge-saved-projects',
  storeName: 'projects'
});

// CRUD operations
await savedProjectsStore.setItem('project-123', projectData);
const project = await savedProjectsStore.getItem('project-123');
await savedProjectsStore.removeItem('project-123');

// Iterate all items
await savedProjectsStore.iterate((value, key) => {
  console.log(key, value.name);
});
```

**Reference**: [localForage API Documentation](https://github.com/localForage/localForage/blob/master/docs/api.md)

---

### Option C: Dexie.js (Full Database Features)

**Repository**: [github.com/dexie/Dexie.js](https://github.com/dexie/Dexie.js)  
**Size**: ~20KB  
**License**: Apache-2.0  
**Stars**: 14k

**Why consider it**:
- Full query capabilities (filtering, sorting, pagination)
- Built-in schema versioning and migrations
- Reactive queries (live updating)
- Cloud sync addon available

**API Example**:
```javascript
import Dexie from 'dexie';

const db = new Dexie('openscad-forge-saved-projects');

// Schema versioning (critical for migrations)
db.version(1).stores({
  projects: '++id, name, savedAt, lastLoadedAt'
});

// CRUD
await db.projects.add({ name: 'keyguard.scad', content: '...', savedAt: Date.now() });
const recentProjects = await db.projects.orderBy('lastLoadedAt').reverse().limit(10).toArray();
await db.projects.delete(projectId);
```

**Storage Persistence** (prevent browser from deleting data):
```javascript
// Request persistent storage
if (navigator.storage && navigator.storage.persist) {
  const isPersisted = await navigator.storage.persist();
  console.log(`Persisted storage granted: ${isPersisted}`);
}
```

**Reference**: [Dexie StorageManager API](https://dexie.org/docs/StorageManager)

---

## Reference Applications

### 1. TLDraw (Drawing App)

**Repository**: [github.com/tldraw/tldraw](https://github.com/tldraw/tldraw)  
**Persistence Docs**: [tldraw.dev/docs/persistence](https://tldraw.dev/docs/persistence)

**How they handle saved projects**:
- Uses `persistenceKey` prop that auto-saves to IndexedDB
- Provides `getSnapshot()` / `loadSnapshot()` for export/import
- Schema migrations run automatically when loading snapshots
- Multiple tabs with same key stay synchronized

**Relevant code pattern**:
```jsx
// Simple auto-persistence
<Tldraw persistenceKey="my-project-id" />

// Manual persistence with throttling
const THROTTLE_MS = 1000;
let lastSaveTime = 0;

store.listen(() => {
  const now = Date.now();
  if (now - lastSaveTime > THROTTLE_MS) {
    lastSaveTime = now;
    const snapshot = getSnapshot(store);
    localStorage.setItem('project', JSON.stringify(snapshot));
  }
});
```

**Lessons**:
- Throttle saves to avoid performance issues
- Separate "document state" from "session state"
- Run migrations when loading older data

---

### 2. Excalidraw (Whiteboard App)

**Repository**: [github.com/excalidraw/excalidraw](https://github.com/excalidraw/excalidraw)  
**Storage Discussions**: [Issue #7341](https://github.com/excalidraw/excalidraw/issues/7341)

**Key lessons from their experience**:
- localStorage has severe performance issues with large documents (5MB+ limit, continuous errors when exceeded)
- Users who switched to IndexedDB reported performance issues "disappeared entirely"
- Restore from database on app restart requires careful element/scene mounting

**Known pitfalls to avoid**:
- Don't use localStorage for file content storage (use IndexedDB)
- Handle failed restores gracefully (show empty state, not crash)
- Test with large files (1MB+) to catch performance issues early

---

### 3. VS Code Web (vscode.dev)

**How they handle file persistence**:
1. **File System Access API** (primary): Direct read/write to local files in Chromium browsers
2. **IndexedDB** (secondary): Stores settings, state, and configuration

**Architecture pattern**:
```javascript
// IndexedDB object store design
const stores = {
  sessions: 'id, lastActivity',      // User sessions
  files: 'id, sessionId, timestamp', // File metadata
  settings: 'key'                    // App configuration
};
```

**Lessons**:
- Separate concerns: file content vs. metadata vs. settings
- Handle missing object stores gracefully (migrations)
- IndexedDB is reliable for application state

---

### 4. CodeSandbox Client

**Repository**: [github.com/codesandbox/codesandbox-client](https://github.com/codesandbox/codesandbox-client)  
**Stars**: 13.5k

**File system approach**:
- Persistent workspace at `/project/workspace`
- Git-backed file tracking
- Automatic commits on hibernate/shutdown

**SDK file operations**:
```javascript
// Node.js-like fs module for file operations
const { fs } = await sdk.ready();

await fs.writeTextFile('/project.json', JSON.stringify(metadata));
const content = await fs.readTextFile('/main.scad');
```

---

## UI/UX Pattern References

### Clear Cache Warning Modal

**Best practices from Chrome's implementation**:
- Show item counts ("5 saved projects will be deleted")
- Require explicit confirmation (not just "OK")
- Use danger/destructive button styling (red)
- Provide cancel as the default focused button

**Implementation pattern**:
```javascript
async function handleClearCache() {
  const summary = await getSavedProjectsSummary();
  
  const confirmed = await showConfirmDialog({
    title: 'Clear All Data?',
    message: `This will permanently delete:\n• ${summary.count} saved project(s)\n• All cached settings\n\nThis cannot be undone.`,
    confirmText: 'Clear All Data',
    cancelText: 'Cancel',
    isDangerous: true,  // Red button styling
    defaultFocus: 'cancel'  // Cancel is safer default
  });
  
  if (!confirmed) return;
  await clearAllData();
}
```

### Project Card UI

**Common patterns from note-taking apps** (LocalNotes, reported, etc.):
- Show file name prominently (truncate with ellipsis if long)
- Relative timestamps ("2 days ago" vs "2026-01-25 14:30:00")
- Truncated preview of content/notes (first ~100 chars)
- Action buttons: Load (primary), Edit, Delete

**Accessibility requirements**:
- Cards as `role="listitem"` in `role="list"` container
- Keyboard navigable (Tab to card, Enter to load)
- Screen reader announcements for actions
- Focus management after delete (focus next card or empty message)

---

## Recommended Architecture Decision

Based on this research, **we recommend idb-keyval** for the Saved Projects feature:

| Criteria | idb-keyval | localForage | Dexie.js |
|----------|-----------|-------------|----------|
| Bundle size | ~250 bytes | ~7KB | ~20KB |
| Fallback support | None (IndexedDB only) | Yes (WebSQL, localStorage) | None |
| Query capabilities | Basic (by key) | Basic | Advanced |
| Schema migrations | Manual | Manual | Built-in |
| Learning curve | Minimal | Low | Medium |
| Our use case fit | ✅ Excellent | ✅ Good | ⚠️ Overkill |

**Rationale**:
1. Our feature only needs basic CRUD operations (no complex queries)
2. IndexedDB is supported in all modern browsers we target
3. Bundle size matters for PWA performance
4. We already handle migrations manually in other parts of the codebase
5. Simple API reduces implementation bugs

**If we need fallback support** (older browsers): Switch to localForage.

---

## Implementation Checklist (from research)

Based on lessons learned from reference projects:

- [ ] **Use IndexedDB, not localStorage** for file content (Excalidraw lesson)
- [ ] **Throttle auto-saves** if implementing real-time persistence (TLDraw pattern)
- [ ] **Create isolated database store** to separate from other app data (idb-keyval custom stores)
- [ ] **Include schema version** in stored records for future migrations (Dexie pattern)
- [ ] **Request persistent storage** to prevent browser cleanup (StorageManager API)
- [ ] **Handle restore failures gracefully** - show empty state, not crash (Excalidraw lesson)
- [ ] **Test with large files** (1MB+) to catch performance issues early
- [ ] **Show item counts in clear warning** (Chrome settings pattern)
- [ ] **Use relative timestamps** in UI ("2 days ago") for better UX
- [ ] **Implement proper keyboard navigation** in project list

---

## Debugging Resources

If issues arise during implementation:

1. **IndexedDB debugging in DevTools**: Application → IndexedDB
2. **idb-keyval issues**: [github.com/jakearchibald/idb-keyval/issues](https://github.com/jakearchibald/idb-keyval/issues)
3. **localForage issues**: [github.com/localForage/localForage/issues](https://github.com/localForage/localForage/issues)
4. **Excalidraw storage discussions**: [github.com/excalidraw/excalidraw/issues/7341](https://github.com/excalidraw/excalidraw/issues/7341)
5. **TLDraw persistence examples**: [tldraw.dev/examples/local-storage](https://tldraw.dev/examples/local-storage)

---

## References

- [IndexedDB API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [StorageManager API (Dexie docs)](https://dexie.org/docs/StorageManager)
- [File System Access API (Chrome Developers)](https://developer.chrome.com/articles/file-system-access/)
- [idb-keyval npm package](https://www.npmjs.com/package/idb-keyval)
- [localForage offline storage article (Mozilla Hacks)](https://hacks.mozilla.org/2014/02/localforage-offline-storage-improved)
