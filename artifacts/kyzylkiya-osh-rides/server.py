from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import mimetypes
import socket
import json
import re
import os
import uuid
import hashlib
import hmac
import base64
import threading
import time

_STATIC_ROOT = Path(
    os.environ.get(
        "STATIC_DIST_DIR",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist"),
    )
).resolve()

requests_store = []
offers_store = []
auth_sessions = {}
phone_users = {}
action_throttle = {}

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
AUTH_SESSIONS_FILE = os.environ.get("AUTH_SESSIONS_FILE", "").strip() or os.path.join(DATA_DIR, "auth_sessions.json")
PHONE_USERS_FILE = os.environ.get("PHONE_USERS_FILE", "").strip() or os.path.join(DATA_DIR, "phone_users.json")
REQUEST_CREATE_COOLDOWN_SEC = 20
OFFER_CREATE_COOLDOWN_SEC = 20

SETTLEMENTS_FILE = os.path.join(os.path.dirname(__file__), "custom_settlements.json")
ADMIN_TOKEN = os.environ.get("MAK_ADMIN_TOKEN", "mak-admin-2026")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_BOT_USERNAME = os.environ.get("TELEGRAM_BOT_USERNAME", "alaket_kg_bot").strip()
TELEGRAM_USERS_FILE = (
    os.environ.get("TELEGRAM_USERS_FILE", "").strip()
    or os.path.join(os.path.dirname(os.path.abspath(__file__)), "telegram_users.json")
)
_telegram_registry_lock = threading.Lock()
AUTH_TOKEN_SECRET = (
    os.environ.get("AUTH_TOKEN_SECRET", "").strip()
    or TELEGRAM_BOT_TOKEN
    or ADMIN_TOKEN
    or "mak-auth-fallback-secret"
)


