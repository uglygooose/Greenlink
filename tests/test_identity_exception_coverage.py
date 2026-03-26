from __future__ import annotations

import os
from datetime import date, datetime
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func

os.environ.setdefault("FORCE_SQLITE", "1")
os.environ.setdefault("SQLITE_FALLBACK_URL", "sqlite:///./_identity_exception_coverage_test.db")
os.environ.setdefault("GREENLINK_ENV", "test")
os.environ.setdefault("GREENLINK_ASSUME_LOCAL", "1")
os.environ.setdefault("SECRET_KEY", "greenlink_identity_exception_coverage_test_secret")
os.environ.setdefault("DEMO_SEED_ADMIN", "0")

from app import models
from app.auth import get_password_hash
from app.database import SessionLocal
from app.main import app
from app.routers.admin import _create_weather_notifications
from app.services.enforcement_proof_service import build_enforcement_proof_payload, run_enforcement_backfill
from app.services.exception_waiver_policy_service import ensure_exception_waiver_allowed, get_exception_waiver_policy_payload
from app.services.people_repair_queue_service import list_people_repair_queue_payload
from app.routers.profile import PlayerProfileUpdate, get_my_profile, update_my_profile
from app.routers.tee import BookingMoveRequest, move_booking
from app.services.account_customers_service import (
    AccountCustomerUpsertPayload,
    create_account_customer_payload,
    update_account_customer_payload,
)
from app.services.club_communications_service import ClubCommunicationInput, create_club_communication
from app.services.golf_day_bookings_service import GolfDayBookingUpsertPayload, create_golf_day_booking_payload
from app.services.identity_integrity_service import resolve_booking_identity_context, sync_booking_integrity, sync_member_identity
from app.services.operational_exceptions_service import upsert_operational_exception
from app.services.pro_shop_service import ProShopProductUpsertPayload, ProShopSaleCreatePayload, ProShopSaleItemPayload, create_pro_shop_product_payload, create_pro_shop_sale_payload


