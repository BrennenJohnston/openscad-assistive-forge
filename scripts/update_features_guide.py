"""Update Features Guide modal tab panel content in index.html."""
import re

content = open('index.html', encoding='utf-8').read()

# ── Presets tab: add sort, import modes, export naming, compatibility sections ──
PRESETS_SEARCH = '<h3>Parameter Presets</h3>            <p>              Save and load your favorite parameter configurations to quickly              switch between different variations of your model.            </p>'
PRESETS_NEW = (
    '<h3>Designs (Presets)</h3>'
    '            <p>'
    '              Save and load your favourite design configurations to quickly'
    '              switch between different variations of your model.'
    '            </p>'
)
content = content.replace(PRESETS_SEARCH, PRESETS_NEW, 1)

# Find end of Presets panel (start of Advanced panel) and insert new sections before
PRESETS_APPEND_ANCHOR = 'id="featuresPanelAdvanced"'
PRESETS_NEW_SECTIONS = (
    '            <h4>Sort Designs</h4>'
    '            <ul class="features-list">'
    '              <li><strong>Sort</strong> designs by name (A\u2013Z or Z\u2013A) or by date created/modified in the Manage Designs panel.</li>'
    '              <li>Sort preference is saved per browser session.</li>'
    '            </ul>'
    '            <h4>Import Modes</h4>'
    '            <ul class="features-list">'
    '              <li><strong>Merge</strong> \u2014 add imported designs to your existing ones (default).</li>'
    '              <li><strong>Replace all</strong> \u2014 delete all existing designs for the current model, then import. Always asks for confirmation.</li>'
    '            </ul>'
    '            <h4>Export Naming</h4>'
    '            <ul class="features-list">'
    '              <li>Single-design exports use the design name as the filename (e.g. <code>iPad Pro 11 LAMP layout.json</code>).</li>'
    '            </ul>'
    '            <h4>Compatibility Analysis</h4>'
    '            <ul class="features-list">'
    '              <li>When loading a design, the app compares its parameters against the current model\u2019s schema.</li>'
    '              <li>Hidden parameters are excluded from this check \u2014 no false "new" or "obsolete" warnings.</li>'
    '            </ul>'
    '          </div>          <div '
)
# Replace the transition between Presets panel end and Advanced panel start
content = content.replace(
    '          </div>          <div            id="featuresPanelAdvanced"',
    PRESETS_NEW_SECTIONS,
    1
)

# ── Advanced tab: add parameter group visibility section ──
ADV_ANCHOR = '<h3>Advanced Features</h3>            <h4>Parameter Search &amp; Jump</h4>'
ADV_NEW = (
    '<h3>Advanced Features</h3>'
    '            <h4>Parameter Group Visibility</h4>'
    '            <ul class="features-list">'
    '              <li>Each parameter group header has a <strong>Hide group</strong> (\u00d7) button. Click it to remove the group from view.</li>'
    '              <li>A <strong>Show all</strong> link appears at the bottom of the panel, showing how many groups are hidden.</li>'
    '              <li>Hidden groups are remembered per model in localStorage.</li>'
    '              <li>Keyboard: Tab to the \u00d7 button and press Space/Enter; Tab to "Show all" to restore.</li>'
    '            </ul>'
    '            <h4>Parameter Search &amp; Jump</h4>'
)
content = content.replace(ADV_ANCHOR, ADV_NEW, 1)

# ── Workflow tab: add grid size and overlay sections ──
WF_ANCHOR = '<h3>Workflow &amp; Actions</h3>'
WF_NEW = (
    '<h3>Workflow &amp; Actions</h3>'
    '            <h4>Grid Size (Printer Bed)</h4>'
    '            <ul class="features-list">'
    '              <li>Open <strong>Preview Settings</strong> and use the <strong>Grid size</strong> controls to match your printer bed dimensions.</li>'
    '              <li>Choose from common presets (Ender 3, Prusa MK4, CR-10, large format) or enter custom mm values.</li>'
    '              <li>The grid updates immediately and the setting is remembered across sessions.</li>'
    '            </ul>'
    '            <h4>Screenshot Reference Image</h4>'
    '            <ul class="features-list">'
    '              <li>Include a <code>screenshot.png</code> in your ZIP project and it is automatically loaded as a reference overlay behind your keyguard in the 3D preview.</li>'
    '              <li>Choose a tablet from the <strong>Size to device</strong> dropdown to snap the overlay to known screen dimensions.</li>'
    '              <li>If your SCAD file has <code>screen_width_mm</code> and <code>screen_height_mm</code> parameters, the overlay resizes automatically when you load the model.</li>'
    '            </ul>'
)
content = content.replace(WF_ANCHOR, WF_NEW, 1)

# ── Accessibility tab: add console warnings and new announcements ──
A11Y_ANCHOR = '<h3>Accessibility Features</h3>            <p>              The UI is built to support keyboard-only use, screen readers,              voice control, and low-vision needs.            </p>            <h4>Keyboard &amp; Focus</h4>'
A11Y_NEW = (
    '<h3>Accessibility Features</h3>'
    '            <p>'
    '              The UI is built to support keyboard-only use, screen readers,'
    '              voice control, and low-vision needs.'
    '            </p>'
    '            <h4>Console Warnings for Missing Files</h4>'
    '            <ul class="features-list">'
    '              <li>When a model uses <code>include &lt;file.txt&gt;</code> but the file is missing, the <strong>Console</strong> panel surfaces the warning immediately.</li>'
    '              <li>A badge count on the Console button updates, and a live region announces the warning to screen readers.</li>'
    '              <li>Filter by Warnings in the Console panel to see only relevant messages.</li>'
    '            </ul>'
    '            <h4>Live Region Announcements</h4>'
    '            <ul class="features-list">'
    '              <li><strong>Designs sorted</strong>: announced when sort order changes in the Manage panel.</li>'
    '              <li><strong>Group hidden / shown</strong>: announced when parameter groups are hidden or shown.</li>'
    '              <li><strong>Grid size updated</strong>: announced when the printer bed dimensions change.</li>'
    '              <li><strong>Overlay sized</strong>: announced when the reference overlay is resized to a tablet device.</li>'
    '            </ul>'
    '            <h4>Keyboard &amp; Focus</h4>'
)
content = content.replace(A11Y_ANCHOR, A11Y_NEW, 1)

open('index.html', 'w', encoding='utf-8').write(content)
print('Features Guide updated successfully.')
