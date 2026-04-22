import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useCreateRideRequest,
  useGetRideRequest,
  useCancelRideRequest,
  useReleaseRideRequest,
  useListRideRequests,
  getGetRideRequestQueryKey,
  getGetRideStatsQueryKey,
  getListActiveDriversQueryKey,
  getListRideRequestsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MapPin,
  Users,
  CheckCircle2,
  Phone,
  Car,
  ArrowRight,
  ArrowDownUp,
  Loader2,
  ListChecks,
  Star,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_DESTINATION, DEFAULT_ORIGIN } from "@/lib/settlements";
import { useAllSettlements } from "@/lib/all-settlements";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { SettlementCombobox } from "@/components/settlement-combobox";
import { ActiveDriversList } from "@/components/active-drivers-list";
import { useTranslation } from "@/lib/i18n";
import { readProfile, updateProfile } from "@/lib/profile";
import { prefetchCityPlaces } from "@/lib/nominatim";
import { alertSuccess, alertWarning, ensureNotificationPermission, primeAudio } from "@/lib/alerts";
import { clearAuthSession, readAuthToken, readAuthUser, requestAuthLogin } from "@/lib/auth";
import {
  clearActiveRideRequestId,
  readActiveRideRequestId,
  writeActiveRideRequestId,
} from "@/lib/active-ride-request";
import { KG_MOBILE_PREFIX, isValidKg996Phone, kg996Suffix } from "@/lib/phone-kg";
import { apiUrl } from "@/lib/api-url";

const pad = (n: number) => String(n).padStart(2, "0");
const PASSENGER_DRAFT_KEY = "mak.passenger.draft.v1";

function toTimeInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function combineDateTime(day: "today" | "tomorrow", time: string): Date {
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));
  const d = new Date();
  if (day === "tomorrow") d.setDate(d.getDate() + 1);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getApiErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const e = err as {
    body?: unknown;
    response?: { data?: unknown };
    data?: unknown;
    message?: string;
  };
  const candidates = [e.body, e.response?.data, e.data];
  for (const c of candidates) {
    if (c && typeof c === "object" && "message" in c) {
      const m = (c as { message?: unknown }).message;
      if (typeof m === "string" && m.trim()) return m.trim();
    }
  }
  if (typeof e.message === "string" && e.message.trim()) return e.message.trim();
  return null;
}

function isAuthError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; body?: unknown; message?: unknown };
  if (e.status === 401) return true;
  const bodyMsg =
    e.body && typeof e.body === "object" && "message" in e.body
      ? (e.body as { message?: unknown }).message
      : undefined;
  const text = String(bodyMsg ?? e.message ?? "").toLowerCase();
  return text.includes("авторизация") || text.includes("session") || text.includes("сессия");
}

function isPassengerPhoneSkipped(value: string, telegramUserId: string | undefined) {
  if (!telegramUserId) return false;
  const digits = kg996Suffix(value).replace(/\D/g, "");
  return digits.length === 0;
}

