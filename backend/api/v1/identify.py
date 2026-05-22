from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()

@router.post("/identify")
async def identify():
    return JSONResponse(status_code=501, content={"detail": "Not implemented yet"})
