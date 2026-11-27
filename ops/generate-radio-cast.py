"""Stage the five Chinese speakers in both roles; never call paid Fish TTS.

Read the credential from the ignored local file (or explicit hidden stdin). Reuse approved recordings and persist
completed takes so interrupted generation can resume without repeating work.
"""
import argparse
import asyncio
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

import edge_tts

from fish_credentials import load_fish_credential

ROOT = pathlib.Path(__file__).resolve().parents[1]
STAGE = ROOT / 'qa/radio-cast'
REFERENCES = ROOT / 'ops/assets/pilot-voices'
MODEL = 's2.1-pro-free'
FILTER = 'highpass=f=300,lowpass=f=3300,loudnorm=I=-18:TP=-2:LRA=7'
TRIM = 'silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:start_silence=0.025,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:start_silence=0.04,areverse'
SIGNALS = {'MAYDAY, MAYDAY, MAYDAY.': 'mayday', 'PAN PAN, PAN PAN, PAN PAN.': 'pan'}
VOICES = {
    'e': {'label': 'E', 'name': '温和日常男声', 'provider': 'Fish Audio', 'referenceId': '41aafb356afe4d46925ab37fbb588c79'},
    'g': {'label': 'G', 'name': '从容雅致男声', 'provider': 'Fish Audio', 'referenceId': '0a86f2f473514783a93b37dad673613e'},
    'h': {'label': 'H', 'name': 'Jimmy 男中音', 'provider': 'Fish Audio', 'referenceId': '09f2e5951ea543319af82e7d2219a92c'},
    'j': {'label': 'J', 'name': '金', 'provider': 'Fish Audio', 'referenceId': '048222d36be842f199ec8ac71993dce4'},
    'xiaoxiao': {'label': '晓晓', 'name': '晓晓', 'provider': 'edge-tts', 'referenceId': 'zh-CN-XiaoxiaoNeural'},
}
EDGE_PROFILE = {'voice': 'zh-CN-XiaoxiaoNeural', 'rate': '+24%', 'pitch': '-12Hz'}


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', *map(str, args)], check=True)


def duration(path):
    return round(float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(path)])), 3)


def dialogue_lines():
    lines = {}
    for path in [ROOT / 'game/src/comms/script.json', *sorted((ROOT / 'game/src/comms').glob('*-radio.json'))]:
        data = json.loads(path.read_text())
        prefix = path.name.removesuffix('-radio.json') + '-' if 'zh' in data else ''
        for event, entries in data.get('zh', data).items():
            if not isinstance(entries, list):
                continue
            for i, pair in enumerate(entries):
                if isinstance(pair, list) and len(pair) == 2 and pair[0] in ['pilot', 'tower']:
                    lines[f'{prefix}{event}-{i}'] = {'role': pair[0], 'text': pair[1]}
    return lines


def edge_audio(text):
    identity = digest({'text': text, **EDGE_PROFILE})
    target = STAGE / 'raw' / (identity + '.mp3')
    if not target.exists():
        async def synthesize():
            for attempt in range(4):
                try:
                    temporary = target.with_suffix('.partial.mp3')
                    await asyncio.wait_for(edge_tts.Communicate(text, **EDGE_PROFILE).save(str(temporary)), 45)
                    temporary.replace(target)
                    return
                except Exception:
                    if attempt == 3:
                        raise
                    await asyncio.sleep(2 ** attempt)
        asyncio.run(synthesize())
        target.with_suffix('.json').write_text(json.dumps({'model': 'edge-tts', 'text': text, 'profile': EDGE_PROFILE}, ensure_ascii=False, indent=2) + '\n')
    return target


