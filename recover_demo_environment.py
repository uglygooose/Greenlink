from __future__ import annotations

import argparse
import json

from sqlalchemy import func

from app import models
from app.database import DB_INFO, DB_SOURCE, SessionLocal
from app.super_admin_service import DEMO_CLUB_SLUG, DEMO_PERSONAS, ensure_demo_environment


def rebuild_demo() -> dict:
    with SessionLocal() as db:
        payload = ensure_demo_environment(db)
        db.commit()

        club = db.query(models.Club).filter(func.lower(models.Club.slug) == DEMO_CLUB_SLUG.lower()).first()
        club_id = int(getattr(club, "id", 0) or 0)
        counts = {
            "members": int(db.query(func.count(models.Member.id)).filter(models.Member.club_id == club_id).scalar() or 0),
            "bookings": int(db.query(func.count(models.Booking.id)).filter(models.Booking.club_id == club_id).scalar() or 0),
            "tee_times": int(db.query(func.count(models.TeeTime.id)).filter(models.TeeTime.club_id == club_id).scalar() or 0),
            "ledger_entries": int(db.query(func.count(models.LedgerEntry.id)).filter(models.LedgerEntry.club_id == club_id).scalar() or 0),
            "revenue_transactions": int(db.query(func.count(models.RevenueTransaction.id)).filter(models.RevenueTransaction.club_id == club_id).scalar() or 0),
            "communications": int(db.query(func.count(models.ClubCommunication.id)).filter(models.ClubCommunication.club_id == club_id).scalar() or 0),
            "golf_day_bookings": int(db.query(func.count(models.GolfDayBooking.id)).filter(models.GolfDayBooking.club_id == club_id).scalar() or 0),
            "pro_shop_products": int(db.query(func.count(models.ProShopProduct.id)).filter(models.ProShopProduct.club_id == club_id).scalar() or 0),
            "pro_shop_sales": int(db.query(func.count(models.ProShopSale.id)).filter(models.ProShopSale.club_id == club_id).scalar() or 0),
        }
        return {
            "db_source": DB_SOURCE,
            "db_info": DB_INFO,
            "workspace": payload.get("workspace") or {},
            "credentials": payload.get("credentials") or [],
            "counts": counts,
        }


def validate_logins() -> dict[str, int]:
    from fastapi.testclient import TestClient

    from app.main import app

    statuses: dict[str, int] = {}
    with TestClient(app) as client:
        for key, persona in DEMO_PERSONAS.items():
            response = client.post(
                "/login",
                json={"email": persona["email"], "password": persona["password"]},
            )
            statuses[key] = int(response.status_code)
    return statuses


def main() -> int:
    parser = argparse.ArgumentParser(description="Rebuild the GreenLink demo environment in the active database.")
    parser.add_argument("--validate", action="store_true", help="Also validate demo logins via the app /login endpoint.")
    args = parser.parse_args()

    result = rebuild_demo()
    if args.validate:
        result["login_statuses"] = validate_logins()

    print(json.dumps(result, indent=2, sort_keys=True, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
