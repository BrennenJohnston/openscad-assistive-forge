"""One-shot script: inserts grid-size controls into index.html after the autoBed help span."""
import sys

HTML_FILE = 'index.html'
SEARCH = '>Automatically place models on the build plate at Z                        equals zero</span                      >'

INSERT = (
    '                      <div class="preview-setting-group" role="group" aria-labelledby="gridSizeLabel">'
    '                        <span id="gridSizeLabel" class="preview-setting-group-label">Grid size</span>'
    '                        <label class="preview-setting-inline">'
    '                          <span>Preset</span>'
    '                          <select id="gridPresetSelect" aria-label="Printer bed preset">'
    '                            <option value="220x220">220 x 220 mm (Ender 3)</option>'
    '                            <option value="256x256">256 x 256 mm (Prusa MK4)</option>'
    '                            <option value="235x235">235 x 235 mm (Ender 3 V2)</option>'
    '                            <option value="300x300">300 x 300 mm (CR-10)</option>'
    '                            <option value="350x350">350 x 350 mm (Large format)</option>'
    '                            <option value="custom">Custom...</option>'
    '                          </select>'
    '                        </label>'
    '                        <label class="preview-setting-inline">'
    '                          <span>Width (mm)</span>'
    '                          <input type="number" id="gridWidthInput" min="50" max="500" value="220" aria-describedby="gridSizeHelp" />'
    '                        </label>'
    '                        <label class="preview-setting-inline">'
    '                          <span>Height (mm)</span>'
    '                          <input type="number" id="gridHeightInput" min="50" max="500" value="220" />'
    '                        </label>'
    '                        <span id="gridSizeHelp" class="sr-only">Enter printer bed dimensions in millimetres to set the grid size</span>'
    '                      </div>'
)

content = open(HTML_FILE, encoding='utf-8').read()
if 'gridPresetSelect' in content:
    print('Already inserted, skipping.')
    sys.exit(0)
end_idx = content.find(SEARCH)
if end_idx == -1:
    print('ERROR: search string not found', file=sys.stderr)
    sys.exit(1)
end_idx += len(SEARCH)
new_content = content[:end_idx] + INSERT + content[end_idx:]
open(HTML_FILE, 'w', encoding='utf-8').write(new_content)
print(f'Done. Inserted {len(INSERT)} chars at position {end_idx}.')
