"""
Phase 9: Preset Panel Rearrangement
Reorders .preset-content children to: Search, Sort, Select, Actions row
"""
import sys
import re

content = open('index.html', encoding='utf-8').read()
original = content

# ---------------------------------------------------------------------------
# Helper: extract a block starting at a known marker
# ---------------------------------------------------------------------------

def find_div_block(html, marker):
    """Return (start_idx, end_idx) of the <div...>...</div> containing marker."""
    idx = html.find(marker)
    if idx < 0:
        return None, None
    start = html.rfind('<div', 0, idx)
    depth = 0
    pos = start
    while pos < len(html):
        if html[pos:pos+4] == '<div':
            depth += 1
        elif html[pos:pos+6] == '</div>':
            depth -= 1
            if depth == 0:
                return start, pos + 6
        pos += 1
    return None, None

# ---------------------------------------------------------------------------
# 1. Extract each current block from preset-content
# ---------------------------------------------------------------------------

# preset-selector (contains presetSelect + preset-actions-group)
sel_start, sel_end = find_div_block(content, 'id="presetSelector"')
if sel_start is None:
    print("ERROR: preset-selector not found"); sys.exit(1)
old_selector = content[sel_start:sel_end]

# preset-sort-toolbar
sort_start, sort_end = find_div_block(content, 'id="presetSortToolbar"')
if sort_start is None:
    print("ERROR: preset-sort-toolbar not found"); sys.exit(1)
old_sort = content[sort_start:sort_end]

# preset-actions (contains managePresetsBtn)
actions_start, actions_end = find_div_block(content, 'id="managePresetsBtn"')
if actions_start is None:
    print("ERROR: managePresetsBtn not found"); sys.exit(1)
# We want the parent div (.preset-actions), not just the button
old_actions_outer = content[actions_start:actions_end]

print("STEP 1 OK: Extracted all 3 preset blocks")

# ---------------------------------------------------------------------------
# 2. Build new preset-content HTML
#
#    New order:
#    1. .preset-search  (new)
#    2. .preset-sort-toolbar  (from old_sort)
#    3. .preset-selector  (presetSelect only — actions-group moved out)
#    4. .preset-actions-row (preset-actions-group + managePresetsBtn)
# ---------------------------------------------------------------------------

# Extract the .preset-actions-group from inside old_selector
ag_start, ag_end = find_div_block(old_selector, 'preset-actions-group')
if ag_start is None:
    print("ERROR: preset-actions-group not found inside preset-selector")
    sys.exit(1)
actions_group_html = old_selector[ag_start:ag_end]

# Extract just the presetSelect (selector without the actions-group)
selector_without_group = old_selector[:ag_start] + old_selector[ag_end:]

# Extract just the managePresetsBtn button
btn_idx = old_actions_outer.find('<button')
btn_end_idx = old_actions_outer.find('</button>') + len('</button>')
manage_btn_html = old_actions_outer[btn_idx:btn_end_idx]

# 1. Search input (new)
SEARCH_BLOCK = (
    '<div class="preset-search">'
    '<label for="presetSearchInput" class="sr-only">Search presets</label>'
    '<input type="text" id="presetSearchInput" class="preset-search-input"'
    ' placeholder="Search presets..."'
    ' aria-describedby="presetSearchStatus" />'
    '<button id="presetSearchClear" class="btn-icon btn-icon-sm preset-search-clear"'
    ' aria-label="Clear search" hidden>&times;</button>'
    '<div id="presetSearchStatus" class="sr-only" role="status" aria-live="polite"></div>'
    '</div>'
)

# 2. Sort (unchanged)
SORT_BLOCK = old_sort

# 3. Selector (without actions-group)
SELECTOR_BLOCK = selector_without_group

# 4. Combined actions row
ACTIONS_ROW_BLOCK = (
    '<div class="preset-actions-row">'
    + actions_group_html
    + manage_btn_html
    + '</div>'
)

# Full new preset-content
NEW_PRESET_CONTENT = (
    '<div class="preset-content">'
    + SEARCH_BLOCK
    + SORT_BLOCK
    + SELECTOR_BLOCK
    + ACTIONS_ROW_BLOCK
    + '</div>'
)

print("STEP 2 OK: Built new preset-content HTML")

# ---------------------------------------------------------------------------
# 3. Find and replace the entire old preset-content block
# ---------------------------------------------------------------------------

pc_start, pc_end = find_div_block(content, 'class="preset-content"')
if pc_start is None:
    print("ERROR: preset-content not found")
    sys.exit(1)

content = content[:pc_start] + NEW_PRESET_CONTENT + content[pc_end:]
print("STEP 3 OK: Replaced preset-content block")

# ---------------------------------------------------------------------------
# 4. Write output
# ---------------------------------------------------------------------------

if content == original:
    print("\nERROR: No changes made!")
    sys.exit(1)

open('index.html', 'w', encoding='utf-8').write(content)
print("\nindex.html updated successfully")

# Verify
checks = [
    'presetSearchInput',
    'presetSearchClear',
    'presetSearchStatus',
    'presetSortToolbar',
    'presetSelect',
    'preset-actions-row',
    'savePresetBtn',
    'addPresetBtn',
    'deletePresetBtn',
    'managePresetsBtn',
]
for check in checks:
    count = content.count(check)
    status = "OK (x1)" if count == 1 else ("MISSING" if count == 0 else "WARNING x" + str(count))
    print(f"  {check}: {status}")
