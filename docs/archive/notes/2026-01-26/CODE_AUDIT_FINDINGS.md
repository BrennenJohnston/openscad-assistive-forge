# Code Audit - Jan 26, 2026

Quick pass through `src/js` to see what's unused or could use cleanup.

## What I found

**Unused exports (18 total)** - Most are test-only or internal helpers. Not a big deal.

A few examples:
- `ui-generator.js` has 10 exports that are only used in tests or internally
- `modal-manager.js` has 3 test-only exports
- The new schema-related exports (`renderFromSchema`, etc.) aren't integrated yet

**Duplicate patterns** - Same code repeated in multiple places:
- `param.name.replace(/_/g, ' ')` appears 23 times → added `formatParamName()` helper
- All 7 control creation functions repeat ~15 lines of label setup
- localStorage try-catch patterns in 4 files

**Verbose sections** - Could be split up eventually:
- `parser.js` `extractParameters()` is 312 lines
- `preview.js` `PreviewManager` is 1,830 lines

## What I did

- Added `formatParamName()` helper (done)
- Noted the rest for future cleanup

## Low priority stuff

The "unused" exports for test-only classes (`StateManager`, `ThemeManager`) are intentional for unit testing. The internal-only exports are fine to leave exported for now.

If the codebase grows, might be worth:
- Extracting `createLabelContainer()` helper
- Creating a localStorage utility module
- Splitting `PreviewManager` into smaller pieces

Not urgent.
