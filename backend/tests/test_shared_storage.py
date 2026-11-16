"""Real PostgreSQL + Redis contracts. Opt in with SHOPPING_TEST_DATABASE_URL.

The database name must end in _test; fixtures truncate only that test database.
No Fake Redis or mocked SQL is used. Synthetic vectors test infrastructure only.
"""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from store.turn_context import mutation_scope

pytestmark = pytest.mark.skipif(
    not os.getenv('SHOPPING_TEST_DATABASE_URL'), reason='real shared services not configured'
)


@pytest.fixture
def shared(monkeypatch):
    from store.shared_db import initialize, pool, close_pools
    import redis
    url = os.environ['SHOPPING_TEST_DATABASE_URL']
    assert url.rsplit('/', 1)[-1].endswith('_test')
    monkeypatch.setenv('DATABASE_URL', url)
    monkeypatch.setenv('REDIS_URL', os.environ.get('SHOPPING_TEST_REDIS_URL', 'redis://127.0.0.1:56379/0'))
    monkeypatch.setenv('REDIS_PREFIX', 'test:' + uuid.uuid4().hex)
    monkeypatch.setenv('EMBEDDING_MODEL', 'test-vector')
    initialize()
    with pool().connection() as conn:
        conn.execute('TRUNCATE products, users, agent_sessions, session_fences, request_ledger, user_preferences, preference_undo_tokens CASCADE')
        conn.execute("INSERT INTO users(user_id) VALUES ('demo_user')")
    client = redis.Redis.from_url(os.environ['REDIS_URL'], decode_responses=True)
    yield client
    keys = list(client.scan_iter(os.environ['REDIS_PREFIX'] + ':*'))
    if keys:
        client.delete(*keys)
    close_pools()


@pytest.fixture
def catalog(shared):
    from store.shared_db import connection
    from store.import_product_data import import_product
    root = Path(__file__).resolve().parents[2] / 'data'
    with connection() as conn:
        for pid, prices, brand in [('a', [100, 300], 'A'), ('b', [200], 'B'), ('c', [190], 'C')]:
            import_product(conn, {
                'product_id': pid, 'title': pid, 'brand': brand, 'category': '数码',
                'sub_category': '平板', 'base_price': prices[0], 'image_path': pid + '.jpg',
                'skus': [{'sku_id': pid + str(i), 'price': p, 'properties': {}} for i, p in enumerate(prices)],
            }, root / 'test' / 'data' / (pid + '.json'), root)
    return shared


def test_postgres_catalog_and_sku_interval(catalog):
    from store.product_store import ProductStore
    store = ProductStore()
    assert [p.product_id for p in store.find_candidates(min_price=180, max_price=220)] == ['c', 'b']
    assert store.get_product_detail('b').skus[0].price == 200


def test_vector_filters_and_stale_content(catalog):
    from rag.pgvector_store import PgVectorStore
    from store.shared_db import connection
    store = PgVectorStore('test-vector')
    for pid, vector in [('a', [1, 0, 0]), ('b', [.9, .1, 0]), ('c', [.8, .2, 0])]:
        store.upsert(pid, pid, vector)
    rows = store.search_vector([1, 0, 0], min_price=180, max_price=220, brand_exclude=['C'])
    assert [r.product_id for r in rows] == ['b']
    with connection() as conn:
        conn.execute("UPDATE products SET title = ? WHERE product_id = ?", ('new', 'b'))
    assert store.search_vector([1, 0, 0], min_price=180, max_price=220, brand_exclude=['C']) == []


def test_session_window_shared_and_recovers_from_redis_loss(shared):
    from store.redis_session import RedisSessionStore
    first, second = RedisSessionStore(), RedisSessionStore()
    with first.turn('conversation') as lease, mutation_scope(lease):
        session = first.get_or_create('conversation')
        for i in range(14):
            session.add_user(str(i))
        session.set('last_hits', [{'product_id': 'b', 'title': 'b'}])
        first.save(session)
    assert [m.content for m in second.get_or_create('conversation').history] == list(map(str, range(4, 14)))
    shared.delete(first.key('conversation'))
    recovered = second.get_or_create('conversation')
    assert recovered.recall_hits()[0]['product_id'] == 'b'
    assert len(recovered.history) == 10


def test_session_busy_and_stale_save_rejected(shared):
    from store.redis_session import RedisSessionStore, SessionBusy, SessionConflict
    first, second = RedisSessionStore(), RedisSessionStore()
    stale = first.get_or_create('s')
    with first.turn('s') as lease, mutation_scope(lease):
        with pytest.raises(SessionBusy):
            with second.turn('s'):
                pass
        fresh = first.get_or_create('s')
        fresh.add_user('fresh')
        first.save(fresh)
    stale.add_user('stale')
    with pytest.raises(SessionConflict):
        second.save(stale)


