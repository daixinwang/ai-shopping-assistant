from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, SecretStr

from services.ai_config import AIConfig
from services.model_config import effective_config, save_config
from llm.client import reset_chat_model
from llm.doubao import DoubaoChatModel, DoubaoSettings

router = APIRouter()
# These are examples; the exact model ID must come from the user's provider.
PROVIDERS = {'doubao': ['doubao-seed-2.0-lite'], 'openai': ['gpt-4o-mini']}


class ConfigRequest(BaseModel):
    provider: str
    model: str
    base_url: str = ''
    api_key: SecretStr = SecretStr('')


class ConfigResponse(BaseModel):
    provider: str
    model: str
    base_url: str
    key_set: bool
    source: str


def public_config(value: dict) -> ConfigResponse:
    return ConfigResponse(provider=value['provider'], model=value['model'], base_url=value['base_url'],
                          key_set=bool(value['api_key']), source=value.get('source', 'saved'))


def resolve_request(req: ConfigRequest) -> dict:
    if req.provider not in PROVIDERS:
        raise HTTPException(422, '主导购目前支持豆包及 OpenAI 兼容协议，请选择对应接入方式。')
    url = req.base_url.strip().rstrip('/')
    try:
        parsed = urlsplit(url)
        valid = parsed.scheme in ('https', 'http') and parsed.hostname and not (parsed.username or parsed.password or parsed.query or parsed.fragment)
        if parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1', '::1'):
            valid = False
        if parsed.port is not None and not 0 < parsed.port <= 65535:
            valid = False
    except ValueError:
        valid = False
    if not valid or any(char.isspace() for char in url) or url.endswith(('/chat/completions', '/responses', '/messages')):
        raise HTTPException(422, '请填写 HTTPS Base URL（本机服务可用 HTTP），不要包含密钥、查询参数或 /chat/completions 等接口后缀。')
    if not req.model.strip():
        raise HTTPException(422, '请填写模型 ID。')
    key = req.api_key.get_secret_value().strip()
    if not key:
        previous = effective_config()
        if previous['provider'] != req.provider or previous['base_url'].rstrip('/') != url:
            raise HTTPException(422, '更换服务商或 Base URL 时，请重新填写对应的 API Key。')
        key = previous['api_key']
    if not key:
        raise HTTPException(422, '请填写 API Key。')
    return {'provider': req.provider, 'model': req.model.strip(), 'base_url': url, 'api_key': key}


@router.post('/config', response_model=ConfigResponse)
async def update_config(req: ConfigRequest):
    try:
        value = resolve_request(req)
        save_config(value)
    except (OSError, RuntimeError):
        raise HTTPException(503, '配置未保存：请检查后端本机配置目录的读写权限。') from None
    AIConfig.get_instance().update(value['provider'], value['model'], value['api_key'])
    reset_chat_model()
    return public_config(value)


@router.get('/config', response_model=ConfigResponse)
async def get_config():
    try:
        return public_config(effective_config())
    except RuntimeError:
        raise HTTPException(503, '本机模型配置无法读取，请检查配置文件。') from None


@router.post('/config/test')
async def test_config(req: ConfigRequest):
    try:
        value = resolve_request(req)
    except RuntimeError:
        raise HTTPException(503, '本机模型配置无法读取。') from None
    adapter = DoubaoChatModel(DoubaoSettings(api_key=value['api_key'], base_url=value['base_url'],
                                           model=value['model'], timeout=12, max_retries=0))
    try:
        reply = await adapter.complete([{'role': 'user', 'content': 'Reply with OK only.'}])
        if not reply.strip():
            raise HTTPException(502, '接口返回空内容，请检查模型是否支持 Chat Completions。')
        return {'ok': True, 'message': '连接成功，模型已返回回复。'}
    except HTTPException:
        raise
    except Exception as error:
        code = getattr(error, 'status_code', None)
        message = {401: '鉴权失败，请检查 API Key 是否与 Base URL 匹配。',
                   403: '没有调用权限，请检查模型开通状态和套餐权限。',
                   404: '接口或模型不存在，请检查 Base URL 和模型 ID。',
                   429: '请求受限，请检查额度和调用频率。'}.get(code, '连接失败或超时，请检查后端网络、Base URL 和模型 ID。')
        raise HTTPException(502, message) from None
    finally:
        await adapter.client.close()


@router.get('/providers')
async def get_providers():
    return PROVIDERS
