from fastapi import APIRouter, HTTPException
from services.product_service import ProductService
from services.session_store import SessionStore
from models.product import ProductSearchRequest, ProductSearchResponse
from models.filter import FilterParams

router = APIRouter()
product_svc = ProductService()
session_store = SessionStore()

@router.post("/products/search", response_model=ProductSearchResponse)
async def search_products(request: ProductSearchRequest):
    session = session_store.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或已过期，请重新识别")

    recognition = session["recognition"]

    # 过滤器中的 sort/store_type 来自建议卡片点击
    products = product_svc.search_and_filter(
        keywords=recognition.search_keywords,
        filters=request.filter_params,
        category=recognition.category
    )

    return ProductSearchResponse(products=products, total=len(products))
