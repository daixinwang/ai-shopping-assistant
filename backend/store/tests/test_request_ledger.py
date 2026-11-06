from __future__ import annotations

from pathlib import Path

import pytest

from store.request_ledger import RequestLedger


class _Clock:
    def __init__(self, now: float = 1_000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


@pytest.fixture()
def clock() -> _Clock:
    return _Clock()


@pytest.fixture()
def ledger(tmp_path: Path, clock: _Clock) -> RequestLedger:
    return RequestLedger(tmp_path / "ledger.sqlite3", pending_ttl=120, retention=3600, clock=clock)


def test_first_claim_is_new_and_a_duplicate_is_pending(ledger: RequestLedger) -> None:
    assert ledger.claim("req-00000001", "chat", "s1").state == "new"
    assert ledger.claim("req-00000001", "chat", "s1").state == "pending"


def test_completed_request_replays_the_stored_response(ledger: RequestLedger) -> None:
    ledger.claim("req-00000002", "chat", "s1")
    ledger.complete("req-00000002", {"narrative": "已为你加入购物车"})

    replay = ledger.claim("req-00000002", "chat", "s1")

    assert replay.state == "done"
    assert replay.response == {"narrative": "已为你加入购物车"}


def test_released_request_can_run_again(ledger: RequestLedger) -> None:
    ledger.claim("req-00000003", "cart")
    ledger.release("req-00000003")

    assert ledger.claim("req-00000003", "cart").state == "new"


def test_stale_pending_request_is_taken_over(ledger: RequestLedger, clock: _Clock) -> None:
    ledger.claim("req-00000004", "chat", "s1")
    clock.now += 121

    assert ledger.claim("req-00000004", "chat", "s1").state == "new"


def test_reusing_an_id_for_another_scope_or_session_conflicts(ledger: RequestLedger) -> None:
    ledger.claim("req-00000005", "chat", "s1")

    assert ledger.claim("req-00000005", "cart").state == "conflict"
    assert ledger.claim("req-00000005", "chat", "s2").state == "conflict"


def test_records_older_than_retention_are_forgotten(ledger: RequestLedger, clock: _Clock) -> None:
    ledger.claim("req-00000006", "chat", "s1")
    ledger.complete("req-00000006", {"narrative": "旧回答"})
    clock.now += 3601

    assert ledger.claim("req-00000006", "chat", "s1").state == "new"


@pytest.mark.parametrize("bad", ["", "short", "has space 12345", "x" * 65, "中文请求编号abcdefgh"])
def test_malformed_request_ids_are_rejected(ledger: RequestLedger, bad: str) -> None:
    with pytest.raises(ValueError):
        ledger.claim(bad, "chat")
