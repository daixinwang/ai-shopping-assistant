class AIConfig:
    """全局 AI 配置单例，保存当前激活的 Provider / Model / API Key"""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.provider = "anthropic"
            cls._instance.model = "claude-3-5-sonnet-20241022"
            cls._instance.api_key = ""
        return cls._instance

    @classmethod
    def get_instance(cls) -> "AIConfig":
        return cls()

    def update(self, provider: str, model: str, api_key: str):
        self.provider = provider
        self.model = model
        self.api_key = api_key