def test_cache_single_flight_and_key_constraints(shared):
    import time
    from infrastructure.cache import SharedCache
    calls = []
    cache = SharedCache()
    def load():
        calls.append(1)
        time.sleep(.1)
        return ['b']
    key = cache.key('search', {'budget': 200, 'exclude': ['C']})
    assert key != cache.key('search', {'budget': 300, 'exclude': ['C']})
    with ThreadPoolExecutor(max_workers=8) as executor:
        assert list(executor.map(lambda _: cache.get_or_load(key, load), range(8))) == [['b']] * 8
    assert len(calls) == 1
    shared.delete(key)
    assert cache.get_or_load(key, load) == ['b']
    assert len(calls) == 2


def test_cart_transaction_rolls_back_and_deduplicates(catalog):
    from store.pg_ledger import PgRequestLedger
    from store.cart_store import CartStore
    ledger, cart = PgRequestLedger(), CartStore()
    def add():
        cart.add_product('b')
        return {'quantity': cart.list_items()[0].quantity}
    def crash():
        add()
        raise RuntimeError('failure before recording success')
    with pytest.raises(RuntimeError):
        ledger.run_atomic('request-failed', 'cart', None, crash)
    assert cart.list_items() == []
    with ThreadPoolExecutor(max_workers=6) as executor:
        values = list(executor.map(lambda _: PgRequestLedger().run_atomic('request-success', 'cart', None, add), range(6)))
    assert all(value == {'quantity': 1} for value in values)
    assert cart.list_items()[0].quantity == 1


def test_cache_failure_bypasses_but_session_coordination_fails(shared, monkeypatch):
    from infrastructure.cache import SharedCache
    from store.redis_session import RedisSessionStore, SharedStateUnavailable
    monkeypatch.setenv('REDIS_URL', 'redis://127.0.0.1:1/0')
    cache = SharedCache()
    assert cache.get_or_load(cache.key('outage', {}), lambda: ['database']) == ['database']
    with pytest.raises(SharedStateUnavailable):
        with RedisSessionStore().turn('outage'):
            pytest.fail('a turn must not run without coordination')


def test_expired_turn_cannot_save(shared):
    from store.redis_session import RedisSessionStore, SessionConflict
    store = RedisSessionStore()
    with store.turn('lost') as lease, mutation_scope(lease):
        session = store.get_or_create('lost')
        shared.delete(store.key('lost') + ':turn')
        with pytest.raises(SessionConflict):
            store.save(session)


def test_global_chat_admission_is_shared(shared, monkeypatch):
    from store.redis_session import RedisSessionStore, CapacityBusy
    monkeypatch.setenv('CHAT_MAX_INFLIGHT','1')
    with RedisSessionStore().turn('first-user'):
        with pytest.raises(CapacityBusy):
            with RedisSessionStore().turn('second-user'):
                pytest.fail('shared capacity exceeded')
    with RedisSessionStore().turn('second-user'):
        pass


def test_different_cart_payload_same_id_rejected(catalog):
    from store.pg_ledger import PgRequestLedger, RequestConflict
    ledger = PgRequestLedger()
    ledger.run_atomic('payload-key', 'cart', None, lambda: {'ok':True}, fingerprint='one')
    with pytest.raises(RequestConflict):
        ledger.run_atomic('payload-key', 'cart', None, lambda: pytest.fail('must not run'), fingerprint='two')


def test_concurrent_preference_updates_are_not_lost(shared):
    from store.user_memory_store import UserMemoryStore, PreferenceUpdate
    store = UserMemoryStore()
    with ThreadPoolExecutor(max_workers=6) as executor:
        list(executor.map(lambda n: store.apply_update('person', PreferenceUpdate(
            field='favorite_categories', value=str(n), message='test')), range(6)))
    assert set(store.get_preference('person').favorite_categories) == set(map(str,range(6)))


def test_auxiliary_indexes_use_postgres_and_invalidate(catalog):
    from store.shared_assets import save_asset, PgCompareIndex, PgVisualIndex
    from store.shared_db import connection
    save_asset('b', 'compare', {'dims':{'续航':'一天'},'tagline':'学习'})
    save_asset('b', 'image', {}, vector=[1,0,0], model='test-vector')
    assert PgCompareIndex().value('b','续航') == '一天'
    assert PgVisualIndex().top_k([1,0,0]) == [('b',1.0)]
    with connection() as conn:
        conn.execute('UPDATE products SET title=? WHERE product_id=?', ('changed','b'))
    assert not PgCompareIndex().has('b')
    assert PgVisualIndex().top_k([1,0,0]) == []


