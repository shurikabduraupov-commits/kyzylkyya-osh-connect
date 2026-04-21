import { useState } from "react";
import { useListActiveDrivers, getListActiveDriversQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Car, Users, ArrowRight, Clock, Megaphone } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

type Props = {
  origin?: string;
  destination?: string;
};

export function ActiveDriversList({ origin, destination }: Props) {
  const { t } = useTranslation();
  const [filterByRoute, setFilterByRoute] = useState(true);
  const { data: drivers = [] } = useListActiveDrivers({
    query: { refetchInterval: 15000, queryKey: getListActiveDriversQueryKey() },
  });

  const canFilter = !!origin && !!destination;
  const filtered =
    canFilter && filterByRoute
      ? drivers.filter((d) => d.origin === origin && d.destination === destination)
      : drivers;

  const isOnline = (lastSeenAt?: string | null) => {
    if (!lastSeenAt) return false;
    const ts = Date.parse(lastSeenAt);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts <= 15 * 60 * 1000;
  };

  return (
    <Card className="w-full shadow-sm border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="font-display text-xl font-bold flex items-center gap-2">
              <Car className="w-5 h-5 text-primary" />
              {t("passenger.drivers.title")}
            </CardTitle>
            <CardDescription className="mt-1">
              {t("passenger.drivers.subtitle")}
            </CardDescription>
          </div>
          {canFilter && (
            <div className="flex bg-muted rounded-lg p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setFilterByRoute(true)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  filterByRoute
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {t("passenger.drivers.filter")}
              </button>
              <button
                type="button"
                onClick={() => setFilterByRoute(false)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  !filterByRoute
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {t("passenger.drivers.all")}
              </button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t("passenger.drivers.empty")}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.slice(0, 20).map((d) => (
              <div
                key={d.driverPhone}
                className="border border-border rounded-xl p-3 bg-card hover-elevate"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-base leading-tight truncate">
                      {d.driverName}
                      <span className="text-muted-foreground font-normal ml-1.5 text-sm">
                        · {d.driverAge}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <span className="truncate">{d.origin}</span>
                      <ArrowRight className="w-3 h-3 shrink-0" />
                      <span className="truncate">{d.destination}</span>
                    </p>
                    <p className="text-[11px] mt-1">
                      <span
                        className={
                          isOnline(d.lastSeenAt)
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                        }
                      >
                        {isOnline(d.lastSeenAt)
                          ? t("passenger.drivers.online")
                          : t("passenger.drivers.offline")}
                      </span>
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
                      d.kind === "offer"
                        ? "bg-primary/15 text-primary"
                        : "bg-accent text-foreground/80"
                    }`}
                  >
                    <Megaphone className="w-3 h-3" />
                    {d.kind === "offer"
                      ? t("passenger.drivers.kind.offer")
                      : t("passenger.drivers.kind.ride")}
                  </span>
                </div>

                {(d.departAfter || d.seats != null) && (
                  <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-3">
                    {d.departAfter && d.departBefore && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(d.departAfter).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        –
                        {new Date(d.departBefore).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {d.kind === "offer" && d.seats != null && (
                      <span className="flex items-center gap-1 text-primary font-medium">
                        <Users className="w-3 h-3" />
                        {t("passenger.drivers.seats-free", { n: d.seats })}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 items-center">
                  <div className="text-sm min-w-0">
                    <p className="truncate">
                      <span className="text-muted-foreground">{d.carColor}</span>{" "}
                      <span className="font-medium">{d.carMake}</span>{" "}
                      <span className="text-muted-foreground">· {d.carYear}</span>
                    </p>
                    <p className="font-mono font-bold text-xs uppercase tracking-wider mt-0.5">
                      {d.carPlate}
                      <span className="ml-2 text-muted-foreground font-sans font-normal normal-case tracking-normal inline-flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {d.carSeats}
                      </span>
                    </p>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-9 shrink-0"
                  >
                    <a href={`tel:${d.driverPhone}`}>
                      <Phone className="w-4 h-4 mr-1" />
                      {t("passenger.drivers.call")}
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
