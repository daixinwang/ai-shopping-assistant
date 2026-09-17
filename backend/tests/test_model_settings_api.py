import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.v1.config import router
from llm.client import get_model_id, reset_chat_model

@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv('SHOPPING_CONFIG_PATH', str(tmp_path / 'model-config.json'))
    monkeypatch.setenv('CHAT_API_KEY', 'environment-key')
    monkeypatch.setenv('CHAT_BASE_URL', 'https://old.example/v1')
    monkeypatch.setenv('CHAT_MODEL', 'old-model')
    from services.ai_config import AIConfig
    AIConfig._instance = None
    reset_chat_model()
    app = FastAPI()
    app.include_router(router, prefix='/api/v1')
    with TestClient(app) as client:
        yield client
    AIConfig._instance = None
    reset_chat_model()

PAYLOAD = {'provider': 'doubao', 'base_url': 'https://new.example/api/v3/', 'model': 'new-model', 'api_key': 'private-test-key'}

def test_save_changes_main_chat_model_without_environment_file(client):
    assert get_model_id() == 'old-model'
    response = client.post('/api/v1/config', json=PAYLOAD)
    assert response.status_code == 200
    assert get_model_id() == 'new-model'
    assert response.json()['base_url'] == 'https://new.example/api/v3'
    assert 'private-test-key' not in response.text

def test_saved_config_survives_client_cache_reset(client):
    client.post('/api/v1/config', json=PAYLOAD)
    reset_chat_model()
    from llm.client import get_chat_model
    model = get_chat_model()
    assert model.settings.api_key == 'private-test-key'
    assert model.settings.base_url == 'https://new.example/api/v3'
    assert model.settings.model == 'new-model'
    assert 'private-test-key' not in client.get('/api/v1/config').text

def test_blank_key_preserves_saved_key_but_never_sends_it_to_changed_host(client):
    client.post('/api/v1/config', json=PAYLOAD)
    changed = {**PAYLOAD, 'model': 'another-model', 'api_key': ''}
    assert client.post('/api/v1/config', json=changed).status_code == 200
    from llm.client import get_chat_model
    assert get_chat_model().settings.api_key == 'private-test-key'
    response = client.post('/api/v1/config', json={**changed, 'base_url': 'https://other.example/v1'})
    assert response.status_code == 422
    assert get_model_id() == 'another-model'

@pytest.mark.parametrize('url', ['file:///tmp/key', 'https://user:pass@example.com/v1', 'https://example.com/v1?key=secret', 'https://example.com/v1/chat/completions'])
def test_rejects_invalid_base_url_without_replacing_active_config(client, url):
    response = client.post('/api/v1/config', json={**PAYLOAD, 'base_url': url})
    assert response.status_code == 422
    assert get_model_id() == 'old-model'

def test_connection_probe_uses_unsaved_fields_without_changing_active_model(client, monkeypatch):
    from llm.doubao import DoubaoChatModel
    seen = []
    async def complete(self, messages, **kwargs):
        seen.append(self.settings)
        return 'OK'
    monkeypatch.setattr(DoubaoChatModel, 'complete', complete)
    response = client.post('/api/v1/config/test', json=PAYLOAD)
    assert response.status_code == 200
    assert seen[0].model == 'new-model'
    assert get_model_id() == 'old-model'

def test_probe_failure_does_not_leak_credentials(client, monkeypatch):
    from llm.doubao import DoubaoChatModel
    async def complete(self, messages, **kwargs):
        raise RuntimeError('private-test-key')
    monkeypatch.setattr(DoubaoChatModel, 'complete', complete)
    response = client.post('/api/v1/config/test', json=PAYLOAD)
    assert response.status_code == 502
    assert 'private-test-key' not in response.text

def test_rejects_provider_without_chat_protocol_support(client):
    response = client.post('/api/v1/config', json={**PAYLOAD, 'provider': 'anthropic'})
    assert response.status_code == 422

def test_legacy_config_and_vision_follow_saved_settings_after_restart(client):
    from services.ai_config import AIConfig
    client.post('/api/v1/config', json=PAYLOAD)
    AIConfig._instance = None
    try:
        legacy = AIConfig.get_instance()
        assert legacy.api_key == 'private-test-key'
        assert legacy.model == 'new-model'
    finally:
        AIConfig._instance = None


def test_legacy_factory_uses_saved_endpoint_over_environment(client, monkeypatch):
    from services.ai_client_factory import AIClientFactory
    client.post('/api/v1/config', json=PAYLOAD)
    seen = []
    class Adapter:
        def __init__(self, settings):
            seen.append(settings)
        async def complete(self, messages, **kwargs):
            return 'OK'
    monkeypatch.setattr('llm.doubao.DoubaoChatModel', Adapter)
    assert AIClientFactory()._call_doubao('old', 'old', 'system', 'hello', None, 'image/jpeg') == 'OK'
    assert seen[0].base_url == 'https://new.example/api/v3'
