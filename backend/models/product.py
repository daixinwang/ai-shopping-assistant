from pydantic import BaseModel, Field
from typing import Optional


class PlatformPrices(BaseModel):
    """各平台价格"""

    tmall: Optional[float] = None
    jd: Optional[float] = None
    pdd: Optional[float] = None


class ProductItem(BaseModel):
    """商品列表中的单个商品"""

    id: str
    name: str
    category: str
    subcategory: str
    brand: str
    color: str
    style: str
    key_features: list[str] = Field(default_factory=list)
    platform_prices: PlatformPrices
    min_price: float
    rating: float
    sales: int
    store_type: str  # flagship / official / third_party
    tags: list[str] = Field(default_factory=list)
    image_url: str


class ProductSearchRequest(BaseModel):
    """POST /api/v1/products/search 请求体"""

    session_id: str
    filter_params: "FilterParams"  # 前向引用


class ProductSearchResponse(BaseModel):
    """商品搜索响应"""

    products: list[ProductItem]
    total: int
