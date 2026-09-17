import asyncio

from fastapi import APIRouter, File, HTTPException, UploadFile

from models.filter import FilterParams
from models.recognition import IdentifyResponse
from services.product_service import ProductService
from services.session_store import SessionStore
from services.suggestion_service import SuggestionService
from services.vision_service import VisionService
from services.vision_service import VisionUnavailableError

router = APIRouter()

vision_svc = VisionService()
suggestion_svc = SuggestionService()
product_svc = ProductService()
session_store = SessionStore()


@router.post("/identify", response_model=IdentifyResponse)
async def identify(image: UploadFile = File(...)):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="只支持图片文件")

    if image.size is not None and image.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="图片文件不能超过 10MB")

    image_bytes = await image.read()
    media_type = image.content_type or "image/jpeg"

    try:
        recognition = await asyncio.to_thread(vision_svc.identify, image_bytes, media_type)
    except HTTPException:
        raise
    except VisionUnavailableError:
        raise HTTPException(
            status_code=503,
            detail={"code": "vision_unavailable", "message": "图片识别暂时不可用"},
        )
    except Exception:
        raise HTTPException(
            status_code=502,
            detail={"code": "vision_failed", "message": "图片识别失败，请重试"},
        )

    try:
        suggestions = await asyncio.to_thread(suggestion_svc.generate, recognition)
    except Exception:
        suggestions = suggestion_svc._default_suggestions()

    products = product_svc.search_and_filter(
        keywords=recognition.search_keywords,
        filters=FilterParams(),
        category=recognition.category,
    )

    session_id = session_store.create(recognition, recognition.category)

    return IdentifyResponse(
        session_id=session_id,
        recognition=recognition,
        suggestions=suggestions,
        products=products,
    )
