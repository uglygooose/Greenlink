from fastapi import APIRouter

from app.api.comms import routes as comms
from app.api.finance import routes as finance
from app.api.orders import routes as orders
from app.api.pos import routes as pos
from app.api.routes import auth, clubs, golf, health, people, platform, pricing, rules, session, superadmin

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/api/auth", tags=["auth"])
api_router.include_router(session.router, prefix="/api/session", tags=["session"])
api_router.include_router(platform.router, prefix="/api/platform", tags=["platform"])
api_router.include_router(superadmin.router, prefix="/api/superadmin", tags=["superadmin"])
api_router.include_router(people.router, prefix="/api/people", tags=["people"])
api_router.include_router(clubs.router, prefix="/api/clubs", tags=["clubs"])
api_router.include_router(golf.router, prefix="/api/golf", tags=["golf"])
api_router.include_router(rules.router, prefix="/api/rules", tags=["rules"])
api_router.include_router(pricing.router, prefix="/api/pricing", tags=["pricing"])
api_router.include_router(finance.router, prefix="/api/finance", tags=["finance"])
api_router.include_router(orders.router, prefix="/api/orders", tags=["orders"])
api_router.include_router(pos.router, prefix="/api/pos", tags=["pos"])
api_router.include_router(comms.router, prefix="/api/comms", tags=["comms"])
