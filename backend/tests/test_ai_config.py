import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.ai_config import AIConfig

def test_default_values():
    config = AIConfig.get_instance()
    assert config.provider == "anthropic"
    assert config.model == "claude-3-5-sonnet-20241022"
    assert config.api_key == ""

def test_singleton():
    a = AIConfig.get_instance()
    b = AIConfig.get_instance()
    assert a is b

def test_update():
    config = AIConfig.get_instance()
    config.update(provider="openai", model="gpt-4o", api_key="sk-test")
    assert config.provider == "openai"
    assert config.model == "gpt-4o"
    assert config.api_key == "sk-test"
    # 还原默认值
    config.update(provider="anthropic", model="claude-3-5-sonnet-20241022", api_key="")


def test_loads_runtime_env(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "doubao")
    monkeypatch.setenv("AI_MODEL", "doubao-seed-2.0-lite")
    monkeypatch.setenv("AI_API_KEY", "ark-test")
    AIConfig._instance = None

    config = AIConfig.get_instance()

    assert config.provider == "doubao"
    assert config.model == "doubao-seed-2.0-lite"
    assert config.api_key == "ark-test"

    AIConfig._instance = None
