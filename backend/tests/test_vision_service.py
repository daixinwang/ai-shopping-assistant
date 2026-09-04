import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.ai_config import AIConfig
from services.vision_service import VisionService, VisionUnavailableError


def setup_function():
    AIConfig.get_instance().update("anthropic", "claude-3-5-sonnet-20241022", "")


def test_identify_reports_unavailable_when_api_key_is_missing():
    service = VisionService()

    def fail_if_called(*args, **kwargs):
        raise AssertionError("external AI should not be called without an API key")

    service.factory.call = fail_if_called
    with pytest.raises(VisionUnavailableError, match="not configured"):
        service.identify(b"fake-image-bytes", "image/jpeg")
