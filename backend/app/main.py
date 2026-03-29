from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.config import get_settings
from app.core.exceptions import AppError
from app.observability.logging import configure_logging
from app.observability.middleware import CorrelationIdMiddleware
from app.schemas.shared import ErrorResponse

configure_logging()
settings = get_settings()

app = FastAPI(title=settings.project_name)
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    payload = ErrorResponse(
        code=exc.code,
        message=exc.message,
        correlation_id=getattr(request.state, "correlation_id", None),
    )
    return JSONResponse(status_code=exc.status_code, content=payload.model_dump())
