"""Generate complete E/G/H Chinese pilot packs without touching live radio.

The credential is read once from hidden stdin. API responses and intermediate
audio stay in qa/; the reviewed manifest/assets can then be published together.
"""
import argparse
import concurrent.futures
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
STAGE = ROOT / 'qa/fish-pilot-production'
MODEL = 's2.1-pro'
FILTER = 'highpass=f=300,lowpass=f=3300,loudnorm=I=-18:TP=-2:LRA=7'
TRIM = 'silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:start_silence=0.025,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:start_silence=0.04,areverse'
SIGNALS = {'MAYDAY, MAYDAY, MAYDAY.': 'mayday', 'PAN PAN, PAN PAN, PAN PAN.': 'pan'}
VOICES = {
    'e': {'label': 'E', 'name': '温和日常男声', 'referenceId': '41aafb356afe4d46925ab37fbb588c79'},
    'g': {'label': 'G', 'name': '从容雅致男声', 'referenceId': '0a86f2f473514783a93b37dad673613e'},
    'h': {'label': 'H', 'name': 'Jimmy 男中音', 'referenceId': '09f2e5951ea543319af82e7d2219a92c'},
}


def pilot_lines():
    result = {}
    for path in [ROOT / 'game/src/comms/script.json', *sorted((ROOT / 'game/src/comms').glob('*-radio.json'))]:
        data = json.loads(path.read_text())
        prefix = path.name.removesuffix('-radio.json') + '-' if 'zh' in data else ''
        for event, lines in data.get('zh', data).items():
            if not isinstance(lines, list):
                continue
            for index, pair in enumerate(lines):
                if isinstance(pair, list) and len(pair) == 2 and pair[0] == 'pilot':
                    result[f'{prefix}{event}-{index}'] = pair[1]
    return result


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', *map(str, args)], check=True)


