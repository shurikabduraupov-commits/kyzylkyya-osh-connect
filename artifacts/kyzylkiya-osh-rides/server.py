from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone
from urllib.parse import urlparse
import json
import os
import uuid

requests_store = []

SETTLEMENTS_FILE = os.path.join(os.path.dirname(__file__), "custom_settlements.json")
ADMIN_TOKEN = os.environ.get("MAK_ADMIN_TOKEN", "mak-admin-2026")


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


def make_route(origin, destination):
    return f"{origin} → {destination}"


class RideHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token")
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

    def do_OPTIONS(self):
        self._send_json(200, {"ok": True})

    def do_GET(self):
        parts = self._path_parts()
        if parts == ["healthz"]:
            self._send_json(200, {"status": "ok"})
            return
        if parts == ["requests"]:
            active = [item for item in requests_store if item["status"] == "active"]
            self._send_json(200, active)
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
            accepted = [item for item in requests_store if item["status"] == "accepted" and item.get("driverPhone")]
            accepted.sort(key=lambda r: r.get("acceptedAt") or "", reverse=True)
            seen = set()
            drivers = []
            for ride in accepted:
                phone = ride.get("driverPhone")
                if phone in seen:
                    continue
                seen.add(phone)
                drivers.append({
                    "driverName": ride.get("driverName"),
                    "driverPhone": phone,
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
                    "lastSeenAt": ride.get("acceptedAt"),
                })
            self._send_json(200, drivers)
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
        self._send_json(404, {"message": "Маршрут табылган жок"})

    def do_POST(self):
        parts = self._path_parts()
        try:
            data = self._read_json()
        except json.JSONDecodeError:
            self._send_json(400, {"message": "JSON туура эмес"})
            return
        if parts == ["requests"]:
            origin = str(data.get("origin", "")).strip()
            destination = str(data.get("destination", "")).strip()
            pickup_address = str(data.get("pickupAddress", "")).strip()
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
            if seats_number < 1 or seats_number > 7:
                self._send_json(400, {"message": "Орундардын саны 1ден 7ге чейин болушу керек"})
                return
            ride = {
                "id": uuid.uuid4().hex,
                "origin": origin,
                "destination": destination,
                "pickupAddress": pickup_address,
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
            }
            requests_store.insert(0, ride)
            self._send_json(201, ride)
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
            if driver_age is None or driver_age < 18 or driver_age > 80:
                self._send_json(400, {"message": "Жашыңызды туура жазыңыз"})
                return
            if driver_exp is None or driver_exp < 0 or driver_exp > 60:
                self._send_json(400, {"message": "Стажыңызды туура жазыңыз"})
                return
            if len(car_make) < 2:
                self._send_json(400, {"message": "Унаанын маркасын жазыңыз"})
                return
            if car_year is None or car_year < 1980 or car_year > 2030:
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
            self._send_json(200, ride)
            return
        self._send_json(404, {"message": "Маршрут табылган жок"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "24615"))
    server = ThreadingHTTPServer(("0.0.0.0", port), RideHandler)
    server.serve_forever()
