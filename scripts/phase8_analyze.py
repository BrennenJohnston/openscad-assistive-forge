import sys

content = open('index.html', encoding='utf-8').read()

# Show context around paramSearchSection and autoPreviewToggle
idx1 = content.find('paramSearchSection')
idx2 = content.find('autoPreviewToggle')

# Get the full autoPreviewToggle label context (including the parent label element)
preview_start = content.rfind('<label', 0, idx2)
preview_end = content.find('</label>', idx2) + len('</label>')
print("=== autoPreviewToggle label element ===")
sys.stdout.buffer.write(content[preview_start:preview_end].encode('utf-8', errors='replace'))
print()

# Get the resetAllBtn and its surrounding wrapper
idx3 = content.find('resetAllBtn')
reset_start = content.rfind('<button', 0, idx3)
reset_end = content.find('</button>', idx3) + len('</button>')
print("\n=== resetAllBtn button element ===")
sys.stdout.buffer.write(content[reset_start:reset_end].encode('utf-8', errors='replace'))
print()

# Get the reset-tools div
idx4 = content.find('reset-tools')
rt_start = content.rfind('<div', 0, idx4)
rt_end = content.find('</div>', idx4)
print("\n=== reset-tools div ===")
sys.stdout.buffer.write(content[rt_start:rt_end + len('</div>')].encode('utf-8', errors='replace'))
print()

# Show what's in param-search-row
idx5 = content.find('param-search-row')
ps_start = content.rfind('<div', 0, idx5)
# Find the closing div of param-search-row
depth = 0
pos = ps_start
while pos < len(content):
    if content[pos:pos+4] == '<div':
        depth += 1
    elif content[pos:pos+6] == '</div>':
        depth -= 1
        if depth == 0:
            break
    pos += 1
ps_end = pos + 6
print("\n=== Full param-search-row div ===")
sys.stdout.buffer.write(content[ps_start:ps_end].encode('utf-8', errors='replace'))
print()
