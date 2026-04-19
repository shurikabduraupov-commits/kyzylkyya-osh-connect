import { useGetRideStats, getGetRideStatsQueryKey } from "@workspace/api-client-react";
import { PassengerMode } from "@/components/passenger-mode";
import { DriverMode } from "@/components/driver-mode";
import { UserRound, CarFront, Languages } from "lucide-react";
import { PoppyIcon } from "@/components/poppy-icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n";

export function Home() {
  const { t, lang, toggle } = useTranslation();
  const { data: stats } = useGetRideStats({
    query: {
      refetchInterval: 10000,
      queryKey: getGetRideStatsQueryKey(),
    },
  });

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col">
      <header className="bg-primary text-primary-foreground pt-12 pb-6 px-4 shrink-0 rounded-b-[2rem] shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-10 pointer-events-none">
          <div className="absolute -top-[50%] -right-[20%] w-[150%] h-[150%] rounded-full border-[40px] border-white" />
        </div>

        <div className="max-w-md mx-auto relative z-10">
          <div className="flex items-center justify-between mb-6 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="bg-white p-1.5 rounded-xl shadow-sm shrink-0">
                <PoppyIcon className="w-7 h-7 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-bold tracking-tight leading-none">
                  {t("header.brand")}
                </h1>
                <p className="text-xs tracking-wide opacity-90 leading-tight">
                  {t("header.brand.full")
                    .split(" ")
                    .map((word, i, arr) => (
                      <span key={i}>
                        <span className="font-extrabold text-sm">{word.charAt(0)}</span>
                        <span className="font-medium">{word.slice(1)}</span>
                        {i < arr.length - 1 && " "}
                      </span>
                    ))}
                </p>
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
                className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 active:bg-white/30 transition-colors backdrop-blur-sm rounded-full px-3 py-1.5 text-xs font-bold tracking-wider"
                data-testid="language-toggle"
              >
                <Languages className="w-3.5 h-3.5" />
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
        <Tabs defaultValue="passenger" className="w-full">
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

          <TabsContent value="passenger" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            <PassengerMode />
          </TabsContent>

          <TabsContent value="driver" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            <DriverMode />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
