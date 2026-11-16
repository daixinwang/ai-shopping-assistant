"""Optional cache-aside storage. Cache failures never change query semantics."""
import hashlib
import json
import os
import random
import time
from functools import lru_cache

import redis


class CacheBusy(RuntimeError):
    pass


@lru_cache(maxsize=8)
def _client(url):
    return redis.Redis.from_url(url, decode_responses=True, socket_connect_timeout=1,
                               socket_timeout=1, max_connections=64)


def client():
    return _client(os.environ['REDIS_URL'])


def prefix():
    return os.getenv('REDIS_PREFIX', 'shopping')


class SharedCache:
    def key(self, namespace, attributes):
        digest = hashlib.sha256(json.dumps(attributes, sort_keys=True, ensure_ascii=False,
                                          separators=(',', ':')).encode()).hexdigest()
        return f'{prefix()}:cache:v1:{namespace}:{digest}'

    def get_or_load(self, key, loader, ttl=60):
        if not os.getenv('REDIS_URL'):
            return loader()
        connection = client()
        lock = connection.lock(key + ':lock', timeout=30,
            blocking_timeout=float(os.getenv('CACHE_WAIT_SECONDS','2')),thread_local=False)
        acquired = False
        try:
            cached = connection.get(key)
            if cached is not None:
                return json.loads(cached)
            acquired = lock.acquire()
            if acquired:
                cached = connection.get(key)
                if cached is not None:
                    lock.release()
                    acquired = False
                    return json.loads(cached)
        except (redis.RedisError, ValueError):
            if acquired:
                try:
                    lock.release()
                except redis.RedisError:
                    pass
            return loader()
        if not acquired:
            raise CacheBusy('相同查询正在计算，请稍后重试')
        try:
            value = loader()
            if acquired:
                try:
                    # A long-running loader must not publish after its lease expired.
                    if lock.owned():
                        connection.set(key, json.dumps(value, ensure_ascii=False),
                                       ex=max(1, int(ttl * random.uniform(.85, 1.15))))
                except redis.RedisError:
                    pass
            return value
        finally:
            if acquired:
                try:
                    lock.release()
                except redis.RedisError:
                    pass
