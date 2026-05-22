import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.v1 import identify, products, filter as filter_router, config as config_router
from services.session_store import SessionStore

app = FastAPI(title="AI 购物助手 API", version="1.0.0")

# CORS - 允许所有来源（开发模式）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 路由注册
app.include_router(identify.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(filter_router.router, prefix="/api/v1")
app.include_router(config_router.router, prefix="/api/v1")

@app.on_event("startup")
async def startup_event():
    async def cleanup_sessions():
        while True:
            await asyncio.sleep(600)  # 10 分钟
            SessionStore().cleanup()
    asyncio.create_task(cleanup_sessions())

@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
