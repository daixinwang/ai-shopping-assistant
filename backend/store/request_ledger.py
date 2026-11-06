from __future__ import annotations

"""Request ledger that makes side-effecting HTTP requests idempotent.

Clients attach a random ``request_id`` to every chat turn or cart mutation. A retry
after a dropped connection reuses the same ID, so the server can replay the stored
result instead of running the turn again and, for example, adding an item twice.

States:
    new       - the caller owns the request and must ``complete`` or ``release`` it
    pending   - another attempt with this ID is still running
    done      - the stored response should be replayed unchanged
    conflict  - the ID was already used for another scope or session

A pending claim older than ``pending_ttl`` is treated as abandoned (for example, the
process crashed) and may be taken over. Records expire after ``retention`` seconds.
"""

import json
import logging
import re
import sqlite3
import time
from collections.abc import Callable
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from store.product_store import DEFAULT_DB_PATH


logger = logging.getLogger(__name__)

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS request_ledger (
    request_id    TEXT PRIMARY KEY,
    scope         TEXT NOT NULL,
    session_id    TEXT,
    status        TEXT NOT NULL,
    response_json TEXT,
    updated_at    REAL NOT NULL
)
"""

ClaimState = Literal["new", "pending", "done", "conflict"]


@dataclass(frozen=True)
class LedgerClaim:
    state: ClaimState
    response: dict[str, Any] | None = None


class RequestLedger:
    def __init__(
        self,
        db_path: Path = DEFAULT_DB_PATH,
        *,
        pending_ttl: float = 120.0,
        retention: float = 24 * 3600.0,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.db_path = db_path
        self._pending_ttl = pending_ttl
        self._retention = retention
        self._clock = clock
        self._ensure_table()

    @staticmethod
    def validate(request_id: str) -> str:
        if not isinstance(request_id, str) or not _REQUEST_ID_RE.fullmatch(request_id):
            raise ValueError("request_id must be 8-64 characters of letters, digits, '-' or '_'")
        return request_id

    def claim(self, request_id: str, scope: str, session_id: str | None = None) -> LedgerClaim:
        self.validate(request_id)
        now = self._clock()
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("DELETE FROM request_ledger WHERE updated_at < ?", (now - self._retention,))
            row = conn.execute(
                "SELECT scope, session_id, status, response_json, updated_at "
                "FROM request_ledger WHERE request_id = ?",
                (request_id,),
            ).fetchone()
            if row is None:
                conn.execute(
                    "INSERT INTO request_ledger (request_id, scope, session_id, status, updated_at) "
                    "VALUES (?, ?, ?, 'pending', ?)",
                    (request_id, scope, session_id, now),
                )
                conn.commit()
                return LedgerClaim("new")
            if row["scope"] != scope or (
                session_id and row["session_id"] and row["session_id"] != session_id
            ):
                conn.commit()
                return LedgerClaim("conflict")
            if row["status"] == "done":
                conn.commit()
                return LedgerClaim("done", json.loads(row["response_json"] or "{}"))
            if now - row["updated_at"] > self._pending_ttl:
                conn.execute(
                    "UPDATE request_ledger SET updated_at = ? WHERE request_id = ?",
                    (now, request_id),
                )
                conn.commit()
                logger.warning("Taking over an abandoned pending request")
                return LedgerClaim("new")
            conn.commit()
            return LedgerClaim("pending")
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def complete(self, request_id: str, response: dict[str, Any]) -> None:
        with closing(self._connect()) as conn:
            conn.execute(
                "UPDATE request_ledger SET status = 'done', response_json = ?, updated_at = ? "
                "WHERE request_id = ?",
                (json.dumps(response, ensure_ascii=False), self._clock(), request_id),
            )

    def release(self, request_id: str) -> None:
        """Forget a pending claim whose work did not produce side effects."""
        with closing(self._connect()) as conn:
            conn.execute(
                "DELETE FROM request_ledger WHERE request_id = ? AND status = 'pending'",
                (request_id,),
            )

    def _connect(self) -> sqlite3.Connection:
        # Autocommit mode; ``claim`` opens an explicit IMMEDIATE transaction.
        conn = sqlite3.connect(self.db_path, timeout=5, isolation_level=None)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_table(self) -> None:
        try:
            with closing(self._connect()) as conn:
                conn.execute(_CREATE_TABLE_SQL)
        except Exception:  # noqa: BLE001 - table creation must not block startup
            logger.error("Failed to create request ledger; details suppressed")
