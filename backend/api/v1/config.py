from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.ai_config import AIConfig

router = APIRouter()

PROVIDERS = {
    "anthropic": [
        "claude-opus-4-5",
        "claude-sonnet-4-5",
        "claude-haiku-4-5-20251001",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
        "claude-3-sonnet-20240229",
        "claude-3-haiku-20240307",
    ],
    "openai": [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "gpt-4",
        "gpt-3.5-turbo",
        "o1",
        "o1-mini",
        "o3-mini",
        "o4-mini",
    ],
    "gemini": [
        "gemini-2.5-pro-preview-05-06",
        "gemini-2.5-flash-preview-05-20",
        "gemini-2.0-flash",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
    ],
    "doubao": [
        "doubao-seed-2.0",
        "doubao-seed-2.0-lite",
        "doubao-pro-32k",
        "doubao-pro-4k",
        "doubao-lite-32k",
        "doubao-lite-4k",
        "doubao-vision-pro-32k",
    ],
}


class ConfigRequest(BaseModel):
    provider: str
    model: str
    api_key: str


class ConfigResponse(BaseModel):
    provider: str
    model: str
    key_set: bool


@router.post("/config", response_model=ConfigResponse)
async def update_config(req: ConfigRequest):
    if req.provider not in PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的 Provider: {req.provider}。支持: {list(PROVIDERS.keys())}"
        )
    # 允许自定义模型 ID（用户可手动输入 endpoint）
    AIConfig.get_instance().update(req.provider, req.model, req.api_key)
    return ConfigResponse(provider=req.provider, model=req.model, key_set=bool(req.api_key))


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    c = AIConfig.get_instance()
    return ConfigResponse(provider=c.provider, model=c.model, key_set=bool(c.api_key))


@router.get("/providers")
async def get_providers():
    return PROVIDERS