def test_sqlite_migration_preserves_source_and_refuses_overwrite(shared, tmp_path):
    import sqlite3
    import hashlib
    from scripts.shared_storage import migrate
    from store.import_product_data import import_product
    from store.product_store import ProductStore
    from store.cart_store import CartStore
    source = tmp_path/'source.sqlite3'
    with sqlite3.connect(source) as conn:
        conn.executescript((Path(__file__).resolve().parents[1]/'db/init.sql').read_text(encoding='utf-8'))
        conn.execute("UPDATE users SET nickname='source nickname' WHERE user_id='demo_user'")
        import_product(conn, {'product_id':'migrated','title':'迁移商品','brand':'品牌','category':'数码',
            'base_price':99,'image_path':'x.jpg','skus':[{'sku_id':'migrated-sku','price':99,'properties':{}}]},
            tmp_path/'data'/'product.json',tmp_path/'data')
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    counts = migrate(source)
    assert counts['products'] == 1
    assert ProductStore().get_product_detail('migrated').title == '迁移商品'
    assert CartStore().add_product('migrated').quantity == 1
    from store.shared_db import pool
    with pool().connection() as conn:
        assert conn.execute("SELECT nickname FROM users WHERE user_id='demo_user'").fetchone()['nickname'] == 'source nickname'
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before
    with pytest.raises(ValueError,match='empty'):
        migrate(source)


def test_takeover_fences_business_writes_and_old_cleanup(catalog):
    from store.redis_session import RedisSessionStore, SessionConflict
    from store.turn_context import mutation_scope
    from store.cart_store import CartStore
    store = RedisSessionStore()
    old = store.turn('takeover')
    old_lease = old.__enter__()
    catalog.delete(store.key('takeover')+':turn')
    with store.turn('takeover') as current:
        with mutation_scope(old_lease), pytest.raises(SessionConflict):
            CartStore().add_product('b')
        with mutation_scope(old_lease):
            stale = store.get_or_create('takeover')
            assert stale._lease is old_lease
            with pytest.raises(SessionConflict):
                store.save(stale)
        old.__exit__(None,None,None)
        with mutation_scope(current):
            session = store.get_or_create('takeover')
            assert session._lease is current
            CartStore().add_product('b')
            store.save(session)
    assert CartStore().list_items()[0].quantity == 1


def test_slow_cache_owner_does_not_trigger_parallel_backfill(shared,monkeypatch):
    import time
    import threading
    from infrastructure.cache import SharedCache, CacheBusy
    monkeypatch.setenv('CACHE_WAIT_SECONDS','.05')
    entered = threading.Event()
    calls=[]
    cache=SharedCache()
    key=cache.key('slow',{})
    def loader():
        calls.append(1)
        entered.set()
        time.sleep(.25)
        return 'result'
    with ThreadPoolExecutor(max_workers=2) as executor:
        future=executor.submit(cache.get_or_load,key,loader)
        assert entered.wait(1)
        with pytest.raises(CacheBusy):
            cache.get_or_load(key,loader)
        assert future.result() == 'result'
    assert len(calls)==1


def test_moving_sku_invalidates_both_products(catalog):
    from rag.pgvector_store import PgVectorStore
    from store.shared_db import connection
    vectors=PgVectorStore('test-vector')
    vectors.upsert('a','old-a',[1,0,0])
    vectors.upsert('b','old-b',[1,0,0])
    with connection() as conn:
        conn.execute("UPDATE product_skus SET product_id='b' WHERE sku_id='a0'")
    assert vectors.count()==0


def test_stream_close_before_start_releases_shared_resources(shared,monkeypatch):
    from api import main as api
    from store.redis_session import RedisSessionStore
    from store.pg_ledger import PgRequestLedger
    from store.shared_db import pool
    monkeypatch.setattr(api,'_sessions',RedisSessionStore())
    monkeypatch.setattr(api,'_ledger',PgRequestLedger())
    monkeypatch.setattr(api,'_agent',object())
    req=api.ChatRequest(query='你好',session_id='unstarted',request_id='unstarted-01')
    stream=api.open_chat_stream(req)
    stream.close()
    with api._sessions.turn('unstarted'):
        pass
    with pool().connection() as conn:
        assert conn.execute("SELECT 1 FROM request_ledger WHERE request_id='unstarted-01'").fetchone() is None