export function PassengerMode() {
  const { t, lang } = useTranslation();
  const sessionTelegramId = readAuthUser()?.telegramUserId;
  const [activeRequestId, setActiveRequestId] = useState<string | null>(() =>
    typeof window !== "undefined" ? readActiveRideRequestId() : null,
  );
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState<number>(5);
  const [isRatingSubmitting, setIsRatingSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const settlements = useAllSettlements();

  const createRideSchema = useMemo(
    () =>
      z
        .object({
          origin: z.string().min(2, t("passenger.error.origin")),
          destination: z.string().min(2, t("passenger.error.destination")),
          pickupAddress: z.string().min(3, t("passenger.error.address")),
          passengerPhone: z.string().refine(
            (v) => isValidKg996Phone(v) || isPassengerPhoneSkipped(v, sessionTelegramId),
            { message: t("passenger.error.phone-kg") },
          ),
          notes: z.string().min(1, t("passenger.error.notes-required")).max(500, t("passenger.error.notes")),
          seats: z.coerce.number().min(1).max(7),
          departDay: z.enum(["today", "tomorrow"]),
          departAfter: z.string().min(1, t("passenger.error.depart-required")),
          departBefore: z.string().min(1, t("passenger.error.depart-required")),
        })
        .refine((value) => value.origin !== value.destination, {
          message: t("passenger.error.same"),
          path: ["destination"],
        })
        .refine(
          (value) => {
            const a = combineDateTime(value.departDay, value.departAfter).getTime();
            const b = combineDateTime(value.departDay, value.departBefore).getTime();
            return b > a;
          },
          {
            message: t("passenger.error.depart-order"),
            path: ["departBefore"],
          },
        )
        .refine(
          (value) => {
            const a = combineDateTime(value.departDay, value.departAfter).getTime();
            return a >= Date.now() - 60 * 1000;
          },
          {
            message: t("passenger.error.depart-past"),
            path: ["departAfter"],
          },
        )
        .refine(
          (value) => {
            const b = combineDateTime(value.departDay, value.departBefore).getTime();
            return b > Date.now();
          },
          {
            message: t("passenger.error.depart-past"),
            path: ["departBefore"],
          },
        ),
    [t, sessionTelegramId],
  );

  type CreateRideValues = z.infer<typeof createRideSchema>;

  const readPassengerDraft = useCallback((): Partial<CreateRideValues> | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(PASSENGER_DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<CreateRideValues>;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }, []);

  const savePassengerDraft = useCallback((data: Partial<CreateRideValues>) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(PASSENGER_DRAFT_KEY, JSON.stringify(data));
    } catch {
      // ignore quota/privacy errors
    }
  }, []);

  const clearPassengerDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(PASSENGER_DRAFT_KEY);
    } catch {
      // ignore quota/privacy errors
    }
  }, []);

  const defaultDepartAfter = useMemo(
    () => toTimeInput(new Date(Date.now() + 30 * 60 * 1000)),
    [],
  );
  const defaultDepartBefore = useMemo(
    () => toTimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)),
    [],
  );

  const initialProfile = useMemo(() => readProfile(), []);
  const initialDraft = useMemo(() => readPassengerDraft(), [readPassengerDraft]);
  const authPhonePrefill = useMemo(() => {
    const phone = readAuthUser()?.phone?.trim() ?? "";
    if (/^\+996\d{9}$/.test(phone)) return phone;
    return null;
  }, []);
  const form = useForm<CreateRideValues>({
    resolver: zodResolver(createRideSchema),
    defaultValues: {
      origin: initialDraft?.origin ?? (initialProfile.lastOrigin || DEFAULT_ORIGIN),
      destination: initialDraft?.destination ?? (initialProfile.lastDestination || DEFAULT_DESTINATION),
      pickupAddress: initialDraft?.pickupAddress ?? "",
      passengerPhone: initialDraft?.passengerPhone ?? authPhonePrefill ?? KG_MOBILE_PREFIX,
      notes: initialDraft?.notes ?? "",
      seats: initialDraft?.seats ?? 1,
      departDay: initialDraft?.departDay ?? "today",
      departAfter: initialDraft?.departAfter ?? defaultDepartAfter,
      departBefore: initialDraft?.departBefore ?? defaultDepartBefore,
    },
  });

  const resetPassengerForm = useCallback(
    (preferredPhone?: string | null) => {
      const fromArg = (preferredPhone ?? "").trim();
      const fromForm = form.getValues("passengerPhone")?.trim() ?? "";
      const phone = isValidKg996Phone(fromArg)
        ? fromArg
        : isValidKg996Phone(fromForm)
          ? fromForm
          : authPhonePrefill ?? KG_MOBILE_PREFIX;
      form.reset({
        origin: initialProfile.lastOrigin || DEFAULT_ORIGIN,
        destination: initialProfile.lastDestination || DEFAULT_DESTINATION,
        pickupAddress: "",
        passengerPhone: phone,
        notes: "",
        seats: 1,
        departDay: "today",
        departAfter: defaultDepartAfter,
        departBefore: defaultDepartBefore,
      });
    },
    [
      authPhonePrefill,
      defaultDepartAfter,
      defaultDepartBefore,
      form,
      initialProfile.lastDestination,
      initialProfile.lastOrigin,
    ],
  );

  useEffect(() => {
    if (Object.keys(form.formState.errors).length > 0) {
      void form.trigger();
    }
  }, [lang, form]);

  useEffect(() => {
    prefetchCityPlaces(form.getValues("origin"));
    const sub = form.watch((value, info) => {
      if (info.name === "origin" && value.origin) {
        prefetchCityPlaces(value.origin);
      }
    });
    return () => sub.unsubscribe();
  }, [form]);

  const createMutation = useCreateRideRequest({
    mutation: {
      onSuccess: (data) => {
        clearPassengerDraft();
        writeActiveRideRequestId(data.id);
        setActiveRequestId(data.id);
        primeAudio();
        void ensureNotificationPermission();
        toast({
          title: t("passenger.toast.created.title"),
          description: t("passenger.toast.created.desc"),
        });
      },
      onError: (error) => {
        if (isAuthError(error)) {
          savePassengerDraft(form.getValues());
          clearAuthSession();
          requestAuthLogin();
          toast({
            title: t("auth.required"),
            variant: "destructive",
          });
          return;
        }
        toast({
          title: getApiErrorMessage(error) ?? t("passenger.toast.error.title"),
          description: getApiErrorMessage(error) ? undefined : t("passenger.toast.error.desc"),
          variant: "destructive",
        });
      },
    },
  });

  const {
    data: activeRequest,
    isPending: isRequestLoading,
    isError: isRideRequestError,
    error: rideRequestError,
  } = useGetRideRequest(activeRequestId || "", {
    query: {
      enabled: !!activeRequestId,
      refetchInterval: (data) => {
        const s = data?.state?.data?.status;
        if (s === "active" || s === "accepted") return 3000;
        return false;
      },
      queryKey: getGetRideRequestQueryKey(activeRequestId || ""),
    },
  });

  useEffect(() => {
    if (!activeRequestId || !isRideRequestError) return;
    const status =
      typeof rideRequestError === "object" &&
      rideRequestError !== null &&
      "status" in rideRequestError &&
      typeof (rideRequestError as { status?: unknown }).status === "number"
        ? (rideRequestError as { status: number }).status
        : null;

    // Only clear the locally stored request id when backend confirms it does not exist.
    // For transient network/server errors we keep the id and let polling retry.
    if (status !== 404) return;
    clearActiveRideRequestId();
    setActiveRequestId(null);
    setPreviousStatus(null);
    toast({
      title: t("passenger.my-request.error.title"),
      description: t("passenger.my-request.error.desc"),
      variant: "destructive",
    });
  }, [activeRequestId, isRideRequestError, rideRequestError, toast, t]);

  const bumpRideListsAfterRequestRemoved = useCallback(
    (requestId: string) => {
      queryClient.setQueryData(getListRideRequestsQueryKey(), (prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.filter((r) => r.id !== requestId);
      });
      void queryClient.invalidateQueries({ queryKey: getListRideRequestsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetRideStatsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListActiveDriversQueryKey() });
    },
    [queryClient],
  );

  const cancelMutation = useCancelRideRequest({
    mutation: {
      onSuccess: (data) => {
        bumpRideListsAfterRequestRemoved(data.id);
        toast({
          title: t("passenger.cancel.toast.title"),
          description: t("passenger.cancel.toast.desc"),
        });
        clearActiveRideRequestId();
        setActiveRequestId(null);
        setPreviousStatus(null);
        resetPassengerForm(data.passengerPhone);
      },
      onError: () => {
        toast({
          title: t("passenger.cancel.error"),
          variant: "destructive",
        });
      },
    },
  });

  const releaseMutation = useReleaseRideRequest({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetRideRequestQueryKey(activeRequestId || "") });
        queryClient.invalidateQueries({ queryKey: getListActiveDriversQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListRideRequestsQueryKey() });
      },
      onError: () => {
        toast({
          title: t("passenger.decline-driver.error"),
          variant: "destructive",
        });
      },
    },
  });

  useEffect(() => {
    if (!activeRequest) return;
    if (previousStatus === "active" && activeRequest.status === "accepted") {
      const driverInfo = activeRequest.driverName
        ? `${activeRequest.driverName}${activeRequest.carMake ? " · " + activeRequest.carMake : ""}${activeRequest.carPlate ? " · " + activeRequest.carPlate : ""}`
        : t("passenger.found.subtitle", { route: activeRequest.route });
      alertSuccess(t("passenger.found.title"), driverInfo);
      toast({
        title: t("passenger.found.title"),
        description: driverInfo,
      });
    }
    if (previousStatus === "accepted" && activeRequest.status === "active") {
      alertWarning(t("passenger.back-to-list.title"), t("passenger.back-to-list.desc"));
      toast({
        title: t("passenger.back-to-list.title"),
        description: t("passenger.back-to-list.desc"),
      });
      queryClient.invalidateQueries({ queryKey: getListActiveDriversQueryKey() });
    }
    if (activeRequest.status === "cancelled") {
      bumpRideListsAfterRequestRemoved(activeRequest.id);
      clearActiveRideRequestId();
      setActiveRequestId(null);
      setPreviousStatus(null);
      return;
    }
    setPreviousStatus(activeRequest.status);
  }, [activeRequest, previousStatus, toast, t, queryClient, bumpRideListsAfterRequestRemoved]);

  const handleCancel = () => {
    if (!activeRequestId) return;
    if (!window.confirm(t("passenger.cancel.confirm"))) return;
    cancelMutation.mutate({ id: activeRequestId });
  };

  const handleDeclineDriver = () => {
    if (!activeRequestId || !activeRequest || activeRequest.status !== "accepted") return;
    if (
      activeRequest.rideProgress === "en_route" ||
      activeRequest.rideProgress === "arrived" ||
      activeRequest.rideProgress === "in_trip"
    ) {
      toast({
        title: t("passenger.actions.locked-enroute"),
        variant: "destructive",
      });
      return;
    }
    if (!window.confirm(t("passenger.decline-driver.confirm"))) return;
    releaseMutation.mutate({
      id: activeRequestId,
      data: { passengerPhone: activeRequest.passengerPhone },
    });
  };

  const handleCancelAcceptedFully = () => {
    if (!activeRequestId || !activeRequest) return;
    if (
      activeRequest.status === "accepted" &&
      (activeRequest.rideProgress === "en_route" ||
        activeRequest.rideProgress === "arrived" ||
        activeRequest.rideProgress === "in_trip")
    ) {
      toast({
        title: t("passenger.actions.locked-enroute"),
        variant: "destructive",
      });
      return;
    }
    if (!window.confirm(t("passenger.cancel-accepted.confirm"))) return;
    cancelMutation.mutate({ id: activeRequestId });
  };

  const handleSubmitRating = async () => {
    if (!activeRequestId || !activeRequest) return;
    setIsRatingSubmitting(true);
    try {
      const token = readAuthToken();
      const resp = await fetch(apiUrl(`/rides-api/requests/${activeRequestId}/rate`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          passengerPhone: activeRequest.passengerPhone,
          rating: ratingValue,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.message || t("passenger.rating.error"));
      }
      toast({
        title: t("passenger.rating.thanks"),
      });
      clearActiveRideRequestId();
      setActiveRequestId(null);
      setPreviousStatus(null);
      resetPassengerForm(activeRequest.passengerPhone);
      queryClient.invalidateQueries({ queryKey: getListActiveDriversQueryKey() });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : t("passenger.rating.error"),
        variant: "destructive",
      });
    } finally {
      setIsRatingSubmitting(false);
    }
  };

  const onSubmit = (data: CreateRideValues) => {
    if (!readAuthToken()) {
      requestAuthLogin();
      savePassengerDraft(data);
      toast({
        title: t("auth.required"),
        variant: "destructive",
      });
      return;
    }
    const { departDay, departAfter, departBefore, ...rest } = data;
    const trimmedPhone = rest.passengerPhone.trim();
    const phoneForApi = isValidKg996Phone(trimmedPhone) ? trimmedPhone : "";
    const payload = {
      ...rest,
      passengerPhone: phoneForApi,
      notes: rest.notes.trim(),
      departAfter: combineDateTime(departDay, departAfter).toISOString(),
      departBefore: combineDateTime(departDay, departBefore).toISOString(),
    };
    updateProfile({
      lastOrigin: data.origin,
      lastDestination: data.destination,
    });
    createMutation.mutate({ data: payload });
  };

  const watchOrigin = form.watch("origin");
  const watchDestination = form.watch("destination");
  const watchPassengerPhone = form.watch("passengerPhone");

  const listOrigin = activeRequest?.origin ?? watchOrigin;
  const listDestination = activeRequest?.destination ?? watchDestination;
  const historyPhone = activeRequest?.passengerPhone ?? watchPassengerPhone;
  const canLoadHistory =
    isValidKg996Phone(historyPhone ?? "") || Boolean(sessionTelegramId);
  const { data: allRequests = [] } = useListRideRequests({
    query: {
      enabled: canLoadHistory,
      refetchInterval: 10000,
      queryKey: getListRideRequestsQueryKey(),
    },
  });
  const passengerHistory = allRequests
    .filter((r) => {
      if (r.status !== "completed") return false;
      if (isValidKg996Phone(historyPhone ?? "") && r.passengerPhone === historyPhone) return true;
      if (sessionTelegramId && r.passengerTelegramUserId === sessionTelegramId) return true;
      return false;
    })
    .slice(0, 20);

  const repeatFromHistory = (ride: (typeof passengerHistory)[number]) => {
    form.setValue("origin", ride.origin, { shouldValidate: true, shouldDirty: true });
    form.setValue("destination", ride.destination, { shouldValidate: true, shouldDirty: true });
    form.setValue("seats", ride.seats, { shouldValidate: true, shouldDirty: true });
    form.setValue("pickupAddress", "", { shouldValidate: true, shouldDirty: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-4">
    {activeRequestId && (
      <Card className="w-full shadow-md border-primary/25 bg-primary/5 overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="font-display text-lg font-bold text-primary">
                {t("passenger.my-request.title")}
              </CardTitle>
              <CardDescription className="mt-1">{t("passenger.my-request.subtitle")}</CardDescription>
            </div>
            {activeRequest && (
              <span
                className={`shrink-0 text-xs font-semibold uppercase tracking-wide rounded-full px-2.5 py-1 ${
                  activeRequest.status === "accepted"
                    ? "bg-green-600/15 text-green-700 dark:text-green-400"
                    : "bg-primary/15 text-primary"
                }`}
              >
                {activeRequest.status === "accepted"
                  ? t("passenger.status.accepted")
                  : t("passenger.status.listed")}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {isRequestLoading && !activeRequest && (
            <div className="flex items-center gap-3 py-6 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin shrink-0" />
              <p className="text-sm">{t("passenger.my-request.loading")}</p>
            </div>
          )}

          {activeRequest?.status === "active" && (
            <>
              <div className="flex items-center gap-2 text-primary font-semibold text-base">
                <span>{activeRequest.origin}</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
                <span>{activeRequest.destination}</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="font-medium leading-snug">{activeRequest.pickupAddress}</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {t("passenger.seats.value", { n: activeRequest.seats })}
                </span>
                <span>
                  {formatTimeShort(activeRequest.departAfter)} – {formatTimeShort(activeRequest.departBefore)}
                </span>
              </div>
              {activeRequest.notes && (
                <p className="text-xs text-foreground/85 bg-muted/60 rounded-md px-2.5 py-2 leading-snug">
                  {activeRequest.notes}
                </p>
              )}
              <div className="flex gap-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                <ListChecks className="w-5 h-5 shrink-0 text-primary mt-0.5" aria-hidden />
                <p className="leading-snug">{t("passenger.my-request.list-hint")}</p>
              </div>
              <Button
                variant="ghost"
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
              >
                {t("passenger.cancel")}
              </Button>
            </>
          )}

          {activeRequest?.status === "accepted" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>{t("passenger.found.title")}</span>
              </div>
              <p className="text-sm text-muted-foreground">{t("passenger.found.subtitle", { route: activeRequest.route })}</p>
              {activeRequest.rideProgress && (
                <p className="text-lg font-extrabold text-destructive bg-destructive/10 border border-destructive/25 rounded-md px-3 py-2.5">
                  {activeRequest.rideProgress === "arrived"
                    ? t("passenger.ride-progress.arrived")
                    : activeRequest.rideProgress === "in_trip"
                      ? t("passenger.ride-progress.intrip")
                    : activeRequest.rideProgress === "en_route"
                      ? t("passenger.ride-progress.enroute")
                      : t("passenger.ride-progress.assigned")}
                </p>
              )}
              {(
                activeRequest.rideProgress === "en_route" ||
                activeRequest.rideProgress === "arrived" ||
                activeRequest.rideProgress === "in_trip"
              ) && (
                <p className="text-xs text-muted-foreground">{t("passenger.actions.locked-enroute.hint")}</p>
              )}

              <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Car className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      {t("passenger.found.driver")}
                    </p>
                    <p className="font-semibold text-foreground text-lg truncate">
                      {activeRequest.driverName}
                      {activeRequest.driverAge != null && (
                        <span className="text-sm text-muted-foreground font-normal">
                          {" "}
                          · {activeRequest.driverAge} {t("passenger.found.age-short")}
                        </span>
                      )}
                    </p>
                    {activeRequest.driverExperience != null && (
                      <p className="text-xs text-muted-foreground">
                        {t("passenger.found.experience", { n: activeRequest.driverExperience })}
                      </p>
                    )}
                  </div>
                </div>

                {(activeRequest.carMake || activeRequest.carPlate) && (
                  <div className="border-t border-border/60 pt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    {activeRequest.carMake && (
                      <div className="col-span-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          {t("passenger.found.car")}
                        </p>
                        <p className="font-semibold text-foreground">
                          {activeRequest.carColor && `${activeRequest.carColor} `}
                          {activeRequest.carMake}
                          {activeRequest.carYear != null && ` · ${activeRequest.carYear}`}
                        </p>
                      </div>
                    )}
                    {activeRequest.carPlate && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          {t("passenger.found.plate")}
                        </p>
                        <p className="font-mono font-bold tracking-wider uppercase text-foreground">
                          {activeRequest.carPlate}
                        </p>
                      </div>
                    )}
                    {activeRequest.carSeats != null && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          {t("passenger.found.seats")}
                        </p>
                        <p className="font-semibold text-foreground">
                          {t("passenger.found.seats-value", { n: activeRequest.carSeats })}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Button
                  className="w-full h-12 text-base font-semibold gap-2"
                  size="lg"
                  onClick={() => window.open(`tel:${activeRequest.driverPhone}`, "_blank")}
                >
                  <Phone className="w-5 h-5" />
                  {t("passenger.found.call", { phone: activeRequest.driverPhone ?? "" })}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleDeclineDriver}
                  disabled={
                    releaseMutation.isPending ||
                    cancelMutation.isPending ||
                    activeRequest.rideProgress === "en_route" ||
                    activeRequest.rideProgress === "arrived" ||
                    activeRequest.rideProgress === "in_trip"
                  }
                >
                  {t("passenger.decline-driver.action")}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleCancelAcceptedFully}
                  disabled={
                    cancelMutation.isPending ||
                    releaseMutation.isPending ||
                    activeRequest.rideProgress === "en_route" ||
                    activeRequest.rideProgress === "arrived" ||
                    activeRequest.rideProgress === "in_trip"
                  }
                >
                  {t("passenger.cancel-accepted.action")}
                </Button>
              </div>
            </div>
          )}
          {activeRequest && activeRequest.status === "completed" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>{t("passenger.completed.title")}</span>
              </div>
              <p className="text-sm text-muted-foreground">{t("passenger.completed.desc")}</p>
              {activeRequest.passengerRating != null ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t("passenger.rating.saved", { n: activeRequest.passengerRating })}
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      clearActiveRideRequestId();
                      setActiveRequestId(null);
                      setPreviousStatus(null);
                      resetPassengerForm(activeRequest.passengerPhone);
                    }}
                  >
                    {t("passenger.rating.close")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t("passenger.rating.prompt")}</p>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Button
                        key={n}
                        type="button"
                        variant={ratingValue === n ? "default" : "outline"}
                        className="h-11"
                        onClick={() => setRatingValue(n)}
                        disabled={isRatingSubmitting}
                      >
                        <Star className="w-4 h-4 mr-1.5" />
                        {n}
                      </Button>
                    ))}
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleSubmitRating}
                    disabled={isRatingSubmitting}
                  >
                    {isRatingSubmitting ? t("passenger.rating.sending") : t("passenger.rating.submit")}
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    )}

    {!activeRequestId && (
    <Card className="w-full shadow-sm border-border">
      <CardHeader className="pb-4">
        <CardTitle className="font-display text-2xl font-bold">{t("passenger.title")}</CardTitle>
        <CardDescription>{t("passenger.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-1 gap-4">
              <FormField
                control={form.control}
                name="origin"
                render={({ field }) => {
                  const destination = form.watch("destination");
                  return (
                    <FormItem>
                      <FormLabel className="text-foreground">{t("passenger.origin.label")}</FormLabel>
                      <FormControl>
                        <SettlementCombobox
                          value={field.value}
                          onChange={(v) => {
                            field.onChange(v);
                            if (v === form.getValues("destination")) {
                              form.setValue("destination", "", { shouldValidate: true });
                            }
                          }}
                          options={settlements
                            .filter((s) => s !== destination)
                            .map((s) => ({ value: s, label: s }))}
                          placeholder={t("passenger.origin.placeholder")}
                          allowCustom
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-full border-primary/35 bg-background shadow-sm hover:bg-muted/70"
                  aria-label={t("passenger.swap-cities.aria")}
                  onClick={() => {
                    const origin = form.getValues("origin");
                    const destination = form.getValues("destination");
                    form.setValue("origin", destination, { shouldValidate: true, shouldDirty: true });
                    form.setValue("destination", origin, { shouldValidate: true, shouldDirty: true });
                    form.setValue("pickupAddress", "", { shouldValidate: true });
                  }}
                >
                  <ArrowDownUp className="h-4 w-4 shrink-0" aria-hidden />
                  {t("passenger.swap-cities")}
                </Button>
              </div>

              <FormField
                control={form.control}
                name="destination"
                render={({ field }) => {
                  const origin = form.watch("origin");
                  return (
                    <FormItem>
                      <FormLabel className="text-foreground">{t("passenger.destination.label")}</FormLabel>
                      <FormControl>
                        <SettlementCombobox
                          value={field.value}
                          onChange={(v) => {
                            field.onChange(v);
                            if (v === form.getValues("origin")) {
                              form.setValue("origin", "", { shouldValidate: true });
                            }
                          }}
                          options={settlements
                            .filter((s) => s !== origin)
                            .map((s) => ({ value: s, label: s }))}
                          placeholder={t("passenger.destination.placeholder")}
                          allowCustom
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>

            <FormField
              control={form.control}
              name="pickupAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">{t("passenger.address.label")}</FormLabel>
                  <FormControl>
                    <AddressAutocomplete
                      value={field.value}
                      onChange={field.onChange}
                      city={form.watch("origin")}
                      placeholder={t("passenger.address.placeholder")}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">{t("passenger.address.hint")}</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">{t("passenger.notes.label")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("passenger.notes.placeholder")}
                      className="min-h-[80px] text-base resize-none"
                      maxLength={500}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="passengerPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">{t("passenger.phone.label")}</FormLabel>
                  <FormControl>
                    <div className="flex rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background">
                      <span className="flex items-center px-3 text-sm font-semibold text-muted-foreground border-r border-input bg-muted/40 shrink-0 select-none">
                        {KG_MOBILE_PREFIX}
                      </span>
                      <Input
                        className="h-12 text-base border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder={t("passenger.phone.placeholder-digits")}
                        maxLength={9}
                        title={t("passenger.phone.hint-kg")}
                        value={kg996Suffix(field.value)}
                        onChange={(e) => {
                          const d = e.target.value.replace(/\D/g, "").slice(0, 9);
                          field.onChange(`${KG_MOBILE_PREFIX}${d}`);
                        }}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {sessionTelegramId
                      ? t("passenger.phone.hint-optional")
                      : t("passenger.phone.hint-kg")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">{t("passenger.depart.label")}</p>
              <FormField
                control={form.control}
                name="departDay"
                render={({ field }) => (
                  <div className="grid grid-cols-2 gap-2 p-1 bg-muted/50 rounded-lg">
                    {(["today", "tomorrow"] as const).map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => field.onChange(day)}
                        className={`h-10 rounded-md text-sm font-medium transition-colors ${
                          field.value === day
                            ? "bg-background shadow-sm text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t(day === "today" ? "passenger.depart.today" : "passenger.depart.tomorrow")}
                      </button>
                    ))}
                  </div>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="departAfter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground font-normal">
                        {t("passenger.depart.from")}
                      </FormLabel>
                      <FormControl>
                        <Input type="time" className="h-12 text-base" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="departBefore"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground font-normal">
                        {t("passenger.depart.to")}
                      </FormLabel>
                      <FormControl>
                        <Input type="time" className="h-12 text-base" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("passenger.depart.hint")}</p>
            </div>

            <FormField
              control={form.control}
              name="seats"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">{t("passenger.seats.label")}</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(Number(val))}
                    value={field.value.toString()}
                  >
                    <FormControl>
                      <SelectTrigger className="h-12 text-base">
                        <div className="flex items-center gap-2">
                          <Users className="w-5 h-5 text-muted-foreground" />
                          <SelectValue placeholder={t("passenger.seats.placeholder")} />
                        </div>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          {t("passenger.seats.value", { n: num })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full h-14 text-lg font-semibold mt-4 shadow-sm hover-elevate-2 group"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? t("passenger.submit.loading") : t("passenger.submit")}
              {!createMutation.isPending && (
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
    )}

    <ActiveDriversList origin={listOrigin} destination={listDestination} />

    <Card className="w-full shadow-sm border-border">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-xl font-bold">{t("passenger.history.title")}</CardTitle>
        <CardDescription>{t("passenger.history.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {!canLoadHistory ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t("passenger.history.need-phone")}</p>
        ) : passengerHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t("passenger.history.empty")}</p>
        ) : (
          <div className="space-y-2">
            {passengerHistory.map((ride) => (
              <div key={ride.id} className="border border-border rounded-xl p-3 bg-card">
                <p className="font-semibold text-sm flex items-center gap-2">
                  <span>{ride.origin}</span>
                  <ArrowRight className="w-3 h-3" />
                  <span>{ride.destination}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDateTimeShort((ride as unknown as { completedAt?: string | null }).completedAt ?? ride.createdAt)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatTimeShort(ride.departAfter)} - {formatTimeShort(ride.departBefore)} · {t("passenger.seats.value", { n: ride.seats })}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-8"
                  onClick={() => repeatFromHistory(ride)}
                >
                  {t("passenger.history.repeat")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
