import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("ANTHROPIC_API_KEY", "test")

from unittest.mock import MagicMock, patch
from services.ai_config import AIConfig
from services.ai_client_factory import AIClientFactory

def make_anthropic_response(text):
    mock = MagicMock()
    mock.content = [MagicMock(text=text)]
    return mock

def make_openai_response(text):
    mock = MagicMock()
    mock.choices = [MagicMock(message=MagicMock(content=text))]
    return mock

def setup_function():
    AIConfig.get_instance().update("anthropic", "claude-3-5-sonnet-20241022", "test-key")

def teardown_function():
    AIConfig.get_instance().update("anthropic", "claude-3-5-sonnet-20241022", "")

def test_call_anthropic_text_only():
    factory = AIClientFactory()
    mock_resp = make_anthropic_response("hello")
    with patch("anthropic.Anthropic") as MockClient:
        MockClient.return_value.messages.create.return_value = mock_resp
        result = factory.call(system="sys", text="hi")
    assert result == "hello"

def test_call_openai_text_only():
    AIConfig.get_instance().update("openai", "gpt-4o", "sk-test")
    factory = AIClientFactory()
    mock_resp = make_openai_response("world")
    with patch("openai.OpenAI") as MockClient:
        MockClient.return_value.chat.completions.create.return_value = mock_resp
        result = factory.call(system="sys", text="hi")
    assert result == "world"

def test_unsupported_provider_raises():
    AIConfig.get_instance().update("unknown", "model", "key")
    factory = AIClientFactory()
    try:
        factory.call(system="sys", text="hi")
        assert False, "应该抛出 ValueError"
    except ValueError as e:
        assert "unknown" in str(e)