def prepare_edge_signals():
    manifest = json.loads((REFERENCES / 'manifest.json').read_text())
    entry = manifest.setdefault('xiaoxiao', {'referenceId': VOICES['xiaoxiao']['referenceId'], 'signals': {}})
    for signal, unit in [('mayday', 'Mayday.'), ('pan', 'Pan pan.')]:
        target = REFERENCES / f'xiaoxiao-{signal}.wav'
        if signal not in entry['signals']:
            raw = edge_audio(unit)
            trimmed = STAGE / 'render' / f'xiaoxiao-{signal}-unit.wav'
            ffmpeg('-i', raw, '-af', TRIM, '-ar', 24000, '-ac', 1, trimmed)
            tempo = max(1.18, duration(trimmed) * 3 / 2.25)
            graph = f'[0:a]atempo={tempo},asplit=3[a][b][c];[a][b][c]concat=n=3:v=0:a=1[out]'
            ffmpeg('-i', trimmed, '-filter_complex', graph, '-map', '[out]', '-ar', 24000, '-ac', 1, target)
            entry['signals'][signal] = {'file': target.name, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'duration': duration(target), 'groups': 3, 'layout': 'same-speaker-three-units-no-added-gap'}
    (REFERENCES / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fish-stdin', action='store_true')
    args = parser.parse_args()
    for folder in ['raw', 'render', 'assets']:
        (STAGE / folder).mkdir(parents=True, exist_ok=True)
    key = load_fish_credential(stdin=args.fish_stdin, required=True)
    lines = dialogue_lines()
    previous = json.loads((ROOT / 'game/src/comms/pilot-voices.json').read_text())
    signals = prepare_edge_signals()
    for voice, profile in VOICES.items():
        assert signals[voice]['referenceId'] == profile['referenceId']
        for spec in signals[voice]['signals'].values():
            assert spec['groups'] == 3 and 0 < spec['duration'] < 2.5
            assert hashlib.sha256((REFERENCES / spec['file']).read_bytes()).hexdigest() == spec['sha256']
    jobs, aliases, reused = {}, {}, {}
    for voice, profile in VOICES.items():
        for clip_id, line in lines.items():
            approved = previous['voices'].get(voice, {}).get('clips', {}).get(clip_id)
            if approved and approved['text'] == line['text']:
                source = ROOT / 'public/assets/radio/pilots' / voice / approved['file']
                assert hashlib.sha256(source.read_bytes()).hexdigest() == approved['sha256']
                reused[(voice, clip_id)] = {**approved, **line, 'path': source}
                continue
            if voice == 'xiaoxiao' and line['role'] == 'tower':
                source = ROOT / 'public/assets/radio' / (clip_id + '.mp3')
                reused[(voice, clip_id)] = {**line, 'path': source, 'duration': duration(source), 'signal': None, 'serviceModel': 'edge-tts'}
                continue
            declared = next(((prefix, signal) for prefix, signal in SIGNALS.items() if line['text'].startswith(prefix)), None)
            signal = declared[1] if declared else None
            body = line['text'][len(declared[0]):].strip() if declared else line['text']
            # J keeps the exact restrained Chinese delivery used in its approved
            # preview; an English urgency direction previously changed register.
            direction = '[严肃克制，干练自然的飞行员无线电通话，快速清晰地复诵，不要播音腔]' if voice == 'j' else '[严肃克制，干练自然的航空无线电通话，快速清晰地报告，不要播音腔]'
            payload = {'text': direction + body, 'reference_id': profile['referenceId'], 'format': 'mp3', 'sample_rate': 44100, 'mp3_bitrate': 128, 'temperature': .3 if voice == 'j' else .5, 'top_p': .7, 'prosody': {'speed': 1.16, 'volume': 0, 'normalize_loudness': True}}
            identity = digest({'model': MODEL if voice != 'xiaoxiao' else 'edge-tts', 'payload': payload if voice != 'xiaoxiao' else {'text': body, **EDGE_PROFILE}})
            tempo = 1.22 if voice == 'j' and signal == 'mayday' else 1.
            render_id = digest({'request': identity, 'signal': signals[voice]['signals'][signal]['sha256'] if signal else None, 'tempo': tempo, 'trim': TRIM, 'filter': FILTER})
            jobs[render_id] = {'voice': voice, 'payload': payload, 'body': body, 'identity': identity, 'signal': signal, 'tempo': tempo}
            aliases[(voice, clip_id)] = render_id
    print(f'Reusing {len(reused)} approved clips; generating {len(jobs)} unique takes for {len(lines)} lines × 5 voices. Fish model: {MODEL}.', flush=True)
    lock, completed = threading.Lock(), 0

    def generate(render_id, job):
        nonlocal completed
        voice, signal = job['voice'], job['signal']
        raw = STAGE / 'raw' / (job['identity'] + '.mp3')
        if voice == 'xiaoxiao':
            raw = edge_audio(job['body'])
        elif not raw.exists():
            body = json.dumps(job['payload'], ensure_ascii=False).encode()
            for attempt in range(5):
                req = urllib.request.Request('https://api.fish.audio/v1/tts', data=body, headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'model': MODEL})
                try:
                    with urllib.request.urlopen(req, timeout=90) as response:
                        audio = response.read(8 * 1024 * 1024)
                        if 'json' in response.headers.get('Content-Type', '') or len(audio) < 1000:
                            raise ValueError('No usable audio')
                    temporary = raw.with_suffix('.partial.mp3')
                    temporary.write_bytes(audio)
                    temporary.replace(raw)
                    raw.with_suffix('.json').write_text(json.dumps({'model': MODEL, 'payload': job['payload'], 'sha256': hashlib.sha256(audio).hexdigest()}, ensure_ascii=False, indent=2) + '\n')
                    break
                except urllib.error.HTTPError as error:
                    if error.code not in [429, 500, 502, 503, 504] or attempt == 4:
                        raise RuntimeError(f'Fish synthesis HTTP {error.code} ({voice})') from None
                    time.sleep(min(8, 2 ** attempt))
                except Exception as error:
                    if attempt == 4:
                        raise RuntimeError(str(error).replace(key, '[redacted]')) from None
                    time.sleep(min(8, 2 ** attempt))
        target = STAGE / 'render' / (render_id + '.mp3')
        if not target.exists():
            body_filter = TRIM + (f",atempo={job['tempo']}" if job['tempo'] != 1 else '')
            if signal:
                graph = f'[1:a]{body_filter},aformat=sample_rates=24000:channel_layouts=mono[body];anullsrc=r=24000:cl=mono:d=0.12[gap];[0:a][gap][body]concat=n=3:v=0:a=1,{FILTER}[out]'
                ffmpeg('-i', REFERENCES / signals[voice]['signals'][signal]['file'], '-i', raw, '-filter_complex', graph, '-map', '[out]', '-ar', 24000, '-ac', 1, '-b:a', '48k', target)
            else:
                ffmpeg('-i', raw, '-af', body_filter + ',' + FILTER, '-ar', 24000, '-ac', 1, '-b:a', '48k', target)
        result = {'path': target, 'duration': duration(target), 'signal': signal, 'serviceModel': 'edge-tts' if voice == 'xiaoxiao' else MODEL}
        assert .2 < result['duration'] < 35
        with lock:
            completed += 1
            if completed % 10 == 0 or completed == len(jobs):
                print(f'Recordings ready: {completed}/{len(jobs)}', flush=True)
        return render_id, result

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(generate, render_id, job) for render_id, job in jobs.items()]
        rendered = dict(future.result() for future in concurrent.futures.as_completed(futures))
    manifest = {'schema': 2, 'provider': 'Fish Audio / Microsoft Edge', 'language': 'zh', 'model': MODEL, 'sourceHash': digest(lines), 'voices': {}}
    for voice, profile in VOICES.items():
        folder = STAGE / 'assets' / voice
        folder.mkdir(exist_ok=True)
        clips = {}
        for clip_id, line in lines.items():
            item = reused.get((voice, clip_id)) or rendered[aliases[(voice, clip_id)]]
            audio = item['path'].read_bytes()
            sha = hashlib.sha256(audio).hexdigest()
            filename = clip_id + '-' + sha[:16] + '.mp3'
            shutil.copyfile(item['path'], folder / filename)
            clips[clip_id] = {**line, 'file': filename, 'duration': item['duration'], 'bytes': len(audio), 'sha256': sha, 'signal': item['signal'], 'serviceModel': item['serviceModel']}
        manifest['voices'][voice] = {**profile, 'roles': ['pilot', 'tower'], 'clips': clips}
    manifest['version'] = digest(manifest)[:20]
    (STAGE / 'pilot-voices.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f'Complete: {len(lines) * len(VOICES)} staged clips; live game unchanged.', flush=True)


if __name__ == '__main__':
    main()
