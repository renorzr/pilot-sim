"""Package already-generated Fish clips for the isolated public audition page."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import wave

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / 'qa/fish-pilot-voices'
OUT = ROOT / 'public/assets/pilot-voices/fish'
TRIM = 'silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:start_silence=0.025,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:start_silence=0.04,areverse'
VOICES = [
    ('e', '温和日常男声', '41aafb356afe4d46925ab37fbb588c79'),
    ('f', '阿土', '5a4ed7bcea924e5faef14ceb537d56ec'),
    ('g', '从容雅致男声', '0a86f2f473514783a93b37dad673613e'),
    ('h', 'Jimmy 男中音', '09f2e5951ea543319af82e7d2219a92c'),
    ('i', '林晓夜', '0781bfe5e1984e8385dcddf123d7c933'),
    ('j', '金', '048222d36be842f199ec8ac71993dce4'),
]
SR, GAP, BODY_GAP = 24000, .08, .12


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', *map(str, args)], check=True)


def duration(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(path)]))


def pcm_duration(path):
    with wave.open(str(path)) as audio:
        return audio.getnframes() / audio.getframerate()


def source(id_, kind):
    return max((CACHE / 'raw').glob(f'fish-{id_}-{kind}-*.mp3'), key=lambda p: p.stat().st_mtime)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--voices', nargs='+', choices=[voice[0] for voice in VOICES], help='Render selected candidates and preserve existing auditions')
    args = parser.parse_args()
    (OUT / 'clips').mkdir(parents=True, exist_ok=True)
    (CACHE / 'render').mkdir(exist_ok=True)
    old = json.loads((ROOT / 'public/assets/pilot-voices/manifest.json').read_text())
    continuous_path = ROOT / 'ops/assets/pilot-voices/audition-continuous.json'
    continuous = json.loads(continuous_path.read_text()) if continuous_path.exists() else {}
    catalog = {}
    for path in CACHE.glob('models-*.json'):
        for item in json.loads(path.read_text()).get('items', []):
            catalog[item['_id']] = item
    voices = []
    for id_, name, reference_id in VOICES:
        if args.voices and id_ not in args.voices:
            continue
        entry = catalog[reference_id]
        gender = '女声' if id_ in ['i', 'j'] else '男声'
        assert entry['licensed'] and ('female' if gender == '女声' else 'male') in entry['tags'] and 'zh' in entry['languages']
        clips = {}
        requests = {}
        for kind in ['normal', 'mayday', 'pan']:
            selected = continuous.get(id_, {}).get(kind)
            if selected:
                body_source = ROOT / 'ops/assets/pilot-voices' / selected['file']
                assert hashlib.sha256(body_source.read_bytes()).hexdigest() == selected['sha256']
                request = selected
                assert selected['groups'] == 3
            else:
                body_source = source(id_, 'normal' if kind == 'normal' else kind + '-body')
                request = json.loads(body_source.with_suffix('.json').read_text())
            assert request['payload']['reference_id'] == reference_id
            requests[kind] = request
            body = CACHE / 'render' / f'{id_}-{kind}-body.wav'
            edit = selected.get('edit') if selected else None
            if edit:
                tempo = float(edit['tempo'])
                assert .5 <= tempo <= 2
                # Times refer to the pinned source. Retain the original speech,
                # removing only measured silence between declaration groups.
                ranges, start = [], 0.
                for left, right in edit['removeSilences']:
                    assert start < left < right < duration(body_source)
                    ranges.append((start, left))
                    start = right
                ranges.append((start, None))
                count = len(ranges)
                graph = '[0:a]asplit=' + str(count) + ''.join(f'[s{i}]' for i in range(count)) + ';'
                for i, (left, right) in enumerate(ranges):
                    trim = f'atrim=start={left}' + (f':end={right}' if right is not None else '')
                    graph += f'[s{i}]{trim},asetpts=PTS-STARTPTS[a{i}];'
                graph += ''.join(f'[a{i}]' for i in range(count)) + f'concat=n={count}:v=0:a=1,atempo={tempo},{TRIM}[out]'
                ffmpeg('-i', body_source, '-filter_complex', graph, '-map', '[out]', '-ar', SR, '-ac', 1, body)
            else:
                ffmpeg('-i', body_source, '-af', TRIM, '-ar', SR, '-ac', 1, body)
            assembled, signal = body, None
            if selected:
                signal = {'units': 3, 'layout': 'continuous-signal-and-report', 'tempo': edit['tempo'] if edit else 1., 'source': str(body_source.relative_to(ROOT)), 'sha256': selected['sha256']}
                if edit:
                    signal['removedSilences'] = edit['removeSilences']
            elif kind != 'normal':
                prefix_source = source(id_, kind + '-prefix')
                assert json.loads(prefix_source.with_suffix('.json').read_text())['payload']['reference_id'] == reference_id
                trimmed = CACHE / 'render' / f'{id_}-{kind}-prefix-trimmed.wav'
                ffmpeg('-i', prefix_source, '-af', TRIM, '-ar', SR, '-ac', 1, trimmed)
                tempo = max(1., pcm_duration(trimmed) / 2.4)
                prefix = CACHE / 'render' / f'{id_}-{kind}-prefix.wav'
                ffmpeg('-i', trimmed, '-af', f'atempo={tempo:.8f}', '-ar', SR, '-ac', 1, prefix)
                signal = {'units': 3, 'layout': 'native-three-groups', 'bodyGap': BODY_GAP, 'tempo': tempo, 'reference': str(prefix.relative_to(ROOT)), 'prefixEnd': pcm_duration(prefix), 'source': str(prefix_source.relative_to(ROOT))}
                assert signal['prefixEnd'] < 2.5
                assembled = CACHE / 'render' / f'{id_}-{kind}-assembled.wav'
                graph = f'anullsrc=r={SR}:cl=mono:d={BODY_GAP}[gap];[0:a][gap][1:a]concat=n=3:v=0:a=1[out]'
                ffmpeg('-i', prefix, '-i', body, '-filter_complex', graph, '-map', '[out]', '-ar', SR, '-ac', 1, assembled)
            variants = {}
            for mode in ['clean', 'radio']:
                target = OUT / 'clips' / f'{id_}-{kind}-{mode}.mp3'
                filters = ('highpass=f=300,lowpass=f=3300,' if mode == 'radio' else '') + 'loudnorm=I=-18:TP=-2:LRA=7'
                ffmpeg('-i', assembled, '-af', filters, '-ar', SR, '-ac', 1, '-b:a', '64k', target)
                variants[mode] = {'url': 'clips/' + target.name, 'duration': round(duration(target), 3), 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
            clips[kind] = {'variants': variants, 'signal': signal}
        voices.append({'id': id_, 'label': id_.upper(), 'name': name, 'gender': gender, 'locale': '普通话', 'provider': 'fish', 'voice': reference_id, 'sourceTitle': entry['title'], 'sourceUrl': 'https://fish.audio/app/text-to-speech/?modelId=' + reference_id, 'licensed': True, 'model': requests['normal']['model'], 'clips': clips})
        print(name, 'ready', flush=True)
    if args.voices and (OUT / 'manifest.json').exists():
        previous = json.loads((OUT / 'manifest.json').read_text())
        existing = [voice for voice in previous['voices'] if not voice.get('current')]
        replacements = {voice['id']: voice for voice in voices}
        existing_ids = {voice['id'] for voice in existing}
        voices = [voice for voice in voices if voice['id'] not in existing_ids] + [replacements.get(voice['id'], voice) for voice in existing]
    current = next(voice for voice in old['voices'] if voice.get('current'))
    current = json.loads(json.dumps(current))
    for clip in current['clips'].values():
        for variant in clip['variants'].values():
            variant['url'] = '../' + variant['url']
    models = sorted({voice['model'] for voice in voices})
    manifest = {'version': 1, 'provider': 'fish', 'model': models[0] if len(models) == 1 else 'mixed', 'models': models, 'scripts': old['scripts'], 'voices': [*voices, current], 'productionChanged': False}
    manifest['fingerprint'] = hashlib.sha256(json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
    temporary = OUT / 'manifest.json.next'
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(OUT / 'manifest.json')


if __name__ == '__main__':
    main()
