from pydantic import BaseModel, Field
from typing import Optional


class RecognitionResult(BaseModel):
    """VisionPipeline 输出：图像识别结果"""

    category: str = Field(..., description="主类目：运动鞋/手机/耳机/T恤/包包")
    subcategory: str = Field(..., description="子类目")
    brand: Optional[str] = Field(None, description="品牌，无法识别时为 None")
    color: str = Field(..., description="主色调")
    style: str = Field(..., description="风格描述")
    key_features: list[str] = Field(default_factory=list, description="关键特征 2-4 个")
    search_keywords: list[str] = Field(default_factory=list, description="检索关键词 2-3 个")


class SuggestionFilterParams(BaseModel):
    """建议卡片的过滤参数"""

    sort: Optional[str] = Field(None, description="price_asc/price_desc/sales/rating")
    store_type: Optional[str] = Field(None, description="flagship/official/third_party")
    platform: Optional[str] = Field(None, description="tmall/jd/pdd")
    rating_min: Optional[float] = Field(None, description="最低评分")


class SuggestionCard(BaseModel):
    """单个建议卡片"""

    id: str
    label: str
    filter_params: SuggestionFilterParams


class IdentifyResponse(BaseModel):
    """POST /api/v1/identify 的响应"""

    session_id: str
    recognition: RecognitionResult
    suggestions: list[SuggestionCard]
    products: list["ProductItem"]  # 前向引用，在 product.py 中定义
