import { useState } from "react";
import { useListActiveDrivers, getListActiveDriversQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Car, Users, ArrowRight } from "lucide-react";
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
                  </div>
                </div>

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
