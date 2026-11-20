# Third-party notices

Pilot Sim's original source code, scripts, dialogue and documentation are
licensed under [MIT](LICENSE). Third-party packages retain their own licenses.
The repository does not vendor `node_modules` or speech-generation tools.

## JavaScript dependencies

Versions below are the versions currently recorded in `game/package-lock.json`.

| Package | Version | License | Notice |
| --- | --- | --- | --- |
| [React](https://github.com/facebook/react) | 19.2.0 | MIT | [License text](LICENSES/react-MIT.txt) |
| [React DOM](https://github.com/facebook/react) | 19.2.0 | MIT | [License text](LICENSES/react-dom-MIT.txt) |
| [Three.js](https://github.com/mrdoob/three.js) | 0.187.0 | MIT | [License text](LICENSES/three-MIT.txt) |
| [Phosphor Icons React](https://github.com/phosphor-icons/react) | 2.1.10 | MIT | [License text](LICENSES/phosphor-icons-MIT.txt) |
| [Vite](https://github.com/vitejs/vite) | 6.4.2 | MIT, with bundled dependency notices | [License text](LICENSES/vite-LICENSE.md) |
| [Vite React plugin](https://github.com/vitejs/vite-plugin-react) | 5.0.4 | MIT | [License text](LICENSES/vite-plugin-react-MIT.txt) |

Transitive dependency licenses accompany their npm packages. Preserve the
relevant notices when redistributing dependencies or a bundled application.

## Generated media and optional tools

- Raster images were generated for this project; their provenance and roles
  are listed in [ASSETS.md](ASSETS.md). No stock cockpit photograph, geographic
  dataset or real airport model is included.
- Dialogue text was authored for the game. Included MP3 files are synthesized
  speech, rather than recordings of real pilots, controllers or radio traffic.
- [edge-tts](https://github.com/rany2/edge-tts) is an optional generation tool
  using Microsoft Edge's online speech service. Its upstream software license
  and the speech provider's terms remain separate from this project's license.
  No voice model or provider software is distributed or relicensed here.
- FFmpeg and optional espeak-ng are separately installed generation tools;
  their binaries are not included in this repository.

Airbus names and avionics abbreviations describe the project's inspiration.
No affiliation, certification or endorsement is implied.
