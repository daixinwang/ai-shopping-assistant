# Backend image. Build from the repository root (the backend reads ../data):
#   docker compose build backend
# PYTHON_IMAGE lets networks without Docker Hub access use a mirror of the same image;
# PIP_INDEX_URL optionally points pip at a closer PyPI mirror.
ARG PYTHON_IMAGE=python:3.12-slim
FROM ${PYTHON_IMAGE}
ARG PIP_INDEX_URL=

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# The code locates data through the repository layout (backend/, data/, .local/),
# so the image keeps that layout under /app.
WORKDIR /app

# Dependencies first, so code changes reuse the cached layer.
COPY backend/requirements.txt backend/requirements.txt
RUN pip install ${PIP_INDEX_URL:+--index-url "$PIP_INDEX_URL"} -r backend/requirements.txt

COPY data/ data/
COPY backend/ backend/

WORKDIR /app/backend

# backend/storage is not tracked by git: build the product database from the tracked
# JSON data. Carts, orders and preferences are written here at runtime, so compose
# mounts a named volume on this directory (seeded from the image on first start).
RUN python -m store.import_product_data --reset \
    && python -m store.import_image_manifest \
    && useradd --create-home --uid 10001 app \
    && mkdir -p /app/.local \
    && chown -R app:app /app/backend/storage /app/.local

USER app
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
