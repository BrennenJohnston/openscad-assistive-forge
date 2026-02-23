"""
Phase 8: Customizer Panel Header Parity
Moves autoPreviewToggle, paramDetailLevel, and resetAllBtn into a
new .customizer-header-row above the parameter search section.
"""
import sys
import re

content = open('index.html', encoding='utf-8').read()
original = content

# ---------------------------------------------------------------------------
# 1. New customizer-header-row HTML
# ---------------------------------------------------------------------------

NEW_HEADER_ROW = (
    '<div class="customizer-header-row">'
    '<label class="customizer-header-control" for="autoPreviewToggle">'
    '<input type="checkbox" id="autoPreviewToggle" /> Automatic Preview'
    '</label>'
    '<label for="paramDetailLevel" class="sr-only">Show Details</label>'
    '<select id="paramDetailLevel" class="customizer-header-select"'
    ' aria-label="Parameter detail level">'
    '<option value="show">Show Details</option>'
    '<option value="inline">Inline Details</option>'
    '<option value="hide" selected>Hide Details</option>'
    '<option value="desc-only">Description Only</option>'
    '</select>'
    '<button id="resetAllBtn" class="btn btn-sm btn-outline"'
    ' aria-label="Reset all parameters to defaults"'
    ' title="Reset all parameters to defaults">'
    ' Reset All'
    '</button>'
    '</div>'
)

# ---------------------------------------------------------------------------
# 2. Remove autoPreviewToggle from preview-settings
# ---------------------------------------------------------------------------

auto_prev_pattern = (
    r'<label\s+class="preview-setting"\s*>'
    r'\s*<input\s+type="checkbox"\s+id="autoPreviewToggle"[^>]*/>'
    r'\s*<span>Auto-preview</span>'
    r'\s*</label>'
)
if re.search(auto_prev_pattern, content, re.DOTALL):
    content = re.sub(auto_prev_pattern, '', content, count=1, flags=re.DOTALL)
    print("STEP 2 OK: Removed autoPreviewToggle from preview-settings")
else:
    # Fallback: find the exact literal string from a grep
    idx = content.find('id="autoPreviewToggle"')
    if idx >= 0:
        # find surrounding label start
        label_start = content.rfind('<label', 0, idx)
        label_end = content.find('</label>', idx) + len('</label>')
        content = content[:label_start] + content[label_end:]
        print("STEP 2 OK: Removed autoPreviewToggle (fallback literal)")
    else:
        print("STEP 2 ERROR: autoPreviewToggle not found!")

# ---------------------------------------------------------------------------
# 3. Remove resetAllBtn from reset-tools
# ---------------------------------------------------------------------------

idx_r = content.find('id="resetAllBtn"')
if idx_r >= 0:
    btn_start = content.rfind('<button', 0, idx_r)
    btn_end = content.find('</button>', idx_r) + len('</button>')
    content = content[:btn_start] + content[btn_end:]
    print("STEP 3 OK: Removed resetAllBtn from reset-tools")
else:
    print("STEP 3 ERROR: resetAllBtn not found!")

# ---------------------------------------------------------------------------
# 4. Remove .param-detail-wrapper from param-search-row
# ---------------------------------------------------------------------------

idx_d = content.find('param-detail-wrapper')
if idx_d >= 0:
    div_start = content.rfind('<div', 0, idx_d)
    div_end = content.find('</div>', idx_d) + len('</div>')
    content = content[:div_start] + content[div_end:]
    print("STEP 4 OK: Removed param-detail-wrapper from param-search-row")
else:
    print("STEP 4 ERROR: param-detail-wrapper not found!")

# ---------------------------------------------------------------------------
# 5. Insert customizer-header-row before param-search-section
# ---------------------------------------------------------------------------

marker = '<!-- Parameter Search and Navigation'
if marker in content:
    insert_pos = content.find(marker)
    content = content[:insert_pos] + NEW_HEADER_ROW + content[insert_pos:]
    print("STEP 5 OK: Inserted customizer-header-row before param-search-section comment")
else:
    pss_marker = 'class="param-search-section"'
    if pss_marker in content:
        pss_pos = content.find(pss_marker)
        div_start = content.rfind('<div', 0, pss_pos)
        content = content[:div_start] + NEW_HEADER_ROW + content[div_start:]
        print("STEP 5 OK: Inserted customizer-header-row before param-search-section div")
    else:
        print("STEP 5 ERROR: Cannot find insertion point!")

# ---------------------------------------------------------------------------
# 6. Write output
# ---------------------------------------------------------------------------

if content == original:
    print("\nERROR: No changes made!")
    sys.exit(1)

open('index.html', 'w', encoding='utf-8').write(content)
print("\nindex.html updated successfully")

# Verify
checks = [
    ('customizer-header-row', "customizer-header-row"),
    ('id="autoPreviewToggle"', "autoPreviewToggle"),
    ('id="paramDetailLevel"', "paramDetailLevel"),
    ('id="resetAllBtn"', "resetAllBtn"),
    ('customizer-header-select', "customizer-header-select"),
]
for check, label in checks:
    count = content.count(check)
    status = "OK (x1)" if count == 1 else ("MISSING" if count == 0 else "WARNING x" + str(count))
    print(f"  {label}: {status}")
