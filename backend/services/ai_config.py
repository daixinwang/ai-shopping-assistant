import os


class AIConfig:
    """Runtime AI provider/model/key configuration."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.provider = os.getenv("AI_PROVIDER", "anthropic")
            cls._instance.model = os.getenv("AI_MODEL", "claude-3-5-sonnet-20241022")
            cls._instance.api_key = os.getenv("AI_API_KEY", "")
        return cls._instance

    @classmethod
    def get_instance(cls) -> "AIConfig":
        return cls()

    def update(self, provider: str, model: str, api_key: str):
        self.provider = provider
        self.model = model
        self.api_key = api_key
