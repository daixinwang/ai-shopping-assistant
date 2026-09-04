import asyncio
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute, APIWebSocketRoute
from fastapi.staticfiles import StaticFiles

from api.v1 import config as config_router
from api.v1 import filter as filter_router
from api.v1 import identify, products
from services.session_store import SessionStore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

app = FastAPI(title="AI 拍照识物与智能比价购物助手 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

myntra_images_dir = Path(__file__).parent.parent / "dataset" / "myntradataset" / "images"
if myntra_images_dir.exists():
    app.mount("/images/myntra", StaticFiles(directory=str(myntra_images_dir)), name="myntra_images")
    print(f"Mounted local product images: {myntra_images_dir}")
else:
    print(f"Warning: image directory not found: {myntra_images_dir}")

app.include_router(identify.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(filter_router.router, prefix="/api/v1")
app.include_router(config_router.router, prefix="/api/v1")


@app.on_event("startup")
async def startup_event():
    async def cleanup_sessions():
        while True:
            await asyncio.sleep(600)
            SessionStore().cleanup()

    asyncio.create_task(cleanup_sessions())


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# Keep the established /api/v1 routes above, then expose CartPilot's root API in the
# same FastAPI router.  Mounting a sub-application at ``/`` makes the endpoints work
# but hides them from this application's OpenAPI document.
from api.main import app as cartpilot_app

for cartpilot_route in cartpilot_app.routes:
    if isinstance(cartpilot_route, (APIRoute, APIWebSocketRoute)):
        app.router.routes.append(cartpilot_route)

for startup_handler in cartpilot_app.router.on_startup:
    app.add_event_handler("startup", startup_handler)

for shutdown_handler in cartpilot_app.router.on_shutdown:
    app.add_event_handler("shutdown", shutdown_handler)
