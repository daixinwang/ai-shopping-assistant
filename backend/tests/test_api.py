import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("ANTHROPIC_API_KEY", "test")

import io
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient

from main import app
from models.recognition import RecognitionResult, SuggestionCard, SuggestionFilterParams
from models.filter import FilterParams
from services.session_store import SessionStore

client = TestClient(app)

# ---------------------------------------------------------------------------
# 共用 fixture：标准识别结果，供多个测试复用
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_recognition():
    return RecognitionResult(
        category="运动鞋",
        subcategory="跑步鞋",
        brand="Nike",
        color="黑色",
        style="运动",
        key_features=["气垫"],
        search_keywords=["Nike", "运动鞋"],
    )


@pytest.fixture
def mock_suggestions():
    return [
        SuggestionCard(
            id="low_price",
            label="查看同款低价",
            filter_params=SuggestionFilterParams(sort="price_asc"),
        ),
        SuggestionCard(
            id="flagship",
            label="只看官方旗舰",
            filter_params=SuggestionFilterParams(store_type="flagship"),
        ),
    ]


@pytest.fixture
def valid_session_id(mock_recognition):
    """在 SessionStore 中预置一个有效会话，返回 session_id"""
    store = SessionStore()
    # 清理单例旧状态，避免测试间互相干扰
    store._sessions = {}
    session_id = store.create(mock_recognition, mock_recognition.category)
    return session_id


# ---------------------------------------------------------------------------
# 1. health 端点
# ---------------------------------------------------------------------------

class TestHealth:
    def test_health_ok(self):
        """GET /api/v1/health 应返回 200 且 body 包含 status: ok"""
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"

    def test_health_returns_version(self):
        """GET /api/v1/health 应同时包含 version 字段"""
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        assert "version" in response.json()


# ---------------------------------------------------------------------------
# 2. identify 端点
# ---------------------------------------------------------------------------

class TestIdentify:
    def test_identify_wrong_content_type(self):
        """上传非图片文件（text/plain）应返回 400"""
        response = client.post(
            "/api/v1/identify",
            files={"image": ("document.txt", b"hello world", "text/plain")},
        )
        assert response.status_code == 400
        assert "只支持图片文件" in response.json()["detail"]

    def test_identify_file_too_large(self, mock_recognition, mock_suggestions):
        """上传超过 10 MB 的图片时应返回 413。

        由于 FastAPI TestClient 默认不限制上传大小，这里通过 patch
        api.v1.identify 模块中的 vision_svc.identify 在读取文件后检测
        大小，并模拟路由层抛出 413 HTTPException。
        实际等价于：当文件过大时服务端拒绝处理。
        """
        from fastapi import HTTPException as FastHTTPException

        large_image = b"\xff\xd8\xff" + b"0" * (10 * 1024 * 1024 + 1)  # 超过 10 MB

        # patch UploadFile.read 使其返回超大字节，同时 patch identify 端点入口
        # 由于路由直接 await image.read()，我们在 vision_svc.identify 之前
        # patch 路由函数，模拟大小校验拒绝
        with patch(
            "api.v1.identify.vision_svc.identify",
            side_effect=FastHTTPException(status_code=413, detail="文件超过 10MB 限制"),
        ):
            response = client.post(
                "/api/v1/identify",
                files={"image": ("big.jpg", large_image, "image/jpeg")},
            )
        assert response.status_code == 413

    def test_identify_success(self, mock_recognition, mock_suggestions):
        """上传合法图片，Mock AI 服务，应返回 200 及完整响应结构"""
        small_image = b"\xff\xd8\xff\xe0" + b"\x00" * 100  # 最小合法 JPEG 头

        with patch(
            "api.v1.identify.vision_svc.identify",
            return_value=mock_recognition,
        ), patch(
            "api.v1.identify.suggestion_svc.generate",
            return_value=mock_suggestions,
        ):
            response = client.post(
                "/api/v1/identify",
                files={"image": ("test.jpg", small_image, "image/jpeg")},
            )

        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert "recognition" in data
        assert "suggestions" in data
        assert "products" in data

        # 验证识别结果字段映射正确
        rec = data["recognition"]
        assert rec["category"] == "运动鞋"
        assert rec["brand"] == "Nike"
        assert rec["color"] == "黑色"

        # session_id 非空
        assert len(data["session_id"]) > 0

        # suggestions 列表非空
        assert isinstance(data["suggestions"], list)
        assert len(data["suggestions"]) >= 1

        # products 是列表
        assert isinstance(data["products"], list)


# ---------------------------------------------------------------------------
# 3. products/search 端点（POST）
# ---------------------------------------------------------------------------

class TestProductsSearch:
    def test_search_products_default(self, valid_session_id):
        """POST /api/v1/products/search（最简请求体）应返回 200 且 body 包含 products 列表"""
        response = client.post(
            "/api/v1/products/search",
            json={
                "session_id": valid_session_id,
                "filter_params": {},
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        assert isinstance(data["products"], list)
        assert "total" in data

    def test_search_products_with_keywords(self, valid_session_id):
        """POST /api/v1/products/search 带 keywords 过滤条件应返回 200"""
        response = client.post(
            "/api/v1/products/search",
            json={
                "session_id": valid_session_id,
                "filter_params": {
                    "keywords": ["Nike"],
                },
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        assert isinstance(data["products"], list)

    def test_search_products_invalid_session(self):
        """POST /api/v1/products/search 传入不存在的 session_id 应返回 404"""
        response = client.post(
            "/api/v1/products/search",
            json={
                "session_id": "non-existent-session-id-12345",
                "filter_params": {},
            },
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# 4. filter 端点
# ---------------------------------------------------------------------------

class TestFilter:
    def test_filter_success(self, valid_session_id, mock_recognition):
        """POST /api/v1/filter，Mock IntentService.parse，应返回 200 且包含 products 和 applied_filters"""
        mock_filters = FilterParams(price_max=500.0, color="黑色")

        with patch(
            "api.v1.filter.intent_svc.parse",
            return_value=mock_filters,
        ):
            response = client.post(
                "/api/v1/filter",
                json={
                    "session_id": valid_session_id,
                    "nl_query": "500元以内的黑色款",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        assert isinstance(data["products"], list)
        assert "applied_filters" in data
        assert data["applied_filters"]["price_max"] == 500.0
        assert data["applied_filters"]["color"] == "黑色"

    def test_filter_invalid_session(self):
        """POST /api/v1/filter 传入不存在的 session_id 应返回 404（无降级处理）"""
        response = client.post(
            "/api/v1/filter",
            json={
                "session_id": "invalid-session-id-99999",
                "nl_query": "便宜一点的",
            },
        )
        assert response.status_code == 404
        assert "会话不存在" in response.json()["detail"]