@pytest.fixture
def servers(catalog, tmp_path):
    import contextlib
    import socket
    import subprocess
    import sys
    import time
    import httpx
    processes, urls, logs = [], [], []
    try:
        for i in range(2):
            with socket.socket() as sock:
                sock.bind(('127.0.0.1',0))
                port = sock.getsockname()[1]
            env = dict(os.environ, DEMO_PORT=str(port), DEMO_STREAM_DELAY_MS='0', BACKEND_WARMUP='0',
                       RETRIEVAL_MODE='lexical', USE_RERANK='0')
            log = (tmp_path / f'server-{i}.log').open('w',encoding='utf-8')
            logs.append(log)
            process = subprocess.Popen([sys.executable,'scripts/run_demo_server.py'],
                cwd=Path(__file__).resolve().parents[1],env=env,stdout=log,stderr=log,
                creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            processes.append(process)
            url = f'http://127.0.0.1:{port}'
            urls.append(url)
            deadline = time.monotonic()+20
            while time.monotonic()<deadline:
                try:
                    if httpx.get(url+'/ready', timeout=1, trust_env=False).status_code == 200:
                        break
                except httpx.HTTPError:
                    pass
                assert process.poll() is None, (tmp_path/f'server-{i}.log').read_text(encoding='utf-8')
                time.sleep(.1)
            else:
                pytest.fail((tmp_path/f'server-{i}.log').read_text(encoding='utf-8'))
        yield urls
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
            log.close()


def test_two_http_processes_share_sessions_and_idempotency(servers, shared):
    import httpx
    import time
    from store.redis_session import RedisSessionStore
    a,b = servers
    with httpx.Client(timeout=15,trust_env=False) as client:
        first = client.post(a+'/chat',json={'query':'你好','session_id':'http-session','request_id':'http-turn-01'})
        assert first.status_code == 200, first.text
        second = client.post(b+'/chat/stream',json={'query':'看看购物车','session_id':'http-session','request_id':'http-turn-02'})
        assert second.status_code == 200 and 'event: done' in second.text, second.text
        assert len(RedisSessionStore().get_or_create('http-session').history) == 4
        replay = client.post(b+'/chat',json={'query':'你好','session_id':'http-session','request_id':'http-turn-01'})
        assert replay.json() == first.json()
        assert replay.headers['Idempotent-Replay'] == 'true'
        altered = client.post(b+'/chat',json={'query':'修改内容','session_id':'http-session','request_id':'http-turn-01'})
        assert altered.status_code == 409
        no_session = {'query':'你好','request_id':'http-without-session'}
        initial = client.post(a+'/chat',json=no_session)
        assert initial.status_code == 200
        assert client.post(b+'/chat',json=no_session).json() == initial.json()
        req = {'action':'add','productID':'b','request_id':'http-cart-once'}
        with ThreadPoolExecutor(max_workers=8) as executor:
            replies = list(executor.map(lambda i: client.post(servers[i%2]+'/cart/mutate',json=req), range(8)))
        assert all(r.status_code == 200 for r in replies), [r.text for r in replies]
        assert client.get(a+'/cart').json()['cart']['item_count'] == 1
        with RedisSessionStore().turn('busy-http'):
            busy = client.post(b+'/chat',json={'query':'你好','session_id':'busy-http','request_id':'http-busy-01'})
            assert busy.status_code == 409
        assert client.get(a+'/api/v1/filter').status_code == 404
        cors = client.options(a+'/chat',headers={'Origin':'http://localhost:8081','Access-Control-Request-Method':'POST'})
        assert cors.status_code == 200
        with client.stream('POST',a+'/chat/stream',json={'query':'你好',
                'session_id':'disconnect-http','request_id':'disconnect-http-01'}) as streaming:
            assert streaming.status_code == 200
            assert next(streaming.iter_lines()) == 'event: session'
        key=RedisSessionStore().key('disconnect-http')+':turn'
        deadline=time.monotonic()+3
        while shared.exists(key) and time.monotonic()<deadline:
            time.sleep(.02)
        assert not shared.exists(key), 'HTTP disconnect leaked a renewing session lease'
        invalid=client.post(a+'/chat',json={'query':'','session_id':'invalid-http','request_id':'invalid-http-01'})
        assert invalid.status_code == 400
        retry=client.post(b+'/chat',json={'query':'你好','session_id':'invalid-http','request_id':'invalid-http-01'})
        assert retry.status_code == 200, retry.text
