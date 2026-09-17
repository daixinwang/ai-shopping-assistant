from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


class RetrievalConfigurationError(RuntimeError):
    """Raised when an explicitly requested retrieval feature cannot start."""


def _enabled(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class RetrievalSettings:
    mode: str
    vector_search: bool
    reranker: bool
    embedding_api_key: str | None = None
    embedding_base_url: str | None = None
    embedding_model: str | None = None

    @classmethod
    def from_env(cls, *, require_index: bool = False) -> "RetrievalSettings":
        legacy_hybrid = _enabled(os.getenv("USE_HYBRID"))
        mode = (os.getenv("RETRIEVAL_MODE") or ("hybrid" if legacy_hybrid else "lexical")).strip().lower()
        if mode not in {"lexical", "hybrid"}:
            raise RetrievalConfigurationError(
                "RETRIEVAL_MODE must be 'lexical' or 'hybrid'"
            )

        reranker = _enabled(os.getenv("USE_RERANK"))
        embedding_api_key = os.getenv("EMBEDDING_API_KEY") or os.getenv("ARK_EMBEDDING_API_KEY")
        embedding_base_url = os.getenv("EMBEDDING_BASE_URL") or os.getenv("ARK_EMBEDDING_BASE_URL")
        embedding_model = os.getenv("EMBEDDING_MODEL") or os.getenv("ARK_EMBEDDING_MODEL")

        if mode == "hybrid":
            missing = [
                name
                for name, value in (
                    ("EMBEDDING_API_KEY", embedding_api_key),
                    ("EMBEDDING_BASE_URL", embedding_base_url),
                    ("EMBEDDING_MODEL", embedding_model),
                )
                if not value
            ]
            if missing:
                raise RetrievalConfigurationError(
                    "hybrid retrieval requires complete embedding configuration; missing: "
                    + ", ".join(missing)
                )
            if require_index:
                default_index = Path(__file__).resolve().parents[1] / "storage" / "chroma"
                index_path = Path(os.getenv("CHROMA_PATH", str(default_index)))
                collection_name = os.getenv("CHROMA_COLLECTION", "product_knowledge")
                try:
                    import chromadb

                    client = chromadb.PersistentClient(
                        path=str(index_path),
                        settings=chromadb.Settings(anonymized_telemetry=False),
                    )
                    collection = client.get_collection(
                        name=collection_name, embedding_function=None
                    )
                    index_ready = collection.count() > 0
                except Exception:  # dependency, corrupt store, or missing collection
                    index_ready = False
                if not index_ready:
                    raise RetrievalConfigurationError(
                        "hybrid retrieval index is unavailable or empty; "
                        "run rag.build_chroma with the configured collection"
                    )

        if reranker:
            missing_rerank = []
            if not (os.getenv("RERANK_API_KEY") or os.getenv("ZHIPU_API_KEY")):
                missing_rerank.append("RERANK_API_KEY")
            missing_rerank.extend(
                name for name in ("RERANK_BASE_URL", "RERANK_MODEL") if not os.getenv(name)
            )
            if missing_rerank:
                raise RetrievalConfigurationError(
                    "USE_RERANK is enabled but reranker configuration is missing: "
                    + ", ".join(missing_rerank)
                )

        return cls(
            mode=mode,
            vector_search=mode == "hybrid",
            reranker=reranker,
            embedding_api_key=embedding_api_key,
            embedding_base_url=embedding_base_url,
            embedding_model=embedding_model,
        )
