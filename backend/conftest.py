"""Offline-safe defaults for migrated CartPilot tests.

Tests replace the client before use; these placeholders ensure model selection itself
does not depend on a developer's private environment.
"""

import os


os.environ.setdefault("CHAT_API_KEY", "test-key")
os.environ.setdefault("CHAT_BASE_URL", "https://example.invalid/v1")
os.environ.setdefault("CHAT_MODEL", "test-model")
os.environ.setdefault("RETRIEVAL_MODE", "lexical")
os.environ.setdefault("USE_RERANK", "0")
