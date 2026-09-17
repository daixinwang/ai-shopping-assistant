"""Run a bounded live HTTP acceptance suite; never reads or exports API keys.

Run from the repository root: .venv/Scripts/python backend/eval/live_acceptance.py
Requires the running backend to have a saved real model configuration.
"""
import argparse
import base64
import hashlib
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='docs/validation/live')
    parser.add_argument('--image', help='Optional catalog image, sent to the configured model')
    args = parser.parse_args()
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    if any(out.glob('*.json')):
        raise SystemExit('Output already contains evidence; choose a new directory.')
    run_id = 'acceptance-' + uuid.uuid4().hex[:12]
    client = httpx.Client(base_url=args.base_url, timeout=180)
    config = client.get('/api/v1/config').json()
    if not config.get('key_set'):
        raise SystemExit('Save a real model configuration before running this suite.')
    cases = [
        ('recommend', 'beauty', '推荐500元以内的防晒产品', 'recommend', 500),
        ('compare', 'beauty', '对比第一款和第二款', 'compare', None),
        ('detail', 'beauty', '介绍第一款的优点和缺点', 'product_detail', None),
        ('refine', 'beauty', '预算改成200元以内，还是找防晒', 'refine', 200),
        ('negative', 'negative', '推荐500元以内的防晒，不要安热沙', 'recommend', 500),
        ('digital', 'digital', '推荐5000元以内的平板电脑', 'recommend', 5000),
        ('empty_results', 'empty', '推荐10元以内的笔记本电脑', 'recommend', 10),
        ('clarify', 'clarify', '想买点东西，但还没想好买什么', 'clarify', None),
        ('invalid_empty', 'invalid', '', None, None),
        ('out_of_scope', 'other', '帮我写一个Python快速排序函数', 'fallback', None),
    ]
    records = []
    for name, session, query, expected, budget in cases:
        payload = {'query': query, 'session_id': run_id + '-' + session, 'user_id': run_id}
        start = time.perf_counter()
        row = {'case': name, 'request': payload, 'expected_tool': expected, 'budget': budget}
        try:
            response = client.post('/chat', json=payload)
            row.update(status=response.status_code, response=response.json())
        except Exception as error:
            row['error_type'] = type(error).__name__
        row['elapsed_seconds'] = round(time.perf_counter() - start, 3)
        records.append(row)
        (out / (name + '.json')).write_text(json.dumps(row, ensure_ascii=False, indent=2), encoding='utf-8')
        body = row.get('response', {})
        print(name, row.get('status'), body.get('decision', {}).get('tool'), row['elapsed_seconds'], flush=True)
    if args.image:
        image = Path(args.image)
        content = image.read_bytes()
        payload = {'query': '找与图片相似的商品', 'session_id': run_id + '-image',
                   'image_base64': base64.b64encode(content).decode('ascii')}
        start = time.perf_counter()
        row = {'case': 'image', 'request': {'query': payload['query'], 'session_id': payload['session_id'],
               'image_file': str(image), 'image_sha256': hashlib.sha256(content).hexdigest()}}
        try:
            with client.stream('POST', '/chat/stream', json=payload) as response:
                row['status'] = response.status_code
                row['sse'] = response.read().decode('utf-8')
        except Exception as error:
            row['error_type'] = type(error).__name__
        row['elapsed_seconds'] = round(time.perf_counter() - start, 3)
        records.append(row)
        (out / 'image.json').write_text(json.dumps(row, ensure_ascii=False, indent=2), encoding='utf-8')
        print('image', row.get('status'), row['elapsed_seconds'], flush=True)
    manifest = {'run_id': run_id, 'completed_at': datetime.now(timezone.utc).isoformat(),
                'model_config': config, 'cases': len(records),
                'note': 'Live exploratory acceptance sample, not a production benchmark. Inspect outputs and traces; HTTP 200 alone is not a pass.'}
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    client.close()


if __name__ == '__main__':
    main()
