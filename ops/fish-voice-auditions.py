"""Fish Audio audition worker. Credential is read once from hidden stdin only."""
import hashlib
import json
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / 'qa/fish-pilot-voices'
BASE = 'https://api.fish.audio'


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / 'raw').mkdir(exist_ok=True)
    print('Ready for credential on hidden stdin.', flush=True)
    key = sys.stdin.readline().strip()
    if not key:
        raise SystemExit('Missing credential')
    print('Credential loaded in memory. Ready for JSON commands.', flush=True)

    def request(path, payload=None, model=None, binary=None, content_type=None):
        headers = {'Authorization': 'Bearer ' + key, 'User-Agent': 'pilot-sim-voice-auditions/1'}
        if model:
            headers['model'] = model
        data = None
        if payload is not None:
            headers['Content-Type'] = 'application/json'
            data = json.dumps(payload, ensure_ascii=False).encode()
        if binary is not None:
            headers['Content-Type'] = content_type
            data = binary
        req = urllib.request.Request(BASE + path, data=data, headers=headers)
        with urllib.request.urlopen(req, timeout=90) as response:
            return response.read(20 * 1024 * 1024), response.headers.get('Content-Type', '')

    for line in sys.stdin:
        try:
            command = json.loads(line)
            action = command.get('action')
            if action == 'exit':
                break
            if action == 'models':
                params = command.get('params', {})
                raw, _ = request('/model?' + urllib.parse.urlencode(params, doseq=True))
                result = json.loads(raw)
                query_hash = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()[:12]
                (CACHE / ('models-' + query_hash + '.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
                print(json.dumps({'total': result.get('total'), 'hasMore': result.get('has_more'), 'items': [{k: item.get(k) for k in ['_id', 'title', 'description', 'tags', 'languages', 'licensed', 'source', 'author', 'samples']} for item in result.get('items', [])]}, ensure_ascii=False), flush=True)
            elif action == 'model':
                model_id = command['id']
                if not re.fullmatch('[a-fA-F0-9]{24,64}', model_id):
                    raise ValueError('Invalid voice ID')
                raw, _ = request('/model/' + model_id)
                (CACHE / ('model-' + model_id + '.json')).write_bytes(raw)
                print(json.dumps(json.loads(raw), ensure_ascii=False), flush=True)
            elif action == 'tts':
                name = command['name']
                if not re.fullmatch('[a-z0-9-]{1,90}', name):
                    raise ValueError('Invalid audition name')
                model = command.get('model', 's2.1-pro')
                if model not in ['s2.1-pro', 's2.1-pro-free', 'drama-3']:
                    raise ValueError('Unsupported synthesis model')
                payload = command['payload']
                identity = hashlib.sha256(json.dumps({'model': model, 'payload': payload}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                target = CACHE / 'raw' / (name + '-' + identity[:16] + '.mp3')
                cached = target.exists() and target.stat().st_size > 1000
                if not cached:
                    raw, content_type = request('/v1/tts', payload, model)
                    if 'json' in content_type or len(raw) < 1000:
                        raise ValueError('Synthesis returned no usable audio: ' + raw[:800].decode(errors='replace'))
                    temporary = target.with_suffix('.partial.mp3')
                    temporary.write_bytes(raw)
                    temporary.replace(target)
                    (CACHE / 'raw' / (target.stem + '.json')).write_text(json.dumps({'model': model, 'payload': payload, 'sha256': hashlib.sha256(raw).hexdigest()}, ensure_ascii=False, indent=2) + '\n')
                print(json.dumps({'ok': True, 'name': name, 'model': model, 'cached': cached, 'path': str(target.relative_to(ROOT)), 'bytes': target.stat().st_size}), flush=True)
            elif action == 'asr':
                source = (ROOT / command['path']).resolve()
                source.relative_to(ROOT / 'public/assets/pilot-voices')
                boundary = 'pilot-audition-' + uuid.uuid4().hex
                body = ('--' + boundary + '\r\nContent-Disposition: form-data; name="audio"; filename="audition.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n').encode() + source.read_bytes() + ('\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="ignore_timestamps"\r\n\r\ntrue\r\n--' + boundary + '--\r\n').encode()
                raw, _ = request('/v1/asr', model='transcribe-1-pro', binary=body, content_type='multipart/form-data; boundary=' + boundary)
                result = json.loads(raw)
                name = source.stem
                (CACHE / ('asr-' + name + '.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
                print(json.dumps({'ok': True, 'name': name, 'transcript': result}, ensure_ascii=False), flush=True)
            else:
                raise ValueError('Unknown command')
        except urllib.error.HTTPError as error:
            detail = error.read(1200).decode(errors='replace').replace(key, '[redacted]')
            print(json.dumps({'ok': False, 'status': error.code, 'detail': detail}, ensure_ascii=False), flush=True)
        except Exception as error:
            print(json.dumps({'ok': False, 'error': str(error).replace(key, '[redacted]')}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
