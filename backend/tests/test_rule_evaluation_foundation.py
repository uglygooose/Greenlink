from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    BookingRule,
    BookingRuleAppliesTo,
    BookingRuleConflictStrategy,
    BookingRuleScopeType,
    BookingRuleSet,
    BookingRuleType,
    Club,
    ClubConfig,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Course,
    Person,
    PricingDayType,
    PricingMatrix,
    PricingRule,
    PricingRuleAppliesTo,
    PricingTimeBand,
    Tee,
    User,
)


def _create_user(db: Session, *, email: str) -> User:
    local_part = email.split("@")[0]
    person = Person(
        first_name=local_part.title(),
        last_name="User",
        full_name=build_full_name(local_part.title(), "User"),
        email=normalize_email(email),
        normalized_email=normalize_email(email),
        profile_metadata={},
    )
    db.add(person)
    db.flush()
    user = User(
        email=email,
        password_hash=hash_password("password123"),
        display_name=local_part,
        person_id=person.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_club(db: Session, *, name: str, slug: str) -> Club:
    club = Club(name=name, slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _assign_membership(db: Session, *, user: User, club: Club, role: ClubMembershipRole) -> ClubMembership:
    membership = ClubMembership(
        person_id=user.person_id,
        club_id=club.id,
        role=role,
        status=ClubMembershipStatus.ACTIVE,
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


def _auth_headers(client: TestClient, email: str, club_id: str) -> dict[str, str]:
    login = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}", "X-Club-Id": club_id}


def test_rule_evaluation_resolves_deterministic_constraints_and_pricing(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="evaluator@example.com")
    club = _create_club(db_session, name="Resolver Club", slug="resolver-club")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    course = Course(club_id=club.id, name="North", holes=18, active=True)
    db_session.add(course)
    db_session.flush()
    tee = Tee(
        course_id=course.id,
        name="Blue",
        gender="men",
        slope_rating=128,
        course_rating="72.4",
        color_code="#1b4d8f",
        active=True,
    )
    other_course = Course(club_id=club.id, name="South", holes=9, active=True)
    db_session.add_all([tee, other_course])
    db_session.flush()

    now = datetime(2026, 3, 30, 9, 0, tzinfo=timezone.utc)
    future = now + timedelta(days=5)

    club_ruleset = BookingRuleSet(
        club_id=club.id,
        name="Member Club Base",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.CLUB,
        scope_ref_id=None,
        conflict_strategy=BookingRuleConflictStrategy.OVERRIDE,
        priority=100,
        active=True,
    )
    course_ruleset = BookingRuleSet(
        club_id=club.id,
        name="North Course Merge",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.COURSE,
        scope_ref_id=str(course.id),
        conflict_strategy=BookingRuleConflictStrategy.MERGE,
        priority=80,
        active=True,
    )
    tee_ruleset = BookingRuleSet(
        club_id=club.id,
        name="Blue Tee Override",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.TEE,
        scope_ref_id=str(tee.id),
        conflict_strategy=BookingRuleConflictStrategy.OVERRIDE,
        priority=60,
        active=True,
    )
    ignored_scope_ruleset = BookingRuleSet(
        club_id=club.id,
        name="South Only",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.COURSE,
        scope_ref_id=str(other_course.id),
        conflict_strategy=BookingRuleConflictStrategy.OVERRIDE,
        priority=50,
        active=True,
    )
    future_ruleset = BookingRuleSet(
        club_id=club.id,
        name="Future Window",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.CLUB,
        scope_ref_id=None,
        conflict_strategy=BookingRuleConflictStrategy.OVERRIDE,
        applies_from=future,
        priority=40,
        active=True,
    )
    db_session.add_all([club_ruleset, course_ruleset, tee_ruleset, ignored_scope_ruleset, future_ruleset])
    db_session.flush()

    db_session.add_all(
        [
            BookingRule(
                ruleset_id=club_ruleset.id,
                type=BookingRuleType.ADVANCE_WINDOW,
                evaluation_order=0,
                config={"days": 14},
                active=True,
            ),
            BookingRule(
                ruleset_id=club_ruleset.id,
                type=BookingRuleType.MAX_FUTURE_BOOKINGS,
                evaluation_order=1,
                config={"count": 4},
                active=True,
            ),
            BookingRule(
                ruleset_id=course_ruleset.id,
                type=BookingRuleType.MAX_BOOKINGS_PER_DAY,
                evaluation_order=0,
                config={"count": 2},
                active=True,
            ),
            BookingRule(
                ruleset_id=course_ruleset.id,
                type=BookingRuleType.TIME_RESTRICTION,
                evaluation_order=1,
                config={"start_time": "06:00", "end_time": "10:00", "days": ["monday"]},
                active=True,
            ),
            BookingRule(
                ruleset_id=tee_ruleset.id,
                type=BookingRuleType.MAX_BOOKINGS_PER_DAY,
                evaluation_order=0,
                config={"count": 1},
                active=True,
            ),
            BookingRule(
                ruleset_id=ignored_scope_ruleset.id,
                type=BookingRuleType.GUEST_LIMIT,
                evaluation_order=0,
                config={"count": 2},
                active=True,
            ),
            BookingRule(
                ruleset_id=future_ruleset.id,
                type=BookingRuleType.GUEST_LIMIT,
                evaluation_order=0,
                config={"count": 1},
                active=True,
            ),
        ]
    )

    matrix = PricingMatrix(club_id=club.id, name="Standard", active=True)
    db_session.add(matrix)
    db_session.flush()
    db_session.add_all(
        [
            PricingRule(
                matrix_id=matrix.id,
                applies_to=PricingRuleAppliesTo.MEMBER,
                day_type=PricingDayType.WEEKDAY,
                time_band=PricingTimeBand.MORNING,
                price="325.00",
                currency="ZAR",
                active=True,
            ),
            PricingRule(
                matrix_id=matrix.id,
                applies_to=PricingRuleAppliesTo.MEMBER,
                day_type=PricingDayType.WEEKEND,
                time_band=PricingTimeBand.MORNING,
                price="425.00",
                currency="ZAR",
                active=True,
            ),
            PricingRule(
                matrix_id=matrix.id,
                applies_to=PricingRuleAppliesTo.GUEST,
                day_type=PricingDayType.WEEKDAY,
                time_band=PricingTimeBand.MORNING,
                price="525.00",
                currency="ZAR",
                active=True,
            ),
        ]
    )
    db_session.commit()

    headers = _auth_headers(client, user.email, str(club.id))
    response = client.get(
        "/api/rules/evaluate",
        params={
            "course_id": str(course.id),
            "tee_id": str(tee.id),
            "membership_type": "member",
            "effective_datetime": now.isoformat(),
        },
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["booking_constraints"]["advance_window"]["days"] == 14
    assert payload["limits"]["max_future_bookings"]["count"] == 4
    assert payload["limits"]["max_bookings_per_day"]["count"] == 2
    assert len(payload["time_restrictions"]["windows"]) == 1
    assert len(payload["pricing"]["candidate_rules"]) == 1
    assert payload["pricing"]["candidate_rules"][0]["price"] == "325.00"
    assert payload["context"]["timezone"] == "Africa/Johannesburg"
    assert payload["context"]["local_day_name"] == "monday"
    assert payload["context"]["day_type"] == "weekday"
    assert payload["context"]["time_band"] == "morning"
    assert payload["pricing"]["context_day_type"] == "weekday"
    assert payload["pricing"]["context_time_band"] == "morning"
    assert any(rule["reason"] == "override_applied" for rule in payload["applicable_rules"])
    assert any(rule["reason"] == "merge_applied" for rule in payload["applicable_rules"])
    assert any(rule["reason"] == "higher_priority_override_already_applied" for rule in payload["ignored_rules"])
    assert any(rule["reason"] == "scope_mismatch" for rule in payload["ignored_rules"])
    assert any(rule["reason"] == "effective_datetime_outside_ruleset_window" for rule in payload["ignored_rules"])
    assert any(warning["code"] == "public_holiday_unresolved" for warning in payload["warnings"])


def test_rule_evaluation_without_datetime_is_timeless_and_returns_broad_pricing_candidates(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="timeless@example.com")
    club = _create_club(db_session, name="Timeless Club", slug="timeless-club")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)

    timeless_ruleset = BookingRuleSet(
        club_id=club.id,
        name="Always On",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.CLUB,
        scope_ref_id=None,
        conflict_strategy=BookingRuleConflictStrategy.FIRST_MATCH,
        priority=100,
        active=True,
    )
    bounded_ruleset = BookingRuleSet(
        club_id=club.id,
        name="Bounded",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.CLUB,
        scope_ref_id=None,
        conflict_strategy=BookingRuleConflictStrategy.OVERRIDE,
        applies_from=datetime(2026, 3, 30, 9, 0, tzinfo=timezone.utc),
        priority=90,
        active=True,
    )
    db_session.add_all([timeless_ruleset, bounded_ruleset])
    db_session.flush()
    db_session.add_all(
        [
            BookingRule(
                ruleset_id=timeless_ruleset.id,
                type=BookingRuleType.ADVANCE_WINDOW,
                evaluation_order=0,
                config={"days": 7},
                active=True,
            ),
            BookingRule(
                ruleset_id=bounded_ruleset.id,
                type=BookingRuleType.MAX_FUTURE_BOOKINGS,
                evaluation_order=0,
                config={"count": 2},
                active=True,
            ),
        ]
    )
    matrix = PricingMatrix(club_id=club.id, name="Broad", active=True)
    db_session.add(matrix)
    db_session.flush()
    db_session.add_all(
        [
            PricingRule(
                matrix_id=matrix.id,
                applies_to=PricingRuleAppliesTo.MEMBER,
                day_type=PricingDayType.WEEKDAY,
                time_band=PricingTimeBand.MORNING,
                price="100.00",
                currency="ZAR",
                active=True,
            ),
            PricingRule(
                matrix_id=matrix.id,
                applies_to=PricingRuleAppliesTo.MEMBER,
                day_type=PricingDayType.WEEKEND,
                time_band=PricingTimeBand.AFTERNOON,
                price="120.00",
                currency="ZAR",
                active=True,
            ),
        ]
    )
    db_session.commit()

    headers = _auth_headers(client, user.email, str(club.id))
    response = client.get("/api/rules/evaluate?membership_type=member", headers=headers)
    assert response.status_code == 200
    payload = response.json()

    assert payload["booking_constraints"]["advance_window"]["days"] == 7
    assert "max_future_bookings" not in payload["limits"]
    assert len(payload["pricing"]["candidate_rules"]) == 2
    assert payload["context"]["day_type"] is None
    assert payload["context"]["time_band"] is None
    assert any(rule["reason"] == "first_match_stopped" for rule in payload["ignored_rules"])


def test_rule_context_supports_supplied_public_holiday_and_custom_time_band(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="holiday@example.com")
    club = _create_club(db_session, name="Holiday Club", slug="holiday-club")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)

    matrix = PricingMatrix(club_id=club.id, name="Holiday Matrix", active=True)
    db_session.add(matrix)
    db_session.flush()
    db_session.add_all(
        [
            PricingRule(
                matrix_id=matrix.id,
                applies_to=PricingRuleAppliesTo.MEMBER,
                day_type=PricingDayType.PUBLIC_HOLIDAY,
                time_band=PricingTimeBand.CUSTOM,
                time_band_ref="prime",
                price="450.00",
                currency="ZAR",
                active=True,
            ),
            PricingRule(
                matrix_id=matrix.id,
                applies_to=PricingRuleAppliesTo.MEMBER,
                day_type=PricingDayType.PUBLIC_HOLIDAY,
                time_band=PricingTimeBand.CUSTOM,
                time_band_ref="sunrise",
                price="400.00",
                currency="ZAR",
                active=True,
            ),
        ]
    )
    db_session.commit()

    headers = _auth_headers(client, user.email, str(club.id))
    response = client.get(
        "/api/rules/evaluate",
        params={
            "membership_type": "member",
            "day_type": "public_holiday",
            "time_band": "custom",
            "time_band_ref": "prime",
        },
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["context"]["day_type"] == "public_holiday"
    assert payload["context"]["day_type_resolution"]["source"] == "supplied"
    assert payload["context"]["time_band"] == "custom"
    assert payload["context"]["time_band_ref"] == "prime"
    assert payload["context"]["time_band_resolution"]["source"] == "supplied"
    assert len(payload["pricing"]["candidate_rules"]) == 1
    assert payload["pricing"]["candidate_rules"][0]["time_band_ref"] == "prime"
    assert any(rule["reason"] == "custom_time_band_ref_mismatch" for rule in payload["pricing"]["ignored_rules"])


def test_availability_preview_is_structural_and_flags_unresolved_state(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="availability@example.com")
    club = _create_club(db_session, name="Availability Club", slug="availability-club")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    course = Course(club_id=club.id, name="East", holes=18, active=True)
    db_session.add(course)
    db_session.flush()
    db_session.add(
        ClubConfig(
            club_id=club.id,
            timezone="Africa/Johannesburg",
            operating_hours={
                "monday": {"open": "06:00", "close": "18:00", "closed": False},
                "tuesday": {"open": "06:00", "close": "18:00", "closed": False},
                "wednesday": {"open": "06:00", "close": "18:00", "closed": False},
                "thursday": {"open": "06:00", "close": "18:00", "closed": False},
                "friday": {"open": "06:00", "close": "18:00", "closed": False},
                "saturday": {"open": "06:00", "close": "18:00", "closed": False},
                "sunday": {"open": "06:00", "close": "18:00", "closed": False},
            },
            booking_window_days=14,
            cancellation_policy_hours=24,
            default_slot_interval_minutes=10,
        )
    )
    ruleset = BookingRuleSet(
        club_id=club.id,
        name="Availability Base",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.CLUB,
        scope_ref_id=None,
        conflict_strategy=BookingRuleConflictStrategy.MERGE,
        priority=100,
        active=True,
    )
    db_session.add(ruleset)
    db_session.flush()
    db_session.add_all(
        [
            BookingRule(
                ruleset_id=ruleset.id,
                type=BookingRuleType.ADVANCE_WINDOW,
                evaluation_order=0,
                config={"days": 10},
                active=True,
            ),
            BookingRule(
                ruleset_id=ruleset.id,
                type=BookingRuleType.MAX_BOOKINGS_PER_DAY,
                evaluation_order=1,
                config={"count": 2},
                active=True,
            ),
            BookingRule(
                ruleset_id=ruleset.id,
                type=BookingRuleType.GUEST_LIMIT,
                evaluation_order=2,
                config={"count": 3},
                active=True,
            ),
            BookingRule(
                ruleset_id=ruleset.id,
                type=BookingRuleType.TIME_RESTRICTION,
                evaluation_order=3,
                config={"start_time": "06:00", "end_time": "10:00", "days": ["monday"]},
                active=True,
            ),
        ]
    )
    db_session.commit()

    effective_datetime = datetime(2026, 3, 30, 7, 0, tzinfo=timezone.utc)
    reference_datetime = datetime(2026, 3, 25, 7, 0, tzinfo=timezone.utc)
    headers = _auth_headers(client, user.email, str(club.id))
    response = client.get(
        "/api/rules/availability-preview",
        params={
            "course_id": str(course.id),
            "membership_type": "member",
            "effective_datetime": effective_datetime.isoformat(),
            "reference_datetime": reference_datetime.isoformat(),
        },
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["status"] == "indeterminate"
    assert payload["slot_policy"]["default_slot_interval_minutes"] == 10
    assert payload["decision_input"]["slot"]["slot_interval_source"] == "club_config_default"
    assert any(item["code"] == "advance_window_satisfied" for item in payload["resolved_checks"])
    assert any(item["code"] == "within_operating_hours" for item in payload["resolved_checks"])
    assert any(item["code"] == "time_restriction_satisfied" for item in payload["resolved_checks"])
    assert any(item["code"] == "max_bookings_per_day_requires_booking_state" for item in payload["unresolved_checks"])
    assert any(item["code"] == "guest_limit_requires_party_context" for item in payload["unresolved_checks"])
    assert any(item["code"] == "live_concurrency_not_evaluated" for item in payload["unresolved_checks"])


def test_slot_preview_consumes_booking_state_and_resolves_capacity_and_limits(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="slotpreview@example.com")
    club = _create_club(db_session, name="Slot Preview Club", slug="slot-preview-club")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    course = Course(club_id=club.id, name="West", holes=18, active=True)
    db_session.add(course)
    db_session.add(
        ClubConfig(
            club_id=club.id,
            timezone="Africa/Johannesburg",
            operating_hours={
                "monday": {"open": "06:00", "close": "18:00", "closed": False},
                "tuesday": {"open": "06:00", "close": "18:00", "closed": False},
                "wednesday": {"open": "06:00", "close": "18:00", "closed": False},
                "thursday": {"open": "06:00", "close": "18:00", "closed": False},
                "friday": {"open": "06:00", "close": "18:00", "closed": False},
                "saturday": {"open": "06:00", "close": "18:00", "closed": False},
                "sunday": {"open": "06:00", "close": "18:00", "closed": False},
            },
            booking_window_days=21,
            cancellation_policy_hours=24,
            default_slot_interval_minutes=10,
        )
    )
    ruleset = BookingRuleSet(
        club_id=club.id,
        name="Slot Base",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.CLUB,
        scope_ref_id=None,
        conflict_strategy=BookingRuleConflictStrategy.MERGE,
        priority=100,
        active=True,
    )
    db_session.add(ruleset)
    db_session.flush()
    db_session.add_all(
        [
            BookingRule(
                ruleset_id=ruleset.id,
                type=BookingRuleType.ADVANCE_WINDOW,
                evaluation_order=0,
                config={"days": 14},
                active=True,
            ),
            BookingRule(
                ruleset_id=ruleset.id,
                type=BookingRuleType.MAX_BOOKINGS_PER_DAY,
                evaluation_order=1,
                config={"count": 3},
                active=True,
            ),
            BookingRule(
                ruleset_id=ruleset.id,
                type=BookingRuleType.MAX_FUTURE_BOOKINGS,
                evaluation_order=2,
                config={"count": 5},
                active=True,
            ),
            BookingRule(
                ruleset_id=ruleset.id,
                type=BookingRuleType.GUEST_LIMIT,
                evaluation_order=3,
                config={"count": 1},
                active=True,
            ),
        ]
    )
    db_session.commit()

    effective_datetime = datetime(2026, 3, 30, 8, 0, tzinfo=timezone.utc)
    reference_datetime = datetime(2026, 3, 25, 8, 0, tzinfo=timezone.utc)
    headers = _auth_headers(client, user.email, str(club.id))
    response = client.post(
        "/api/rules/slot-preview",
        headers=headers,
        json={
            "course_id": str(course.id),
            "membership_type": "member",
            "effective_datetime": effective_datetime.isoformat(),
            "reference_datetime": reference_datetime.isoformat(),
            "slot": {"slot_interval_minutes": 8},
            "party": {
                "member_count": 2,
                "guest_count": 2,
                "requested_player_count": 4,
                "requester_applies_to": "member",
            },
            "booking_state": {
                "manually_blocked": False,
                "reserved_state_active": False,
                "competition_controlled": False,
                "event_controlled": False,
                "externally_unavailable": False,
                "current_bookings_for_day": 1,
                "current_future_bookings": 2,
                "occupancy": {
                    "player_capacity": 4,
                    "occupied_player_count": 0,
                    "reserved_player_count": 0,
                    "confirmed_booking_count": 0,
                    "reserved_booking_count": 0,
                },
            },
        },
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["status"] == "blocked"
    assert payload["decision_input"]["slot"]["slot_interval_minutes"] == 8
    assert payload["decision_input"]["slot"]["slot_interval_source"] == "input"
    assert any(item["code"] == "slot_capacity_available" for item in payload["resolved_checks"])
    assert any(item["code"] == "max_bookings_per_day_satisfied" for item in payload["resolved_checks"])
    assert any(item["code"] == "max_future_bookings_satisfied" for item in payload["resolved_checks"])
    assert any(item["code"] == "guest_limit_exceeded" for item in payload["blockers"])
