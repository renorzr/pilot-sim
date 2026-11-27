"""Export unfiltered pilot recordings for cockpit playback and live VHF.

Reuse original Chinese takes, preserving the approved same-speaker emergency
performances. The credential is read from the ignored local file or explicit hidden stdin; any missing Fish
take uses the free tier. English retains the established Guy voice profile.
"""
import argparse
import asyncio
import concurrent.futures
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import threading
import time
import urllib.request

import edge_tts

from fish_credentials import load_fish_credential

ROOT = pathlib.Path(__file__).resolve().parents[1]
STAGE = ROOT / 'qa/radio-climb'
CAST_STAGE = ROOT / 'qa/radio-cast'
TRIM = 'silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:start_silence=0.025,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:start_silence=0.04,areverse'
NORMALIZE = 'loudnorm=I=-18:TP=-2:LRA=7'
SIGNALS = {'MAYDAY, MAYDAY, MAYDAY.': 'mayday', 'PAN PAN, PAN PAN, PAN PAN.': 'pan'}
EDGE = {'zh': {'voice': 'zh-CN-XiaoxiaoNeural', 'rate': '+24%', 'pitch': '-12Hz'}, 'en': {'voice': 'en-US-GuyNeural', 'rate': '+24%', 'pitch': '-10Hz'}}


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-threads', '1', '-filter_threads', '1', '-filter_complex_threads', '1', *map(str, args)], check=True, timeout=30)