def direction(voice, signal):
    if voice == 'e':
        return '[urgent but controlled, fast and clear]' if signal == 'mayday' else '[serious, conversational, fast and clear]'
    if signal == 'mayday':
        return '[紧急但冷静，飞行员短促快速地向塔台报告，吐字清楚]'
    if signal == 'pan':
        return '[严肃冷静，飞行员干练自然的无线电报告，简短快速，吐字清楚]'
    return '[严肃克制，干练自然的飞行员无线电通话，快速清晰地复诵，不要播音腔]'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', choices=['s2.1-pro', 's2.1-pro-free'], default=MODEL)
    args = parser.parse_args()
    for folder in ['raw', 'render', 'assets']:
        (STAGE / folder).mkdir(parents=True, exist_ok=True)
    print('Ready for Fish credential on hidden stdin.', flush=True)
    key = sys.stdin.readline().strip()
    if not key:
        raise SystemExit('Missing credential')
    lines = pilot_lines()
    references = ROOT / 'ops/assets/pilot-voices'
    signal_manifest = json.loads((references / 'manifest.json').read_text())
    # Keep the approved natural three-call performances as reproducible sources.
    for voice in VOICES:
        approved = signal_manifest[voice]
        assert approved['referenceId'] == VOICES[voice]['referenceId'], 'Reapprove signal sources when changing a pilot'
        for signal in ['mayday', 'pan']:
            spec = approved['signals'][signal]
            assert spec['groups'] == 3 and 0 < spec['duration'] < 2.5
            target = references / spec['file']
            assert hashlib.sha256(target.read_bytes()).hexdigest() == spec['sha256'], 'Signal source hash changed; review before regeneration'
    cached = {}
    for folder in [ROOT / 'qa/fish-pilot-voices/raw', STAGE / 'raw']:
        for path in folder.glob('*.json'):
            meta = json.loads(path.read_text())
            audio = path.with_suffix('.mp3')
            if 'payload' in meta and audio.exists() and meta['model'] in ['s2.1-pro', 's2.1-pro-free']:
                # Both service tiers use S2.1-Pro. Reuse every completed take.
                cached[digest({'model': MODEL, 'payload': meta['payload']})] = audio

    tasks, aliases = {}, {}
    for voice, profile in VOICES.items():
        for clip_id, text in lines.items():
            declared = next(((prefix, signal) for prefix, signal in SIGNALS.items() if text.startswith(prefix)), None)
            signal = declared[1] if declared else None
            body = text[len(declared[0]):].strip() if declared else text
            payload = {'text': direction(voice, signal) + body, 'reference_id': profile['referenceId'], 'format': 'mp3', 'sample_rate': 44100, 'mp3_bitrate': 128, 'temperature': .5, 'top_p': .7, 'prosody': {'speed': 1.18 if signal else 1.16, 'volume': 0, 'normalize_loudness': True}}
            identity = digest({'model': MODEL, 'payload': payload})
            render_identity = {'request': identity, 'signal': signal, 'voice': voice, 'filter': FILTER, 'trim': TRIM}
            if signal:
                render_identity['signalHash'] = hashlib.sha256((references / f'{voice}-{signal}.wav').read_bytes()).hexdigest()
            job_id = digest(render_identity)
            tasks[job_id] = {'voice': voice, 'payload': payload, 'identity': identity, 'signal': signal}
            aliases[(voice, clip_id)] = job_id
    print(f'Preparing {len(lines)} pilot lines × 3 voices; {len(tasks)} unique recordings.', flush=True)
    lock = threading.Lock()
    completed = 0

    def generate(job_id, job):
        nonlocal completed
        identity, payload, signal, voice = job['identity'], job['payload'], job['signal'], job['voice']
        actual_identity = digest({'model': args.model, 'payload': payload})
        raw = cached.get(identity, STAGE / 'raw' / (actual_identity + '.mp3'))
        if not raw.exists():
            body = json.dumps(payload, ensure_ascii=False).encode()
            for attempt in range(4):
                req = urllib.request.Request('https://api.fish.audio/v1/tts', data=body, headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'model': args.model})
                try:
                    with urllib.request.urlopen(req, timeout=90) as response:
                        audio = response.read(8 * 1024 * 1024)
                        if 'json' in response.headers.get('Content-Type', '') or len(audio) < 1000:
                            raise ValueError('No usable audio returned')
                    temporary = raw.with_suffix('.partial.mp3')
                    temporary.write_bytes(audio)
                    temporary.replace(raw)
                    raw.with_suffix('.json').write_text(json.dumps({'model': args.model, 'payload': payload, 'sha256': hashlib.sha256(audio).hexdigest()}, ensure_ascii=False, indent=2) + '\n')
                    break
                except urllib.error.HTTPError as error:
                    if error.code not in [429, 500, 502, 503, 504] or attempt == 3:
                        raise RuntimeError('Fish synthesis HTTP ' + str(error.code)) from None
                    time.sleep(2 ** attempt)
                except Exception as error:
                    if attempt == 3:
                        raise RuntimeError(str(error).replace(key, '[redacted]')) from None
                    time.sleep(2 ** attempt)
        target = STAGE / 'render' / (job_id + '.mp3')
        if not target.exists():
            if signal:
                graph = f'[1:a]{TRIM},aformat=sample_rates=24000:channel_layouts=mono[body];anullsrc=r=24000:cl=mono:d=0.12[gap];[0:a][gap][body]concat=n=3:v=0:a=1,{FILTER}[out]'
                ffmpeg('-i', references / f'{voice}-{signal}.wav', '-i', raw, '-filter_complex', graph, '-map', '[out]', '-ar', 24000, '-ac', 1, '-b:a', '48k', target)
            else:
                ffmpeg('-i', raw, '-af', TRIM + ',' + FILTER, '-ar', 24000, '-ac', 1, '-b:a', '48k', target)
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=sample_rate,channels', '-of', 'json', str(target)]))
        duration = round(float(probe['format']['duration']), 3)
        assert .2 < duration < 35 and probe['streams'][0]['channels'] == 1 and probe['streams'][0]['sample_rate'] == '24000'
        actual_model = json.loads(raw.with_suffix('.json').read_text())['model']
        result = {'path': target, 'duration': duration, 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'signal': signal, 'serviceModel': actual_model}
        with lock:
            completed += 1
            print(f'Recordings ready: {completed}/{len(tasks)}', flush=True)
        return job_id, result

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(generate, job_id, job) for job_id, job in tasks.items()]
        rendered = dict(future.result() for future in concurrent.futures.as_completed(futures))
    manifest = {'schema': 1, 'provider': 'Fish Audio', 'model': MODEL, 'sourceHash': digest(lines), 'voices': {}}
    for voice, profile in VOICES.items():
        folder = STAGE / 'assets' / voice
        folder.mkdir(exist_ok=True)
        clips = {}
        for clip_id, text in lines.items():
            item = rendered[aliases[(voice, clip_id)]]
            filename = clip_id + '-' + item['sha256'][:16] + '.mp3'
            shutil.copyfile(item['path'], folder / filename)
            clips[clip_id] = {'file': filename, 'text': text, 'duration': item['duration'], 'bytes': item['bytes'], 'sha256': item['sha256'], 'signal': item['signal'], 'serviceModel': item['serviceModel']}
        manifest['voices'][voice] = {**profile, 'clips': clips}
    manifest['version'] = digest(manifest)[:20]
    (STAGE / 'pilot-voices.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f'Complete: {len(lines) * 3} clips. Staged manifest/assets ready for review; live radio unchanged.', flush=True)


if __name__ == '__main__':
    main()
