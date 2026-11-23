"""Generate isolated, comparable pilot voice auditions; never replace live radio."""
import asyncio
import hashlib
import json
import pathlib
import shutil
import subprocess
import wave

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/pilot-voices'
CACHE = ROOT / 'qa/pilot-voices/raw'
RATE, PITCH = '+26%', '-18Hz'
VOICES = [
    {'id': 'a', 'label': 'A', 'name': '云健', 'voice': 'zh-CN-YunjianNeural', 'gender': '男声', 'locale': '普通话'},
    {'id': 'b', 'label': 'B', 'name': '云哲', 'voice': 'zh-TW-YunJheNeural', 'gender': '男声', 'locale': '台湾华语'},
    {'id': 'c', 'label': 'C', 'name': '云夏', 'voice': 'zh-CN-YunxiaNeural', 'gender': '男声', 'locale': '普通话'},
    {'id': 'd', 'label': 'D', 'name': '晓伊', 'voice': 'zh-CN-XiaoyiNeural', 'gender': '女声', 'locale': '普通话'},
    {'id': 'current', 'label': '对照', 'name': '云希', 'voice': 'zh-CN-YunxiNeural', 'gender': '男声', 'locale': '普通话', 'current': True},
]
SCRIPTS = {
    'normal': {'title': '普通通话', 'body': '塔台，云际三二零，跑道一七左，准备起飞。起飞后保持跑道方向，爬升至三千英尺。'},
    'mayday': {'title': '紧急呼叫', 'unit': 'Mayday.', 'prefix': 'MAYDAY, MAYDAY, MAYDAY.', 'body': '塔台，云际三二零，双发失效，无法保持高度，请求紧急着陆。'},
    'pan': {'title': '优先着陆', 'unit': 'Pan pan.', 'prefix': 'PAN PAN, PAN PAN, PAN PAN.', 'body': '塔台，云际三二零，襟翼卡阻，请求优先着陆。'},
}
TRIM = 'silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:start_silence=0.025,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:start_silence=0.04,areverse'
GAP, BODY_GAP, SAMPLE_RATE = .08, .12, 24000


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', *map(str, args)], check=True)


def duration(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(path)]))


def pcm_duration(path):
    with wave.open(str(path)) as source:
        return source.getnframes() / source.getframerate()


SEM = asyncio.Semaphore(3)


async def synthesize(voice, text):
    profile = {'voice': voice['voice'], 'rate': RATE, 'pitch': PITCH}
    identity = hashlib.sha256(json.dumps({'profile': profile, 'text': text}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    target = CACHE / (identity + '.mp3')
    if not target.exists() or target.stat().st_size < 1000:
        async with SEM:
            for attempt in range(3):
                try:
                    temporary = target.with_suffix('.partial.mp3')
                    await asyncio.wait_for(edge_tts.Communicate(text, **profile).save(str(temporary)), 40)
                    temporary.replace(target)
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    await asyncio.sleep(1 + attempt)
    return target


async def build_voice(voice):
    sources = await asyncio.gather(*(synthesize(voice, script['body']) for script in SCRIPTS.values()))
    units = await asyncio.gather(*(synthesize(voice, SCRIPTS[key]['unit']) for key in ['mayday', 'pan']))
    unit_sources = dict(zip(['mayday', 'pan'], units))
    clips = {}
    for (key, script), raw_body in zip(SCRIPTS.items(), sources):
        base = f"{voice['id']}-{key}"
        body = CACHE / (base + '-body.wav')
        ffmpeg('-i', raw_body, '-af', TRIM, '-ar', SAMPLE_RATE, '-ac', 1, body)
        assembled = body
        signal = None
        if 'unit' in script:
            trimmed = CACHE / (base + '-unit-trimmed.wav')
            ffmpeg('-i', unit_sources[key], '-af', TRIM, '-ar', SAMPLE_RATE, '-ac', 1, trimmed)
            # Same speaker/pitch throughout; keep all three declaration units brisk.
            tempo = max(1.10, pcm_duration(trimmed) * 3 / (2.4 - GAP * 2))
            unit = CACHE / (base + '-unit.wav')
            ffmpeg('-i', trimmed, '-af', f'atempo={tempo:.8f}', '-ar', SAMPLE_RATE, '-ac', 1, unit)
            signal = {'units': 3, 'unitDuration': pcm_duration(unit), 'gap': GAP, 'bodyGap': BODY_GAP, 'tempo': tempo, 'reference': str(unit.relative_to(ROOT)), 'prefixEnd': pcm_duration(unit) * 3 + GAP * 2}
            assert signal['prefixEnd'] < 2.5, signal
            assembled = CACHE / (base + '-assembled.wav')
            graph = (
                '[0:a]asplit=3[u0][u1][u2];'
                f'anullsrc=r={SAMPLE_RATE}:cl=mono:d={GAP}[g0];'
                f'anullsrc=r={SAMPLE_RATE}:cl=mono:d={GAP}[g1];'
                f'anullsrc=r={SAMPLE_RATE}:cl=mono:d={BODY_GAP}[g2];'
                '[u0][g0][u1][g1][u2][g2][1:a]concat=n=7:v=0:a=1[out]'
            )
            ffmpeg('-i', unit, '-i', body, '-filter_complex', graph, '-map', '[out]', '-ar', SAMPLE_RATE, '-ac', 1, assembled)
        variants = {}
        for mode in ['clean', 'radio']:
            filters = ('highpass=f=300,lowpass=f=3300,' if mode == 'radio' else '') + 'loudnorm=I=-18:TP=-2:LRA=7'
            target = OUT / 'clips' / (base + '-' + mode + '.mp3')
            ffmpeg('-i', assembled, '-af', filters, '-ar', SAMPLE_RATE, '-ac', 1, '-b:a', '64k', target)
            variants[mode] = {'url': 'clips/' + target.name, 'duration': round(duration(target), 3), 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
        clips[key] = {'variants': variants, 'signal': signal}
    print(f"{voice['label']} {voice['name']}: three audition clips ready", flush=True)
    return {**voice, 'profile': {'rate': RATE, 'pitch': PITCH}, 'clips': clips}


async def main():
    (OUT / 'clips').mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    available = {item['ShortName'] for item in await asyncio.wait_for(edge_tts.list_voices(), 35)}
    assert all(voice['voice'] in available for voice in VOICES), 'A selected neural voice is unavailable'
    voices = await asyncio.gather(*(build_voice(voice) for voice in VOICES))
    shutil.copyfile(ROOT / 'game/src/comms/radio-effects.js', OUT / 'radio-effects.js')
    manifest = {'version': 1, 'rate': RATE, 'pitch': PITCH, 'scripts': SCRIPTS, 'voices': voices, 'productionChanged': False}
    manifest['fingerprint'] = hashlib.sha256(json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
    temporary = OUT / 'manifest.json.next'
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(OUT / 'manifest.json')
    print('Auditions ready at /assets/pilot-voices/; production radio unchanged.', flush=True)


if __name__ == '__main__':
    asyncio.run(main())
