import asyncio
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from services.vision_service import VisionService
from services.suggestion_service import SuggestionService
from services.product_service import ProductService
from services.session_store import SessionStore
from models.recognition import IdentifyResponse
from models.filter import FilterParams

router = APIRouter()

vision_svc = VisionService()
suggestion_svc = SuggestionService()
product_svc = ProductService()
session_store = SessionStore()

@router.post("/identify", response_model=IdentifyResponse)
async def identify(image: UploadFile = File(...)):
    # 校验文件类型
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="只支持图片文件")

    image_bytes = await image.read()
    media_type = image.content_type or "image/jpeg"

    # Stage 1: 图像识别（在线程中运行同步方法）
    recognition = await asyncio.to_thread(vision_svc.identify, image_bytes, media_type)

    # Stage 2: 生成建议卡片（在线程中运行同步方法）
    suggestions = await asyncio.to_thread(suggestion_svc.generate, recognition)

    # 用关键词搜索初始商品列表
    products = product_svc.search_and_filter(
        keywords=recognition.search_keywords,
        filters=FilterParams(),
        category=recognition.category
    )

    # 保存会话
    session_id = session_store.create(recognition, recognition.category)

    return IdentifyResponse(
        session_id=session_id,
        recognition=recognition,
        suggestions=suggestions,
        products=products
    )
