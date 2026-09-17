"""Offline-safe defaults for migrated CartPilot tests.

Tests replace the client before use; these placeholders ensure model selection itself
does not depend on a developer's private environment.
"""

import os
import pytest


os.environ["CHAT_API_KEY"] = "test-key"
os.environ["CHAT_BASE_URL"] = "https://example.invalid/v1"
os.environ["CHAT_MODEL"] = "test-model"
os.environ.setdefault("RETRIEVAL_MODE", "lexical")
os.environ.setdefault("USE_RERANK", "0")


@pytest.fixture(autouse=True)
def isolate_saved_model_config(monkeypatch, tmp_path):
    """Unit tests must not load a developer's saved model credentials."""
    monkeypatch.setenv("SHOPPING_CONFIG_PATH", str(tmp_path / "model-config.json"))
