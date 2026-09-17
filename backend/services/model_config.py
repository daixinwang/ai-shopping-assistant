"""Server-owned model settings. Credentials are never returned by the settings API."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from llm.doubao import DoubaoSettings


def config_path() -> Path:
    return Path(os.environ.get('SHOPPING_CONFIG_PATH') or Path(__file__).resolve().parents[2] / '.local' / 'model-config.json')


def load_saved_config() -> dict | None:
    path = config_path()
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
        if value.get('provider') not in ('doubao', 'openai') or any(not isinstance(value.get(k), str) or not value[k] for k in ('base_url', 'model', 'api_key')):
            raise ValueError('invalid settings')
        return value
    except (OSError, ValueError, TypeError, AttributeError):
        raise RuntimeError('本机模型配置无法读取，请检查配置文件。') from None


def effective_config() -> dict:
    saved = load_saved_config()
    if saved:
        return {**saved, 'source': 'saved'}
    # The existing environment configuration remains a fallback, not a requirement.
    from llm.client import _load_env_once
    _load_env_once()
    return {
        'provider': os.getenv('CHAT_PROVIDER', 'doubao'),
        'api_key': os.getenv('CHAT_API_KEY') or os.getenv('ARK_API_KEY') or '',
        'base_url': os.getenv('CHAT_BASE_URL') or os.getenv('ARK_BASE_URL') or '',
        'model': os.getenv('CHAT_MODEL') or os.getenv('ARK_MODEL') or '',
        'source': 'environment',
    }


def chat_settings() -> DoubaoSettings:
    value = effective_config()
    if not all(value[k] for k in ('api_key', 'base_url', 'model')):
        raise RuntimeError('模型尚未配置，请在服务设置中填写 API Key、Base URL 和模型 ID。')
    return DoubaoSettings(api_key=value['api_key'], base_url=value['base_url'], model=value['model'],
                          timeout=float(os.getenv('CHAT_TIMEOUT', os.getenv('ARK_TIMEOUT', '30'))),
                          max_retries=int(os.getenv('CHAT_MAX_RETRIES', os.getenv('ARK_MAX_RETRIES', '1'))))


def save_config(value: dict) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix='.model-', suffix='.tmp')
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as file:
            json.dump(value, file, ensure_ascii=False)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
