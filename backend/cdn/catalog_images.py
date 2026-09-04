from __future__ import annotations

"""Resolve audited local demo images without trusting request paths."""

from functools import lru_cache
from pathlib import Path
import re


DATA_ROOT = Path(__file__).resolve().parents[2] / "data"
_PRODUCT_ID = re.compile(r"^[a-zA-Z0-9_-]+$")


@lru_cache(maxsize=256)
def catalog_image_path(product_id: str) -> Path | None:
    if not _PRODUCT_ID.fullmatch(product_id):
        return None
    match = next(DATA_ROOT.glob(f"*/images/{product_id}_live.jpg"), None)
    return match.resolve() if match and match.is_file() else None


def catalog_image_url(product_id: str, fallback: str | None = None) -> str | None:
    if catalog_image_path(product_id) is not None:
        return f"/catalog-images/{product_id}.jpg"
    return fallback
