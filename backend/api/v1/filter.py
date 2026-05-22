import asyncio
from fastapi import APIRouter, HTTPException
from services.intent_service import IntentService
from services.product_service import ProductService
from services.session_store import SessionStore
from models.filter import NLFilterRequest, NLFilterResponse

router = APIRouter()
intent_svc = IntentService()
product_svc = ProductService()
session_store = SessionStore()

@router.post("/filter", response_model=NLFilterResponse)
async def filter_products(request: NLFilterRequest):
    session = session_store.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或已过期，请重新识别")

    recognition = session["recognition"]

    # Stage 3: 自然语言 → 结构化过滤器
    filters = await asyncio.to_thread(intent_svc.parse, request.nl_query, recognition.category)

    products = product_svc.search_and_filter(
        keywords=recognition.search_keywords,
        filters=filters,
        category=recognition.category
    )

    return NLFilterResponse(products=products, applied_filters=filters)