def _env_truthy(name):
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def _load_json_dict(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def _save_json_dict(path, payload):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def persist_auth_state():
    try:
        _save_json_dict(AUTH_SESSIONS_FILE, auth_sessions)
    except OSError:
        pass
    try:
        _save_json_dict(PHONE_USERS_FILE, phone_users)
    except OSError:
        pass


def restore_auth_state():
    global auth_sessions, phone_users
    auth_sessions = _load_json_dict(AUTH_SESSIONS_FILE)
    phone_users = _load_json_dict(PHONE_USERS_FILE)


def _auth_public_user(session):
    return {
        "id": session.get("id", ""),
        "name": session.get("name", ""),
        "phone": session.get("phone", ""),
        "telegramUserId": session.get("telegramUserId", ""),
        "telegramChatId": session.get("telegramChatId", ""),
        "username": session.get("username", ""),
        "photoUrl": session.get("photoUrl", ""),
    }


def _b64url_encode(raw_bytes):
    return base64.urlsafe_b64encode(raw_bytes).decode("ascii").rstrip("=")


def _b64url_decode(raw_text):
    text = str(raw_text or "").strip()
    if not text:
        return b""
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode((text + padding).encode("ascii"))


def _token_sign(payload_b64):
    digest = hmac.new(
        AUTH_TOKEN_SECRET.encode("utf-8"),
        payload_b64.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return _b64url_encode(digest)


def _issue_signed_token(session):
    payload = {
        "id": str(session.get("id", "")).strip(),
        "name": str(session.get("name", "")).strip(),
        "phone": str(session.get("phone", "")).strip(),
        "telegramUserId": str(session.get("telegramUserId", "")).strip(),
        "telegramChatId": str(session.get("telegramChatId", "")).strip(),
        "username": str(session.get("username", "")).strip(),
        "photoUrl": str(session.get("photoUrl", "")).strip(),
        "iat": now_iso(),
    }
    payload_b64 = _b64url_encode(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    sig = _token_sign(payload_b64)
    return f"v1.{payload_b64}.{sig}"


def _read_signed_token(token):
    try:
        parts = str(token or "").split(".")
        if len(parts) != 3 or parts[0] != "v1":
            return None
        payload_b64 = parts[1]
        sig = parts[2]
        expected_sig = _token_sign(payload_b64)
        if not hmac.compare_digest(sig, expected_sig):
            return None
        payload_raw = _b64url_decode(payload_b64)
        payload = json.loads(payload_raw.decode("utf-8"))
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def issue_session(user_record):
    session = {
        "id": str(user_record.get("id", "")).strip() or uuid.uuid4().hex,
        "name": str(user_record.get("name", "")).strip(),
        "phone": str(user_record.get("phone", "")).strip(),
        "telegramUserId": str(user_record.get("telegramUserId", "")).strip(),
        "telegramChatId": str(user_record.get("telegramChatId", "")).strip(),
        "username": str(user_record.get("username", "")).strip(),
        "photoUrl": str(user_record.get("photoUrl", "")).strip(),
        "createdAt": now_iso(),
    }
    token = _issue_signed_token(session)
    auth_sessions[token] = session
    persist_auth_state()
    return token, session


def upsert_phone_user(name, phone):
    existing = phone_users.get(phone)
    now = now_iso()
    if isinstance(existing, dict):
        existing["name"] = name
        existing["lastLoginAt"] = now
        user = existing
    else:
        user = {
            "id": uuid.uuid4().hex,
            "name": name,
            "phone": phone,
            "telegramUserId": "",
            "telegramChatId": "",
            "username": "",
            "photoUrl": "",
            "firstLoginAt": now,
            "lastLoginAt": now,
        }
    phone_users[phone] = user
    persist_auth_state()
    return user


def _load_custom_settlements():
    try:
        with open(SETTLEMENTS_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
            if isinstance(data, list):
                return [str(x) for x in data if isinstance(x, str)]
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return []


def _save_custom_settlements(items):
    with open(SETTLEMENTS_FILE, "w", encoding="utf-8") as fh:
        json.dump(items, fh, ensure_ascii=False, indent=2)


custom_settlements = _load_custom_settlements()


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso_utc(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def expire_stale_entities():
    now = datetime.now(timezone.utc)
    for ride in requests_store:
        if ride.get("status") not in ("active", "accepted"):
            continue
        before = parse_iso_utc(ride.get("departBefore"))
        if not before or before > now:
            continue
        if ride.get("status") == "accepted":
            clear_driver_acceptance(ride)
        ride["status"] = "cancelled"
        ride["cancelledAt"] = now_iso()
    for offer in offers_store:
        if offer.get("status") != "active":
            continue
        before = parse_iso_utc(offer.get("departBefore"))
        if not before or before > now:
            continue
        offer["status"] = "cancelled"
        offer["cancelledAt"] = now_iso()


def passenger_owns_ride(session_user, ride, passenger_phone_req):
    """Passenger release/rate: match by phone or Telegram session."""
    req_phone = str(passenger_phone_req or "").strip()
    stored = str(ride.get("passengerPhone", "")).strip()
    if req_phone and stored and req_phone == stored:
        return True
    if not isinstance(session_user, dict):
        return False
    sess_tid = str(session_user.get("telegramUserId", "")).strip()
    ride_tid = str(ride.get("passengerTelegramUserId", "")).strip()
    return bool(sess_tid and ride_tid and sess_tid == ride_tid)


def hit_rate_limit(actor_key, action, cooldown_sec):
    key = f"{action}:{actor_key}"
    now = time.time()
    prev = action_throttle.get(key)
    if prev is not None:
        delta = now - prev
        if delta < cooldown_sec:
            return int(cooldown_sec - delta) + 1
    action_throttle[key] = now
    return 0


def make_route(origin, destination):
    return f"{origin} → {destination}"


def clear_driver_acceptance(ride):
    """Return a single accepted ride request to the active pool (no driver)."""
    ride["status"] = "active"
    ride["driverName"] = None
    ride["driverPhone"] = None
    ride["driverAge"] = None
    ride["driverExperience"] = None
    ride["carMake"] = None
    ride["carYear"] = None
    ride["carPlate"] = None
    ride["carColor"] = None
    ride["carSeats"] = None
    ride["acceptedAt"] = None
    ride["rideProgress"] = None
    ride["completedAt"] = None


def release_all_accepted_rides_for_driver(driver_phone):
    """All accepted requests for this driver phone become active again."""
    if not driver_phone:
        return 0
    n = 0
    for ride in requests_store:
        if ride.get("status") != "accepted":
            continue
        if ride.get("driverPhone") != driver_phone:
            continue
        clear_driver_acceptance(ride)
        n += 1
    return n


def cancel_active_offers_for_driver(driver_phone):
    """Deactivate all active offers for the given driver."""
    if not driver_phone:
        return 0
    n = 0
    for offer in offers_store:
        if offer.get("status") != "active":
            continue
        if offer.get("driverPhone") != driver_phone:
            continue
        offer["status"] = "cancelled"
        offer["cancelledAt"] = now_iso()
        n += 1
    return n


def has_active_passenger_role(session_user, passenger_phone):
    """True when user already has an active/accepted passenger request."""
    phone = str(passenger_phone or "").strip()
    session_tid = str((session_user or {}).get("telegramUserId", "")).strip() if isinstance(session_user, dict) else ""
    for ride in requests_store:
        if ride.get("status") not in ("active", "accepted"):
            continue
        ride_phone = str(ride.get("passengerPhone", "")).strip()
        ride_tid = str(ride.get("passengerTelegramUserId", "")).strip()
        if phone and ride_phone and phone == ride_phone:
            return True
        if session_tid and ride_tid and session_tid == ride_tid:
            return True
    return False


def has_active_driver_role(driver_phone):
    """True when driver has active offer or accepted ride."""
    phone = str(driver_phone or "").strip()
    if not phone:
        return False
    has_offer = any(
        offer.get("status") == "active" and str(offer.get("driverPhone", "")).strip() == phone
        for offer in offers_store
    )
    if has_offer:
        return True
    return any(
        ride.get("status") == "accepted" and str(ride.get("driverPhone", "")).strip() == phone
        for ride in requests_store
    )


def verify_telegram_widget_auth(payload):
    if not TELEGRAM_BOT_TOKEN:
        return False
    incoming_hash = str(payload.get("hash", "")).strip()
    auth_date = str(payload.get("auth_date", "")).strip()
    user_id = str(payload.get("id", "")).strip()
    if not incoming_hash or not auth_date or not user_id:
        return False
    try:
        auth_ts = int(auth_date)
    except ValueError:
        return False
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if abs(now_ts - auth_ts) > 86400:
        return False

    data_pairs = []
    for key, value in payload.items():
        if key == "hash" or value is None:
            continue
        data_pairs.append((str(key), str(value)))
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(data_pairs))
    secret_key = hashlib.sha256(TELEGRAM_BOT_TOKEN.encode("utf-8")).digest()
    calc_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(calc_hash, incoming_hash)


def _telegram_registry_load():
    try:
        with open(TELEGRAM_USERS_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def _telegram_registry_save(reg):
    tmp_path = TELEGRAM_USERS_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(reg, fh, ensure_ascii=False, indent=2)
    os.replace(tmp_path, TELEGRAM_USERS_FILE)


def register_telegram_user_login(session_record):
    """Persist Telegram user id on each successful Login Widget auth (registration + return visits)."""
    uid = str(session_record.get("telegramUserId", "")).strip()
    if not uid:
        return
    now = now_iso()
    with _telegram_registry_lock:
        reg = _telegram_registry_load()
        if uid in reg and isinstance(reg[uid], dict):
            reg[uid]["lastLoginAt"] = now
            reg[uid]["name"] = session_record.get("name", reg[uid].get("name", ""))
            un = str(session_record.get("username", "")).strip()
            if un:
                reg[uid]["username"] = un
        else:
            reg[uid] = {
                "telegramUserId": uid,
                "name": str(session_record.get("name", "")).strip(),
                "username": str(session_record.get("username", "")).strip(),
                "firstLoginAt": now,
                "lastLoginAt": now,
            }
        try:
            _telegram_registry_save(reg)
        except OSError:
            pass


def get_telegram_user_phone(telegram_user_id):
    uid = str(telegram_user_id or "").strip()
    if not uid:
        return ""
    with _telegram_registry_lock:
        reg = _telegram_registry_load()
        row = reg.get(uid)
        if not isinstance(row, dict):
            return ""
        phone = str(row.get("phone", "")).strip()
        return phone if re.fullmatch(r"\+996\d{9}", phone) else ""


def upsert_telegram_user_phone(telegram_user_id, phone):
    uid = str(telegram_user_id or "").strip()
    normalized_phone = str(phone or "").strip()
    if not uid or not re.fullmatch(r"\+996\d{9}", normalized_phone):
        return
    with _telegram_registry_lock:
        reg = _telegram_registry_load()
        row = reg.get(uid)
        now = now_iso()
        if not isinstance(row, dict):
            row = {
                "telegramUserId": uid,
                "name": "",
                "username": "",
                "firstLoginAt": now,
            }
        row["phone"] = normalized_phone
        row["lastLoginAt"] = now
        reg[uid] = row
        try:
            _telegram_registry_save(reg)
        except OSError:
            pass


restore_auth_state()


def _http_get_json(url, headers, timeout=12):
    request = Request(url, headers=headers)
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _in_kyrgyzstan(lon, lat):
    try:
        lo, la = float(lon), float(lat)
    except (TypeError, ValueError):
        return False
    return 69.0 <= lo <= 80.7 and 39.0 <= la <= 43.4


def _photon_row_kind(props):
    key = str(props.get("osm_key", "")).lower()
    place = str(props.get("place") or props.get("type") or "").lower()
    if key == "highway":
        return "street"
    if key == "place":
        area_places = {
            "neighbourhood",
            "suburb",
            "quarter",
            "village",
            "hamlet",
            "locality",
            "isolated_dwelling",
        }
        if place in area_places:
            return "area"
    return "poi"


def _photon_build_item(props, city, query, lon, lat, kind):
    name = str(props.get("name") or "").strip()
    street = str(props.get("street") or "").strip()
    housenumber = str(props.get("housenumber") or "").strip()
    locality = str(
        props.get("city")
        or props.get("town")
        or props.get("village")
        or props.get("district")
        or props.get("locality")
        or "",
    ).strip()
    country = str(props.get("country") or "").strip()

    if kind == "street":
        line1 = name or street
        if housenumber:
            line1 = f"{line1} {housenumber}".strip()
    elif kind == "area":
        line1 = name
    else:
        parts = [p for p in [street, name] if p]
        line1 = " — ".join(parts) if parts else (name or street)
        if housenumber:
            line1 = f"{line1} {housenumber}".strip()

    if not line1:
        return None

    display = ", ".join([p for p in [line1, locality, country] if p])
    short = ", ".join([p for p in [line1, locality or city] if p])
    osm_id = props.get("osm_id")
    place_id = f"photon:{props.get('osm_type', 'x')}:{osm_id}" if osm_id else f"photon:{uuid.uuid4().hex}"
    terms = {display.lower(), short.lower(), query.lower(), (city or "").lower()}
    if locality:
        terms.add(locality.lower())
    return {
        "placeId": place_id,
        "displayName": display,
        "shortLabel": short,
        "category": str(props.get("osm_key", "") or "address"),
        "type": str(props.get("osm_value", "") or props.get("type", "") or ""),
        "lat": str(lat),
        "lon": str(lon),
        "searchTerms": list(terms),
    }


def _search_photon(city, query):
    """Komoot Photon — streets first; POIs only if few streets. No bbox= (HTTP 400)."""
    q = f"{query} {city}".strip() if city else query
    params = urlencode(
        {
            "q": q,
            "limit": "50",
            "lang": "ru",
        }
    )
    url = f"https://photon.komoot.io/api/?{params}"
    headers = {
        "Accept": "application/json",
        "User-Agent": "KyzylKyya-Osh-Connect/1.0 (+https://github.com/shurikabduraupov-commits/kyzylkyya-osh-connect)",
    }
    try:
        data = _http_get_json(url, headers)
    except (HTTPError, URLError, TimeoutError, socket.timeout, json.JSONDecodeError, OSError):
        return []

    seen = set()
    streets, areas, pois = [], [], []
    for feat in data.get("features", []) if isinstance(data, dict) else []:
        props = feat.get("properties") or {}
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates") or []
        if len(coords) < 2:
            continue
        lon, lat = coords[0], coords[1]
        cc = str(props.get("countrycode", "")).lower()
        if cc:
            if cc != "kg":
                continue
        elif not _in_kyrgyzstan(lon, lat):
            continue
        kind = _photon_row_kind(props)
        item = _photon_build_item(props, city, query, lon, lat, kind)
        if not item:
            continue
        key = item["displayName"].lower()
        if key in seen:
            continue
        seen.add(key)
        if kind == "street":
            streets.append(item)
        elif kind == "area":
            areas.append(item)
        else:
            pois.append(item)

    merged = streets + areas
    if len(merged) < 6:
        merged.extend(pois[: max(0, 12 - len(merged))])
    return merged[:20]


def _nominatim_parse_items(data, query, city):
    seen = set()
    results = []
    for item in data if isinstance(data, list) else []:
        display = str(item.get("display_name", "")).strip()
        if not display:
            continue
        key = display.lower()
        if key in seen:
            continue
        seen.add(key)
        parts = [p.strip() for p in display.split(",") if p.strip()]
        short = ", ".join(parts[:2]) if parts else display
        place_id = str(item.get("place_id") or item.get("osm_id") or uuid.uuid4().hex)
        lat = str(item.get("lat", ""))
        lon = str(item.get("lon", ""))
        category = str(item.get("class", "") or "address")
        item_type = str(item.get("type", "") or "")
        terms = list({display.lower(), short.lower(), query.lower(), (city or "").lower()})
        results.append(
            {
                "placeId": place_id,
                "displayName": display,
                "shortLabel": short,
                "category": category,
                "type": item_type,
                "lat": lat,
                "lon": lon,
                "searchTerms": terms,
            }
        )
    return results[:20]


def _search_nominatim(city, query):
    q = f"{query}, {city}, Kyrgyzstan" if city else f"{query}, Kyrgyzstan"
    params = urlencode(
        {
            "format": "jsonv2",
            "addressdetails": "1",
            "countrycodes": "kg",
            "limit": "20",
            "q": q,
        }
    )
    headers = {
        "Accept": "application/json",
        "User-Agent": "KyzylKyya-Osh-Connect/1.0 (+https://github.com/shurikabduraupov-commits/kyzylkyya-osh-connect)",
    }
    bases = (
        "https://nominatim.openstreetmap.org/search",
        "https://nominatim.openstreetmap.de/search",
    )
    for base in bases:
        try:
            data = _http_get_json(f"{base}?{params}", headers, timeout=10)
        except (HTTPError, URLError, TimeoutError, socket.timeout, json.JSONDecodeError, OSError):
            continue
        parsed = _nominatim_parse_items(data, query, city)
        if parsed:
            return parsed
    return []


def _search_nominatim_structured(city, query):
    """Street + city — works better than free-text q for capitals (e.g. Bishkek)."""
    city = str(city or "").strip()
    query = str(query or "").strip()
    if not city or not query:
        return []
    params = urlencode(
        {
            "format": "jsonv2",
            "addressdetails": "1",
            "countrycodes": "kg",
            "limit": "20",
            "street": query,
            "city": city,
        }
    )
    headers = {
        "Accept": "application/json",
        "User-Agent": "KyzylKyya-Osh-Connect/1.0 (+https://github.com/shurikabduraupov-commits/kyzylkyya-osh-connect)",
    }
    bases = (
        "https://nominatim.openstreetmap.org/search",
        "https://nominatim.openstreetmap.de/search",
    )
    for base in bases:
        try:
            data = _http_get_json(f"{base}?{params}", headers, timeout=10)
        except (HTTPError, URLError, TimeoutError, socket.timeout, json.JSONDecodeError, OSError):
            continue
        parsed = _nominatim_parse_items(data, query, city)
        if parsed:
            return parsed
    return []


def search_addresses(city, query):
    query = str(query or "").strip()
    city = str(city or "").strip()
    if len(query) < 1:
        return []
    merged = _search_photon(city, query)
    if not merged:
        merged = _search_nominatim(city, query)
    if not merged:
        merged = _search_nominatim_structured(city, query)
    return merged


class RideHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def _send_static_file(self, file_path: Path, status: int = 200):
        data = file_path.read_bytes()
        ctype, _enc = mimetypes.guess_type(str(file_path))
        if not ctype:
            ctype = "application/octet-stream"
        charset = "; charset=utf-8" if ctype.startswith("text/") else ""
        self.send_response(status)
        self.send_header("Content-Type", f"{ctype}{charset}")
        if file_path.name == "index.html":
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _try_serve_static(self, req_path: str) -> None:
        if not _STATIC_ROOT.is_dir():
            msg = (
                'Сайттын файлдары табылган жок. Алдын ала "pnpm run build" '
                "жасап, dist папкасын түзүңүз."
            ).encode("utf-8")
            self.send_response(503)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return

        rel = (req_path or "/").strip("/")
        if not rel:
            candidate = (_STATIC_ROOT / "index.html").resolve()
        else:
            candidate = (_STATIC_ROOT / rel).resolve()
        try:
            candidate.relative_to(_STATIC_ROOT)
        except ValueError:
            self.send_response(403)
            self.end_headers()
            return

        if candidate.is_file():
            self._send_static_file(candidate)
            return

        last = Path(rel).name
        if "." in last and not last.endswith(".html"):
            self.send_response(404)
            self.end_headers()
            return

        index_html = (_STATIC_ROOT / "index.html").resolve()
        if index_html.is_file():
            self._send_static_file(index_html)
            return

        self.send_response(404)
        self.end_headers()

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token, Authorization")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw)

    def _path_parts(self):
        path = urlparse(self.path).path
        if path.startswith("/rides-api"):
            path = path[len("/rides-api"):]
        return [part for part in path.split("/") if part]

    def _read_bearer_token(self):
        auth = self.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            return auth[7:].strip()
        return ""

    def _current_session_user(self):
        token = self._read_bearer_token()
        if not token:
            return None
        signed_payload = _read_signed_token(token)
        if isinstance(signed_payload, dict):
            return {
                "id": str(signed_payload.get("id", "")).strip(),
                "name": str(signed_payload.get("name", "")).strip(),
                "phone": str(signed_payload.get("phone", "")).strip(),
                "telegramUserId": str(signed_payload.get("telegramUserId", "")).strip(),
                "telegramChatId": str(signed_payload.get("telegramChatId", "")).strip(),
                "username": str(signed_payload.get("username", "")).strip(),
                "photoUrl": str(signed_payload.get("photoUrl", "")).strip(),
                "createdAt": str(signed_payload.get("iat", "")).strip() or now_iso(),
            }
        session = auth_sessions.get(token)
        return session if isinstance(session, dict) else None

    def do_OPTIONS(self):
        self._send_json(200, {"ok": True})

    def do_GET(self):
        expire_stale_entities()
        parsed = urlparse(self.path)
        req_path = parsed.path or "/"
        if not req_path.startswith("/rides-api"):
            self._try_serve_static(req_path)
            return

        query_params = parse_qs(parsed.query)
        parts = self._path_parts()
        if parts == ["healthz"]:
            self._send_json(200, {"status": "ok"})
            return
        if parts == ["requests"]:
            visible = [item for item in requests_store if item["status"] in ("active", "accepted", "completed")]
            self._send_json(200, visible)
            return
        if len(parts) == 2 and parts[0] == "requests":
            ride = next((item for item in requests_store if item["id"] == parts[1]), None)
            if ride is None:
                self._send_json(404, {"message": "Заявка табылган жок"})
                return
            self._send_json(200, ride)
            return
        if parts == ["settlements"]:
            self._send_json(200, custom_settlements)
            return
        if parts == ["drivers"]:
            entries = []
            for ride in requests_store:
                if ride["status"] != "accepted" or not ride.get("driverPhone"):
                    continue
                entries.append({
                    "kind": "ride",
                    "id": ride["id"],
                    "driverName": ride.get("driverName"),
                    "driverPhone": ride.get("driverPhone"),
                    "driverAge": ride.get("driverAge"),
                    "driverExperience": ride.get("driverExperience"),
                    "carMake": ride.get("carMake"),
                    "carYear": ride.get("carYear"),
                    "carPlate": ride.get("carPlate"),
                    "carColor": ride.get("carColor"),
                    "carSeats": ride.get("carSeats"),
                    "route": ride.get("route"),
                    "origin": ride.get("origin"),
                    "destination": ride.get("destination"),
                    "seats": ride.get("seats"),
                    "departAfter": ride.get("departAfter"),
                    "departBefore": ride.get("departBefore"),
                    "notes": ride.get("notes"),
                    "lastSeenAt": ride.get("acceptedAt"),
                })
            for offer in offers_store:
                if offer["status"] != "active":
                    continue
                entries.append({
                    "kind": "offer",
                    "id": offer["id"],
                    "driverName": offer.get("driverName"),
                    "driverPhone": offer.get("driverPhone"),
                    "driverAge": offer.get("driverAge"),
                    "driverExperience": offer.get("driverExperience"),
                    "carMake": offer.get("carMake"),
                    "carYear": offer.get("carYear"),
                    "carPlate": offer.get("carPlate"),
                    "carColor": offer.get("carColor"),
                    "carSeats": offer.get("carSeats"),
                    "route": offer.get("route"),
                    "origin": offer.get("origin"),
                    "destination": offer.get("destination"),
                    "seats": offer.get("seats"),
                    "departAfter": offer.get("departAfter"),
                    "departBefore": offer.get("departBefore"),
                    "notes": offer.get("notes"),
                    "lastSeenAt": offer.get("createdAt"),
                })
            entries.sort(key=lambda r: r.get("lastSeenAt") or "", reverse=True)
            seen = set()
            drivers = []
            for entry in entries:
                phone = entry.get("driverPhone")
                if phone in seen:
                    continue
                seen.add(phone)
                drivers.append(entry)
            self._send_json(200, drivers)
            return
        if parts == ["offers"]:
            offers = [o for o in offers_store if o["status"] == "active"]
            offers.sort(key=lambda r: r.get("createdAt") or "", reverse=True)
            self._send_json(200, offers)
            return
        if parts == ["stats"]:
            active = [item for item in requests_store if item["status"] == "active"]
            accepted = [item for item in requests_store if item["status"] == "accepted"]
            self._send_json(200, {
                "activeRequests": len(active),
                "acceptedRequests": len(accepted),
                "totalSeats": sum(int(item["seats"]) for item in active),
            })
            return
        if parts == ["auth", "me"]:
            session = self._current_session_user()
            if not session:
                self._send_json(401, {"message": "Сессия табылган жок"})
                return
            self._send_json(200, _auth_public_user(session))
            return
        if parts == ["auth", "settings"]:
            bot_user = TELEGRAM_BOT_USERNAME.lstrip("@").strip()
            open_bot = f"https://t.me/{bot_user}" if bot_user else ""
            self._send_json(
                200,
                {
                    "authRequired": _env_truthy("AUTH_REQUIRED"),
                    "botUsername": bot_user,
                    "openBotUrl": open_bot,
                    "telegramLoginConfigured": bool(TELEGRAM_BOT_TOKEN and bot_user),
                },
            )
            return
        if parts == ["auth", "phone", "config"]:
            self._send_json(
                200,
                {
                    "required": _env_truthy("AUTH_REQUIRED"),
                    "phoneMask": "+996XXXXXXXXX",
                },
            )
            return
        if parts == ["auth", "telegram", "config"]:
            bot_user = TELEGRAM_BOT_USERNAME.lstrip("@").strip()
            open_bot = f"https://t.me/{bot_user}" if bot_user else ""
            self._send_json(
                200,
                {
                    "enabled": bool(TELEGRAM_BOT_TOKEN and bot_user),
                    "botUsername": bot_user,
                    "openBotUrl": open_bot,
                },
            )
            return
        if parts == ["address-search"]:
            city = str(query_params.get("city", [""])[0]).strip()
            query = str(query_params.get("q", [""])[0]).strip()
            self._send_json(200, search_addresses(city, query))
            return
        self._send_json(404, {"message": "Маршрут табылган жок"})

    def do_POST(self):
        expire_stale_entities()
        req_path = urlparse(self.path).path or "/"
        if not req_path.startswith("/rides-api"):
            self.send_response(404)
            self.end_headers()
            return
        parts = self._path_parts()
        try:
            data = self._read_json()
        except json.JSONDecodeError:
            self._send_json(400, {"message": "JSON туура эмес"})
            return
        if parts == ["auth", "phone", "register"]:
            name = str(data.get("name", "")).strip()
            phone = str(data.get("phone", "")).strip()
            if len(name) < 2:
                self._send_json(400, {"message": "Атыңызды жазыңыз"})
                return
            if not re.fullmatch(r"\+996\d{9}", phone):
                self._send_json(400, {"message": "Телефон +996 менен андан кийин 9 сан болушу керек"})
                return
            user = upsert_phone_user(name, phone)
            token, session = issue_session(user)
            self._send_json(200, {"token": token, "user": _auth_public_user(session)})
            return
        if parts == ["requests"]:
            if _env_truthy("AUTH_REQUIRED") and not self._current_session_user():
                self._send_json(401, {"message": "Авторизация талап кылынат"})
                return
            session_user = self._current_session_user()
            origin = str(data.get("origin", "")).strip()
            destination = str(data.get("destination", "")).strip()
            pickup_address = str(data.get("pickupAddress", "")).strip()
            passenger_phone_raw = str(data.get("passengerPhone", "")).strip()
            if re.fullmatch(r"\+996\d{9}", passenger_phone_raw):
                passenger_phone = passenger_phone_raw
            elif passenger_phone_raw in ("", "+996"):
                passenger_phone = ""
            else:
                self._send_json(
                    400,
                    {"message": "Телефон +996 менен андан кийин 9 сан болушу керек"},
                )
                return
            notes = str(data.get("notes", "")).strip()
            if len(notes) > 500:
                notes = notes[:500]
            seats = data.get("seats")
            try:
                seats_number = int(seats)
            except (TypeError, ValueError):
                self._send_json(400, {"message": "Орундардын санын жазыңыз"})
                return
            depart_after = str(data.get("departAfter", "")).strip()
            depart_before = str(data.get("departBefore", "")).strip()

            def _parse_iso(value):
                if not value:
                    return None
                try:
                    return datetime.fromisoformat(value.replace("Z", "+00:00"))
                except ValueError:
                    return None

            after_dt = _parse_iso(depart_after)
            before_dt = _parse_iso(depart_before)
            if after_dt is None or before_dt is None:
                self._send_json(400, {"message": "Чыгуу убактысын тандаңыз"})
                return
            if before_dt <= after_dt:
                self._send_json(400, {"message": "«Чейин» убактысы «дан»дан кеч болушу керек"})
                return
            now_utc = datetime.now(timezone.utc)
            if before_dt <= now_utc:
                self._send_json(400, {"message": "Убакыт азыркыдан кеч болушу керек"})
                return
            if len(origin) < 2:
                self._send_json(400, {"message": "Кайсы жерден чыгарыңызды тандаңыз"})
                return
            if len(destination) < 2:
                self._send_json(400, {"message": "Каякка барарыңызды тандаңыз"})
                return
            if origin == destination:
                self._send_json(400, {"message": "Чыгуу жана баруу пункттары башка болушу керек"})
                return
            if len(pickup_address) < 3:
                self._send_json(400, {"message": "Так даректи жазыңыз"})
                return
            if not passenger_phone:
                tg_uid = str(session_user.get("telegramUserId", "")).strip() if session_user else ""
                if not tg_uid:
                    self._send_json(
                        400,
                        {"message": "Телефон жазыңыз же Telegram аркылуу кирүү керек"},
                    )
                    return
            session_phone = str(session_user.get("phone", "")).strip() if session_user else ""
            driver_identity_phone = session_phone or passenger_phone
            if has_active_driver_role(driver_identity_phone):
                self._send_json(
                    409,
                    {"message": "Сизде активдүү айдоочу жарыясы же сапары бар. Адегенде аны аяктап же токтотуңуз."},
                )
                return
            actor_key = (
                str(session_user.get("id", "")).strip()
                if session_user and str(session_user.get("id", "")).strip()
                else (
                    passenger_phone
                    or (str(session_user.get("telegramUserId", "")).strip() if session_user else "")
                )
            )
            retry_after = hit_rate_limit(actor_key, "create_request", REQUEST_CREATE_COOLDOWN_SEC)
            if retry_after > 0:
                self._send_json(429, {"message": f"Өтө бат жөнөтүлдү. {retry_after} сек күтүңүз."})
                return
            if session_user and session_user.get("telegramUserId") and passenger_phone:
                session_user["phone"] = passenger_phone
                upsert_telegram_user_phone(session_user.get("telegramUserId"), passenger_phone)
                persist_auth_state()
            if len(notes) < 1:
                self._send_json(400, {"message": "Кошумча эскертүү жазыңыз (үй номери, белги ж.б.)"})
                return
            if seats_number < 1 or seats_number > 7:
                self._send_json(400, {"message": "Орундардын саны 1ден 7ге чейин болушу керек"})
                return
            ptid = str(session_user.get("telegramUserId", "")).strip() if session_user else ""
            puser = str(session_user.get("username", "")).strip() if session_user else ""
            ride = {
                "id": uuid.uuid4().hex,
                "origin": origin,
                "destination": destination,
                "pickupAddress": pickup_address,
                "passengerPhone": passenger_phone,
                "passengerTelegramUserId": ptid,
                "passengerTelegramUsername": puser or None,
                "notes": notes or None,
                "seats": seats_number,
                "route": make_route(origin, destination),
                "status": "active",
                "driverName": None,
                "driverPhone": None,
                "driverAge": None,
                "driverExperience": None,
                "carMake": None,
                "carYear": None,
                "carPlate": None,
                "carColor": None,
                "carSeats": None,
                "departAfter": after_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
                "departBefore": before_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
                "createdAt": now_iso(),
                "acceptedAt": None,
                "rideProgress": None,
                "completedAt": None,
                "passengerRating": None,
                "ratedAt": None,
                "driverPassengerRating": None,
                "driverRatedAt": None,
                "cancelledAt": None,
            }
            requests_store.insert(0, ride)
            self._send_json(201, ride)
            return
        if parts == ["auth", "telegram", "widget"]:
            if not TELEGRAM_BOT_TOKEN:
                self._send_json(503, {"message": "Telegram токени коюлган эмес (TELEGRAM_BOT_TOKEN)."})
                return
            if not verify_telegram_widget_auth(data):
                self._send_json(403, {"message": "Telegram авторизациясы текшерилген жок"})
                return
            first = str(data.get("first_name", "")).strip()
            last = str(data.get("last_name", "")).strip()
            full_name = f"{first} {last}".strip() or str(data.get("username", "")).strip() or "Telegram user"
            telegram_uid = str(data.get("id", "")).strip()
            linked_phone = get_telegram_user_phone(telegram_uid)
            session = {
                "id": telegram_uid or uuid.uuid4().hex,
                "name": full_name,
                "phone": linked_phone,
                "telegramUserId": telegram_uid,
                "telegramChatId": "",
                "username": str(data.get("username", "")).strip(),
                "photoUrl": str(data.get("photo_url", "")).strip(),
                "createdAt": now_iso(),
            }
            session_token, session = issue_session(session)
            register_telegram_user_login(session)
            self._send_json(200, {"token": session_token, "user": _auth_public_user(session)})
            return
        if parts == ["offers"]:
            if _env_truthy("AUTH_REQUIRED") and not self._current_session_user():
                self._send_json(401, {"message": "Авторизация талап кылынат"})
                return
            session_user = self._current_session_user()
            origin = str(data.get("origin", "")).strip()
            destination = str(data.get("destination", "")).strip()
            notes = str(data.get("notes", "")).strip()
            if len(notes) > 500:
                notes = notes[:500]
            seats = data.get("seats")
            try:
                seats_number = int(seats)
            except (TypeError, ValueError):
                self._send_json(400, {"message": "Орундардын санын жазыңыз"})
                return
            depart_after = str(data.get("departAfter", "")).strip()
            depart_before = str(data.get("departBefore", "")).strip()

            def _parse_iso(value):
                if not value:
                    return None
                try:
                    return datetime.fromisoformat(value.replace("Z", "+00:00"))
                except ValueError:
                    return None

            after_dt = _parse_iso(depart_after)
            before_dt = _parse_iso(depart_before)
            if after_dt is None or before_dt is None:
                self._send_json(400, {"message": "Чыгуу убактысын тандаңыз"})
                return
            if before_dt <= after_dt:
                self._send_json(400, {"message": "«Чейин» убактысы «дан»дан кеч болушу керек"})
                return
            now_utc = datetime.now(timezone.utc)
            if before_dt <= now_utc:
                self._send_json(400, {"message": "Убакыт азыркыдан кеч болушу керек"})
                return
            if len(origin) < 2 or len(destination) < 2 or origin == destination:
                self._send_json(400, {"message": "Маршрутту туура тандаңыз"})
                return
            if seats_number < 1 or seats_number > 8:
                self._send_json(400, {"message": "Бош орундардын саны 1ден 8ге чейин"})
                return

            driver_name = str(data.get("driverName", "")).strip()
            driver_phone = str(data.get("driverPhone", "")).strip()
            car_make = str(data.get("carMake", "")).strip()
            car_plate = str(data.get("carPlate", "")).strip()
            car_color = str(data.get("carColor", "")).strip()

            def _to_int(value):
                try:
                    return int(value)
                except (TypeError, ValueError):
                    return None

            driver_age = _to_int(data.get("driverAge"))
            driver_exp = _to_int(data.get("driverExperience"))
            car_year = _to_int(data.get("carYear"))
            car_seats = _to_int(data.get("carSeats"))

            if (
                len(driver_name) < 2
                or len(driver_phone) < 5
                or driver_age is None
                or driver_exp is None
                or len(car_make) < 2
                or car_year is None
                or car_year < 1000
                or car_year > 9999
                or len(car_plate) < 3
                or len(car_color) < 2
                or car_seats is None
            ):
                self._send_json(400, {"message": "Алгач профилди толтуруңуз"})
                return
            if not re.fullmatch(r"\+996\d{9}", driver_phone):
                self._send_json(400, {"message": "Телефон +996 менен андан кийин 9 сан болушу керек"})
                return
            if has_active_passenger_role(session_user, driver_phone):
                self._send_json(
                    409,
                    {"message": "Сизде активдүү жүргүнчү заявкасы бар. Адегенде аны аяктап же жокко чыгарыңыз."},
                )
                return
            actor_key = (
                str(session_user.get("id", "")).strip()
                if session_user and str(session_user.get("id", "")).strip()
                else driver_phone
            )
            retry_after = hit_rate_limit(actor_key, "create_offer", OFFER_CREATE_COOLDOWN_SEC)
            if retry_after > 0:
                self._send_json(429, {"message": f"Өтө бат жөнөтүлдү. {retry_after} сек күтүңүз."})
                return
            if session_user and session_user.get("telegramUserId"):
                session_user["phone"] = driver_phone
                upsert_telegram_user_phone(session_user.get("telegramUserId"), driver_phone)
                persist_auth_state()

            for existing in offers_store:
                if existing["status"] == "active" and existing.get("driverPhone") == driver_phone and existing.get("origin") == origin and existing.get("destination") == destination:
                    existing["status"] = "cancelled"
                    existing["cancelledAt"] = now_iso()

            offer = {
                "id": uuid.uuid4().hex,
                "origin": origin,
                "destination": destination,
                "route": make_route(origin, destination),
                "seats": seats_number,
                "notes": notes or None,
                "departAfter": after_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
                "departBefore": before_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
                "driverName": driver_name,
                "driverPhone": driver_phone,
                "driverAge": driver_age,
                "driverExperience": driver_exp,
                "carMake": car_make,
                "carYear": car_year,
                "carPlate": car_plate,
                "carColor": car_color,
                "carSeats": car_seats,
                "status": "active",
                "createdAt": now_iso(),
                "cancelledAt": None,
            }
            offers_store.insert(0, offer)
            self._send_json(201, offer)
            return
        if len(parts) == 3 and parts[0] == "offers" and parts[2] == "cancel":
            offer = next((o for o in offers_store if o["id"] == parts[1]), None)
            if offer is None:
                self._send_json(404, {"message": "Объявление табылган жок"})
                return
            driver_phone = str(data.get("driverPhone", "")).strip()
            if driver_phone and offer.get("driverPhone") and driver_phone != offer["driverPhone"]:
                self._send_json(403, {"message": "Бул объявление башка айдоочуга таандык"})
                return
            if offer["status"] == "active":
                offer["status"] = "cancelled"
                offer["cancelledAt"] = now_iso()
                owner_phone = str(offer.get("driverPhone", "")).strip()
                if owner_phone:
                    release_all_accepted_rides_for_driver(owner_phone)
            self._send_json(200, offer)
            return
        if parts == ["settlements"]:
            token = self.headers.get("X-Admin-Token", "")
            if token != ADMIN_TOKEN:
                self._send_json(403, {"message": "Уруксат жок"})
                return
            name = str(data.get("name", "")).strip()
            if len(name) < 2:
                self._send_json(400, {"message": "Аталышы кыска"})
                return
            existing = {s.lower() for s in custom_settlements}
            if name.lower() in existing:
                self._send_json(200, custom_settlements)
                return
            custom_settlements.append(name)
            _save_custom_settlements(custom_settlements)
            self._send_json(201, custom_settlements)
            return
        if len(parts) == 3 and parts[0] == "requests" and parts[2] == "cancel":
            ride = next((item for item in requests_store if item["id"] == parts[1]), None)
            if ride is None:
                self._send_json(404, {"message": "Заявка табылган жок"})
                return
            if ride["status"] == "cancelled":
                self._send_json(200, ride)
                return
            if ride.get("status") == "accepted" and ride.get("rideProgress") in ("en_route", "arrived", "in_trip"):
                self._send_json(409, {"message": "Айдоочу жолго чыкты, эми бул заявканы жокко чыгаруу мүмкүн эмес"})
                return
            was_accepted = ride["status"] == "accepted"
            ride["status"] = "cancelled"
            ride["cancelledAt"] = now_iso()
            if was_accepted:
                # So drivers no longer see this as an assigned order (GET /requests omits cancelled anyway).
                ride["driverName"] = None
                ride["driverPhone"] = None
                ride["driverAge"] = None
                ride["driverExperience"] = None
                ride["carMake"] = None
                ride["carYear"] = None
                ride["carPlate"] = None
                ride["carColor"] = None
                ride["carSeats"] = None
                ride["acceptedAt"] = None
            self._send_json(200, ride)
            return
        if len(parts) == 3 and parts[0] == "requests" and parts[2] == "release":
            ride = next((item for item in requests_store if item["id"] == parts[1]), None)
            if ride is None:
                self._send_json(404, {"message": "Заявка табылган жок"})
                return
            if ride["status"] != "accepted":
                self._send_json(409, {"message": "Заказ кабыл алынган эмес"})
                return
            driver_phone_req = str(data.get("driverPhone", "")).strip()
            passenger_phone_req = str(data.get("passengerPhone", "")).strip()
            allowed_driver = bool(
                driver_phone_req
                and ride.get("driverPhone")
                and driver_phone_req == ride["driverPhone"]
            )
            allowed_passenger = passenger_owns_ride(self._current_session_user(), ride, passenger_phone_req)
            if not allowed_driver and not allowed_passenger:
                self._send_json(403, {"message": "Бул операция үчүн уруксат жок"})
                return
            if allowed_passenger and ride.get("rideProgress") in ("en_route", "arrived", "in_trip"):
                self._send_json(409, {"message": "Айдоочу жолго чыкты, эми айдоочудан баш тартуу мүмкүн эмес"})
                return
            clear_driver_acceptance(ride)
            self._send_json(200, ride)
            return
        if len(parts) == 3 and parts[0] == "requests" and parts[2] == "progress":
            ride = next((item for item in requests_store if item["id"] == parts[1]), None)
            if ride is None:
                self._send_json(404, {"message": "Заявка табылган жок"})
                return
            if ride.get("status") != "accepted":
                self._send_json(409, {"message": "Заказ кабыл алынган эмес"})
                return
            driver_phone_req = str(data.get("driverPhone", "")).strip()
            if not driver_phone_req or driver_phone_req != str(ride.get("driverPhone", "")).strip():
                self._send_json(403, {"message": "Бул операция үчүн уруксат жок"})
                return
            progress = str(data.get("progress", "")).strip()
            if progress not in ("assigned", "en_route", "arrived", "in_trip", "completed"):
                self._send_json(400, {"message": "Статус туура эмес"})
                return
            ride["rideProgress"] = progress
            if progress == "completed":
                ride["status"] = "completed"
                ride["completedAt"] = now_iso()
                cancel_active_offers_for_driver(ride.get("driverPhone"))
            self._send_json(200, ride)
            return
        if len(parts) == 3 and parts[0] == "requests" and parts[2] == "rate":
            ride = next((item for item in requests_store if item["id"] == parts[1]), None)
            if ride is None:
                self._send_json(404, {"message": "Заявка табылган жок"})
                return
            if ride.get("status") != "completed":
                self._send_json(409, {"message": "Бул заказ али аяктай элек"})
                return
            passenger_phone_req = str(data.get("passengerPhone", "")).strip()
            if not passenger_owns_ride(self._current_session_user(), ride, passenger_phone_req):
                self._send_json(403, {"message": "Бул операция үчүн уруксат жок"})
                return
            if ride.get("passengerRating") is not None:
                self._send_json(409, {"message": "Баалоо буга чейин жөнөтүлгөн"})
                return
            try:
                rating = int(data.get("rating"))
            except (TypeError, ValueError):
                self._send_json(400, {"message": "Баа 1ден 5ке чейин болушу керек"})
                return
            if rating < 1 or rating > 5:
                self._send_json(400, {"message": "Баа 1ден 5ке чейин болушу керек"})
                return
            ride["passengerRating"] = rating
            ride["ratedAt"] = now_iso()
            self._send_json(200, ride)
            return
        if len(parts) == 3 and parts[0] == "requests" and parts[2] == "rate-passenger":
            ride = next((item for item in requests_store if item["id"] == parts[1]), None)
            if ride is None:
                self._send_json(404, {"message": "Заявка табылган жок"})
                return
            if ride.get("status") != "completed":
                self._send_json(409, {"message": "Бул заказ али аяктай элек"})
                return
            driver_phone_req = str(data.get("driverPhone", "")).strip()
            if not driver_phone_req or driver_phone_req != str(ride.get("driverPhone", "")).strip():
                self._send_json(403, {"message": "Бул операция үчүн уруксат жок"})
                return
            if ride.get("driverPassengerRating") is not None:
                self._send_json(409, {"message": "Баалоо буга чейин жөнөтүлгөн"})
                return
            try:
                rating = int(data.get("rating"))
            except (TypeError, ValueError):
                self._send_json(400, {"message": "Баа 1ден 5ке чейин болушу керек"})
                return
            if rating < 1 or rating > 5:
                self._send_json(400, {"message": "Баа 1ден 5ке чейин болушу керек"})
                return
            ride["driverPassengerRating"] = rating
            ride["driverRatedAt"] = now_iso()
            self._send_json(200, ride)
            return
        if len(parts) == 3 and parts[0] == "requests" and parts[2] == "accept":
            ride = next((item for item in requests_store if item["id"] == parts[1]), None)
            if ride is None:
                self._send_json(404, {"message": "Заявка табылган жок"})
                return
            if ride["status"] != "active":
                self._send_json(409, {"message": "Заказ буга чейин кабыл алынган"})
                return
            driver_name = str(data.get("driverName", "")).strip()
            driver_phone = str(data.get("driverPhone", "")).strip()
            car_make = str(data.get("carMake", "")).strip()
            car_plate = str(data.get("carPlate", "")).strip()
            car_color = str(data.get("carColor", "")).strip()

            def _to_int(value):
                try:
                    return int(value)
                except (TypeError, ValueError):
                    return None

            driver_age = _to_int(data.get("driverAge"))
            driver_exp = _to_int(data.get("driverExperience"))
            car_year = _to_int(data.get("carYear"))
            car_seats = _to_int(data.get("carSeats"))

            if len(driver_name) < 2:
                self._send_json(400, {"message": "Айдоочунун атын жазыңыз"})
                return
            if len(driver_phone) < 5:
                self._send_json(400, {"message": "Айдоочунун телефонун жазыңыз"})
                return
            if has_active_passenger_role(self._current_session_user(), driver_phone):
                self._send_json(
                    409,
                    {"message": "Сизде активдүү жүргүнчү заявкасы бар. Адегенде аны аяктап же жокко чыгарыңыз."},
                )
                return
            if driver_age is None or driver_age < 18 or driver_age > 80:
                self._send_json(400, {"message": "Жашыңызды туура жазыңыз"})
                return
            if driver_exp is None or driver_exp < 0 or driver_exp > 60:
                self._send_json(400, {"message": "Стажыңызды туура жазыңыз"})
                return
            if len(car_make) < 2:
                self._send_json(400, {"message": "Унаанын маркасын жазыңыз"})
                return
            if car_year is None or car_year < 1000 or car_year > 9999:
                self._send_json(400, {"message": "Чыгарылган жылын туура жазыңыз"})
                return
            if len(car_plate) < 3:
                self._send_json(400, {"message": "Мамлекеттик номерин жазыңыз"})
                return
            if len(car_color) < 2:
                self._send_json(400, {"message": "Унаанын түсүн жазыңыз"})
                return
            if car_seats is None or car_seats < 1 or car_seats > 8:
                self._send_json(400, {"message": "Орундардын санын туура жазыңыз"})
                return

            try:
                need_seats = int(ride.get("seats", 0))
            except (TypeError, ValueError):
                need_seats = 0
            if need_seats < 1:
                self._send_json(400, {"message": "Заявкада орундардын саны туура эмес"})
                return
            if need_seats > car_seats:
                self._send_json(
                    409,
                    {"message": "Бул заявкадагы орундар унааңыздын салонуна кирбейт"},
                )
                return
            used_seats = 0
            for item in requests_store:
                if item.get("status") != "accepted" or item.get("driverPhone") != driver_phone:
                    continue
                try:
                    used_seats += int(item.get("seats", 0))
                except (TypeError, ValueError):
                    continue
            if used_seats + need_seats > car_seats:
                self._send_json(
                    409,
                    {
                        "message": "Бош орундар жетишсиз: мурун кабыл алган заказдарыңыз менен бул орундар унааңыздан ашып кетти",
                    },
                )
                return
            matching_offer = next(
                (
                    offer
                    for offer in offers_store
                    if offer.get("status") == "active"
                    and offer.get("driverPhone") == driver_phone
                    and offer.get("origin") == ride.get("origin")
                    and offer.get("destination") == ride.get("destination")
                ),
                None,
            )
            if not matching_offer:
                self._send_json(
                    409,
                    {
                        "message": "Бул заявканы кабыл алуу үчүн ушундай маршруттагы активдүү объявлениеңиз болушу керек",
                    },
                )
                return
            try:
                offer_total_seats = int(matching_offer.get("seats", 0))
            except (TypeError, ValueError):
                offer_total_seats = 0
            route_used_seats = 0
            for item in requests_store:
                if item.get("status") != "accepted":
                    continue
                if item.get("driverPhone") != driver_phone:
                    continue
                if item.get("origin") != ride.get("origin") or item.get("destination") != ride.get("destination"):
                    continue
                try:
                    route_used_seats += int(item.get("seats", 0))
                except (TypeError, ValueError):
                    continue
            if route_used_seats + need_seats > offer_total_seats:
                self._send_json(
                    409,
                    {
                        "message": "Бул маршрутта бош орун жетишсиз: объявлениедеги бош орундар жүргүнчүнүн керектөөсүнөн аз",
                    },
                )
                return

            ride["status"] = "accepted"
            ride["driverName"] = driver_name
            ride["driverPhone"] = driver_phone
            ride["driverAge"] = driver_age
            ride["driverExperience"] = driver_exp
            ride["carMake"] = car_make
            ride["carYear"] = car_year
            ride["carPlate"] = car_plate
            ride["carColor"] = car_color
            ride["carSeats"] = car_seats
            ride["acceptedAt"] = now_iso()
            ride["rideProgress"] = "assigned"
            self._send_json(200, ride)
            return
        self._send_json(404, {"message": "Маршрут табылган жок"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "24615"))
    print(f"rides-server: listening on 0.0.0.0:{port}", flush=True)
    server = ThreadingHTTPServer(("0.0.0.0", port), RideHandler)
    server.serve_forever()
