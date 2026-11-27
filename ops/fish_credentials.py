"""Read the local Fish Audio key without exposing it in output or arguments."""
import getpass
from pathlib import Path
import sys

CREDENTIAL_FILE = Path(__file__).resolve().parents[1] / '.secrets' / 'fish-audio.key'


def load_fish_credential(*, stdin=False, prompt=False, required=False):
    if stdin:
        value = sys.stdin.readline().strip()
    elif prompt:
        value = getpass.getpass('Fish Audio API key (hidden): ').strip()
    else:
        try:
            value = CREDENTIAL_FILE.read_text(encoding='utf-8').strip()
        except FileNotFoundError:
            value = ''
    if required and not value:
        raise SystemExit('Missing Fish credential: save it in .secrets/fish-audio.key or use --fish-stdin.')
    return value or None
