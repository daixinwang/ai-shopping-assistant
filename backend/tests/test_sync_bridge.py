"""The synchronous Agent must not create a new network event loop per model call."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import threading

from llm.client import _run, _iterate_async


def test_sync_bridge_reuses_one_loop_across_worker_threads():
    async def identity():
        return asyncio.get_running_loop()
    with ThreadPoolExecutor(max_workers=6) as executor:
        loops = list(executor.map(lambda _: _run(identity()),range(24)))
    assert len(set(loops)) == 1
    assert loops[0].is_running()


def test_sync_stream_close_cancels_producer():
    closed = threading.Event()
    async def generate():
        try:
            yield 'first'
            await asyncio.sleep(60)
        finally:
            closed.set()
    stream = _iterate_async(generate())
    assert next(stream) == 'first'
    stream.close()
    assert closed.wait(2), 'abandoned streams must cancel the provider task'
