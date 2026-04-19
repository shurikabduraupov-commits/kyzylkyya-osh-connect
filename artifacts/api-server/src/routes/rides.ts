import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";

type RideRequest = {
  id: string;
  pickupAddress: string;
  seats: number;
  route: string;
  status: "active" | "accepted";
  driverName: string | null;
  driverPhone: string | null;
  createdAt: string;
  acceptedAt: string | null;
};

const router: IRouter = Router();
const requests: RideRequest[] = [];

router.get("/requests", (_req, res) => {
  res.json(requests.filter((request) => request.status === "active"));
});

router.post("/requests", (req, res) => {
  const pickupAddress = String(req.body?.pickupAddress ?? "").trim();
  const seats = Number(req.body?.seats);

  if (pickupAddress.length < 3) {
    res.status(400).json({ message: "Кызыл-Кыядагы даректи жазыңыз" });
    return;
  }

  if (!Number.isInteger(seats) || seats < 1 || seats > 7) {
    res.status(400).json({ message: "Орундардын саны 1ден 7ге чейин болушу керек" });
    return;
  }

  const ride: RideRequest = {
    id: randomUUID().replaceAll("-", ""),
    pickupAddress,
    seats,
    route: "Кызыл-Кыя → Ош",
    status: "active",
    driverName: null,
    driverPhone: null,
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
