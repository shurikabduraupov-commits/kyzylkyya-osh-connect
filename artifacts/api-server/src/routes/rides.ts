import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";

type RideRequest = {
  id: string;
  origin: string;
  destination: string;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLon: number | null;
  passengerPhone: string;
  notes: string | null;
  seats: number;
  route: string;
  status: "active" | "accepted";
  driverName: string | null;
  driverPhone: string | null;
  departAfter: string;
  departBefore: string;
  createdAt: string;
  acceptedAt: string | null;
};

const router: IRouter = Router();
const requests: RideRequest[] = [];

const makeRoute = (origin: string, destination: string) => `${origin} → ${destination}`;

router.get("/requests", (_req, res) => {
  res.json(requests.filter((request) => request.status === "active"));
});

router.post("/requests", (req, res) => {
  const origin = String(req.body?.origin ?? "").trim();
  const destination = String(req.body?.destination ?? "").trim();
  const pickupAddress = String(req.body?.pickupAddress ?? "").trim();
  const rawLat = req.body?.pickupLat;
  const rawLon = req.body?.pickupLon;
  let pickupLat: number | null = null;
  let pickupLon: number | null = null;
  if (rawLat != null && rawLon != null) {
    const lat = Number(rawLat);
    const lon = Number(rawLon);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180 &&
      lat >= 37 &&
      lat <= 46 &&
      lon >= 68 &&
      lon <= 82
    ) {
      pickupLat = lat;
      pickupLon = lon;
    }
  }
  const passengerPhone = String(req.body?.passengerPhone ?? "").trim();
  const notesRaw = String(req.body?.notes ?? "").trim();
  const notes = notesRaw.length === 0 ? null : notesRaw.slice(0, 500);
  const seats = Number(req.body?.seats);

  if (origin.length < 2) {
    res.status(400).json({ message: "Кайсы жерден чыгарыңызды тандаңыз" });
    return;
  }

  if (destination.length < 2) {
    res.status(400).json({ message: "Каякка барарыңызды тандаңыз" });
    return;
  }

  if (origin === destination) {
    res.status(400).json({ message: "Чыгуу жана баруу пункттары башка болушу керек" });
    return;
  }

  if (pickupAddress.length < 3) {
    res.status(400).json({ message: "Так даректи жазыңыз" });
    return;
  }
  if (!/^\+996\d{9}$/.test(passengerPhone)) {
    res.status(400).json({ message: "Телефон +996 жана андан кийин 9 сан болушу керек" });
    return;
  }

  if (!Number.isInteger(seats) || seats < 1 || seats > 7) {
    res.status(400).json({ message: "Орундардын саны 1ден 7ге чейин болушу керек" });
    return;
  }

  const departAfterRaw = String(req.body?.departAfter ?? "").trim();
  const departBeforeRaw = String(req.body?.departBefore ?? "").trim();
  const departAfterTs = Date.parse(departAfterRaw);
  const departBeforeTs = Date.parse(departBeforeRaw);
  if (Number.isNaN(departAfterTs) || Number.isNaN(departBeforeTs)) {
    res.status(400).json({ message: "Чыгуу убактысын тандаңыз" });
    return;
  }
  if (departBeforeTs <= departAfterTs) {
    res.status(400).json({ message: "«Чейин» убактысы «дан»дан кеч болушу керек" });
    return;
  }

  const ride: RideRequest = {
    id: randomUUID().replaceAll("-", ""),
    origin,
    destination,
    pickupAddress,
    pickupLat,
    pickupLon,
    passengerPhone,
    notes,
    seats,
    route: makeRoute(origin, destination),
    status: "active",
    driverName: null,
    driverPhone: null,
    departAfter: new Date(departAfterTs).toISOString(),
    departBefore: new Date(departBeforeTs).toISOString(),
    createdAt: new Date().toISOString(),
    acceptedAt: null,
  };

  requests.unshift(ride);
  res.status(201).json(ride);
});

router.get("/requests/:id", (req, res) => {
  const ride = requests.find((request) => request.id === req.params.id);

  if (!ride) {
    res.status(404).json({ message: "Заявка табылган жок" });
    return;
  }

  res.json(ride);
});

router.post("/requests/:id/accept", (req, res) => {
  const ride = requests.find((request) => request.id === req.params.id);

  if (!ride) {
    res.status(404).json({ message: "Заявка табылган жок" });
    return;
  }

  if (ride.status !== "active") {
    res.status(409).json({ message: "Заказ буга чейин кабыл алынган" });
    return;
  }

  const driverName = String(req.body?.driverName ?? "").trim();
  const driverPhone = String(req.body?.driverPhone ?? "").trim();

  if (driverName.length < 2) {
    res.status(400).json({ message: "Айдоочунун атын жазыңыз" });
    return;
  }

  if (driverPhone.length < 5) {
    res.status(400).json({ message: "Айдоочунун телефонун жазыңыз" });
    return;
  }

  ride.status = "accepted";
  ride.driverName = driverName;
  ride.driverPhone = driverPhone;
  ride.acceptedAt = new Date().toISOString();

  res.json(ride);
});

router.get("/stats", (_req, res) => {
  const active = requests.filter((request) => request.status === "active");
  const accepted = requests.filter((request) => request.status === "accepted");

  res.json({
    activeRequests: active.length,
    acceptedRequests: accepted.length,
    totalSeats: active.reduce((total, request) => total + request.seats, 0),
  });
});

export default router;
