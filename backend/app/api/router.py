from fastapi import APIRouter

from app.api.routes import auth, health, platform, session

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/api/auth", tags=["auth"])
api_router.include_router(session.router, prefix="/api/session", tags=["session"])
api_router.include_router(platform.router, prefix="/api/platform", tags=["platform"])
