import { useGetRideStats, getGetRideStatsQueryKey } from "@workspace/api-client-react";
import { PassengerMode } from "@/components/passenger-mode";
import { DriverMode } from "@/components/driver-mode";
import { Map, ArrowRight, UserRound, CarFront } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function Home() {
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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                <Map className="w-6 h-6 text-white" />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight">Жол<span className="opacity-80">Тап</span></h1>
            </div>

            {stats && (
              <div className="text-right text-sm">
                <p className="font-medium text-white/90">Бүгүн</p>
                <p className="opacity-80">{stats.acceptedRequests} сапар • {stats.totalSeats} орун</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 text-white/90 font-medium text-lg">
            <span>Кызыл-Кыя</span>
            <ArrowRight className="w-5 h-5 opacity-70" />
            <span>Ош</span>
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
              Мен жүргүнчүмүн
            </TabsTrigger>
            <TabsTrigger
              value="driver"
              className="rounded-lg h-full font-semibold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
            >
              <CarFront className="w-4 h-4 mr-2" />
              Мен айдоочумун
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
