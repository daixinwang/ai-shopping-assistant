from pydantic import BaseModel, Field
from typing import Optional, Literal


class FilterParams(BaseModel):
    """结构化筛选条件（由 IntentPipeline 生成或手动指定）"""

    price_max: Optional[float] = Field(None, description="最高价格")
    price_min: Optional[float] = Field(None, description="最低价格")
    color: Optional[str] = Field(None, description="颜色关键词")
    rating_min: Optional[float] = Field(None, description="最低评分")
    platform: Optional[Literal["tmall", "jd", "pdd"]] = Field(None, description="指定平台")
    store_type: Optional[Literal["flagship", "official", "third_party"]] = Field(None)
    sort: Optional[Literal["price_asc", "price_desc", "sales", "rating"]] = Field(None)
    keywords: list[str] = Field(default_factory=list, description="额外关键词")


class NLFilterRequest(BaseModel):
    """POST /api/v1/filter 请求体"""

    session_id: str
    nl_query: str = Field(..., description="自然语言筛选条件")


class NLFilterResponse(BaseModel):
    """POST /api/v1/filter 响应"""

    products: list["ProductItem"]  # 前向引用，在 product.py 中定义
    applied_filters: FilterParams
