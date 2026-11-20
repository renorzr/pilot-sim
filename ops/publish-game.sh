#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
radio_stage=""
if [[ $# -gt 0 ]]; then
  if [[ $# -ne 2 || "$1" != "--radio-stage" ]]; then
    echo 'Usage: publish-game.sh [--radio-stage DIRECTORY]' >&2
    exit 2
  fi
  radio_stage="$(realpath -- "$2")"
  test -d "$radio_stage/radio"
  cmp -s "$radio_stage/durations.json" "$project_dir/game/src/comms/durations.json"
  cmp -s "$radio_stage/voice-version.json" "$project_dir/game/src/comms/voice-version.json"
  if [[ -f "$radio_stage/durations.en.json" ]]; then
    cmp -s "$radio_stage/durations.en.json" "$project_dir/game/src/comms/durations.en.json"
    cmp -s "$radio_stage/voice-version.en.json" "$project_dir/game/src/comms/voice-version.en.json"
  fi
fi
cd "$project_dir/game"
if [[ -n "$radio_stage" ]]; then
  PILOT_SIM_RADIO_ASSETS="$radio_stage/radio" npm run test:flight
else
  npm run test:flight
fi
npm run build
if [[ -n "$radio_stage" ]]; then
  # Overlay reviewed staged speech after Vite copies the current public assets.
  # Live clips remain intact until both tests and the build have succeeded.
  cp -a "$radio_stage/radio/." dist/client/assets/radio/
fi
cd "$project_dir"
# Keep the original designs and generated source assets. Publish the entry
# point last so clients never receive an index with missing JS/CSS files.
cp -a game/dist/client/assets/. public/assets/
install -m 644 game/dist/client/index.html public/index.html.next
mv public/index.html.next public/index.html
echo 'Published: https://flight.awsdev.renorzr.top/'
