"""Compatibility entrypoint for the portable Node/Playwright browser suite."""
import pathlib
import subprocess
raise SystemExit(subprocess.call(['node', str(pathlib.Path(__file__).with_name('browser.test.cjs'))]))
