from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.ai_config import AIConfig

router = APIRouter()

PROVIDERS = {
    "anthropic": [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
    ],
    "openai": [
        "gpt-4o",
        "gpt-4o-mini",
    ],
    "gemini": [
        "gemini-1.5-pro",
        "gemini-1.5-flash",
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
    if req.model not in PROVIDERS[req.provider]:
        raise HTTPException(
            status_code=400,
            detail=f"模型 {req.model} 不属于 {req.provider}"
        )
    AIConfig.get_instance().update(req.provider, req.model, req.api_key)
    return ConfigResponse(provider=req.provider, model=req.model, key_set=bool(req.api_key))


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    c = AIConfig.get_instance()
    return ConfigResponse(provider=c.provider, model=c.model, key_set=bool(c.api_key))


@router.get("/providers")
async def get_providers():
    return PROVIDERS
