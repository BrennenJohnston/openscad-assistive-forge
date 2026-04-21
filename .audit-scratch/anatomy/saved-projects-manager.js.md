# Anatomy: src/js/saved-projects-manager.js

- Total lines: 2242
- Top-level declarations: 63
- Exports: 32
- Module-level mutable state (let/var): 3
- Section banners: 0

## Exports

- initSavedProjectsDB
- listSavedProjects
- saveProject
- getProject
- touchProject
- updateProject
- deleteProject
- getSavedProjectsSummary
- clearAllSavedProjects
- getStorageDiagnostics
- createFolder
- getFolder
- listFolders
- renameFolder
- deleteFolder
- moveFolder
- getFolderTree
- getFolderBreadcrumbs
- moveProject
- getProjectsInFolder
- addProjectFile
- getProjectFiles
- getProjectFileByPath
- deleteProjectFile
- deleteAllProjectFiles
- storeAsset
- getAsset
- deleteAsset
- saveOverlayToProject
- getProjectOverlays
- savePresetToProject
- getPresetsFromProject

## Module-level mutable state

| Line | Name | Snippet |
|---:|---|---|
| 27 | db | `let db = null;` |
| 28 | storageType | `let storageType = null; // 'indexeddb' or 'localstorage'` |
| 29 | initPromise | `let initPromise = null; // Track initialization promise to avoid race conditions` |

## Top-level declarations

| Line | Kind | Name |
|---:|---|---|
| 14 | module-level | DB_NAME |
| 15 | module-level | DB_VERSION |
| 16 | module-level | STORE_NAME |
| 17 | module-level | FOLDERS_STORE |
| 18 | module-level | PROJECT_FILES_STORE |
| 19 | module-level | ASSETS_STORE |
| 20 | module-level | LS_KEY |
| 21 | module-level | LS_FOLDERS_KEY |
| 22 | module-level | SCHEMA_VERSION |
| 23 | module-level | LS_MAX_PROJECT_FILES_BYTES |
| 24 | module-level | MAX_IDB_RETRY |
| 25 | module-level | LARGE_FILES_BATCH_SIZE |
| 27 | module-level | db |
| 28 | module-level | storageType |
| 29 | module-level | initPromise |
| 36 | function | generateId |
| 48 | function | generateUniqueName |
| 79 | function | escapeRegExp |
| 87 | function | ensureInitialized |
| 107 | function | reconnectDB |
| 117 | exported function | initSavedProjectsDB |
| 299 | function | getFromIndexedDB |
| 365 | function | saveToIndexedDB |
| 401 | function | deleteFromIndexedDB |
| 437 | function | clearIndexedDB |
| 494 | function | inferFileKind |
| 520 | function | saveProjectFilesInBatches |
| 559 | function | loadProjectFilesFromStore |
| 574 | function | getFromLocalStorage |
| 589 | function | saveToLocalStorage |
| 602 | exported function | listSavedProjects |
| 666 | exported function | saveProject |
| 859 | exported function | getProject |
| 921 | exported function | touchProject |
| 978 | exported function | updateProject |
| 1086 | exported function | deleteProject |
| 1142 | exported function | getSavedProjectsSummary |
| 1169 | exported function | clearAllSavedProjects |
| 1211 | exported function | getStorageDiagnostics |
| 1268 | exported function | createFolder |
| 1327 | exported function | getFolder |
| 1358 | exported function | listFolders |
| 1394 | exported function | renameFolder |
| 1448 | exported function | deleteFolder |
| 1514 | exported function | moveFolder |
| 1575 | exported function | getFolderTree |
| 1622 | exported function | getFolderBreadcrumbs |
| 1645 | function | getFoldersFromLocalStorage |
| 1658 | function | saveFoldersToLocalStorage |
| 1679 | exported function | moveProject |
| 1735 | exported function | getProjectsInFolder |
| 1760 | exported function | addProjectFile |
| 1811 | exported function | getProjectFiles |
| 1839 | exported function | getProjectFileByPath |
| 1854 | exported function | deleteProjectFile |
| 1894 | exported function | deleteAllProjectFiles |
| 1919 | exported function | storeAsset |
| 1959 | exported function | getAsset |
| 1985 | exported function | deleteAsset |
| 2022 | exported function | saveOverlayToProject |
| 2085 | exported function | getProjectOverlays |
| 2122 | exported function | savePresetToProject |
| 2211 | exported function | getPresetsFromProject |

## Event listeners attached at module scope

(none — addEventListener calls are inside functions only)