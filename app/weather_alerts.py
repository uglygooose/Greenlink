from __future__ import annotations

import json
import threading
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import requests
from requests.adapters import HTTPAdapter
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload
from urllib3.util.retry import Retry

from app import models
from app.observability import log_event

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
MET_NO_FORECAST_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact"
DEFAULT_FORECAST_TIMEZONE = "Africa/Johannesburg"
MET_NO_USER_AGENT = "GreenLink/1.0 (+https://greenlink.app)"
FORECAST_CACHE_TTL_MINUTES = 45
_FORECAST_CACHE: dict[str, dict[str, Any]] = {}
_FORECAST_CACHE_LOCK = threading.Lock()

_WEATHER_HTTP_RETRY = Retry(
    total=2,
    connect=2,
    read=2,
    backoff_factor=0.35,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset(["GET"]),
    raise_on_status=False,
)
_WEATHER_HTTP_ADAPTER = HTTPAdapter(max_retries=_WEATHER_HTTP_RETRY, pool_connections=8, pool_maxsize=8)
_WEATHER_HTTP_SESSION = requests.Session()
_WEATHER_HTTP_SESSION.mount("https://", _WEATHER_HTTP_ADAPTER)
_WEATHER_HTTP_SESSION.mount("http://", _WEATHER_HTTP_ADAPTER)

# Known club fallbacks for demo reliability when geocoding is unavailable.
# Umhlali Country Club (Ballito, KZN) from OpenStreetMap/Mapcarta reference.
KNOWN_COURSE_COORDS: list[dict[str, Any]] = [
    {
        "keywords": ["umhlali"],
        "latitude": -29.51403,
        "longitude": 31.19402,
        "label": "Umhlali Country Club",
    }
]

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


def _to_local_naive(value: datetime, timezone_name: str = DEFAULT_FORECAST_TIMEZONE) -> datetime:
    if value.tzinfo is None:
        return value
    try:
        return value.astimezone(ZoneInfo(timezone_name)).replace(tzinfo=None)
    except Exception:
        return value.replace(tzinfo=None)


def _met_no_weather_code(symbol_code: str | None) -> int:
    symbol = str(symbol_code or "").strip().lower()
    if not symbol:
        return 0
    if "thunder" in symbol:
        return 95
    if "heavyrain" in symbol or "rainshowers_heavy" in symbol:
        return 65
    if "rain" in symbol or "sleet" in symbol or "snow" in symbol:
        return 61
    return 0


def _met_no_precip_probability(symbol_code: str | None, precipitation_mm: float) -> float:
    symbol = str(symbol_code or "").strip().lower()
    mm = max(0.0, float(precipitation_mm or 0.0))
    if "thunder" in symbol:
        return 95.0
    if "heavyrain" in symbol:
        return 90.0
    if "rain" in symbol or "sleet" in symbol or "snow" in symbol:
        return max(70.0, min(90.0, 65.0 + (mm * 12.0)))
    if mm >= 1.0:
        return 60.0
    return 0.0


def _forecast_cache_key(latitude: float, longitude: float, target_date: date) -> str:
    return f"{round(float(latitude), 4)}|{round(float(longitude), 4)}|{target_date.isoformat()}"


def _http_get_json(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout_s: float = 12.0,
) -> dict[str, Any]:
    response = _WEATHER_HTTP_SESSION.get(url, params=params, headers=headers, timeout=float(timeout_s))
    response.raise_for_status()
    if not response.content:
        return {}
    try:
        payload = response.json()
    except ValueError as e:
        raise requests.RequestException(f"Invalid JSON response from weather provider: {url}") from e
    return payload if isinstance(payload, dict) else {}


def _get_cached_forecast(latitude: float, longitude: float, target_date: date) -> tuple[dict[str, Any] | None, str | None]:
    key = _forecast_cache_key(latitude, longitude, target_date)
    with _FORECAST_CACHE_LOCK:
        entry = _FORECAST_CACHE.get(key)
    if not isinstance(entry, dict):
        return None, None

    cached_at = entry.get("cached_at")
    if not isinstance(cached_at, datetime):
        return None, None

    age_seconds = (datetime.utcnow() - cached_at).total_seconds()
    if age_seconds > (FORECAST_CACHE_TTL_MINUTES * 60):
        return None, None

    payload = entry.get("payload")
    if not isinstance(payload, dict):
        return None, None

    stamp = cached_at.strftime("%H:%M")
    return payload, f"{stamp} UTC"


