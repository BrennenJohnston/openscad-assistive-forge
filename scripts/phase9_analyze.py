import sys
content = open('index.html', encoding='utf-8').read()

MARKER = 'preset-content'
idx = content.find(MARKER)
start = content.rfind('<div', 0, idx)
depth = 0
pos = start
while pos < len(content):
    if content[pos:pos+4] == '<div':
        depth += 1
    elif content[pos:pos+6] == '</div>':
        depth -= 1
        if depth == 0:
            break
    pos += 1
end = pos + 6
snippet = content[start:end]
sys.stdout.buffer.write(snippet.encode('utf-8', errors='replace'))
