from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any

import requests
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app import models

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"

RAIN_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82}
STORM_CODES = {95, 96, 99}


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except Exception:
        return int(default)


def _value_at(values: Any, idx: int, default: Any = None) -> Any:
    if not isinstance(values, list):
        return default
    if idx < 0 or idx >= len(values):
        return default
    return values[idx]


def _status_text(value: Any) -> str:
    try:
        return str(getattr(value, "value", value) or "").strip().lower()
    except Exception:
        return ""


def _parse_iso_dt(raw: str | None) -> datetime | None:
    text = str(raw or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except Exception:
        return None


def _normalize_hour_key(value: datetime) -> str:
    d = value.replace(minute=0, second=0, microsecond=0)
    return d.strftime("%Y-%m-%dT%H:00")


def _get_club_name(db: Session, club_id: int) -> str:
    row = db.query(models.Club).filter(models.Club.id == int(club_id)).first()
    return str(getattr(row, "name", "") or "").strip()


def get_club_coordinates(db: Session, club_id: int, timeout_s: float = 10.0) -> dict[str, Any] | None:
    """
    Resolve course coordinates from club settings first, then geocode by club name.
    """
    lat = None
    lon = None

    settings = (
        db.query(models.ClubSetting)
        .filter(
            models.ClubSetting.club_id == int(club_id),
            models.ClubSetting.key.in_(["weather_lat", "weather_lon"]),
        )
        .all()
    )
    for row in settings:
        key = str(getattr(row, "key", "")).strip().lower()
        if key == "weather_lat":
            lat = _safe_float(getattr(row, "value", None), default=0.0)
        if key == "weather_lon":
            lon = _safe_float(getattr(row, "value", None), default=0.0)

    if isinstance(lat, float) and isinstance(lon, float) and abs(lat) > 0.0001 and abs(lon) > 0.0001:
        return {
            "latitude": lat,
            "longitude": lon,
            "source": "club_settings",
            "label": _get_club_name(db, club_id) or f"Club {club_id}",
        }

    club_name = _get_club_name(db, club_id)
    if not club_name:
        return None

    search_names = [club_name]
    lowered = club_name.lower()
    if "south africa" not in lowered:
        search_names.append(f"{club_name}, South Africa")
    if "demo" in lowered:
        cleaned = " ".join([w for w in club_name.split() if w.lower() not in {"demo", "test"}]).strip()
        if cleaned and cleaned not in search_names:
            search_names.append(cleaned)
        if cleaned and "south africa" not in cleaned.lower():
            search_names.append(f"{cleaned}, South Africa")

    for query_name in search_names:
        try:
            response = requests.get(
                OPEN_METEO_GEOCODE_URL,
                params={
                    "name": query_name,
                    "count": 5,
                    "language": "en",
                    "format": "json",
                },
                timeout=timeout_s,
            )
            response.raise_for_status()
            payload = response.json() if response.content else {}
        except Exception:
            continue

        results = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(results, list) or not results:
            continue

        best = None
        for row in results:
            if not isinstance(row, dict):
                continue
            if str(row.get("country_code") or "").strip().upper() == "ZA":
                best = row
                break
        if best is None:
            best = results[0] if isinstance(results[0], dict) else None
        if not isinstance(best, dict):
            continue

        lat = _safe_float(best.get("latitude"), default=0.0)
        lon = _safe_float(best.get("longitude"), default=0.0)
        if abs(lat) < 0.0001 and abs(lon) < 0.0001:
            continue

        area = str(best.get("name") or "").strip()
        country = str(best.get("country") or "").strip()
        label = f"{area}, {country}".strip(", ")
        return {
            "latitude": lat,
            "longitude": lon,
            "source": "geocoding",
            "label": label or query_name,
        }

    return None


def fetch_hourly_forecast(
    latitude: float,
    longitude: float,
    target_date: date,
    timeout_s: float = 12.0,
) -> dict[str, Any]:
    response = requests.get(
        OPEN_METEO_FORECAST_URL,
        params={
            "latitude": f"{float(latitude):.6f}",
            "longitude": f"{float(longitude):.6f}",
            "timezone": "auto",
            "start_date": target_date.isoformat(),
            "end_date": target_date.isoformat(),
            "hourly": "precipitation_probability,precipitation,weather_code,wind_speed_10m",
        },
        timeout=timeout_s,
    )
    response.raise_for_status()
    payload = response.json() if response.content else {}

    hourly = payload.get("hourly") if isinstance(payload, dict) else {}
    times = hourly.get("time") if isinstance(hourly, dict) else []
    precipitation_probability = hourly.get("precipitation_probability") if isinstance(hourly, dict) else []
    precipitation = hourly.get("precipitation") if isinstance(hourly, dict) else []
    weather_code = hourly.get("weather_code") if isinstance(hourly, dict) else []
    wind_speed_10m = hourly.get("wind_speed_10m") if isinstance(hourly, dict) else []

    by_hour: dict[str, dict[str, Any]] = {}
    for idx, raw_time in enumerate(times or []):
        dt = _parse_iso_dt(raw_time)
        if dt is None:
            continue
        key = _normalize_hour_key(dt)
        by_hour[key] = {
            "time": key,
            "precipitation_probability": _safe_float(_value_at(precipitation_probability, idx), default=0.0),
            "precipitation": _safe_float(_value_at(precipitation, idx), default=0.0),
            "weather_code": _safe_int(_value_at(weather_code, idx), default=0),
            "wind_speed_10m": _safe_float(_value_at(wind_speed_10m, idx), default=0.0),
        }

    return {
        "timezone": str(payload.get("timezone") or "").strip() if isinstance(payload, dict) else "",
        "hourly": by_hour,
    }


def forecast_point_for_tee_time(
    hourly_points: dict[str, dict[str, Any]],
    tee_time: datetime,
) -> dict[str, Any] | None:
    if not isinstance(hourly_points, dict) or not hourly_points:
        return None

    tee = tee_time
    if tee is None:
        return None
    if tee.tzinfo is not None:
        tee = tee.replace(tzinfo=None)

    key = _normalize_hour_key(tee)
    if key in hourly_points:
        return hourly_points[key]

    # Fallback: nearest hour point within 90 minutes.
    nearest = None
    nearest_delta = None
    for raw_key, point in hourly_points.items():
        dt = _parse_iso_dt(raw_key)
        if dt is None:
            continue
        delta = abs((dt.replace(tzinfo=None) - tee).total_seconds())
        if nearest is None or delta < float(nearest_delta or 10**18):
            nearest = point
            nearest_delta = delta
    if nearest is not None and (nearest_delta or 0) <= (90 * 60):
        return nearest
    return None


def classify_weather_risk(
    forecast_point: dict[str, Any] | None,
    min_precip_probability: int = 60,
    min_precip_mm: float = 1.0,
) -> dict[str, Any]:
    point = forecast_point or {}
    precip_probability = max(0.0, _safe_float(point.get("precipitation_probability"), default=0.0))
    precipitation = max(0.0, _safe_float(point.get("precipitation"), default=0.0))
    weather_code = _safe_int(point.get("weather_code"), default=0)
    wind_kmh = max(0.0, _safe_float(point.get("wind_speed_10m"), default=0.0))

    heavy_weather = (
        weather_code in STORM_CODES
        or precip_probability >= 80
        or precipitation >= 4.0
    )
    at_risk = (
        weather_code in RAIN_CODES
        or weather_code in STORM_CODES
        or precip_probability >= float(min_precip_probability)
        or precipitation >= float(min_precip_mm)
    )

    reasons: list[str] = []
    if precip_probability >= float(min_precip_probability):
        reasons.append(f"{round(precip_probability)}% rain probability")
    if precipitation >= float(min_precip_mm):
        reasons.append(f"{precipitation:.1f}mm forecast rain")
    if weather_code in STORM_CODES:
        reasons.append("storm code flagged")
    elif weather_code in RAIN_CODES and not reasons:
        reasons.append("rain code flagged")

    score = min(
        100,
        int(
            round(
                (precip_probability * 0.7)
                + (precipitation * 8.0)
                + (28.0 if weather_code in STORM_CODES else 10.0 if weather_code in RAIN_CODES else 0.0)
            )
        ),
    )

    level = "high" if heavy_weather else "medium" if at_risk else "low"
    return {
        "level": level,
        "at_risk": bool(at_risk),
        "score": score,
        "reasons": reasons,
        "precipitation_probability": precip_probability,
        "precipitation_mm": precipitation,
        "weather_code": weather_code,
        "wind_kmh": wind_kmh,
        "forecast_time": point.get("time"),
    }


def resolve_player_user_for_booking(
    db: Session,
    booking: models.Booking,
    club_id: int,
    cache: dict[str, models.User | None] | None = None,
) -> models.User | None:
    cache = cache if isinstance(cache, dict) else {}

    created_by = getattr(booking, "created_by_user_id", None)
    if created_by:
        key = f"id:{int(created_by)}"
        if key not in cache:
            cache[key] = (
                db.query(models.User)
                .filter(
                    models.User.id == int(created_by),
                    models.User.club_id == int(club_id),
                    models.User.role == models.UserRole.player,
                )
                .first()
            )
        if cache[key]:
            return cache[key]

    booking_email = str(getattr(booking, "player_email", "") or "").strip().lower()
    if booking_email:
        key = f"email:{booking_email}"
        if key not in cache:
            cache[key] = (
                db.query(models.User)
                .filter(
                    models.User.club_id == int(club_id),
                    models.User.role == models.UserRole.player,
                    func.lower(models.User.email) == booking_email,
                )
                .first()
            )
        if cache[key]:
            return cache[key]

    member_id = getattr(booking, "member_id", None)
    if member_id:
        key = f"member:{int(member_id)}"
        if key not in cache:
            member = (
                db.query(models.Member)
                .filter(models.Member.id == int(member_id), models.Member.club_id == int(club_id))
                .first()
            )
            member_email = str(getattr(member, "email", "") or "").strip().lower()
            if member_email:
                cache[key] = (
                    db.query(models.User)
                    .filter(
                        models.User.club_id == int(club_id),
                        models.User.role == models.UserRole.player,
                        func.lower(models.User.email) == member_email,
                    )
                    .first()
                )
            else:
                cache[key] = None
        if cache[key]:
            return cache[key]

    handicap_sa_id = str(getattr(booking, "handicap_sa_id", "") or "").strip().lower()
    if handicap_sa_id:
        key = f"hna:{handicap_sa_id}"
        if key not in cache:
            cache[key] = (
                db.query(models.User)
                .filter(
                    models.User.club_id == int(club_id),
                    models.User.role == models.UserRole.player,
                    func.lower(models.User.handicap_sa_id) == handicap_sa_id,
                )
                .first()
            )
        if cache[key]:
            return cache[key]

    return None


def build_weather_booking_candidates(
    db: Session,
    club_id: int,
    target_date: date,
    min_precip_probability: int = 60,
    min_precip_mm: float = 1.0,
) -> dict[str, Any]:
    start_dt = datetime.combine(target_date, datetime.min.time())
    end_dt = start_dt + timedelta(days=1)

    statuses = [models.BookingStatus.booked, models.BookingStatus.checked_in]
    rows = (
        db.query(models.Booking)
        .join(models.TeeTime, models.Booking.tee_time_id == models.TeeTime.id)
        .options(selectinload(models.Booking.tee_time))
        .filter(
            models.Booking.club_id == int(club_id),
            models.TeeTime.tee_time >= start_dt,
            models.TeeTime.tee_time < end_dt,
            models.Booking.status.in_(statuses),
        )
        .order_by(models.TeeTime.tee_time.asc(), models.Booking.id.asc())
        .all()
    )

    coords = get_club_coordinates(db, club_id)
    if not coords:
        raise RuntimeError("Course coordinates not configured and geocoding failed.")

    forecast = fetch_hourly_forecast(
        latitude=_safe_float(coords.get("latitude"), default=0.0),
        longitude=_safe_float(coords.get("longitude"), default=0.0),
        target_date=target_date,
    )
    hourly = forecast.get("hourly") if isinstance(forecast, dict) else {}
    if not isinstance(hourly, dict) or not hourly:
        raise RuntimeError("No weather forecast points returned for the selected date.")

    user_cache: dict[str, models.User | None] = {}
    items: list[dict[str, Any]] = []
    risky_count = 0
    messageable_count = 0

    for booking in rows:
        tee_time_row = getattr(booking, "tee_time", None)
        tee_dt = getattr(tee_time_row, "tee_time", None)
        if tee_dt is None:
            continue

        point = forecast_point_for_tee_time(hourly, tee_dt)
        risk = classify_weather_risk(
            point,
            min_precip_probability=min_precip_probability,
            min_precip_mm=min_precip_mm,
        )
        if not bool(risk.get("at_risk")):
            continue

        risky_count += 1
        player_user = resolve_player_user_for_booking(db, booking, club_id, cache=user_cache)
        if player_user:
            messageable_count += 1

        items.append(
            {
                "booking_id": int(getattr(booking, "id", 0) or 0),
                "tee_time_id": int(getattr(booking, "tee_time_id", 0) or 0),
                "tee_time": tee_dt.isoformat(),
                "tee_label": str(getattr(tee_time_row, "hole", "") or ""),
                "player_name": str(getattr(booking, "player_name", "") or ""),
                "player_email": str(getattr(booking, "player_email", "") or ""),
                "status": _status_text(getattr(booking, "status", None)) or "booked",
                "risk_level": str(risk.get("level") or "medium"),
                "risk_score": int(risk.get("score") or 0),
                "risk_reasons": risk.get("reasons") or [],
                "precip_probability": float(risk.get("precipitation_probability") or 0.0),
                "precipitation_mm": float(risk.get("precipitation_mm") or 0.0),
                "wind_kmh": float(risk.get("wind_kmh") or 0.0),
                "weather_code": int(risk.get("weather_code") or 0),
                "forecast_hour": risk.get("forecast_time"),
                "player_user_id": int(getattr(player_user, "id", 0) or 0) if player_user else None,
                "can_message": bool(player_user),
            }
        )

    items.sort(
        key=lambda row: (
            0 if str(row.get("risk_level")) == "high" else 1,
            -int(row.get("risk_score") or 0),
            str(row.get("tee_time") or ""),
            int(row.get("booking_id") or 0),
        )
    )

    return {
        "target_date": target_date.isoformat(),
        "forecast_timezone": str(forecast.get("timezone") or "").strip(),
        "course_location": {
            "label": str(coords.get("label") or ""),
            "source": str(coords.get("source") or ""),
            "latitude": round(_safe_float(coords.get("latitude"), default=0.0), 5),
            "longitude": round(_safe_float(coords.get("longitude"), default=0.0), 5),
        },
        "thresholds": {
            "min_precip_probability": int(min_precip_probability),
            "min_precip_mm": float(min_precip_mm),
        },
        "counts": {
            "bookings_considered": len(rows),
            "at_risk": risky_count,
            "messageable": messageable_count,
        },
        "items": items,
    }


def build_weather_prompt_payload(
    item: dict[str, Any],
    sender_name: str | None = None,
) -> tuple[str, str, dict[str, Any]]:
    tee_iso = str(item.get("tee_time") or "")
    tee_dt = _parse_iso_dt(tee_iso) or datetime.utcnow()
    tee_label = str(item.get("tee_label") or "").strip() or "1"
    title = f"Weather check for your {tee_dt.strftime('%H:%M')} tee time"

    reasons = item.get("risk_reasons") if isinstance(item.get("risk_reasons"), list) else []
    reasons_text = ", ".join(str(r) for r in reasons if str(r).strip())
    if not reasons_text:
        reasons_text = "adverse weather"

    sender = str(sender_name or "Pro Shop").strip() or "Pro Shop"
    body = (
        f"{sender}: Weather forecast near tee {tee_label} at {tee_dt.strftime('%H:%M')} shows {reasons_text}. "
        f"Please confirm if you are still playing."
    )
    payload = {
        "kind": "weather_reconfirm",
        "tee_time": tee_iso,
        "tee_label": tee_label,
        "risk_level": item.get("risk_level"),
        "risk_score": item.get("risk_score"),
        "risk_reasons": reasons,
        "precip_probability": item.get("precip_probability"),
        "precipitation_mm": item.get("precipitation_mm"),
        "weather_code": item.get("weather_code"),
        "actions": [
            {"key": "confirm_playing", "label": "Still Playing"},
            {"key": "request_cancel", "label": "Need to Cancel"},
            {"key": "request_callback", "label": "Call Me"},
        ],
    }
    return title, body, payload


def append_booking_note(existing: str | None, line: str) -> str:
    prefix = str(existing or "").strip()
    add = str(line or "").strip()
    if not add:
        return prefix
    if not prefix:
        return add
    normalized = [x.strip() for x in prefix.split("\n") if x.strip()]
    if add in normalized:
        return prefix
    return f"{prefix}\n{add}"


def serialize_notification_payload(raw: str | None) -> dict[str, Any]:
    text = str(raw or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        return {}
    return {}