def _set_cached_forecast(latitude: float, longitude: float, target_date: date, payload: dict[str, Any]) -> None:
    if not isinstance(payload, dict):
        return
    key = _forecast_cache_key(latitude, longitude, target_date)
    with _FORECAST_CACHE_LOCK:
        _FORECAST_CACHE[key] = {
            "cached_at": datetime.utcnow(),
            "payload": payload,
        }


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

    club_name_lower = club_name.lower()
    for item in KNOWN_COURSE_COORDS:
        keywords = [str(v or "").strip().lower() for v in (item.get("keywords") or []) if str(v or "").strip()]
        if not keywords:
            continue
        if not any(k in club_name_lower for k in keywords):
            continue
        return {
            "latitude": _safe_float(item.get("latitude"), default=0.0),
            "longitude": _safe_float(item.get("longitude"), default=0.0),
            "source": "known_course",
            "label": str(item.get("label") or club_name).strip() or club_name,
        }

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
            payload = _http_get_json(
                OPEN_METEO_GEOCODE_URL,
                params={
                    "name": query_name,
                    "count": 5,
                    "language": "en",
                    "format": "json",
                },
                timeout=timeout_s,
            )
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
    payload = _http_get_json(
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


def fetch_hourly_forecast_met_no(
    latitude: float,
    longitude: float,
    target_date: date,
    timeout_s: float = 12.0,
) -> dict[str, Any]:
    payload = _http_get_json(
        MET_NO_FORECAST_URL,
        params={
            "lat": f"{float(latitude):.6f}",
            "lon": f"{float(longitude):.6f}",
        },
        headers={
            "User-Agent": MET_NO_USER_AGENT,
            "Accept": "application/json",
        },
        timeout=timeout_s,
    )

    properties = payload.get("properties") if isinstance(payload, dict) else {}
    time_series = properties.get("timeseries") if isinstance(properties, dict) else []
    by_hour: dict[str, dict[str, Any]] = {}
    for point in time_series or []:
        if not isinstance(point, dict):
            continue
        point_dt = _parse_iso_dt(str(point.get("time") or ""))
        if point_dt is None:
            continue
        local_dt = _to_local_naive(point_dt, timezone_name=DEFAULT_FORECAST_TIMEZONE)
        if local_dt.date() != target_date:
            continue

        data = point.get("data") if isinstance(point.get("data"), dict) else {}
        next_one = data.get("next_1_hours") if isinstance(data.get("next_1_hours"), dict) else {}
        next_details = next_one.get("details") if isinstance(next_one.get("details"), dict) else {}
        next_summary = next_one.get("summary") if isinstance(next_one.get("summary"), dict) else {}
        instant = data.get("instant") if isinstance(data.get("instant"), dict) else {}
        instant_details = instant.get("details") if isinstance(instant.get("details"), dict) else {}

        precipitation_mm = _safe_float(next_details.get("precipitation_amount"), default=0.0)
        symbol_code = str(next_summary.get("symbol_code") or "").strip().lower()
        weather_code = _met_no_weather_code(symbol_code)
        precip_probability = _met_no_precip_probability(symbol_code, precipitation_mm)
        wind_ms = _safe_float(instant_details.get("wind_speed"), default=0.0)
        wind_kmh = max(0.0, wind_ms * 3.6)

        key = _normalize_hour_key(local_dt)
        by_hour[key] = {
            "time": key,
            "precipitation_probability": precip_probability,
            "precipitation": precipitation_mm,
            "weather_code": weather_code,
            "wind_speed_10m": wind_kmh,
        }

    return {
        "timezone": DEFAULT_FORECAST_TIMEZONE,
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
    latitude = _safe_float(coords.get("latitude"), default=0.0)
    longitude = _safe_float(coords.get("longitude"), default=0.0)

    forecast: dict[str, Any] = {}
    hourly: dict[str, dict[str, Any]] = {}
    provider_unavailable = False
    provider_note = ""
    provider_name = "open_meteo"
    try:
        forecast = fetch_hourly_forecast(
            latitude=latitude,
            longitude=longitude,
            target_date=target_date,
        )
        hourly_raw = forecast.get("hourly") if isinstance(forecast, dict) else {}
        if isinstance(hourly_raw, dict):
            hourly = hourly_raw
        if not isinstance(hourly, dict) or not hourly:
            forecast = fetch_hourly_forecast_met_no(
                latitude=latitude,
                longitude=longitude,
                target_date=target_date,
            )
            provider_name = "met_no"
            hourly_raw = forecast.get("hourly") if isinstance(forecast, dict) else {}
            hourly = hourly_raw if isinstance(hourly_raw, dict) else {}
    except requests.RequestException as primary_exc:
        log_event(
            "warning",
            "weather.primary_provider_failed",
            club_id=int(club_id),
            target_date=target_date.isoformat(),
            error_type=type(primary_exc).__name__,
            error=str(primary_exc)[:220],
        )
        try:
            forecast = fetch_hourly_forecast_met_no(
                latitude=latitude,
                longitude=longitude,
                target_date=target_date,
            )
            provider_name = "met_no"
            hourly_raw = forecast.get("hourly") if isinstance(forecast, dict) else {}
            hourly = hourly_raw if isinstance(hourly_raw, dict) else {}
        except requests.RequestException as backup_exc:
            log_event(
                "warning",
                "weather.backup_provider_failed",
                club_id=int(club_id),
                target_date=target_date.isoformat(),
                error_type=type(backup_exc).__name__,
                error=str(backup_exc)[:220],
            )
            provider_unavailable = True
            provider_note = "Live rain forecast temporarily unavailable."

    if not provider_unavailable and isinstance(hourly, dict) and hourly:
        _set_cached_forecast(latitude, longitude, target_date, forecast)

    if not provider_unavailable and (not isinstance(hourly, dict) or not hourly):
        provider_unavailable = True
        provider_note = "Live rain forecast unavailable for this date."
    elif provider_name == "met_no":
        provider_note = "Using backup weather feed."

    if provider_unavailable:
        cached_forecast, cached_stamp = _get_cached_forecast(latitude, longitude, target_date)
        cached_hourly = (cached_forecast or {}).get("hourly") if isinstance(cached_forecast, dict) else {}
        if isinstance(cached_hourly, dict) and cached_hourly:
            provider_unavailable = False
            provider_name = "cache"
            forecast = cached_forecast or {}
            hourly = cached_hourly
            provider_note = f"Using cached forecast from {cached_stamp}."
            log_event(
                "info",
                "weather.cache_fallback_used",
                club_id=int(club_id),
                target_date=target_date.isoformat(),
                cached_at=cached_stamp,
            )

    user_cache: dict[str, models.User | None] = {}
    items: list[dict[str, Any]] = []
    risky_count = 0
    messageable_count = 0

    for booking in rows:
        tee_time_row = getattr(booking, "tee_time", None)
        tee_dt = getattr(tee_time_row, "tee_time", None)
        if tee_dt is None:
            continue

        if provider_unavailable:
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
                "precip_probability": (
                    float(risk.get("precipitation_probability"))
                    if risk.get("precipitation_probability") is not None
                    else None
                ),
                "precipitation_mm": (
                    float(risk.get("precipitation_mm"))
                    if risk.get("precipitation_mm") is not None
                    else None
                ),
                "weather_code": (
                    int(risk.get("weather_code"))
                    if risk.get("weather_code") is not None
                    else None
                ),
                "forecast_hour": risk.get("forecast_time"),
                "forecast_mode": "manual_fallback" if provider_unavailable else "provider",
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
        "provider_unavailable": bool(provider_unavailable),
        "provider_note": provider_note or None,
        "provider_name": provider_name,
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
