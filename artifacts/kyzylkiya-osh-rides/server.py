from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone
from urllib.parse import urlparse
import json
import os
import uuid

requests_store = []


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


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
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
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
                self._send_json(404, {"message": "Заявка не найдена"})
                return
            self._send_json(200, ride)
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
        self._send_json(404, {"message": "Маршрут не найден"})

    def do_POST(self):
        parts = self._path_parts()
        try:
            data = self._read_json()
        except json.JSONDecodeError:
            self._send_json(400, {"message": "Некорректный JSON"})
            return
        if parts == ["requests"]:
            pickup_address = str(data.get("pickupAddress", "")).strip()
            seats = data.get("seats")
            try:
                seats_number = int(seats)
            except (TypeError, ValueError):
                self._send_json(400, {"message": "Укажите количество мест"})
                return
            if len(pickup_address) < 3:
                self._send_json(400, {"message": "Укажите адрес в Кызыл-Кие"})
                return
            if seats_number < 1 or seats_number > 7:
                self._send_json(400, {"message": "Количество мест должно быть от 1 до 7"})
                return
            ride = {
                "id": uuid.uuid4().hex,
                "pickupAddress": pickup_address,
                "seats": seats_number,
                "route": "Кызыл-Кия → Ош",
                "status": "active",
                "driverName": None,
                "driverPhone": None,
                "createdAt": now_iso(),
                "acceptedAt": None,
            }
            requests_store.insert(0, ride)
            self._send_json(201, ride)
            return
        if len(parts) == 3 and parts[0] == "requests" and parts[2] == "accept":
            ride = next((item for item in requests_store if item["id"] == parts[1]), None)
            if ride is None:
                self._send_json(404, {"message": "Заявка не найдена"})
                return
            if ride["status"] != "active":
                self._send_json(409, {"message": "Заказ уже принят"})
                return
            driver_name = str(data.get("driverName", "")).strip()
            driver_phone = str(data.get("driverPhone", "")).strip()
            if len(driver_name) < 2:
                self._send_json(400, {"message": "Укажите имя водителя"})
                return
            if len(driver_phone) < 5:
                self._send_json(400, {"message": "Укажите телефон водителя"})
                return
            ride["status"] = "accepted"
            ride["driverName"] = driver_name
            ride["driverPhone"] = driver_phone
            ride["acceptedAt"] = now_iso()
            self._send_json(200, ride)
            return
        self._send_json(404, {"message": "Маршрут не найден"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "24615"))
    server = ThreadingHTTPServer(("0.0.0.0", port), RideHandler)
    server.serve_forever()
