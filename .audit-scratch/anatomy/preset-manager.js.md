# Anatomy: src/js/preset-manager.js

- Total lines: 1724
- Top-level declarations: 18
- Exports: 9
- Module-level mutable state (let/var): 1
- Section banners: 0

## Exports

- STORAGE_SCHEMA_VERSION
- checkMigrationAvailable
- migrateFromLegacyStorage
- dismissMigrationOffer
- coercePresetValues
- PresetManager
- extractScadVersion
- compareVersions
- presetManager

## Module-level mutable state

| Line | Name | Snippet |
|---:|---|---|
| 7 | validatePresetsCollectionFn | `let validatePresetsCollectionFn = null;` |

## Top-level declarations

| Line | Kind | Name |
|---:|---|---|
| 7 | module-level | validatePresetsCollectionFn |
| 23 | exported const | STORAGE_SCHEMA_VERSION |
| 28 | module-level | STORAGE_KEYS |
| 43 | function | detectStorageVersion |
| 67 | exported function | checkMigrationAvailable |
| 127 | exported function | migrateFromLegacyStorage |
| 243 | exported function | dismissMigrationOffer |
| 256 | function | resetMigrationFlag |
| 273 | function | isOpenSCADNativeFormat |
| 307 | function | isForgeFormat |
| 324 | exported function | coercePresetValues |
| 361 | function | autoDetectType |
| 391 | function | coerceToType |
| 445 | function | stringifyForOpenSCAD |
| 464 | exported class | PresetManager |
| 1669 | exported function | extractScadVersion |
| 1705 | exported function | compareVersions |
| 1723 | exported const | presetManager |

## Event listeners attached at module scope

(none — addEventListener calls are inside functions only)