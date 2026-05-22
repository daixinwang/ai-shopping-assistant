from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()

@router.post("/products/search")
async def search_products():
    return JSONResponse(status_code=501, content={"detail": "Not implemented yet"})
