"""Fix the Presets panel in the Features Guide - inject new sections."""
content = open('index.html', encoding='utf-8').read()

# Find the Advanced panel start - we'll insert before it
ADV_PANEL_SEARCH = 'id="featuresPanelAdvanced"'
adv_idx = content.find(ADV_PANEL_SEARCH)
if adv_idx == -1:
    print('ERROR: could not find featuresPanelAdvanced')
    raise SystemExit(1)

# Walk backwards to find the </div> that closes the Presets panel
# The HTML structure is: ...preset content...</div>...<div id="featuresPanelAdvanced"...
# We need to insert BEFORE the </div> that precedes the Advanced panel
close_div = content.rfind('</div>', 0, adv_idx)
print(f'Close </div> found at: {close_div}')
print(f'Context: {repr(content[close_div-100:close_div+50])}')

NEW_SECTIONS = (
    '            <h4>Sort Designs</h4>'
    '            <ul class="features-list">'
    '              <li><strong>Sort</strong> designs by name (A&#x2013;Z or Z&#x2013;A) or by date created/modified in the Manage Designs panel.</li>'
    '              <li>Sort preference is saved per browser session.</li>'
    '            </ul>'
    '            <h4>Import Modes</h4>'
    '            <ul class="features-list">'
    '              <li><strong>Merge</strong> &#x2014; add imported designs to your existing ones (default).</li>'
    '              <li><strong>Replace all</strong> &#x2014; delete all existing designs for the current model, then import. Always asks for confirmation.</li>'
    '            </ul>'
    '            <h4>Export Naming</h4>'
    '            <ul class="features-list">'
    '              <li>Single-design exports use the design name as the filename (e.g. <code>iPad Pro 11 LAMP layout.json</code>).</li>'
    '            </ul>'
    '            <h4>Compatibility Analysis</h4>'
    '            <ul class="features-list">'
    '              <li>When loading a design, the app compares its parameters against the current model&#x2019;s schema.</li>'
    '              <li>Hidden parameters are excluded from this check &#x2014; no false &#x201C;new&#x201D; or &#x201C;obsolete&#x201D; warnings.</li>'
    '            </ul>'
)

# Insert BEFORE the closing </div> of the presets panel
new_content = content[:close_div] + NEW_SECTIONS + content[close_div:]
open('index.html', 'w', encoding='utf-8').write(new_content)
print(f'Inserted {len(NEW_SECTIONS)} chars before position {close_div}')
