# D1: Preset-Specific Companion Files — Architecture Design

**Status:** Design approved, not yet implemented.
**Priority:** Implement after Phases 1–2 items are stable in production.
**Risk:** High — touches IndexedDB schema, WASM filesystem, and ZIP project format.

---

## Problem

Currently all companion files (openings text, screenshot PNG, shared libraries) are
project-level — shared across every preset. This prevents two common AAC workflows:

1. **Per-tablet keyguard:** The same SCAD file generates keyguards for an iPad Pro 11"
   and an iPad 9th Gen. Each needs a different `screenshot.png` to show correct button
   positions. Today both presets share one file.

2. **Per-layout openings:** "TouchChat LAMP layout" and "Snap + Core layout" need
   different `openings_and_additions.txt` files. Today users must keep two SCAD projects.

---

## Proposed Data Model

### Preset structure (schemaVersion 3)

```json
{
  "id": "preset-1706...",
  "name": "iPad Pro 11 — LAMP layout",
  "parameters": { "device": "ipad-pro-11", "rows": 4 },
  "description": "...",
  "created": 1706000000000,
  "modified": 1706000000000,
  "companionFiles": {
    "screenshot.png": "data:image/png;base64,...",
    "openings_and_additions.txt": "ADD 120 45 30 30\n..."
  }
}
```

Project-level companion files (shared across all presets) are stored as before in
`state.projectFiles` (a `Map<filename, content>`).

### File resolution order (when a preset is active)

1. Check `preset.companionFiles` — preset-specific files take priority
2. Fall back to `state.projectFiles` — project-level shared files
3. If neither has the file, the WASM FS mount fails gracefully

---

## Migration Strategy

| Saved project version | Behaviour |
|---|---|
| `schemaVersion` 1 or 2 | All companion files treated as project-level (no change) |
| `schemaVersion` 3 | Preset-specific files loaded from `preset.companionFiles` |

The project loader detects `schemaVersion` and migrates automatically:
- v1/v2: `state.projectFiles` populated from ZIP as before; `preset.companionFiles = {}` for all
- v3: loader reads both project-level files and per-preset `companionFiles`

---

## UI Changes

### Companion files panel

The file list gains a two-level display:

```
Project files (shared)
   main.scad
   common_library.scad

iPad Pro 11 — LAMP layout (current design)
   screenshot.png          [preset-specific]
   openings_and_additions.txt [preset-specific]
```

Badge colours distinguish project-level ("shared") from preset-specific files.

When no preset is active, all uploads go to project level.
When a preset is active, a toggle control lets users choose: "Save as shared" vs "Save to this design".

### ZIP export

The exported ZIP structure becomes:

```
my_keyguard.zip
├── main.scad
├── common_library.scad           ← project-level
├── presets/
│   ├── ipad-pro-11-lamp.json     ← includes companionFiles inline
│   └── ipad-9th-gen-core.json
└── project.json                  ← schemaVersion: 3
```

---

## Storage Considerations

- Large base64 screenshot PNGs (200–400 KB each) duplicated per preset will grow
  IndexedDB rapidly.
- **Mitigation:** Content-addressable dedup in the assets store.
  Store file content by SHA-256 hash; `companionFiles` holds `{ filename: hash }`;
  a separate `assets` store maps `hash → content`. Two presets sharing the same
  screenshot share one stored copy.

---

## Implementation Checklist (future sprint)

- [ ] Add `schemaVersion: 3` detection to project loader
- [ ] Extend `PresetManager.savePreset()` to accept `companionFiles` argument
- [ ] Add `companionFiles` field to preset object on save
- [ ] Update WASM filesystem mount to merge project-level + preset-specific files
- [ ] Update companion files UI panel to show two-level list with badges
- [ ] Implement content-addressable asset dedup in IndexedDB layer
- [ ] Update ZIP export to write per-preset companion files
- [ ] Update ZIP import to read per-preset companion files
- [ ] Write unit tests: file resolution order, dedup, migration from v2
- [ ] Write E2E test: upload preset-specific screenshot, switch presets, verify different overlays
