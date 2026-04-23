import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { searchNominatim } from "@/lib/nominatim";
import "leaflet/dist/leaflet.css";

export type PickupMapRide = {
  id: string;
  origin: string;
  pickupAddress: string;
};

type LatLng = { lat: number; lng: number };

function parseCoord(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function fetchOsrmRoute(a: LatLng, b: LatLng, signal: AbortSignal): Promise<[number, number][]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("osrm");
  const data = (await res.json()) as {
    routes?: Array<{ geometry?: { type?: string; coordinates?: [number, number][] } }>;
  };
  const coords = data.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) throw new Error("osrm-empty");
  return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
}

type Props = {
  ride: PickupMapRide | null;
};

export function DriverPickupRouteMap({ ride }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const [mapEpoch, setMapEpoch] = useState(0);

  const [driverPos, setDriverPos] = useState<LatLng | null>(null);
  const [passengerPos, setPassengerPos] = useState<LatLng | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [geoHint, setGeoHint] = useState(false);
  const [passengerError, setPassengerError] = useState(false);
  const [routeError, setRouteError] = useState(false);
  const [loadingPassenger, setLoadingPassenger] = useState(false);

  useEffect(() => {
    if (!ride) {
      setPassengerPos(null);
      setPassengerError(false);
      setRouteError(false);
      setLoadingPassenger(false);
      return;
    }
    const ac = new AbortController();
    let cancelled = false;
    setLoadingPassenger(true);
    setPassengerError(false);
    void (async () => {
      try {
        const list = await searchNominatim({
          query: ride.pickupAddress,
          city: ride.origin,
          signal: ac.signal,
        });
        if (cancelled || ac.signal.aborted) return;
        const top = list[0];
        if (!top) {
          setPassengerPos(null);
          setPassengerError(true);
          return;
        }
        const lat = parseCoord(top.lat);
        const lng = parseCoord(top.lon);
        if (lat == null || lng == null) {
          setPassengerPos(null);
          setPassengerError(true);
          return;
        }
        setPassengerPos({ lat, lng });
      } catch {
        if (!ac.signal.aborted && !cancelled) {
          setPassengerPos(null);
          setPassengerError(true);
        }
      } finally {
        if (!cancelled && !ac.signal.aborted) setLoadingPassenger(false);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [ride?.id, ride?.origin, ride?.pickupAddress]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoDenied(true);
      return;
    }
    if (!ride) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setDriverPos(null);
      setGeoDenied(false);
      setGeoHint(false);
      return;
    }
    setGeoDenied(false);
    setGeoHint(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoHint(false);
        setDriverPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setGeoHint(false);
        setGeoDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [ride?.id]);

  const requestLocationClick = () => {
    if (!navigator.geolocation) return;
    setGeoDenied(false);
    setGeoHint(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoHint(false);
        setDriverPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setGeoHint(false);
        setGeoDenied(true);
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  useEffect(() => {
    if (!ride) {
      const existing = mapRef.current;
      mapRef.current = null;
      layerRef.current = null;
      existing?.remove();
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    let layerGroup: import("leaflet").LayerGroup | null = null;
    let resizeObserver: ResizeObserver | null = null;

    void import("leaflet").then((Leaflet) => {
      if (disposed || !containerRef.current) return;
      const L = Leaflet.default;

      const mapInstance = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([42.8746, 74.5698], 6);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapInstance);

      layerGroup = L.layerGroup().addTo(mapInstance);
      layerRef.current = layerGroup;
      mapRef.current = mapInstance;
      setMapEpoch((n) => n + 1);

      const invalidate = () => {
        mapInstance?.invalidateSize({ animate: false });
      };
      requestAnimationFrame(() => {
        invalidate();
        requestAnimationFrame(invalidate);
      });
      resizeObserver = new ResizeObserver(() => invalidate());
      resizeObserver.observe(el);
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      const m = mapRef.current;
      layerRef.current = null;
      mapRef.current = null;
      m?.remove();
    };
  }, [ride?.id]);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerRef.current;
    if (!map || !layerGroup || !ride) return;

    let cancelled = false;
    const ac = new AbortController();

    void import("leaflet").then(async (Leaflet) => {
      const L = Leaflet.default;
      layerGroup.clearLayers();
      setRouteError(false);

      if (!passengerPos) {
        if (passengerError) return;
        return;
      }

      const passLatLng: [number, number] = [passengerPos.lat, passengerPos.lng];
      L.circleMarker(passLatLng, {
        radius: 9,
        color: "#15803d",
        weight: 2,
        fillColor: "#22c55e",
        fillOpacity: 0.95,
      })
        .bindTooltip(t("driver.pickup-map.marker-passenger"), { direction: "top" })
        .addTo(layerGroup);

      if (!driverPos) {
        map.setView(passLatLng, 15);
        return;
      }

      const drvLatLng: [number, number] = [driverPos.lat, driverPos.lng];
      L.circleMarker(drvLatLng, {
        radius: 9,
        color: "#1d4ed8",
        weight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.95,
      })
        .bindTooltip(t("driver.pickup-map.marker-you"), { direction: "top" })
        .addTo(layerGroup);

      try {
        const latLngs = await fetchOsrmRoute(driverPos, passengerPos, ac.signal);
        if (cancelled || ac.signal.aborted) return;
        L.polyline(latLngs, { color: "#0ea5e9", weight: 5, opacity: 0.88 }).addTo(layerGroup);
        const bounds = L.latLngBounds(latLngs);
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
      } catch {
        if (!cancelled && !ac.signal.aborted) {
          setRouteError(true);
          const bounds = L.latLngBounds([drvLatLng, passLatLng]);
          map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
          L.polyline([drvLatLng, passLatLng], { color: "#94a3b8", weight: 3, dashArray: "6 8" }).addTo(layerGroup);
        }
      }
    });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [ride?.id, driverPos, passengerPos, passengerError, mapEpoch, t]);

  if (!ride) return null;

  return (
    <Card className="shadow-sm border-border overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{t("driver.pickup-map.title")}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t("driver.pickup-map.subtitle")}</p>
        </div>

        {loadingPassenger && <p className="text-xs text-muted-foreground">{t("driver.pickup-map.loading-address")}</p>}
        {passengerError && (
          <p className="text-xs text-destructive">{t("driver.pickup-map.geocode-error")}</p>
        )}
        {routeError && (
          <p className="text-xs text-muted-foreground">{t("driver.pickup-map.route-fallback")}</p>
        )}
        {geoHint && !geoDenied && (
          <p className="text-xs text-muted-foreground">{t("driver.pickup-map.waiting-gps")}</p>
        )}
        {geoDenied && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground flex-1">{t("driver.pickup-map.need-location")}</p>
            <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={requestLocationClick}>
              {t("driver.pickup-map.enable-location")}
            </Button>
          </div>
        )}

        <div ref={containerRef} className="h-64 sm:h-72 w-full rounded-lg border border-border bg-muted/30" />

        <p className="text-[10px] leading-snug text-muted-foreground">{t("driver.pickup-map.disclaimer")}</p>
      </CardContent>
    </Card>
  );
}
