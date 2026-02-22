"""Check if features guide panel updates landed correctly."""
content = open('index.html', encoding='utf-8').read()

checks = [
    ('Sort Designs heading', 'Sort Designs'),
    ('Import Modes heading', 'Import Modes'),
    ('Replace all text', 'Replace all'),
    ('Compatibility Analysis', 'Compatibility Analysis'),
    ('Parameter Group Visibility', 'Parameter Group Visibility'),
    ('Grid Size (Printer Bed)', 'Grid Size (Printer Bed)'),
    ('Console Warnings section', 'Console Warnings for Missing Files'),
    ('Live Region Announcements', 'Live Region Announcements'),
]
for label, s in checks:
    found = s in content
    idx = content.find(s)
    print(f'{"OK" if found else "MISSING"}: {label} (at {idx})')
