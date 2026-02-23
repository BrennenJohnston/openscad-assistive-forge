"""Find the features guide panel sections in index.html."""
content = open('index.html', encoding='utf-8').read()
panels = ['featuresPanelPresets', 'featuresPanelWorkflow', 'featuresPanelAdvanced', 'featuresPanelAccessibility']
for p in panels:
    idx = content.find(f'id="{p}"')
    if idx == -1:
        idx2 = content.find(p)
        occurrences = []
        pos = 0
        while True:
            found = content.find(p, pos)
            if found == -1:
                break
            occurrences.append(found)
            pos = found + 1
        print(f'{p}: found at positions {occurrences[:5]}')
        if len(occurrences) >= 2:
            print(f'  second occurrence: {repr(content[occurrences[1]:occurrences[1]+300])}')
    else:
        print(f'{p}: id= found at {idx}')
        print(f'  context: {repr(content[idx:idx+400])}')
