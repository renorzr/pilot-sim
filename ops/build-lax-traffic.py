"""Compatibility entry point for the shared offline airport road extractor."""
import runpy
from pathlib import Path

if __name__ == '__main__':
    runpy.run_path(str(Path(__file__).with_name('build-airport-traffic.py')))['main']()