def _seed_admin_user() -> dict[str, int | str]:
    admin_email = f"identity-admin-{uuid4().hex[:8]}@greenlinkqa.com"
    password = "IdentityPass!12345"

    with SessionLocal() as db:
        club = models.Club(name=f"Identity Club {uuid4().hex[:6]}", slug=f"identity-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()

        admin = models.User(
            name="Identity Admin",
            email=admin_email,
            password=get_password_hash(password),
            role=models.UserRole.admin,
            club_id=int(club.id),
        )
        db.add(admin)
        db.flush()

        db.add(
            models.UserClubAssignment(
                user_id=int(admin.id),
                club_id=int(club.id),
                role=models.UserRole.admin.value,
                is_primary=True,
            )
        )
        db.commit()
        return {
            "club_id": int(club.id),
            "admin_id": int(admin.id),
            "admin_email": admin_email,
            "password": password,
        }


def _login(client: TestClient, email: str, password: str) -> str:
    response = client.post("/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    payload = response.json()
    token = str(payload.get("access_token") or "")
    assert token
    return token


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_same_global_person_can_hold_different_relationships_across_clubs():
    with SessionLocal() as db:
        club_a = models.Club(name=f"Identity Club A {uuid4().hex[:6]}", slug=f"identity-a-{uuid4().hex[:8]}", active=1)
        club_b = models.Club(name=f"Identity Club B {uuid4().hex[:6]}", slug=f"identity-b-{uuid4().hex[:8]}", active=1)
        db.add_all([club_a, club_b])
        db.flush()

        member = models.Member(
            club_id=int(club_a.id),
            member_number=f"MEM-{uuid4().hex[:6].upper()}",
            first_name="Morgan",
            last_name="Lee",
            email=f"morgan-{uuid4().hex[:8]}@example.com",
            membership_category="Full Member",
            membership_category_raw="Full Member",
            pricing_mode="membership_default",
            membership_status="active",
            active=1,
        )
        db.add(member)
        db.flush()

        global_person_a, relationship_a = sync_member_identity(db, member, source_system="coverage_test")
        global_person_b, relationship_b, issues = resolve_booking_identity_context(
            db,
            club_id=int(club_b.id),
            booking_id=None,
            player_name="Morgan Lee",
            player_email=str(member.email),
            member=None,
            user=None,
            account_customer=None,
            player_type="visitor",
            source_system="coverage_test",
            source_ref=f"booking:{uuid4().hex[:8]}",
        )
        db.commit()

        relationship_rows = (
            db.query(models.ClubRelationshipState)
            .filter(models.ClubRelationshipState.global_person_id == int(global_person_a.id))
            .order_by(models.ClubRelationshipState.club_id.asc())
            .all()
        )

        assert global_person_a is not None
        assert global_person_b is not None
        assert int(global_person_a.id) == int(global_person_b.id)
        assert relationship_a is not None
        assert relationship_b is not None
        assert relationship_a.relationship_type == "member"
        assert relationship_b.relationship_type == "affiliated"
        assert len(issues) == 0
        assert {int(row.club_id) for row in relationship_rows} >= {int(club_a.id), int(club_b.id)}


def test_identity_ambiguity_emits_booking_blocking_exception():
    with SessionLocal() as db:
        club = models.Club(name=f"Identity Ambiguity {uuid4().hex[:6]}", slug=f"identity-amb-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()

        global_person, relationship, issues = resolve_booking_identity_context(
            db,
            club_id=int(club.id),
            booking_id=987654,
            player_name="Walk In Guest",
            player_email=None,
            member=None,
            user=None,
            account_customer=None,
            player_type="visitor",
            source_system="coverage_test",
            source_ref="booking:987654",
        )
        db.commit()

        exception_row = (
            db.query(models.OperationalException)
            .filter(
                models.OperationalException.club_id == int(club.id),
                models.OperationalException.exception_type == "identity_ambiguous_for_booking",
            )
            .first()
        )

        assert global_person is not None
        assert relationship is not None
        assert relationship.booking_eligibility == "review_required"
        assert any(str(issue.get("exception_type")) == "identity_ambiguous_for_booking" for issue in issues)
        assert exception_row is not None
        assert exception_row.blocking_surface == "booking_commit"
        assert exception_row.state in {"open", "acknowledged", "in_progress", "blocked"}


def test_close_day_rejects_open_revenue_integrity_exceptions(client: TestClient):
    seeded = _seed_admin_user()
    token = _login(client, str(seeded["admin_email"]), str(seeded["password"]))
    headers = {"Authorization": f"Bearer {token}"}
    target_date = date(2033, 1, 15)

    with SessionLocal() as db:
        upsert_operational_exception(
            db,
            club_id=int(seeded["club_id"]),
            dedupe_key=f"coverage-close:{int(seeded['club_id'])}:{target_date.isoformat()}",
            exception_type="pricing_context_unresolved",
            blocking_surface="revenue_integrity_close",
            source_domain="identity",
            summary="Open pricing context still blocks close.",
            severity="high",
            owner_role="admin",
            next_required_action="Resolve pricing context before close.",
            details={"date": target_date.isoformat()},
        )
        db.commit()

    response = client.post(f"/cashbook/close-day?close_date={target_date.isoformat()}", headers=headers)
    assert response.status_code == 409, response.text
    assert "Close blocked" in response.json().get("detail", "")


def test_paid_booking_integrity_emits_revenue_link_missing_exception():
    with SessionLocal() as db:
        club = models.Club(name=f"Booking Integrity {uuid4().hex[:6]}", slug=f"booking-int-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()
        db.info["club_id"] = int(club.id)

        tee_time = models.TeeTime(
            club_id=int(club.id),
            tee_time=datetime(2034, 1, 15, 8, 0, 0),
            hole="1",
            capacity=4,
            status="open",
        )
        db.add(tee_time)
        db.flush()

        booking = models.Booking(
            club_id=int(club.id),
            tee_time_id=int(tee_time.id),
            player_name="Walk In Guest",
            player_email=None,
            player_category="visitor",
            price=125.0,
            status=models.BookingStatus.checked_in,
        )
        db.add(booking)
        db.commit()
        sync_booking_integrity(db, booking, source_system="coverage_test")
        db.commit()
        revenue_exception = (
            db.query(models.OperationalException)
            .filter(
                models.OperationalException.club_id == int(club.id),
                models.OperationalException.exception_type == "revenue_link_missing",
                models.OperationalException.state.in_(["open", "acknowledged", "in_progress", "blocked"]),
            )
            .first()
        )
        assert revenue_exception is not None
        assert revenue_exception.blocking_surface == "revenue_integrity_close"


def test_weather_notifications_skip_untrusted_targets_and_emit_exception():
    with SessionLocal() as db:
        club = models.Club(name=f"Weather Integrity {uuid4().hex[:6]}", slug=f"weather-int-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()

        staff = models.User(
            name="Weather Staff",
            email=f"weather-staff-{uuid4().hex[:8]}@example.com",
            password=get_password_hash("WeatherPass!12345"),
            role=models.UserRole.admin,
            club_id=int(club.id),
        )
        player = models.User(
            name="Target Player",
            email=f"target-player-{uuid4().hex[:8]}@example.com",
            password=get_password_hash("WeatherPass!12345"),
            role=models.UserRole.player,
            club_id=int(club.id),
        )
        tee_time = models.TeeTime(
            club_id=int(club.id),
            tee_time=datetime(2035, 2, 14, 9, 0, 0),
            hole="1",
            capacity=4,
            status="open",
        )
        db.add_all([staff, player, tee_time])
        db.flush()

        booking = models.Booking(
            club_id=int(club.id),
            tee_time_id=int(tee_time.id),
            player_name="Unknown Target",
            player_email=None,
            player_category="visitor",
            price=80.0,
            status=models.BookingStatus.booked,
        )
        db.add(booking)
        db.commit()

        counts = _create_weather_notifications(
            db=db,
            club_id=int(club.id),
            target_date=date(2035, 2, 14),
            staff=staff,
            items=[
                {
                    "can_message": True,
                    "notification_sent": False,
                    "booking_id": int(booking.id),
                    "tee_time_id": int(tee_time.id),
                    "player_user_id": int(player.id),
                }
            ],
        )
        db.commit()

        communication_exception = (
            db.query(models.OperationalException)
            .filter(
                models.OperationalException.club_id == int(club.id),
                models.OperationalException.exception_type == "communication_target_untrusted",
                models.OperationalException.state.in_(["open", "acknowledged", "in_progress", "blocked"]),
            )
            .first()
        )

        assert int(counts.get("created") or 0) == 0
        assert int(counts.get("skipped_unlinked") or 0) == 1
        assert communication_exception is not None
        assert communication_exception.blocking_surface == "communications_publish"


def test_published_club_communication_blocks_when_target_trust_is_open():
    with SessionLocal() as db:
        club = models.Club(name=f"Comms Integrity {uuid4().hex[:6]}", slug=f"comms-int-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()

        upsert_operational_exception(
            db,
            club_id=int(club.id),
            dedupe_key=f"communication-target:{uuid4().hex[:8]}",
            exception_type="communication_target_untrusted",
            blocking_surface="communications_publish",
            source_domain="identity",
            summary="Communication targets are not trusted yet.",
            severity="high",
            owner_role="admin",
            next_required_action="Repair trusted contact state before publishing.",
        )
        db.commit()

        with pytest.raises(HTTPException) as exc_info:
            create_club_communication(
                db,
                club_id=int(club.id),
                admin_user_id=None,
                payload=ClubCommunicationInput(
                    kind="announcement",
                    audience="members",
                    status="published",
                    title="Storm Delay",
                    body="Expect delays.",
                ),
            )

        assert int(exc_info.value.status_code) == 409
        assert "Publish blocked" in str(exc_info.value.detail)


def test_golf_day_settlement_without_trusted_account_link_emits_blocking_exception():
    with SessionLocal() as db:
        club = models.Club(name=f"Golf Day Integrity {uuid4().hex[:6]}", slug=f"golfday-int-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()

        create_golf_day_booking_payload(
            db,
            club_id=int(club.id),
            payload=GolfDayBookingUpsertPayload(
                event_name="Corporate Challenge",
                amount=12000.0,
                balance_due=3500.0,
                payment_status="partial",
                invoice_reference=f"INV-{uuid4().hex[:8].upper()}",
            ),
        )
        db.commit()

        exception_row = (
            db.query(models.OperationalException)
            .filter(
                models.OperationalException.club_id == int(club.id),
                models.OperationalException.exception_type == "revenue_link_missing",
                models.OperationalException.source_domain == "golf_day",
                models.OperationalException.state.in_(["open", "acknowledged", "in_progress", "blocked"]),
            )
            .first()
        )

        assert exception_row is not None
        assert exception_row.blocking_surface == "revenue_integrity_close"


def test_account_customer_repair_resolves_linked_golf_day_integrity_blockers():
    with SessionLocal() as db:
        club = models.Club(name=f"Account Integrity {uuid4().hex[:6]}", slug=f"acct-int-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()

        created = create_account_customer_payload(
            db,
            club_id=int(club.id),
            payload=AccountCustomerUpsertPayload(
                name="Acme Events",
                account_code=None,
                customer_type="corporate",
                active=True,
            ),
        )
        account_customer_id = int(created["account_customer"]["id"])

        create_golf_day_booking_payload(
            db,
            club_id=int(club.id),
            payload=GolfDayBookingUpsertPayload(
                event_name="Acme Invitational",
                amount=8000.0,
                balance_due=1000.0,
                payment_status="partial",
                account_customer_id=account_customer_id,
                invoice_reference=f"INV-{uuid4().hex[:8].upper()}",
            ),
        )
        db.commit()

        open_account_exception = (
            db.query(models.OperationalException)
            .filter(
                models.OperationalException.club_id == int(club.id),
                models.OperationalException.exception_type == "account_customer_conflict",
                models.OperationalException.state.in_(["open", "acknowledged", "in_progress", "blocked"]),
            )
            .first()
        )
        open_golf_day_exception = (
            db.query(models.OperationalException)
            .filter(
                models.OperationalException.club_id == int(club.id),
                models.OperationalException.exception_type == "revenue_link_missing",
                models.OperationalException.source_domain == "golf_day",
                models.OperationalException.state.in_(["open", "acknowledged", "in_progress", "blocked"]),
            )
            .first()
        )

        assert open_account_exception is not None
        assert open_golf_day_exception is not None

        update_account_customer_payload(
            db,
            account_customer_id=account_customer_id,
            payload=AccountCustomerUpsertPayload(
                name="Acme Events",
                account_code="ACME-100",
                customer_type="corporate",
                active=True,
            ),
        )
        db.commit()

        resolved_account_exception = (
            db.query(models.OperationalException)
            .filter(
                models.OperationalException.club_id == int(club.id),
                models.OperationalException.exception_type == "account_customer_conflict",
            )
            .first()
        )
        resolved_golf_day_exception = (
            db.query(models.OperationalException)
            .filter(
                models.OperationalException.club_id == int(club.id),
                models.OperationalException.exception_type == "revenue_link_missing",
                models.OperationalException.source_domain == "golf_day",
            )
            .first()
        )

        assert resolved_account_exception is not None
        assert resolved_account_exception.state == "resolved"
        assert resolved_golf_day_exception is not None
        assert resolved_golf_day_exception.state == "resolved"


def test_tee_move_revalidates_booking_integrity():
    with SessionLocal() as db:
        club = models.Club(name=f"Tee Move Integrity {uuid4().hex[:6]}", slug=f"tee-move-int-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()
        db.info["club_id"] = int(club.id)

        staff = models.User(
            name="Tee Staff",
            email=f"tee-staff-{uuid4().hex[:8]}@example.com",
            password=get_password_hash("TeeMovePass!12345"),
            role=models.UserRole.admin,
            club_id=int(club.id),
        )
        tee_a = models.TeeTime(club_id=int(club.id), tee_time=datetime(2036, 3, 1, 8, 0, 0), hole="1", capacity=4, status="open")
        tee_b = models.TeeTime(club_id=int(club.id), tee_time=datetime(2036, 3, 1, 8, 10, 0), hole="1", capacity=4, status="open")
        db.add_all([staff, tee_a, tee_b])
        db.flush()

        booking = models.Booking(
            club_id=int(club.id),
            tee_time_id=int(tee_a.id),
            player_name="Moved Guest",
            player_email=None,
            player_category="visitor",
            price=140.0,
            status=models.BookingStatus.checked_in,
        )
        db.add(booking)
        db.commit()
        club_id = int(club.id)
        staff_id = int(staff.id)
        booking_id = int(booking.id)
        tee_b_id = int(tee_b.id)

    with SessionLocal() as db:
        staff = db.query(models.User).filter(models.User.id == staff_id).first()
        assert staff is not None
        move_booking(
            booking_id=booking_id,
            payload=BookingMoveRequest(to_tee_time_id=tee_b_id),
            db=db,
            staff=staff,
            club_id=club_id,
        )

        revenue_exception = (
            db.query(models.OperationalException)
            .filter(
                models.OperationalException.club_id == club_id,
                models.OperationalException.exception_type == "revenue_link_missing",
                models.OperationalException.state.in_(["open", "acknowledged", "in_progress", "blocked"]),
            )
            .first()
        )

        assert revenue_exception is not None
        assert revenue_exception.blocking_surface == "revenue_integrity_close"


def test_pro_shop_account_sale_without_trusted_customer_emits_blocking_exception():
    with SessionLocal() as db:
        club = models.Club(name=f"Pro Shop Integrity {uuid4().hex[:6]}", slug=f"proshop-int-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()

        staff = models.User(
            name="Pro Shop Staff",
            email=f"pro-shop-staff-{uuid4().hex[:8]}@example.com",
            password=get_password_hash("ProShopPass!12345"),
            role=models.UserRole.admin,
            club_id=int(club.id),
        )
        db.add(staff)
        db.flush()

        created_product = create_pro_shop_product_payload(
            db,
            club_id=int(club.id),
            payload=ProShopProductUpsertPayload(
                sku=f"BALL-{uuid4().hex[:6].upper()}",
                name="Golf Balls",
                unit_price=50.0,
                stock_qty=20,
                reorder_level=2,
                active=True,
            ),
        )

        create_pro_shop_sale_payload(
            db,
            club_id=int(club.id),
            staff_user_id=int(staff.id),
            payload=ProShopSaleCreatePayload(
                customer_name="Unknown Corporate",
                payment_method="account",
                items=[
                    ProShopSaleItemPayload(
                        product_id=int(created_product["product"]["id"]),
                        quantity=2,
                    )
                ],
            ),
        )
        db.commit()

        exception_row = (
            db.query(models.OperationalException)
            .filter(
                models.OperationalException.club_id == int(club.id),
                models.OperationalException.exception_type == "pro_shop_account_sale_unlinked",
                models.OperationalException.state.in_(["open", "acknowledged", "in_progress", "blocked"]),
            )
            .first()
        )

        assert exception_row is not None
        assert exception_row.blocking_surface == "revenue_integrity_close"


def test_player_profile_member_claim_with_upcoming_booking_emits_readiness_exception():
    with SessionLocal() as db:
        club = models.Club(name=f"Profile Integrity {uuid4().hex[:6]}", slug=f"profile-int-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()

        player = models.User(
            name="Profile Player",
            email=f"profile-player-{uuid4().hex[:8]}@example.com",
            password=get_password_hash("ProfilePass!12345"),
            role=models.UserRole.player,
            club_id=int(club.id),
        )
        tee_time = models.TeeTime(
            club_id=int(club.id),
            tee_time=datetime(2037, 4, 2, 9, 0, 0),
            hole="1",
            capacity=4,
            status="open",
        )
        db.add_all([player, tee_time])
        db.flush()

        booking = models.Booking(
            club_id=int(club.id),
            tee_time_id=int(tee_time.id),
            created_by_user_id=int(player.id),
            player_name="Profile Player",
            player_email=str(player.email),
            player_category="visitor",
            price=95.0,
            status=models.BookingStatus.booked,
        )
        db.add(booking)
        db.commit()

        response = update_my_profile(
            PlayerProfileUpdate(
                name="Profile Player",
                account_type="member",
            ),
            db=db,
            current_user=player,
        )

        readiness_exception = (
            db.query(models.OperationalException)
            .filter(
                models.OperationalException.club_id == int(club.id),
                models.OperationalException.exception_type == "profile_readiness_unresolved",
                models.OperationalException.state.in_(["open", "acknowledged", "in_progress", "blocked"]),
            )
            .first()
        )

        assert readiness_exception is not None
        assert readiness_exception.blocking_surface == "player_profile_readiness"
        assert response.readiness is not None
        assert response.readiness["status"] == "review_required"
        assert int(response.readiness["upcoming_booking_count"]) == 1
        member_linkage = next(item for item in response.readiness["items"] if item["key"] == "member_linkage")
        assert member_linkage["ok"] is False
        assert member_linkage["state"] == "blocked"
        assert response.readiness["next_actions"]


def test_player_profile_readiness_resolves_after_member_number_is_captured():
    with SessionLocal() as db:
        club = models.Club(name=f"Profile Resolve {uuid4().hex[:6]}", slug=f"profile-res-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()

        player = models.User(
            name="Resolved Player",
            email=f"resolved-player-{uuid4().hex[:8]}@example.com",
            password=get_password_hash("ProfilePass!12345"),
            role=models.UserRole.player,
            club_id=int(club.id),
        )
        tee_time = models.TeeTime(
            club_id=int(club.id),
            tee_time=datetime(2037, 4, 3, 10, 0, 0),
            hole="1",
            capacity=4,
            status="open",
        )
        db.add_all([player, tee_time])
        db.flush()

        db.add(
            models.Booking(
                club_id=int(club.id),
                tee_time_id=int(tee_time.id),
                created_by_user_id=int(player.id),
                player_name="Resolved Player",
                player_email=str(player.email),
                player_category="visitor",
                price=105.0,
                status=models.BookingStatus.booked,
            )
        )
        db.commit()

        update_my_profile(
            PlayerProfileUpdate(
                name="Resolved Player",
                account_type="member",
            ),
            db=db,
            current_user=player,
        )
        response = update_my_profile(
            PlayerProfileUpdate(
                name="Resolved Player",
                account_type="member",
                member_number=f"MEM-{uuid4().hex[:6].upper()}",
            ),
            db=db,
            current_user=player,
        )

        readiness_exception = (
            db.query(models.OperationalException)
            .filter(
                models.OperationalException.club_id == int(club.id),
                models.OperationalException.exception_type == "profile_readiness_unresolved",
            )
            .first()
        )

        assert readiness_exception is not None
        assert readiness_exception.state == "resolved"
        assert response.readiness is not None
        member_linkage = next(item for item in response.readiness["items"] if item["key"] == "member_linkage")
        assert member_linkage["ok"] is True
        assert response.readiness["relationship_type"] in {"member", "visitor", "affiliated", None}


def test_get_my_profile_returns_server_owned_readiness_payload():
    with SessionLocal() as db:
        club = models.Club(name=f"Profile Readiness GET {uuid4().hex[:6]}", slug=f"profile-get-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()

        player = models.User(
            name="Readiness Player",
            email=f"readiness-player-{uuid4().hex[:8]}@example.com",
            password=get_password_hash("ProfilePass!12345"),
            role=models.UserRole.player,
            club_id=int(club.id),
            phone="0820000000",
            home_course="GreenLink Hills",
        )
        db.add(player)
        db.commit()

        response = get_my_profile(db=db, current_user=player)

        assert response.readiness is not None
        assert isinstance(response.readiness.get("items"), list)
        assert any(item["key"] == "phone" for item in response.readiness["items"])
        assert "completion_pct" in response.readiness


def test_enforcement_proof_and_backfill_clear_missing_identity_links():
    with SessionLocal() as db:
        club = models.Club(name=f"Backfill Proof {uuid4().hex[:6]}", slug=f"backfill-proof-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()

        player = models.User(
            name="Backfill Player",
            email=f"backfill-player-{uuid4().hex[:8]}@example.com",
            password=get_password_hash("BackfillPass!12345"),
            role=models.UserRole.player,
            club_id=int(club.id),
            global_person_id=None,
        )
        member = models.Member(
            club_id=int(club.id),
            first_name="Backfill",
            last_name="Member",
            email=f"backfill-member-{uuid4().hex[:8]}@example.com",
            member_number=f"MEM-{uuid4().hex[:6].upper()}",
            membership_status="active",
            active=1,
            person_id=None,
            global_person_id=None,
        )
        tee_time = models.TeeTime(
            club_id=int(club.id),
            tee_time=datetime(2038, 5, 1, 8, 0, 0),
            hole="1",
            capacity=4,
            status="open",
        )
        db.add_all([player, member, tee_time])
        db.flush()
        booking = models.Booking(
            club_id=int(club.id),
            tee_time_id=int(tee_time.id),
            created_by_user_id=int(player.id),
            member_id=int(member.id),
            player_name="Backfill Player",
            player_email=str(player.email),
            player_category="adult",
            status=models.BookingStatus.booked,
            global_person_id=None,
            club_relationship_state_id=None,
        )
        db.add(booking)
        db.commit()

        before = build_enforcement_proof_payload(db, club_id=int(club.id))
        assert before["ready"] is False
        assert int(before["backfill"]["users_missing_global_person"]) >= 1
        assert int(before["backfill"]["members_missing_person"]) >= 1
        assert int(before["backfill"]["bookings_missing_identity_links"]) >= 1

        result = run_enforcement_backfill(db, club_id=int(club.id))
        assert result["ready"] is True

        after = build_enforcement_proof_payload(db, club_id=int(club.id))
        assert after["ready"] is True
        assert int(after["backfill"]["users_missing_global_person"]) == 0
        assert int(after["backfill"]["members_missing_person"]) == 0
        assert int(after["backfill"]["members_missing_global_person"]) == 0
        assert int(after["backfill"]["bookings_missing_identity_links"]) == 0


def test_exception_waiver_policy_is_locked_down():
    with SessionLocal() as db:
        club = models.Club(name=f"Waiver Policy {uuid4().hex[:6]}", slug=f"waiver-policy-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()

        exception_row = upsert_operational_exception(
            db,
            club_id=int(club.id),
            dedupe_key=f"waiver-test:{uuid4().hex[:8]}",
            exception_type="revenue_link_missing",
            blocking_surface="revenue_integrity_close",
            source_domain="identity",
            summary="Waiver should be blocked.",
            severity="high",
            owner_role="admin",
            next_required_action="Do not waive this.",
        )
        db.commit()

        policy = get_exception_waiver_policy_payload()
        assert policy["enabled"] is False

        with pytest.raises(HTTPException) as exc_info:
            ensure_exception_waiver_allowed(exception_row, reason="close anyway")

        assert int(exc_info.value.status_code) == 409


def test_people_repair_queue_returns_actionable_profile_target():
    with SessionLocal() as db:
        club = models.Club(name=f"Queue Club {uuid4().hex[:6]}", slug=f"queue-club-{uuid4().hex[:8]}", active=1)
        db.add(club)
        db.flush()

        player = models.User(
            name="Queue Player",
            email=f"queue-player-{uuid4().hex[:8]}@example.com",
            password=get_password_hash("QueuePass!12345"),
            role=models.UserRole.player,
            club_id=int(club.id),
        )
        tee_time = models.TeeTime(
            club_id=int(club.id),
            tee_time=datetime(2039, 6, 1, 9, 0, 0),
            hole="1",
            capacity=4,
            status="open",
        )
        db.add_all([player, tee_time])
        db.flush()
        db.add(
            models.Booking(
                club_id=int(club.id),
                tee_time_id=int(tee_time.id),
                created_by_user_id=int(player.id),
                player_name="Queue Player",
                player_email=str(player.email),
                status=models.BookingStatus.booked,
            )
        )
        db.commit()

        update_my_profile(
            PlayerProfileUpdate(
                name="Queue Player",
                account_type="member",
            ),
            db=db,
            current_user=player,
        )

        queue = list_people_repair_queue_payload(db, club_id=int(club.id), limit=10)
        rows = queue["queue"]
        assert rows
        item = next(row for row in rows if row["exception_type"] == "profile_readiness_unresolved")
        assert item["target"]["name"] == "Queue Player"
        assert item["target"]["primary_ref"]["workspace"] == "players"
