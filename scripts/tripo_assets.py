#!/usr/bin/env python3
"""Small resumable Tripo v3 asset pipeline. Credentials never enter Unity or Git.

Docs: https://developers.tripo3d.ai/en/docs/generation-image-to-model/p
Commands: balance, submit NAME, poll NAME. Submit is the only credit-spending command.
"""
import argparse
import json
import mimetypes
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
STATE = Path.home() / '.config' / 'waddles-quest' / 'tripo-tasks'
BASE = 'https://openapi.tripo3d.ai/v3'
NAMES = ('drifter', 'sword', 'gremlin', 'charger')


def key():
    value = os.environ.get('TRIPO_API_KEY', '').strip()
    if not value:
        value = (Path.home() / '.config/waddles-quest/tripo-api-key.txt').read_text().strip()
    if not value or '\n' in value or value.startswith('TRIPO_API_KEY='):
        raise RuntimeError('Store only the key value in the local key file, or set TRIPO_API_KEY.')
    return value


def request(endpoint, payload=None, raw=None, content_type=None):
    headers = {'Authorization': 'Bearer ' + key()}
    data = raw
    if payload is not None:
        data = json.dumps(payload).encode()
        headers['Content-Type'] = 'application/json'
    if content_type:
        headers['Content-Type'] = content_type
    req = urllib.request.Request(BASE + endpoint, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        # Never dump request objects, headers, or credentials on failure.
        raise RuntimeError(f'Tripo HTTP {error.code}; request was not retried automatically.') from None
    if result.get('code') != 0:
        raise RuntimeError(f"Tripo error code {result.get('code')}; request was not retried automatically.")
    return result['data']


def state_path(name):
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    return STATE / (name + '.json')


def submit(name):
    path = state_path(name)
    if path.exists():
        print(name + ': existing task retained; use poll. No credits spent.')
        return
    image = ROOT / 'art-src/unity-concepts/model-references' / (name + '.png')
    boundary = 'waddle-' + uuid.uuid4().hex
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{image.name}"\r\n'
            f'Content-Type: {mimetypes.guess_type(image.name)[0]}\r\n\r\n').encode()
    body += image.read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
    token = request('/files', raw=body, content_type='multipart/form-data; boundary=' + boundary)['file_token']
    payload = {'input': token, 'model': 'P2-20260801', 'face_limit': 5000 if name == 'sword' else 12000,
               'texture': True, 'pbr': True, 'texture_quality': 'standard', 'delight': True}
    # Record the submission intent first. An ambiguous network result MUST be reconciled
    # in Tripo's task history, never retried blindly and charged a second time.
    path.write_text(json.dumps({'name': name, 'status': 'submitting', 'parameters': payload}, indent=2))
    result = request('/generation/image-to-model', payload)
    task = {'name': name, 'task_id': result['task_id'], 'parameters': payload}
    path.write_text(json.dumps(task, indent=2))
    print(name + ': submitted task ' + task['task_id'])


def download(url, target):
    # Signed model URLs are fetched WITHOUT forwarding the API authorization header.
    with urllib.request.urlopen(url, timeout=120) as response:
        content = response.read()
    if not content.startswith(b'glTF'):
        raise RuntimeError('Expected a GLB model; output left untouched.')
    target.parent.mkdir(parents=True, exist_ok=True)
    staging = target.with_suffix('.download')
    staging.write_bytes(content)
    staging.replace(target)


def poll(name):
    path = state_path(name)
    task = json.loads(path.read_text())
    if 'task_id' not in task:
        raise RuntimeError('Submission outcome is ambiguous; reconcile the task in Tripo before resubmitting.')
    result = request('/tasks/' + task['task_id'])
    print(f"{name}: {result['status']} {result.get('progress', 0)}%")
    if result['status'] == 'success':
        target = ROOT / 'art-src/tripo-models' / (name + '.glb')
        if not target.exists():
            download(result['output']['model_url'], target)
        # Keep reproducible provenance without credentials, file tokens, or expiring signed URLs.
        provenance = {'name': name, 'task_id': task['task_id'], 'model': task['parameters']['model'],
                      'face_limit': task['parameters']['face_limit'], 'texture_quality': 'standard',
                      'reference': 'art-src/unity-concepts/model-references/' + name + '.png'}
        target.with_suffix('.json').write_text(json.dumps(provenance, indent=2) + '\n')
        print('Saved ' + str(target.relative_to(ROOT)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('balance', 'submit', 'poll'))
    parser.add_argument('name', nargs='?', choices=NAMES)
    args = parser.parse_args()
    if args.command == 'balance':
        print(json.dumps(request('/account/balance')))
    elif not args.name:
        parser.error('name is required for submit/poll')
    elif args.command == 'submit':
        submit(args.name)
    else:
        poll(args.name)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
