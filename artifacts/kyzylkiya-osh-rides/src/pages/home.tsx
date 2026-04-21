import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRideStats,
  getGetRideStatsQueryKey,
  getListActiveDriversQueryKey,
} from "@workspace/api-client-react";
import { PassengerMode } from "@/components/passenger-mode";
import { DriverMode } from "@/components/driver-mode";
import { TelegramAuthGate } from "@/components/telegram-auth-gate";
import { UserRound, CarFront, Languages, Loader2 } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n";
import { readAuthUser, type AuthUser } from "@/lib/auth";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-url";

export function Home() {
  const { t, lang, toggle } = useTranslation();
  const queryClient = useQueryClient();
  const viteAuthGate = import.meta.env.VITE_AUTH_ENABLED === "true";
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => readAuthUser());
  /** null = ещё грузим с сервера; false/true — ответ /rides-api/auth/settings */
  const [serverAuthRequired, setServerAuthRequired] = useState<boolean | null>(() =>
    viteAuthGate ? false : null,
  );

  useEffect(() => {
    if (viteAuthGate) return;
    let cancelled = false;
    void fetch(apiUrl("/rides-api/auth/settings"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("settings"))))
      .then((data: { authRequired?: unknown }) => {
        if (cancelled) return;
        setServerAuthRequired(Boolean(data?.authRequired));
      })
      .catch(() => {
        if (!cancelled) setServerAuthRequired(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viteAuthGate]);

  const { data: stats } = useGetRideStats({
    query: {
      refetchInterval: 10000,
      queryKey: getGetRideStatsQueryKey(),
    },
  });

  const showAuthGate = !authUser && (viteAuthGate || serverAuthRequired === true);
  const waitingAuthSettings = !viteAuthGate && serverAuthRequired === null;

  if (waitingAuthSettings) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
        <p className="text-sm">{t("auth.settings.loading")}</p>
      </div>
    );
  }

  if (showAuthGate) {
    return <TelegramAuthGate onSuccess={setAuthUser} />;
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col">
      <header className="bg-primary text-primary-foreground pt-12 pb-6 px-4 shrink-0 rounded-b-[2rem] shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-10 pointer-events-none">
          <div className="absolute -top-[50%] -right-[20%] w-[150%] h-[150%] rounded-full border-[40px] border-white" />
        </div>

        <div className="max-w-md mx-auto relative z-10">
          <div className="flex items-center justify-between mb-6 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="bg-white p-2 rounded-xl shadow-sm shrink-0">
                <BrandMark />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                  {t("header.brand")}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {stats && (
                <div className="text-right text-sm hidden xs:block">
                  <p className="font-medium text-white/90">{t("header.today")}</p>
                  <p className="opacity-80">
                    {t("header.stats", {
                      trips: stats.acceptedRequests,
                      seats: stats.totalSeats,
                    })}
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={toggle}
                aria-label={t("lang.toggle.aria")}
                className="flex items-center gap-2 bg-white/15 hover:bg-white/25 active:bg-white/30 transition-colors backdrop-blur-sm rounded-full px-4 py-2.5 text-sm font-bold tracking-wider"
                data-testid="language-toggle"
              >
                <Languages className="w-5 h-5 shrink-0" />
                <span>{lang === "kg" ? t("lang.kg") : t("lang.ru")}</span>
              </button>
            </div>
          </div>

          {stats && (
            <div className="text-sm text-white/90 mb-3 xs:hidden">
              <span className="font-medium">{t("header.today")}: </span>
              <span className="opacity-90">
                {t("header.stats", {
                  trips: stats.acceptedRequests,
                  seats: stats.totalSeats,
                })}
              </span>
            </div>
          )}

          <div className="space-y-1 text-white/90">
            <p className="font-medium text-lg">{t("header.title")}</p>
            <p className="text-sm opacity-85">{t("header.subtitle")}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 -mt-4 relative z-20 pb-12">
        <Tabs
          defaultValue="passenger"
          className="w-full"
          onValueChange={(value) => {
            if (value === "passenger") {
              void queryClient.invalidateQueries({
                queryKey: getListActiveDriversQueryKey(),
                refetchType: "all",
              });
            }
          }}
        >
          <TabsList className="grid w-full grid-cols-2 p-1 bg-card border shadow-sm rounded-xl h-14 mb-6">
            <TabsTrigger
              value="passenger"
              className="rounded-lg h-full font-semibold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
            >
              <UserRound className="w-4 h-4 mr-2" />
              {t("tabs.passenger")}
            </TabsTrigger>
            <TabsTrigger
              value="driver"
              className="rounded-lg h-full font-semibold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
            >
              <CarFront className="w-4 h-4 mr-2" />
              {t("tabs.driver")}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="passenger"
            forceMount
            className="mt-0 focus-visible:outline-none focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            <PassengerMode />
          </TabsContent>

          <TabsContent
            value="driver"
            forceMount
            className="mt-0 focus-visible:outline-none focus-visible:ring-0 data-[state=inactive]:hidden"
          >
            <DriverMode />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
