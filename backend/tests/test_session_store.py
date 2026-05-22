import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.session_store import SessionStore
from models.recognition import RecognitionResult

@pytest.fixture
def store():
    s = SessionStore()
    # 清理可能的残留会话
    s._sessions.clear()
    return s

@pytest.fixture
def sample_recognition():
    return RecognitionResult(
        category="运动鞋",
        subcategory="跑步鞋",
        brand="Nike",
        color="黑色",
        style="低帮轻量",
        key_features=["气垫"],
        search_keywords=["Nike跑步鞋"]
    )

def test_create_and_get(store, sample_recognition):
    """创建会话后能正常获取"""
    session_id = store.create(sample_recognition, "运动鞋")
    assert session_id is not None
    session = store.get(session_id)
    assert session is not None
    assert session["recognition"].brand == "Nike"
    assert session["category"] == "运动鞋"

def test_get_nonexistent(store):
    """获取不存在的会话返回 None"""
    result = store.get("nonexistent-session-id")
    assert result is None

def test_session_id_is_uuid(store, sample_recognition):
    """session_id 应为合法 UUID 格式"""
    import re
    session_id = store.create(sample_recognition)
    uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    assert re.match(uuid_pattern, session_id), f"无效的 UUID: {session_id}"

def test_multiple_sessions_independent(store, sample_recognition):
    """多个会话彼此独立"""
    id1 = store.create(sample_recognition, "运动鞋")

    r2 = RecognitionResult(
        category="手机", subcategory="旗舰", brand="Apple",
        color="白色", style="简洁", key_features=[], search_keywords=["iPhone"]
    )
    id2 = store.create(r2, "手机")

    assert id1 != id2
    assert store.get(id1)["category"] == "运动鞋"
    assert store.get(id2)["category"] == "手机"
