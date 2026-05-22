import uuid
from datetime import datetime, timedelta
from typing import Optional
from models.recognition import RecognitionResult

SESSION_TTL_MINUTES = 30

class SessionStore:
    """内存会话存储，保存识别结果供后续 /search 和 /filter 接口使用"""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._sessions = {}  # type: dict
        return cls._instance

    def create(self, recognition: RecognitionResult, category: str = "") -> str:
        """创建新会话，返回 session_id"""
        session_id = str(uuid.uuid4())
        self._sessions[session_id] = {
            "recognition": recognition,
            "category": category,
            "created_at": datetime.now(),
        }
        return session_id

    def get(self, session_id: str) -> Optional[dict]:
        """获取会话，过期返回 None"""
        session = self._sessions.get(session_id)
        if session is None:
            return None
        if datetime.now() - session["created_at"] > timedelta(minutes=SESSION_TTL_MINUTES):
            del self._sessions[session_id]
            return None
        return session

    def cleanup(self):
        """清理所有过期会话"""
        now = datetime.now()
        expired = [
            sid for sid, s in self._sessions.items()
            if now - s["created_at"] > timedelta(minutes=SESSION_TTL_MINUTES)
        ]
        for sid in expired:
            del self._sessions[sid]
