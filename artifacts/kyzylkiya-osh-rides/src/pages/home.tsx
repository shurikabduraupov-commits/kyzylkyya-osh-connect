import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRideStats,
  useListDriverOffers,
  useListRideRequests,
  getGetRideStatsQueryKey,
  getListActiveDriversQueryKey,
  getListDriverOffersQueryKey,
  getListRideRequestsQueryKey,
} from "@workspace/api-client-react";
import { PassengerMode } from "@/components/passenger-mode";
import { DriverMode } from "@/components/driver-mode";
import { TelegramAuthGate } from "@/components/telegram-auth-gate";
import { UserRound, CarFront, Languages } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "@/lib/i18n";
import {
  AUTH_LOGIN_REQUIRED_EVENT,
  AUTH_SESSION_CLEARED_EVENT,
  logoutAndClearUserState,
  readAuthToken,
  readAuthUser,
  type AuthUser,
  validateAuth,
  writeAuthSession,
  writeAuthUser,
} from "@/lib/auth";
import { readProfile } from "@/lib/profile";
import { useEffect, useMemo, useState } from "react";

type HomeTab = "passenger" | "driver";
const HOME_TAB_STORAGE_KEY = "mak.home.activeTab";

export function Home() {
  const { t, lang, toggle } = useTranslation();
  const queryClient = useQueryClient();
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => readAuthUser());
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<HomeTab>(() => {
    if (typeof window === "undefined") return "passenger";
    const stored = localStorage.getItem(HOME_TAB_STORAGE_KEY);
    return stored === "driver" ? "driver" : "passenger";
  });

  useEffect(() => {
    const token = readAuthToken();
    if (!token) return;
    let cancelled = false;
    void validateAuth().then((freshUser) => {
      if (cancelled || !freshUser) return;
      setAuthUser(freshUser);
      // keep token untouched, refresh user snapshot from server
      if (token) writeAuthSession(token, freshUser);
      else writeAuthUser(freshUser);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onSessionCleared = () => {
      setAuthUser(null);
    };
    const onLoginRequired = () => {
      setAuthGateOpen(true);
    };
    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, onSessionCleared);
    window.addEventListener(AUTH_LOGIN_REQUIRED_EVENT, onLoginRequired);
    return () => {
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, onSessionCleared);
      window.removeEventListener(AUTH_LOGIN_REQUIRED_EVENT, onLoginRequired);
    };
  }, []);

  const { data: stats } = useGetRideStats({
    query: {
      refetchInterval: 10000,
      queryKey: getGetRideStatsQueryKey(),
    },
  });

  const { data: allRequests = [] } = useListRideRequests({
    query: {
      enabled: !!authUser,
      refetchInterval: 10000,
      queryKey: getListRideRequestsQueryKey(),
    },
  });
  const { data: allOffers = [] } = useListDriverOffers({
    query: {
      enabled: !!authUser,
      refetchInterval: 10000,
      queryKey: getListDriverOffersQueryKey(),
    },
  });

  const roleLock = useMemo(() => {
    if (!authUser) return null as "passenger" | "driver" | null;
    const authPhone = authUser.phone?.trim() ?? "";
    const profilePhone = readProfile().driverPhone.trim();
    const driverPhone = profilePhone || authPhone;
    const telegramId = authUser.telegramUserId?.trim() ?? "";

    const hasActivePassengerRequest = allRequests.some((r) => {
      if (r.status !== "active" && r.status !== "accepted") return false;
      if (authPhone && r.passengerPhone === authPhone) return true;
      if (telegramId && r.passengerTelegramUserId === telegramId) return true;
      return false;
    });

    const hasActiveDriverOffer = !!driverPhone && allOffers.some((o) => o.driverPhone === driverPhone);
    const hasAcceptedDriverRide = !!driverPhone && allRequests.some((r) => r.status === "accepted" && r.driverPhone === driverPhone);
    const hasActiveDriverRole = hasActiveDriverOffer || hasAcceptedDriverRide;

    if (hasActivePassengerRequest && !hasActiveDriverRole) return "passenger";
    if (hasActiveDriverRole && !hasActivePassengerRequest) return "driver";
    return null;
  }, [allOffers, allRequests, authUser]);

  useEffect(() => {
    if (roleLock === "passenger" && activeTab === "driver") {
      setActiveTab("passenger");
      try {
        localStorage.setItem(HOME_TAB_STORAGE_KEY, "passenger");
      } catch {
        // ignore quota / privacy errors
      }
    } else if (roleLock === "driver" && activeTab === "passenger") {
      setActiveTab("driver");
      try {
        localStorage.setItem(HOME_TAB_STORAGE_KEY, "driver");
      } catch {
        // ignore quota / privacy errors
      }
    }
  }, [activeTab, roleLock]);

  if (authGateOpen) {
    return (
      <TelegramAuthGate
        onSuccess={(user) => {
          setAuthUser(user);
          setAuthGateOpen(false);
        }}
      />
    );
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

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {authUser?.name ? (
                <p className="text-xs sm:text-sm font-semibold text-white/90 max-w-[12rem] truncate">
                  {authUser.name}
                </p>
              ) : null}
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
              {authUser ? (
                <button
                  type="button"
                  onClick={() => setLogoutConfirmOpen(true)}
                  className="flex items-center gap-2 bg-white/15 hover:bg-white/25 active:bg-white/30 transition-colors backdrop-blur-sm rounded-full px-3 py-2 text-xs sm:text-sm font-bold tracking-wide"
                >
                  {t("auth.logout")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthGateOpen(true)}
                  className="flex items-center gap-2 bg-white/15 hover:bg-white/25 active:bg-white/30 transition-colors backdrop-blur-sm rounded-full px-3 py-2 text-xs sm:text-sm font-bold tracking-wide"
                >
                  {t("auth.login")}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1 text-white/90">
            <p className="font-medium text-lg">{t("header.title")}</p>
            <p className="text-sm opacity-85">{t("header.subtitle")}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 -mt-4 relative z-20 pb-12">
        <Tabs
          value={activeTab}
          className="w-full"
          onValueChange={(value) => {
            const next = value === "driver" ? "driver" : "passenger";
            setActiveTab(next);
            try {
              localStorage.setItem(HOME_TAB_STORAGE_KEY, next);
            } catch {
              // ignore quota / privacy errors
            }
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
              disabled={roleLock === "driver"}
              className="rounded-lg h-full font-semibold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
            >
              <UserRound className="w-4 h-4 mr-2" />
              {t("tabs.passenger")}
            </TabsTrigger>
            <TabsTrigger
              value="driver"
              disabled={roleLock === "passenger"}
              className="rounded-lg h-full font-semibold text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
            >
              <CarFront className="w-4 h-4 mr-2" />
              {t("tabs.driver")}
            </TabsTrigger>
          </TabsList>
          {roleLock === "passenger" && (
            <p className="text-xs text-muted-foreground -mt-4 mb-4">
              {t("tabs.lock.driver-disabled")}
            </p>
          )}
          {roleLock === "driver" && (
            <p className="text-xs text-muted-foreground -mt-4 mb-4">
              {t("tabs.lock.passenger-disabled")}
            </p>
          )}

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

      <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("auth.logout.confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("auth.logout.confirm.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("auth.logout.confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void logoutAndClearUserState();
                setAuthUser(null);
              }}
            >
              {t("auth.logout.confirm.action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
