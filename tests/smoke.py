import json, pathlib, subprocess
root = pathlib.Path(__file__).resolve().parents[1]
m = json.loads((root/'manifest.json').read_text())
assert m['manifest_version'] == 3 and m['version'] == '0.5.0'
assert m['host_permissions'] == ['https://chatgpt.com/*', 'https://mission-signal.synovaq.org/*']
assert set(m['permissions']) == {'alarms', 'storage', 'tabs'}
assert m['content_scripts'][0]['matches'] == ['https://chatgpt.com/*']
for filename in ['background.js', 'content.js', 'popup.js', 'popup.html', 'popup.css', 'README.md']:
    assert (root / filename).stat().st_size > 100, filename
for filename in ['background.js', 'content.js', 'popup.js', 'mission.js']:
    source = (root/filename).read_text()
    assert 'eval(' not in source
    subprocess.run(['node', '--check', str(root/filename)], check=True)
print('Manifest, permissions, files and JS syntax: PASS')
