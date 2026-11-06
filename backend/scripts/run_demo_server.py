"""Run the shopping API with the offline ``DemoChatModel``: no API key, no network.

Usage, from the repository root::

    .venv\\Scripts\\python.exe backend\\scripts\\run_demo_server.py

The demo model only imitates response shapes (see ``llm/demo.py``) and must not be used
to judge real model quality. The server never reads the saved model configuration, so
real credentials stay untouched. ``DEMO_PORT`` changes the port (default 8000),
``DEMO_HOST`` the listen address (default 127.0.0.1; containers use 0.0.0.0) and
``DEMO_STREAM_DELAY_MS`` the typing speed of streamed answers (default 35).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]


def main() -> None:
    sys.path.insert(0, str(BACKEND_DIR))
    os.chdir(BACKEND_DIR)
    os.environ.setdefault("RETRIEVAL_MODE", "lexical")
    os.environ.setdefault("USE_RERANK", "0")
    # Point model settings at a file that does not exist and use placeholder values,
    # so neither the saved configuration nor a real key is ever loaded.
    os.environ["SHOPPING_CONFIG_PATH"] = str(BACKEND_DIR.parent / ".local" / "demo-model-config.json")
    os.environ["CHAT_API_KEY"] = "demo-offline"
    os.environ["CHAT_BASE_URL"] = "https://demo.invalid/v1"
    os.environ["CHAT_MODEL"] = "demo-offline-model"

    import uvicorn

    from llm.client import set_chat_model
    from llm.demo import DemoChatModel

    set_chat_model(DemoChatModel())

    from main import app

    port = int(os.getenv("DEMO_PORT", "8000"))
    # Containers set DEMO_HOST=0.0.0.0; a local run stays on the loopback interface.
    host = os.getenv("DEMO_HOST", "127.0.0.1")
    print(f"Demo backend with the offline DemoChatModel: http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, reload=False, log_level="info")


if __name__ == "__main__":
    main()