def info(path):
    return {'duration': round(float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(path)])), 3), 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fish-stdin', action='store_true')
    args = parser.parse_args()
    for name in ['raw', 'clean', 'render']:
        (STAGE / name).mkdir(parents=True, exist_ok=True)
    key = load_fish_credential(stdin=args.fish_stdin, required=True)
    pack = json.loads((CAST_STAGE / 'pilot-voices.json').read_text())
    cached = {}
    for folder in [ROOT / 'qa/fish-pilot-voices/raw', CAST_STAGE / 'raw', ROOT / 'qa/fish-pilot-production/raw', STAGE / 'raw']:
        for path in folder.glob('*.json'):
            meta = json.loads(path.read_text())
            payload = meta.get('payload', {})
            audio = path.with_suffix('.mp3')
            if isinstance(payload.get('reference_id'), str) and audio.exists():
                text = re.sub(r'^(?:\[[^\]]+\]\s*)+', '', payload['text'])
                cached[(payload['reference_id'], text)] = audio
    signals = json.loads((ROOT / 'ops/assets/pilot-voices/manifest.json').read_text())
    english = {}
    for path in [ROOT / 'game/src/comms/script.en.json', *sorted((ROOT / 'game/src/comms').glob('*-radio.json'))]:
        source = json.loads(path.read_text())
        prefix = path.name.removesuffix('-radio.json') + '-' if 'en' in source else ''
        for event, lines in source.get('en', source).items():
            if not isinstance(lines, list):
                continue
            for i, pair in enumerate(lines):
                if isinstance(pair, list) and len(pair) == 2 and pair[0] == 'pilot':
                    english[f'{prefix}{event}-{i}'] = pair[1]
    jobs, aliases = {}, {}
    for language, voices in [('zh', pack['voices']), ('en', {'guy': {'referenceId': EDGE['en']['voice'], 'clips': {id: {'role': 'pilot', 'text': text} for id, text in english.items()}}})]:
        for voice, profile in voices.items():
            for clip_id, item in profile['clips'].items():
                if item['role'] != 'pilot':
                    continue
                signal = next(((prefix, name) for prefix, name in SIGNALS.items() if item['text'].startswith(prefix)), None)
                body = item['text'][len(signal[0]):].strip() if signal else item['text']
                job = {'language': language, 'voice': voice, 'referenceId': profile['referenceId'], 'body': body, 'signal': signal[1] if signal else None}
                job_id = digest(job)
                jobs[job_id] = job
                aliases[(language, voice, clip_id)] = job_id
    print(f'Preparing {len(aliases)} dry pilot files from {len(jobs)} unique bodies; original Fish takes available: {len(cached)}.', flush=True)
    lock, completed = threading.Lock(), 0

    def edge(text, language):
        identity = digest({'text': text, **EDGE[language]})
        existing = CAST_STAGE / 'raw' / (identity + '.mp3')
        target = existing if language == 'zh' and existing.exists() else STAGE / 'raw' / (identity + '.mp3')
        if not target.exists() or target.stat().st_size < 1000:
            async def generate():
                for attempt in range(4):
                    try:
                        temporary = target.with_suffix('.partial.mp3')
                        await asyncio.wait_for(edge_tts.Communicate(text, **EDGE[language]).save(str(temporary)), 45)
                        temporary.replace(target)
                        return
                    except Exception:
                        if attempt == 3:
                            raise
                        await asyncio.sleep(attempt + 1)
            asyncio.run(generate())
            target.with_suffix('.json').write_text(json.dumps({'model': 'edge-tts', 'text': text, 'profile': EDGE[language]}, ensure_ascii=False, indent=2) + '\n')
        return target

    # English declarations use the same Guy speaker as their reports.
    english_signals = {}
    for name, unit in [('mayday', 'Mayday.'), ('pan', 'Pan pan.')]:
        raw = edge(unit, 'en')
        wav = STAGE / 'render' / f'english-{name}-unit.wav'
        ffmpeg('-i', raw, '-af', TRIM, '-ar', 24000, '-ac', 1, wav)
        tempo = max(1.10, info(wav)['duration'] * 3 / 2.3)
        target = STAGE / 'render' / f'english-{name}-prefix.wav'
        ffmpeg('-i', wav, '-filter_complex', f'[0:a]atempo={tempo},asplit=3[a][b][c];[a][b][c]concat=n=3:v=0:a=1[out]', '-map', '[out]', '-ar', 24000, '-ac', 1, target)
        english_signals[name] = target

    def render(job_id, job):
        nonlocal completed
        language, voice, signal = job['language'], job['voice'], job['signal']
        raw = cached.get((job['referenceId'], job['body'])) if language == 'zh' and voice != 'xiaoxiao' else None
        if raw is None and (language == 'en' or voice == 'xiaoxiao'):
            raw = edge(job['body'], language)
        if raw is None:
            raw = STAGE / 'raw' / (digest({'voice': voice, 'body': job['body']}) + '.mp3')
            if not raw.exists():
                payload = {'reference_id': job['referenceId'], 'text': '[严肃克制，干练自然的航空无线电通话，快速清晰地报告，不要播音腔]' + job['body'], 'format': 'mp3', 'sample_rate': 44100, 'temperature': .3 if voice == 'j' else .5, 'top_p': .7, 'prosody': {'speed': 1.16, 'volume': 0, 'normalize_loudness': True}}
                for attempt in range(4):
                    try:
                        request = urllib.request.Request('https://api.fish.audio/v1/tts', data=json.dumps(payload, ensure_ascii=False).encode(), headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'model': 's2.1-pro-free'})
                        with urllib.request.urlopen(request, timeout=90) as response:
                            data = response.read(8 * 1024 * 1024)
                            assert 'json' not in response.headers.get('Content-Type', '') and len(data) > 1000
                        raw.write_bytes(data)
                        raw.with_suffix('.json').write_text(json.dumps({'model': 's2.1-pro-free', 'payload': payload}, ensure_ascii=False, indent=2) + '\n')
                        break
                    except Exception as error:
                        if attempt == 3:
                            raise RuntimeError(str(error).replace(key, '[redacted]')) from None
                        time.sleep(attempt + 1)
        target = STAGE / 'clean' / (job_id + '.mp3')
        if not target.exists() or target.stat().st_size < 1000:
            tempo = ',atempo=1.22' if voice == 'j' and signal == 'mayday' else ''
            if signal:
                prefix = ROOT / 'ops/assets/pilot-voices' / signals[voice]['signals'][signal]['file'] if language == 'zh' else english_signals[signal]
                graph = f'[1:a]{TRIM}{tempo},aformat=sample_rates=24000:channel_layouts=mono[body];anullsrc=r=24000:cl=mono:d=0.12[gap];[0:a][gap][body]concat=n=3:v=0:a=1,{NORMALIZE}[out]'
                ffmpeg('-i', prefix, '-i', raw, '-filter_complex', graph, '-map', '[out]', '-ar', 24000, '-ac', 1, '-b:a', '48k', target)
            else:
                ffmpeg('-i', raw, '-af', TRIM + ',' + NORMALIZE, '-ar', 24000, '-ac', 1, '-b:a', '48k', target)
        result = {'path': target, **info(target)}
        with lock:
            completed += 1
            if completed % 50 == 0 or completed == len(jobs):
                print(f'Dry takes ready: {completed}/{len(jobs)}', flush=True)
        return job_id, result

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(render, id, job) for id, job in jobs.items()]
        rendered = dict(future.result() for future in concurrent.futures.as_completed(futures))
    english_pack = {'voice': EDGE['en']['voice'], 'profile': EDGE['en'], 'clips': {}}
    for (language, voice, clip_id), job_id in aliases.items():
        item = rendered[job_id]
        filename = clip_id + '-clean-' + item['sha256'][:16] + '.mp3'
        folder = CAST_STAGE / 'assets' / voice if language == 'zh' else STAGE / 'radio/en/pilots'
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / filename
        target.write_bytes(item['path'].read_bytes())
        metadata = {k: v for k, v in item.items() if k != 'path'}
        metadata['file'] = filename
        if language == 'zh':
            pack['voices'][voice]['clips'][clip_id]['clean'] = metadata
        else:
            english_pack['clips'][clip_id] = {'text': english[clip_id], **metadata}
    pack['schema'] = 3
    pack.pop('version', None)
    pack['version'] = digest(pack)[:20]
    english_pack['version'] = digest(english_pack)[:20]
    (CAST_STAGE / 'pilot-voices.json').write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
    (STAGE / 'english-pilot-clean.json').write_text(json.dumps(english_pack, ensure_ascii=False, indent=2) + '\n')
    print(f'Complete: {len(aliases)} unfiltered pilot files staged; no live files replaced.', flush=True)


if __name__ == '__main__':
    main()
