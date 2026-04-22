import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useListRideRequests,
  useAcceptRideRequest,
  useReleaseRideRequest,
  useCreateDriverOffer,
  useCancelDriverOffer,
  useListDriverOffers,
  getListRideRequestsQueryKey,
  getGetRideStatsQueryKey,
  getListActiveDriversQueryKey,
  getListDriverOffersQueryKey,
} from "@workspace/api-client-react";
import type { RideRequest } from "@workspace/api-client-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Users, Clock, Phone, Navigation, ArrowRight, ChevronDown, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAllSettlements } from "@/lib/all-settlements";
import { SettlementCombobox } from "@/components/settlement-combobox";
import { useTranslation } from "@/lib/i18n";
import { readProfile, updateProfile, isProfileComplete } from "@/lib/profile";
import { clearAuthSession, readAuthToken, readAuthUser, requestAuthLogin } from "@/lib/auth";
import { alertWarning } from "@/lib/alerts";
import { KG_MOBILE_PREFIX, isValidKg996Phone, kg996Suffix } from "@/lib/phone-kg";
import { apiUrl } from "@/lib/api-url";
import { Car } from "lucide-react";

const pad2 = (n: number) => String(n).padStart(2, "0");
const DRIVER_PUBLISH_DRAFT_KEY = "mak.driver.publish.draft.v1";
function toTimeInput(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
function combineDateTime(day: "today" | "tomorrow", time: string): Date {
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));
  const d = new Date();
  if (day === "tomorrow") d.setDate(d.getDate() + 1);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function formatDepartTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (sameDay) return time;
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${time}`;
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

function getRoleConflictErrorMessage(err: unknown, t: (key: string) => string): string | null {
  const raw = getApiErrorMessage(err);
  if (!raw) return null;
  const text = raw.toLowerCase();
  if (text.includes("активдүү айдоочу")) return t("role-lock.driver-active");
  if (text.includes("активдүү жүргүнчү")) return t("role-lock.passenger-active");
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

export function DriverMode() {
  const { t, lang } = useTranslation();
  const { toast, dismiss } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [progressUpdatingId, setProgressUpdatingId] = useState<string | null>(null);
  const [isPublishCollapsed, setIsPublishCollapsed] = useState(false);
  const [filterByRoute, setFilterByRoute] = useState(true);
  const [ratingRideId, setRatingRideId] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [isRatingSubmitting, setIsRatingSubmitting] = useState(false);
  const [savedProfile, setSavedProfile] = useState(() => {
    const profile = readProfile();
    const authPhone = readAuthUser()?.phone?.trim() ?? "";
    if (!profile.driverPhone && /^\+996\d{9}$/.test(authPhone)) {
      const merged = { ...profile, driverPhone: authPhone };
      updateProfile({ driverPhone: authPhone });
      return merged;
    }
    return profile;
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const prevHasSavedProfileRef = useRef(isProfileComplete(savedProfile));
  const hasSavedProfile = isProfileComplete(savedProfile);
  const scrollDriverSectionToTop = useCallback(() => {
    if (typeof window === "undefined") return;
    const targetTop = rootRef.current
      ? Math.max(0, rootRef.current.getBoundingClientRect().top + window.scrollY - 8)
      : 0;
    // Repeat once more after layout settles to avoid mobile viewport/focus jumps.
    window.scrollTo({ top: targetTop, behavior: "smooth" });
    window.setTimeout(() => {
      window.scrollTo({ top: targetTop, behavior: "smooth" });
    }, 120);
  }, []);
  const settlements = useAllSettlements();

  const intFromString = (min: number, max: number, msg: string) =>
    z
      .union([z.string(), z.number()])
      .transform((v) => (typeof v === "number" ? v : Number(v)))
      .refine((n) => Number.isFinite(n) && Number.isInteger(n) && n >= min && n <= max, {
        message: msg,
      });

  const acceptRideSchema = useMemo(
    () =>
      z.object({
        driverName: z.string().min(2, t("driver.error.name")),
        driverPhone: z.string().refine((v) => isValidKg996Phone(v), { message: t("driver.error.phone") }),
        driverAge: intFromString(18, 80, t("driver.error.age")),
        driverExperience: intFromString(0, 60, t("driver.error.experience")),
        carMake: z.string().min(2, t("driver.error.car-make")),
        carYear: intFromString(1980, 2030, t("driver.error.car-year")),
        carPlate: z.string().min(3, t("driver.error.car-plate")),
        carColor: z.string().min(2, t("driver.error.car-color")),
        carSeats: intFromString(1, 8, t("driver.error.car-seats")),
      }),
    [t],
  );

  type AcceptRideValues = z.infer<typeof acceptRideSchema>;

  const profileToFormDefaults = (p: ReturnType<typeof readProfile>) => ({
    driverName: p.driverName,
    driverPhone: p.driverPhone,
    driverAge: p.driverAge != null ? String(p.driverAge) : "",
    driverExperience: p.driverExperience != null ? String(p.driverExperience) : "",
    carMake: p.carMake,
    carYear: p.carYear != null ? String(p.carYear) : "",
    carPlate: p.carPlate,
    carColor: p.carColor,
    carSeats: p.carSeats != null ? String(p.carSeats) : "",
  }) as unknown as AcceptRideValues;

  const timeAgo = (value: string) => {
    const diffMs = Date.now() - new Date(value).getTime();
    const minutes = Math.max(0, Math.floor(diffMs / 60000));
    if (minutes < 1) return t("time.now");
    if (minutes < 60) return t("time.minutes", { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("time.hours", { n: hours });
    const days = Math.floor(hours / 24);
    return t("time.days", { n: days });
  };

  const driverPhoneForPoll = savedProfile.driverPhone;
  const { data: requests = [], isPending } = useListRideRequests({
    query: {
      refetchInterval: (q) => {
        const list = q.state.data;
        if (!driverPhoneForPoll || !Array.isArray(list)) return 5000;
        const hasMyAccepted = list.some(
          (r) => r.status === "accepted" && r.driverPhone === driverPhoneForPoll,
        );
        return hasMyAccepted ? 2500 : 5000;
      },
      queryKey: getListRideRequestsQueryKey(),
    },
  });

  const acceptedSeatsForPhone = (phone: string) =>
    requests
      .filter((r) => r.status === "accepted" && r.driverPhone === phone)
      .reduce((sum, r) => sum + r.seats, 0);

  const acceptExceedsCarSeats = (request: RideRequest, carCapacity: number, driverPhone: string) =>
    acceptedSeatsForPhone(driverPhone) + request.seats > carCapacity;

  /** When the driver themselves releases a ride, skip the “passenger declined” toast for that id. */
  const skipPassengerDeclinedNotifyIds = useRef(new Set<string>());

  const releaseMutation = useReleaseRideRequest({
    mutation: {
      onSuccess: (_data, variables) => {
        if (variables?.id) skipPassengerDeclinedNotifyIds.current.add(variables.id);
        toast({
          title: t("driver.mine.released.title"),
          description: t("driver.mine.released.desc"),
        });
        queryClient.invalidateQueries({ queryKey: getListRideRequestsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRideStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListActiveDriversQueryKey() });
      },
      onError: () => {
        toast({
          title: t("driver.mine.release.error"),
          variant: "destructive",
        });
      },
    },
  });

  const publishSchema = useMemo(
    () =>
      z
        .object({
          origin: z.string().min(2, t("driver.publish.origin")),
          destination: z.string().min(2, t("driver.publish.destination")),
          seats: z.coerce.number().min(1).max(8),
          notes: z.string().max(500).optional(),
          departDay: z.enum(["today", "tomorrow"]),
          departAfter: z.string().min(1),
          departBefore: z.string().min(1),
        })
        .refine((v) => v.origin !== v.destination, {
          message: t("passenger.error.same"),
          path: ["destination"],
        })
        .refine(
          (v) => combineDateTime(v.departDay, v.departBefore).getTime() > combineDateTime(v.departDay, v.departAfter).getTime(),
          { message: t("passenger.error.depart-order"), path: ["departBefore"] },
        )
        .refine(
          (v) => combineDateTime(v.departDay, v.departAfter).getTime() >= Date.now() - 60 * 1000,
          { message: t("passenger.error.depart-past"), path: ["departAfter"] },
        )
        .refine(
          (v) => combineDateTime(v.departDay, v.departBefore).getTime() > Date.now(),
          { message: t("passenger.error.depart-past"), path: ["departBefore"] },
        )
        .refine(
          (v) => savedProfile.carSeats == null || v.seats <= savedProfile.carSeats,
          { message: t("driver.error.car-seats"), path: ["seats"] },
        ),
    [t, savedProfile.carSeats],
  );
  type PublishValues = z.infer<typeof publishSchema>;

  const defaultPubAfter = useMemo(() => toTimeInput(new Date(Date.now() + 30 * 60 * 1000)), []);
  const defaultPubBefore = useMemo(() => toTimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)), []);
  const readPublishDraft = useCallback((): Partial<PublishValues> | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(DRIVER_PUBLISH_DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PublishValues>;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }, []);
  const savePublishDraft = useCallback((data: Partial<PublishValues>) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(DRIVER_PUBLISH_DRAFT_KEY, JSON.stringify(data));
    } catch {
      // ignore quota/privacy errors
    }
  }, []);
  const clearPublishDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(DRIVER_PUBLISH_DRAFT_KEY);
    } catch {
      // ignore quota/privacy errors
    }
  }, []);
  const initialPublishDraft = useMemo(() => readPublishDraft(), [readPublishDraft]);

  const publishForm = useForm<PublishValues>({
    resolver: zodResolver(publishSchema),
    defaultValues: {
      origin: initialPublishDraft?.origin ?? savedProfile.lastOrigin ?? "",
      destination: initialPublishDraft?.destination ?? savedProfile.lastDestination ?? "",
      seats: initialPublishDraft?.seats ?? savedProfile.carSeats ?? 4,
      notes: initialPublishDraft?.notes ?? "",
      departDay: initialPublishDraft?.departDay ?? "today",
      departAfter: initialPublishDraft?.departAfter ?? defaultPubAfter,
      departBefore: initialPublishDraft?.departBefore ?? defaultPubBefore,
    },
  });

  useEffect(() => {
    if (Object.keys(publishForm.formState.errors).length > 0) {
      void publishForm.trigger();
    }
  }, [lang, publishForm]);

  useEffect(() => {
    if (isPublishCollapsed) return;
    const day = publishForm.getValues("departDay");
    const currentAfter = publishForm.getValues("departAfter");
    const currentBefore = publishForm.getValues("departBefore");
    const now = Date.now();
    const afterDate = combineDateTime(day, currentAfter);
    const beforeDate = combineDateTime(day, currentBefore);

    if (
      Number.isNaN(afterDate.getTime()) ||
      Number.isNaN(beforeDate.getTime()) ||
      afterDate.getTime() < now - 60 * 1000 ||
      beforeDate.getTime() <= now ||
      beforeDate.getTime() <= afterDate.getTime()
    ) {
      publishForm.setValue("departAfter", toTimeInput(new Date(now + 30 * 60 * 1000)), {
        shouldValidate: true,
      });
      publishForm.setValue("departBefore", toTimeInput(new Date(now + 2 * 60 * 60 * 1000)), {
        shouldValidate: true,
      });
    }
  }, [isPublishCollapsed, publishForm]);

  useEffect(() => {
    const carSeats = savedProfile.carSeats;
    if (carSeats == null) return;
    const currentSeats = publishForm.getValues("seats");
    if (currentSeats > carSeats) {
      publishForm.setValue("seats", carSeats, { shouldValidate: true });
    }
  }, [savedProfile.carSeats, publishForm]);

  const { data: allOffers = [] } = useListDriverOffers({
    query: {
      refetchInterval: 10000,
      queryKey: getListDriverOffersQueryKey(),
      enabled: !!savedProfile.driverPhone,
    },
  });
  const myOffers = allOffers.filter(
    (o) => o.driverPhone === savedProfile.driverPhone && !!savedProfile.driverPhone,
  );
  const hasActiveMyOffer = myOffers.length > 0;
  const myOfferRouteKeys = new Set(myOffers.map((o) => `${o.origin}→${o.destination}`));
  const canAcceptByOfferRoute = (origin: string, destination: string) =>
    myOfferRouteKeys.has(`${origin}→${destination}`);
  const offerSeatsForRoute = (origin: string, destination: string) =>
    myOffers.find((o) => o.origin === origin && o.destination === destination)?.seats ?? null;
  const acceptedSeatsForRoute = (driverPhone: string, origin: string, destination: string) =>
    requests
      .filter(
        (r) =>
          r.status === "accepted" &&
          r.driverPhone === driverPhone &&
          r.origin === origin &&
          r.destination === destination,
      )
      .reduce((sum, r) => sum + r.seats, 0);
  const acceptExceedsOfferSeats = (request: RideRequest, driverPhone: string) => {
    const routeSeats = offerSeatsForRoute(request.origin, request.destination);
    if (routeSeats == null) return true;
    return acceptedSeatsForRoute(driverPhone, request.origin, request.destination) + request.seats > routeSeats;
  };

  const createOfferMutation = useCreateDriverOffer({
    mutation: {
      onSuccess: () => {
        clearPublishDraft();
        setIsPublishCollapsed(true);
        toast({
          title: t("driver.publish.toast.title"),
          description: t("driver.publish.toast.desc"),
        });
        publishForm.reset({
          origin: publishForm.getValues("origin"),
          destination: publishForm.getValues("destination"),
          seats: publishForm.getValues("seats"),
          notes: "",
          departDay: "today",
          departAfter: toTimeInput(new Date(Date.now() + 30 * 60 * 1000)),
          departBefore: toTimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)),
        });
        queryClient.invalidateQueries({ queryKey: getListDriverOffersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListActiveDriversQueryKey() });
      },
      onError: (error) => {
        if (isAuthError(error)) {
          savePublishDraft(publishForm.getValues());
          clearAuthSession();
          dismiss();
          requestAuthLogin();
          return;
        }
        const roleConflictMessage = getRoleConflictErrorMessage(error, t);
        if (roleConflictMessage) {
          toast({
            title: roleConflictMessage,
            variant: "destructive",
          });
          return;
        }
        setIsPublishCollapsed(false);
        toast({
          title: getApiErrorMessage(error) ?? t("driver.publish.error"),
          variant: "destructive",
        });
      },
    },
  });

  const cancelOfferMutation = useCancelDriverOffer({
    mutation: {
      onSuccess: () => {
        myAcceptedRides.forEach((r) => skipPassengerDeclinedNotifyIds.current.add(r.id));
        toast({
          title: t("driver.offers.cancelled.title"),
          description: t("driver.offers.cancelled.desc"),
        });
        queryClient.invalidateQueries({ queryKey: getListDriverOffersQueryKey() });
        void queryClient.invalidateQueries({
          queryKey: getListActiveDriversQueryKey(),
          refetchType: "all",
        });
        queryClient.invalidateQueries({ queryKey: getListRideRequestsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRideStatsQueryKey() });
        queryClient.invalidateQueries({
          predicate: (q) => {
            const k = q.queryKey[0];
            return typeof k === "string" && /^\/rides-api\/requests\/[^/]+$/.test(k);
          },
        });
      },
      onError: () => {
        toast({
          title: t("driver.offers.cancel.error"),
          variant: "destructive",
        });
      },
    },
  });

  const handleCancelOffer = (offerId: string) => {
    if (!window.confirm(t("driver.offers.cancel.confirm"))) return;
    cancelOfferMutation.mutate({
      id: offerId,
      data: { driverPhone: savedProfile.driverPhone },
    });
  };

  const onPublishSubmit = (data: PublishValues) => {
    if (!readAuthToken()) {
      savePublishDraft(data);
      dismiss();
      requestAuthLogin();
      return;
    }
    const { departDay, departAfter, departBefore, notes, ...rest } = data;
    updateProfile({ lastOrigin: data.origin, lastDestination: data.destination });
    createOfferMutation.mutate({
      data: {
        ...rest,
        notes: notes?.trim() ? notes.trim() : undefined,
        departAfter: combineDateTime(departDay, departAfter).toISOString(),
        departBefore: combineDateTime(departDay, departBefore).toISOString(),
        driverName: savedProfile.driverName,
        driverPhone: savedProfile.driverPhone,
        driverAge: savedProfile.driverAge!,
        driverExperience: savedProfile.driverExperience!,
        carMake: savedProfile.carMake,
        carYear: savedProfile.carYear!,
        carPlate: savedProfile.carPlate,
        carColor: savedProfile.carColor,
        carSeats: savedProfile.carSeats!,
      },
    });
  };

  const onPublishInvalid = () => {
    const firstError = Object.values(publishForm.formState.errors).find((err) => !!err?.message);
    toast({
      title: typeof firstError?.message === "string" ? firstError.message : t("driver.publish.error"),
      variant: "destructive",
    });
  };

  const handleReleaseClick = (rideId: string) => {
    if (!window.confirm(t("driver.mine.release.confirm"))) return;
    releaseMutation.mutate({
      id: rideId,
      data: { driverPhone: savedProfile.driverPhone },
    });
  };

  const submitPassengerRating = async (rideId: string) => {
    setIsRatingSubmitting(true);
    try {
      const ratingResp = await fetch(apiUrl(`/rides-api/requests/${rideId}/rate-passenger`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverPhone: savedProfile.driverPhone,
          rating: ratingValue,
        }),
      });
      if (!ratingResp.ok) {
        const err = await ratingResp.json().catch(() => ({}));
        throw new Error(err?.message || t("driver.rating-passenger.error"));
      }
      toast({
        title: t("driver.rating-passenger.saved"),
      });
      setRatingRideId(null);
      queryClient.invalidateQueries({ queryKey: getListRideRequestsQueryKey() });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : t("driver.rating-passenger.error"),
        variant: "destructive",
      });
    } finally {
      setIsRatingSubmitting(false);
    }
  };

  const handleProgressUpdate = async (
    rideId: string,
    progress: "assigned" | "en_route" | "arrived" | "in_trip" | "completed",
  ) => {
    if (!savedProfile.driverPhone) return;
    setProgressUpdatingId(rideId);
    try {
      const resp = await fetch(apiUrl(`/rides-api/requests/${rideId}/progress`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverPhone: savedProfile.driverPhone,
          progress,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.message || t("driver.progress.error"));
      }
      toast({
        title:
          progress === "completed"
            ? t("driver.progress.completed.done")
            : progress === "in_trip"
              ? t("driver.progress.intrip.done")
              : progress === "arrived"
            ? t("driver.progress.arrived.done")
            : progress === "en_route"
              ? t("driver.progress.enroute.done")
              : t("driver.progress.assigned.done"),
      });
      queryClient.invalidateQueries({ queryKey: getListRideRequestsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListActiveDriversQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListDriverOffersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRideStatsQueryKey() });
      if (progress === "completed") {
        setRatingRideId(rideId);
        setRatingValue(5);
      }
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : t("driver.progress.error"),
        variant: "destructive",
      });
    } finally {
      setProgressUpdatingId(null);
    }
  };

  const progressLabel = (progress: "assigned" | "en_route" | "arrived" | "in_trip" | "completed") => {
    if (progress === "completed") return t("driver.progress.completed");
    if (progress === "in_trip") return t("driver.progress.intrip");
    if (progress === "arrived") return t("driver.progress.arrived");
    if (progress === "en_route") return t("driver.progress.enroute");
    return t("driver.progress.assigned");
  };

  const renderPassengerContact = (ride: RideRequest, disabled = false) => {
    if (ride.passengerPhone) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-full"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            window.open(`tel:${ride.passengerPhone}`, "_self");
          }}
          title={disabled ? t("driver.error.offer-route-mismatch") : undefined}
        >
            <Phone className="w-4 h-4 mr-1.5" />
            {t("passenger.drivers.call")}
        </Button>
      );
    }
    const un = (ride.passengerTelegramUsername ?? "").replace(/^@/, "").trim();
    if (un) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-full"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            window.open(`https://t.me/${un}`, "_blank", "noopener,noreferrer");
          }}
          title={disabled ? t("driver.error.offer-route-mismatch") : undefined}
        >
          {t("driver.card.write-telegram")} @{un}
        </Button>
      );
    }
    const uid = (ride.passengerTelegramUserId ?? "").trim();
    if (uid) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-full"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            window.open(`tg://user?id=${uid}`, "_self");
          }}
          title={disabled ? t("driver.error.offer-route-mismatch") : undefined}
        >
          {t("driver.card.open-telegram")}
        </Button>
      );
    }
    return null;
  };

  const confirmAndHandleProgressUpdate = (
    rideId: string,
    current: "assigned" | "en_route" | "arrived" | "in_trip" | "completed" | null,
    next: "assigned" | "en_route" | "arrived" | "in_trip" | "completed",
  ) => {
    if (current === next) return;
    if (!window.confirm(t("driver.progress.confirm", { status: progressLabel(next) }))) return;
    void handleProgressUpdate(rideId, next);
  };

  const acceptMutation = useAcceptRideRequest({
    mutation: {
      onSuccess: (_data, variables) => {
        const next = updateProfile({
          driverName: variables.data.driverName,
          driverPhone: variables.data.driverPhone,
          driverAge: variables.data.driverAge,
          driverExperience: variables.data.driverExperience,
          carMake: variables.data.carMake,
          carYear: variables.data.carYear,
          carPlate: variables.data.carPlate,
          carColor: variables.data.carColor,
          carSeats: variables.data.carSeats,
        });
        setSavedProfile(next);
        toast({
          title: t("driver.toast.accepted.title"),
          description: t("driver.toast.accepted.desc"),
        });
        setSelectedRequestId(null);
        queryClient.invalidateQueries({ queryKey: getListRideRequestsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRideStatsQueryKey() });
      },
      onError: (error) => {
        const roleConflictMessage = getRoleConflictErrorMessage(error, t);
        toast({
          title: roleConflictMessage ?? t("driver.toast.error.title"),
          description: roleConflictMessage ? undefined : t("driver.toast.error.desc"),
          variant: "destructive",
        });
      },
    },
  });

  const form = useForm<AcceptRideValues>({
    resolver: zodResolver(acceptRideSchema),
    defaultValues: profileToFormDefaults(savedProfile),
  });

  const handleAcceptClick = (id: string) => {
    const ride = requests.find((r) => r.id === id);
    if (ride && !canAcceptByOfferRoute(ride.origin, ride.destination)) {
      toast({
        title: t("driver.error.offer-route-mismatch"),
        variant: "destructive",
      });
      return;
    }
    if (ride && acceptExceedsOfferSeats(ride, savedProfile.driverPhone)) {
      toast({
        title: t("driver.error.offer-seats-capacity"),
        variant: "destructive",
      });
      return;
    }
    if (
      ride &&
      hasSavedProfile &&
      savedProfile.carSeats != null &&
      acceptExceedsCarSeats(ride, savedProfile.carSeats, savedProfile.driverPhone)
    ) {
      toast({
        title: t("driver.error.seats-capacity"),
        variant: "destructive",
      });
      return;
    }
    if (hasSavedProfile) {
      acceptMutation.mutate({
        id,
        data: {
          driverName: savedProfile.driverName,
          driverPhone: savedProfile.driverPhone,
          driverAge: savedProfile.driverAge!,
          driverExperience: savedProfile.driverExperience!,
          carMake: savedProfile.carMake,
          carYear: savedProfile.carYear!,
          carPlate: savedProfile.carPlate,
          carColor: savedProfile.carColor,
          carSeats: savedProfile.carSeats!,
        },
      });
      return;
    }
    form.reset(profileToFormDefaults(savedProfile));
    setSelectedRequestId(id);
  };

  const handleEditProfile = () => {
    form.reset(profileToFormDefaults(savedProfile));
    setSelectedRequestId("__edit__");
  };

  useEffect(() => {
    const prev = prevHasSavedProfileRef.current;
    if (!prev && hasSavedProfile) {
      requestAnimationFrame(() => scrollDriverSectionToTop());
    }
    prevHasSavedProfileRef.current = hasSavedProfile;
  }, [hasSavedProfile, scrollDriverSectionToTop]);

  useEffect(() => {
    if (Object.keys(form.formState.errors).length > 0) {
      void form.trigger();
    }
  }, [lang, form]);

  const onSubmit = (data: AcceptRideValues) => {
    if (!selectedRequestId) return;
    if (selectedRequestId === "__edit__") {
      const next = updateProfile({
        driverName: data.driverName,
        driverPhone: data.driverPhone,
        driverAge: data.driverAge,
        driverExperience: data.driverExperience,
        carMake: data.carMake,
        carYear: data.carYear,
        carPlate: data.carPlate,
        carColor: data.carColor,
        carSeats: data.carSeats,
      });
      setSavedProfile(next);
      setSelectedRequestId(null);
      return;
    }
    const rideToAccept = requests.find((r) => r.id === selectedRequestId);
    if (!rideToAccept || rideToAccept.status !== "active") {
      toast({
        title: t("driver.toast.error.title"),
        description: t("driver.toast.error.desc"),
        variant: "destructive",
      });
      return;
    }
    if (!canAcceptByOfferRoute(rideToAccept.origin, rideToAccept.destination)) {
      toast({
        title: t("driver.error.offer-route-mismatch"),
        variant: "destructive",
      });
      return;
    }
    const phone = data.driverPhone.trim();
    if (acceptExceedsOfferSeats(rideToAccept, phone)) {
      toast({
        title: t("driver.error.offer-seats-capacity"),
        variant: "destructive",
      });
      return;
    }
    const used = acceptedSeatsForPhone(phone);
    if (used + rideToAccept.seats > data.carSeats) {
      toast({
        title: t("driver.error.seats-capacity"),
        variant: "destructive",
      });
      return;
    }
    acceptMutation.mutate({
      id: selectedRequestId,
      data,
    });
  };

  const activeRequests = requests.filter((request) => {
    if (request.status !== "active") return false;
    if (!filterByRoute) return true;
    return canAcceptByOfferRoute(request.origin, request.destination);
  });

  const myAcceptedRides = requests.filter(
    (request) =>
      (request.status === "accepted" || request.status === "completed") &&
      ((request as unknown as { driverPassengerRating?: number | null }).driverPassengerRating == null ||
        request.status !== "completed") &&
      request.driverPhone === savedProfile.driverPhone &&
      !!savedProfile.driverPhone,
  );
  const myHistoryRides = requests
    .filter(
      (request) =>
        request.status === "completed" &&
        request.driverPhone === savedProfile.driverPhone &&
        !!savedProfile.driverPhone,
    )
    .slice(0, 20);

  const prevAcceptedRideIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const current = new Set(myAcceptedRides.map((r) => r.id));
    const prev = prevAcceptedRideIdsRef.current;
    if (prev.size > 0 && savedProfile.driverPhone) {
      for (const id of prev) {
        if (current.has(id)) continue;
        if (skipPassengerDeclinedNotifyIds.current.has(id)) {
          skipPassengerDeclinedNotifyIds.current.delete(id);
          continue;
        }
        const ride = requests.find((r) => r.id === id);
        if (ride?.status === "active") {
          alertWarning(
            t("driver.passenger-declined.title"),
            t("driver.passenger-declined.desc", { route: ride.route }),
          );
          toast({
            title: t("driver.passenger-declined.title"),
            description: t("driver.passenger-declined.desc", { route: ride.route }),
          });
        } else {
          alertWarning(t("driver.order-ended.title"), t("driver.order-ended.desc"));
          toast({
            title: t("driver.order-ended.title"),
            description: t("driver.order-ended.desc"),
          });
        }
      }
    }
    prevAcceptedRideIdsRef.current = current;
  }, [myAcceptedRides, requests, savedProfile.driverPhone, toast, t]);

  const renderProfileFields = () => (
    <>
      <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold pt-1">
        {t("driver.section.driver")}
      </p>
      <FormField
        control={form.control}
        name="driverName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("driver.dialog.name")}</FormLabel>
            <FormControl>
              <Input placeholder={t("driver.dialog.name.placeholder")} className="h-12" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="driverPhone"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("driver.dialog.phone")}</FormLabel>
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
            <p className="text-xs text-muted-foreground">{t("driver.dialog.phone.hint-kg")}</p>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="driverAge"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("driver.dialog.age")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder={t("driver.dialog.age.placeholder")}
                  className="h-12"
                  {...field}
                  value={field.value as unknown as string ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="driverExperience"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("driver.dialog.experience")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder={t("driver.dialog.experience.placeholder")}
                  className="h-12"
                  {...field}
                  value={field.value as unknown as string ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold pt-2">
        {t("driver.section.car")}
      </p>
      <FormField
        control={form.control}
        name="carMake"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("driver.dialog.car-make")}</FormLabel>
            <FormControl>
              <div className="relative">
                <Car className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t("driver.dialog.car-make.placeholder")}
                  className="h-12 pl-10"
                  {...field}
                />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="carYear"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("driver.dialog.car-year")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder={t("driver.dialog.car-year.placeholder")}
                  className="h-12"
                  {...field}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                    field.onChange(digits);
                  }}
                  value={field.value as unknown as string ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="carColor"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("driver.dialog.car-color")}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t("driver.dialog.car-color.placeholder")}
                  className="h-12"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="carPlate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("driver.dialog.car-plate")}</FormLabel>
            <FormControl>
              <Input
                placeholder={t("driver.dialog.car-plate.placeholder")}
                className="h-12 uppercase tracking-wider font-mono"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="carSeats"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("driver.dialog.car-seats")}</FormLabel>
            <Select
              onValueChange={(val) => field.onChange(val)}
              value={String(field.value ?? "")}
            >
              <FormControl>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder={t("driver.dialog.car-seats.placeholder")} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );

  if (!hasSavedProfile) {
    return (
      <div className="space-y-4">
        <Card className="shadow-sm border-border">
          <CardContent className="p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="font-display font-bold text-xl">{t("driver.onboard.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("driver.onboard.desc")}</p>
            </div>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => {
                  const next = updateProfile({
                    driverName: data.driverName,
                    driverPhone: data.driverPhone,
                    driverAge: data.driverAge,
                    driverExperience: data.driverExperience,
                    carMake: data.carMake,
                    carYear: data.carYear,
                    carPlate: data.carPlate,
                    carColor: data.carColor,
                    carSeats: data.carSeats,
                  });
                  setSavedProfile(next);
                  requestAnimationFrame(() => scrollDriverSectionToTop());
                })}
                className="space-y-4"
              >
                {renderProfileFields()}
                <Button type="submit" className="w-full h-12 font-semibold">
                  {t("driver.onboard.submit")}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-display font-bold text-xl">{t("driver.active.title")}</h2>
        <div className="flex items-center text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse mr-2" />
          {t("driver.live")}
        </div>
      </div>

      {hasSavedProfile && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/60 border border-border/60 text-sm">
          <span className="truncate text-foreground/80">
            {t("driver.profile.as", {
              name: savedProfile.driverName,
              phone: savedProfile.driverPhone,
            })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs font-semibold text-primary hover:text-primary shrink-0"
            onClick={handleEditProfile}
          >
            {t("driver.profile.change")}
          </Button>
        </div>
      )}

      {hasActiveMyOffer && (
        <Card className="shadow-sm border-border">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">{t("driver.offers.title")}</p>
            <div className="space-y-2">
              {myOffers.map((o) => (
                <div key={o.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                    <span>{o.origin}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>{o.destination}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {t("passenger.drivers.seats-free", { n: o.seats })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDepartTime(o.departAfter)}–{formatDepartTime(o.departBefore)}
                    </span>
                  </div>
                  {o.notes && (
                    <p className="text-xs text-foreground/80 bg-muted/50 rounded-md px-2 py-1.5 leading-snug">
                      {o.notes}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleCancelOffer(o.id)}
                    disabled={cancelOfferMutation.isPending}
                  >
                    {t("driver.offers.cancel")}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {hasActiveMyOffer ? (
        <Card className="shadow-sm border-border bg-muted/40">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold text-foreground">{t("driver.publish.title")}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{t("driver.publish.disabled-active-offer")}</p>
          </CardContent>
        </Card>
      ) : (
      <Card className="shadow-sm border-primary/30 bg-primary/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-primary">{t("driver.publish.title")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("driver.publish.subtitle")}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => setIsPublishCollapsed((prev) => !prev)}
              aria-label={t("driver.publish.toggle")}
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${isPublishCollapsed ? "" : "rotate-180"}`}
              />
            </Button>
          </div>
          {isPublishCollapsed ? (
            <p className="text-xs text-muted-foreground">{t("driver.publish.collapsed-hint")}</p>
          ) : (
            <Form {...publishForm}>
              <form onSubmit={publishForm.handleSubmit(onPublishSubmit, onPublishInvalid)} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={publishForm.control}
                    name="origin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{t("driver.publish.origin")}</FormLabel>
                        <SettlementCombobox
                          value={field.value}
                          onChange={field.onChange}
                          options={settlements.map((s) => ({ value: s, label: s }))}
                          placeholder={t("driver.publish.origin")}
                          className="h-11"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={publishForm.control}
                    name="destination"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{t("driver.publish.destination")}</FormLabel>
                        <SettlementCombobox
                          value={field.value}
                          onChange={field.onChange}
                          options={settlements.map((s) => ({ value: s, label: s }))}
                          placeholder={t("driver.publish.destination")}
                          className="h-11"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={publishForm.control}
                  name="departDay"
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-2 p-1 bg-muted/50 rounded-lg">
                      {(["today", "tomorrow"] as const).map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => field.onChange(day)}
                          className={`h-9 rounded-md text-sm font-medium transition-colors ${
                            field.value === day
                              ? "bg-background shadow-sm text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {t(day === "today" ? "passenger.depart.today" : "passenger.depart.tomorrow")}
                        </button>
                      ))}
                    </div>
                  )}
                />
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={publishForm.control}
                    name="departAfter"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{t("driver.publish.depart-after")}</FormLabel>
                        <FormControl>
                          <Input type="time" className="h-11" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={publishForm.control}
                    name="departBefore"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{t("driver.publish.depart-before")}</FormLabel>
                        <FormControl>
                          <Input type="time" className="h-11" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={publishForm.control}
                  name="seats"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{t("driver.publish.seats")}</FormLabel>
                      <Select
                        onValueChange={(val) => field.onChange(Number(val))}
                        value={String(field.value)}
                      >
                        <FormControl>
                          <SelectTrigger className="h-11">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-muted-foreground" />
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={publishForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{t("driver.publish.notes")}</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={2}
                          placeholder={t("driver.publish.notes.placeholder")}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full h-11 font-semibold"
                  disabled={createOfferMutation.isPending}
                >
                  {createOfferMutation.isPending ? t("driver.publish.submitting") : t("driver.publish.submit")}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
      )}

      {myAcceptedRides.length > 0 && (
        <Card className="shadow-sm border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-primary">{t("driver.mine.title")}</p>
            <div className="space-y-3">
              {myAcceptedRides.map((ride) => (
                <div key={ride.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                    <span>{ride.origin}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>{ride.destination}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-sm font-medium leading-tight">{ride.pickupAddress}</p>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {t("driver.card.seats", { n: ride.seats })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDepartTime(ride.departAfter)}–{formatDepartTime(ride.departBefore)}
                    </span>
                  </div>
                  {ride.notes && (
                    <p className="text-xs text-foreground/80 bg-muted/50 rounded-md px-2 py-1.5 leading-snug">
                      {ride.notes}
                    </p>
                  )}
                  {renderPassengerContact(ride)}
                  <Select
                    value={(ride.rideProgress as "assigned" | "en_route" | "arrived" | "in_trip" | "completed" | null) ?? "assigned"}
                    onValueChange={(value) =>
                      confirmAndHandleProgressUpdate(
                        ride.id,
                        (ride.rideProgress as "assigned" | "en_route" | "arrived" | "in_trip" | "completed" | null) ?? "assigned",
                        value as "assigned" | "en_route" | "arrived" | "in_trip" | "completed",
                      )
                    }
                    disabled={progressUpdatingId === ride.id || ride.rideProgress === "completed"}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t("driver.progress.select")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="assigned">{t("driver.progress.assigned")}</SelectItem>
                      <SelectItem value="en_route">{t("driver.progress.enroute")}</SelectItem>
                      <SelectItem value="arrived">{t("driver.progress.arrived")}</SelectItem>
                      <SelectItem value="in_trip">{t("driver.progress.intrip")}</SelectItem>
                      <SelectItem value="completed">{t("driver.progress.completed")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {ride.status !== "completed" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleReleaseClick(ride.id)}
                      disabled={releaseMutation.isPending}
                    >
                      {t("driver.mine.release")}
                    </Button>
                  )}
                  {ride.rideProgress === "completed" && ratingRideId === ride.id && (
                    <div className="rounded-lg border border-border/70 bg-muted/40 p-3 space-y-2">
                      <p className="text-sm font-medium">{t("driver.rating-passenger.prompt")}</p>
                      <div className="grid grid-cols-5 gap-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Button
                            key={n}
                            type="button"
                            variant={ratingValue === n ? "default" : "outline"}
                            className="h-10"
                            onClick={() => setRatingValue(n)}
                            disabled={isRatingSubmitting}
                          >
                            <Star className="w-4 h-4 mr-1.5" />
                            {n}
                          </Button>
                        ))}
                      </div>
                      <div>
                        <Button
                          type="button"
                          className="w-full"
                          onClick={() => void submitPassengerRating(ride.id)}
                          disabled={isRatingSubmitting}
                        >
                          {isRatingSubmitting
                            ? t("driver.rating-passenger.sending")
                            : t("driver.rating-passenger.submit")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm border-border">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">{t("driver.history.title")}</p>
          {myHistoryRides.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("driver.history.empty")}</p>
          ) : (
            <div className="space-y-2">
              {myHistoryRides.map((ride) => (
                <div key={ride.id} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                    <span>{ride.origin}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>{ride.destination}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTimeShort((ride as unknown as { completedAt?: string | null }).completedAt ?? ride.createdAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDepartTime(ride.departAfter)}-{formatDepartTime(ride.departBefore)} · {t("driver.card.seats", { n: ride.seats })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!hasActiveMyOffer ? (
        <Card className="shadow-sm border-border bg-muted/30">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-2">
            <Navigation className="w-10 h-10 text-muted-foreground/40 mb-1" aria-hidden />
            <p className="font-medium text-foreground">{t("driver.requests-gated.title")}</p>
            <p className="text-sm text-muted-foreground max-w-[280px]">{t("driver.requests-gated.desc")}</p>
          </CardContent>
        </Card>
      ) : isPending ? (
        <div className="space-y-3">
          <div className="flex bg-muted rounded-lg p-0.5 w-fit ml-auto">
            <button
              type="button"
              onClick={() => setFilterByRoute(true)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                filterByRoute ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              {t("passenger.drivers.filter")}
            </button>
            <button
              type="button"
              onClick={() => setFilterByRoute(false)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                !filterByRoute ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              {t("passenger.drivers.all")}
            </button>
          </div>
          {[1, 2, 3].map((item) => (
            <Card key={item} className="animate-pulse border-border/50 shadow-none">
              <CardContent className="p-5 h-[120px] bg-muted/20" />
            </Card>
          ))}
        </div>
      ) : activeRequests.length === 0 ? (
        <div className="space-y-3">
          <div className="flex bg-muted rounded-lg p-0.5 w-fit ml-auto">
            <button
              type="button"
              onClick={() => setFilterByRoute(true)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                filterByRoute ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              {t("passenger.drivers.filter")}
            </button>
            <button
              type="button"
              onClick={() => setFilterByRoute(false)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                !filterByRoute ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              {t("passenger.drivers.all")}
            </button>
          </div>
          <Card className="border-dashed border-2 border-border/60 bg-transparent">
            <CardContent className="p-10 flex flex-col items-center justify-center text-center text-muted-foreground">
              <Navigation className="w-10 h-10 mb-3 opacity-20" />
              <p className="font-medium text-foreground">{t("driver.empty.title")}</p>
              <p className="text-sm">{t("driver.empty.desc")}</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex bg-muted rounded-lg p-0.5 w-fit ml-auto">
            <button
              type="button"
              onClick={() => setFilterByRoute(true)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                filterByRoute ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              {t("passenger.drivers.filter")}
            </button>
            <button
              type="button"
              onClick={() => setFilterByRoute(false)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                !filterByRoute ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              {t("passenger.drivers.all")}
            </button>
          </div>
          {activeRequests.map((request) => (
            <Card key={request.id} className="overflow-hidden border-border shadow-sm hover:border-primary/30 transition-colors">
              <CardContent className="p-0">
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2 text-primary font-semibold">
                    <span>{request.origin}</span>
                    <ArrowRight className="w-4 h-4" />
                    <span>{request.destination}</span>
                  </div>
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-foreground/70" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                          {t("driver.card.address")}
                        </p>
                        <p className="font-semibold text-lg leading-tight">{request.pickupAddress}</p>
                        <p className="mt-1.5 text-sm font-medium text-primary">
                          {t("driver.card.depart", {
                            from: formatDepartTime(request.departAfter),
                            to: formatDepartTime(request.departBefore),
                          })}
                        </p>
                        {request.notes && (
                          <p className="mt-1.5 text-sm text-foreground/80 bg-muted/50 rounded-md px-2.5 py-1.5 leading-snug">
                            {request.notes}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1 font-medium text-foreground/80">
                            <Users className="w-3.5 h-3.5" />
                            {t("driver.card.seats", { n: request.seats })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {timeAgo(request.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="px-5 pb-5">
                  <div className="mb-2">
                    {renderPassengerContact(request, !canAcceptByOfferRoute(request.origin, request.destination))}
                  </div>
                  <Button
                    className="w-full font-semibold shadow-none"
                    variant="default"
                    onClick={() => handleAcceptClick(request.id)}
                    disabled={
                      acceptMutation.isPending ||
                      !canAcceptByOfferRoute(request.origin, request.destination) ||
                      acceptExceedsOfferSeats(request, savedProfile.driverPhone) ||
                      (hasSavedProfile &&
                        savedProfile.carSeats != null &&
                        acceptExceedsCarSeats(request, savedProfile.carSeats, savedProfile.driverPhone))
                    }
                    title={
                      !canAcceptByOfferRoute(request.origin, request.destination)
                        ? t("driver.error.offer-route-mismatch")
                        : acceptExceedsOfferSeats(request, savedProfile.driverPhone)
                        ? t("driver.error.offer-seats-capacity")
                        : hasSavedProfile &&
                            savedProfile.carSeats != null &&
                            acceptExceedsCarSeats(request, savedProfile.carSeats, savedProfile.driverPhone)
                          ? t("driver.error.seats-capacity")
                          : undefined
                    }
                  >
                    {t("driver.card.accept")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedRequestId} onOpenChange={(open) => !open && setSelectedRequestId(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{t("driver.dialog.title")}</DialogTitle>
            <DialogDescription>{t("driver.dialog.desc")}</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              {renderProfileFields()}

              <DialogFooter className="pt-2">
                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold"
                  disabled={acceptMutation.isPending}
                >
                  {acceptMutation.isPending ? t("driver.dialog.submit.loading") : t("driver.dialog.submit")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
