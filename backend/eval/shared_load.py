"""Reproducible local infrastructure benchmark (real PG/Redis, offline demo model).

Requires DATABASE_URL ending in _test and REDIS_URL. Starts two isolated API processes,
uses the existing test catalog, and leaves the database intact. No provider API calls.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import platform
import socket
import subprocess
import sys
import tempfile
import time
import uuid

import httpx


def percentile(values, fraction):
    values = sorted(values)
    return round(values[min(len(values)-1,int((len(values)-1)*fraction))],2)


def run(args):
    if not os.getenv('DATABASE_URL','').rsplit('/',1)[-1].endswith('_test'):
        raise ValueError('Use a dedicated database whose name ends in _test')
    from store.shared_db import pool
    with pool().connection() as conn:
        rows = conn.execute("SELECT product_id FROM products WHERE status='active' ORDER BY product_id").fetchall()
    ids = [r['product_id'] for r in rows]
    if not ids:
        raise ValueError('Migrate a test catalog first')
    from infrastructure.cache import client
    namespace = 'load:'+uuid.uuid4().hex
    processes, logs, urls = [], [], []
    try:
        for _ in range(2):
            with socket.socket() as sock:
                sock.bind(('127.0.0.1',0))
                port = sock.getsockname()[1]
            log = tempfile.TemporaryFile(mode='w+',encoding='utf-8')
            logs.append(log)
            env = dict(os.environ,DEMO_PORT=str(port),DEMO_STREAM_DELAY_MS='0',BACKEND_WARMUP='0',
                       REDIS_PREFIX=namespace,RETRIEVAL_MODE='lexical',USE_RERANK='0')
            process = subprocess.Popen([sys.executable,'scripts/run_demo_server.py'],
                cwd=Path(__file__).resolve().parents[1],env=env,stdout=log,stderr=log,
                creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            processes.append(process)
            url = f'http://127.0.0.1:{port}'
            urls.append(url)
            deadline = time.monotonic()+25
            while time.monotonic()<deadline:
                try:
                    if httpx.get(url+'/ready',timeout=1,trust_env=False).status_code==200:
                        break
                except httpx.HTTPError:
                    pass
                if process.poll() is not None:
                    log.seek(0)
                    raise RuntimeError(log.read())
                time.sleep(.1)
            else:
                raise RuntimeError('Server did not become ready')
        reports = []
        with httpx.Client(timeout=30,trust_env=False,limits=httpx.Limits(max_connections=args.concurrency)) as http:
            for kind, count in [('product',args.requests),('chat',args.chats)]:
                if count<=0:
                    continue
                # Warm each replica before measuring; chat only reads the shared cart.
                for url in urls:
                    http.get(url+'/products/'+ids[0]).raise_for_status()
                    http.post(url+'/chat',json={'query':'看看购物车','request_id':'warm-'+uuid.uuid4().hex}).raise_for_status()
                def request(i):
                    start = time.perf_counter()
                    try:
                        if kind == 'product':
                            response = http.get(urls[i%2]+'/products/'+ids[i%len(ids)])
                        else:
                            response = http.post(urls[i%2]+'/chat',json={'query':'看看购物车',
                                'session_id':namespace+':'+str(i),'request_id':uuid.uuid4().hex})
                        status = response.status_code
                        error = ''
                    except httpx.HTTPError as exc:
                        status = 0
                        error = type(exc).__name__
                    return (time.perf_counter()-start)*1000,status,error
                started = time.perf_counter()
                with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
                    if args.duration:
                        def worker(worker_id):
                            samples, i = [], worker_id
                            while time.perf_counter()-started < args.duration:
                                samples.append(request(i))
                                i += args.concurrency
                            return samples
                        samples = [sample for group in executor.map(worker,range(args.concurrency)) for sample in group]
                        count = len(samples)
                    else:
                        samples = list(executor.map(request,range(count)))
                elapsed = time.perf_counter()-started
                latencies = [ms for ms,_,_ in samples]
                statuses = dict(Counter(str(status) for _,status,_ in samples))
                errors = dict(Counter(error for _,_,error in samples if error))
                reports.append({'workload':kind,'requests':count,'concurrency':args.concurrency,
                    'elapsed_seconds':round(elapsed,3),'rps':round(count/elapsed,2),'status_counts':statuses,
                    'errors':sum(status!=200 for _,status,_ in samples),'transport_errors':errors,'p50_ms':percentile(latencies,.5),
                    'p95_ms':percentile(latencies,.95),'p99_ms':percentile(latencies,.99)})
        report = {'date_utc':datetime.now(timezone.utc).isoformat(),'platform':platform.platform(),
            'python':platform.python_version(),'api_processes':2,'catalog_products':len(ids),
            'pg_pool_per_process':int(os.getenv('PG_POOL_SIZE','10')),
            'chat_max_inflight':int(os.getenv('CHAT_MAX_INFLIGHT','16')),
            'target_duration_per_workload_seconds':args.duration,
            'model':'offline DemoChatModel; chat workload reads cart, no remote LLM or embedding',
            'storage':'real Docker PostgreSQL/pgvector and Redis on the same host',
            'results':reports,'limits':'Local closed-loop throughput; not production capacity, semantic quality, or a million-request SLA.'}
        if args.output:
            args.output.parent.mkdir(parents=True,exist_ok=True)
            args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(report,ensure_ascii=False,indent=2))
    finally:
        for process in processes:
            process.terminate()
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        for log in logs:
            if args.output:
                log.seek(0)
                args.output.with_suffix(f'.server-{logs.index(log)}.log').write_text(log.read(),encoding='utf-8')
            log.close()
        keys = list(client().scan_iter(namespace+':*'))
        if keys:
            client().delete(*keys)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--requests',type=int,default=1000)
    parser.add_argument('--chats',type=int,default=200)
    parser.add_argument('--concurrency',type=int,default=8)
    parser.add_argument('--duration',type=float,default=0,help='Sustain each workload for this many seconds instead of a fixed request count')
    parser.add_argument('--output',type=Path)
    args = parser.parse_args()
    if args.concurrency<1 or args.requests<0 or args.chats<0:
        parser.error('counts must be non-negative and concurrency positive')
    run(args)
