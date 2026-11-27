# Recorded radio phrases

Routine radio uses reusable phrase recordings in both languages and all five
approved Chinese voices. A recipe retains the exact dialogue text, speaker,
ordered phrase IDs, measured duration and a content fingerprint. Callsigns are
complete phrases; digits are not spliced individually. Continuing and sentence
ending intonation use different entries, and recordings are not shared between
pilot and controller roles. Emergency declarations, safety callouts and historical
performances retain their complete recordings.

`game/src/comms/phrase-catalogue.json` contains recipes and asset identities.
`phrases.js` resolves the selected language and actor without substituting voices.
`phrase-audio.js` downloads mono 24 kHz PCM WAVs, caches shared fragments and
concatenates their samples with 90 ms Chinese / 70 ms English gaps. Speech is
never sped up to fit a transmission. The result plays through the existing media
element and VHF effects as one continuous recording, with one PTT envelope.
Cockpit/exterior changes adjust only the live filter.

The player prepares active/pending transmissions and the selected airport's
routine radio in advance. Shared PCM and assembled audio each have a 16 MiB LRU
budget; the latter also has a 40-recording limit. The current recording is pinned.
Both caches live for the audio session and are released on disposal. Download or
format errors cannot produce partial speech: the player uses a complete fallback
for that entire transmission, without switching midway. For migrated recipes,
this fallback is encoded from the same shared phrases in advance, so cold and
warm playback retain the same delivery. Uncertain source cuts retain the complete
approved take. The queue reserves the longest measured performance. Late download
completion cannot replace a current line. Pause, time acceleration, ducking,
language changes and replay seek still use the same media clock.

Live recordings retain the audio selection as ephemeral `audioSource` metadata;
replay keeps a complete take when that was the performance originally heard.
These choices do not alter aircraft physics or persist the flight recording.
Playback diagnostics expose assembly mode, phrase count and cache byte usage.

## Authoring

To migrate existing approved performances, run
`node ops/export-radio-phrase-sources.mjs`, then
`python ops/build-radio-phrases.py`. Authoring needs FFmpeg, NumPy and
faster-whisper with the tiny/base multilingual models. ASR aligns known text;
cuts prefer quiet phrase boundaries with short fades. Low-confidence boundaries
retain the original complete performance. Source hashes invalidate alignment
caches under ignored `qa/radio-production/`. No ASR, TTS or credentials are used
by the game or a normal checkout's tests/build.

Approved LGA/JFK phrase cuts and independent donor takes are retained in the
formal phrase pack with source hashes and cut ranges. The temporary audition
page, its assets and its one-time import tools have been retired.
`node ops/compile-radio-phrase-fallbacks.mjs` encodes complete cold-start
fallbacks from the same shared samples, deduplicated by recipe and content.

New combinations can use `node ops/compose-radio-phrase-recipes.mjs recipes.json`.
Input is an array with `clip`, `group`, `language`, `actor`, `role`, `text`,
`parts` (reviewed phrase IDs) and optional `gapMs`. The tool validates text and
speaker consistency, builds a complete fallback from the same phrase samples,
and updates the catalogue fingerprint. A new combination requires no new
whole-sentence performance. Record missing airport/clearance/callsign phrases
in context first and review their cuts; do not split individual digits or borrow
another speaker. Register the dialogue in the corresponding bilingual script.
The legacy voice check accepts complete phrase recipes, so adding an airport
does not require a second set of whole-sentence recordings.

`node ops/check-radio-phrases.mjs` verifies coverage, speaker/text consistency,
durations and all source/audio hashes. It runs before normal tests/builds;
`game/tests/radio-phrases.test.mjs` covers PCM, cache lifetime, failure, playback
continuity and replay metadata. Keep original source files and historical hashed
assets while open sessions or fallback recipes still reference them.
