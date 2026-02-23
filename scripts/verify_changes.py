"""Verify key changes made during sprint implementation."""
checks = {
    'index.html': [
        'gridPresetSelect',
        'gridWidthInput',
        'gridHeightInput',
        'gridSizeHelp',
        'Designs (Presets)',
        'Parameter Group Visibility',
        'Console Warnings for Missing Files',
        'Grid Size (Printer Bed)',
        'Screenshot Reference Overlay',
        'Import Modes',
        'Sort Designs',
        'Live Region Announcements',
    ],
    'src/js/preset-manager.js': [
        'clearPresetsForModel',
        'getSortedPresets',
        'targetModelName',
        'hiddenParameterNames',
        'stripHidden',
        'hiddenSet',
    ],
    'src/js/preview.js': [
        'STORAGE_KEY_GRID_SIZE',
        'DEFAULT_GRID_CONFIG',
        'gridConfig',
        'setGridSize',
        'getGridSize',
        '_createGridHelper',
        'loadGridSizePreference',
        'fitOverlayToScreenDimensions',
    ],
    'src/js/download.js': [
        'sanitizeFilename',
    ],
    'src/js/render-controller.js': [
        "case 'CONSOLE'",
        'updateConsoleOutput',
    ],
    'src/main.js': [
        'sanitizeFilename(preset.name)',
        'clearPresetsForModel',
        'applyHiddenGroups',
        'autoApplyScreenDimensionsFromParams',
        'fitOverlayToScreenDimensions',
        'overlayTabletSelect',
        'loadTabletDb',
        'gridPresetSelect',
        'importMode',
        'importModeDialog',
        'currentSortOrder',
        'getSortedPresets',
        '[OpenSCAD output]',
        'param-groups-show-all',
    ],
    'pixi.toml': [
        'description = "Start Vite dev server',
        'validate:html',
    ],
    'MAINTAINERS.md': [
        'Maintainer Expectations',
        'Conventional Commits',
    ],
    'tests/e2e/tutorials.spec.js': [
        'assertNoSpotlightPanelOverlap',
        'failure recovery',
        'infinite retry',
    ],
    'public/data/tablets.json': [
        'ipad-pro-11-m4',
        'screenWidthMm',
    ],
    'docs/design-d1-preset-companion-files.md': [
        'companionFiles',
        'schemaVersion',
        'content-addressable',
    ],
}

all_ok = True
for filename, strings in checks.items():
    try:
        content = open(filename, encoding='utf-8').read()
    except FileNotFoundError:
        print(f'MISSING FILE: {filename}')
        all_ok = False
        continue
    for s in strings:
        found = s in content
        status = 'OK' if found else 'MISSING'
        if not found:
            all_ok = False
        print(f'  [{status}] {filename}: {s!r}')

print()
print('All checks passed!' if all_ok else 'SOME CHECKS FAILED — review above.')
