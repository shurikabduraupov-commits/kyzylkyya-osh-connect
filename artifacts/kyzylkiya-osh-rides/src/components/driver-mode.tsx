import { useEffect, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Users, Clock, Phone, Navigation, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ALL_ROUTES_VALUE } from "@/lib/settlements";
import { useAllSettlements } from "@/lib/all-settlements";
import { SettlementCombobox } from "@/components/settlement-combobox";
import { useTranslation } from "@/lib/i18n";
import { readProfile, updateProfile, isProfileComplete } from "@/lib/profile";
import { Car } from "lucide-react";

const pad2 = (n: number) => String(n).padStart(2, "0");
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

export function DriverMode() {
  const { t, lang } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState(ALL_ROUTES_VALUE);
  const [destinationFilter, setDestinationFilter] = useState(ALL_ROUTES_VALUE);
  const [savedProfile, setSavedProfile] = useState(() => readProfile());
  const hasSavedProfile = isProfileComplete(savedProfile);
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
        driverPhone: z.string().min(5, t("driver.error.phone")),
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

  const { data: requests = [], isPending } = useListRideRequests({
    query: {
      refetchInterval: 5000,
      queryKey: getListRideRequestsQueryKey(),
    },
  });

  const releaseMutation = useReleaseRideRequest({
    mutation: {
      onSuccess: () => {
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
        ),
    [t],
  );
  type PublishValues = z.infer<typeof publishSchema>;

  const defaultPubAfter = useMemo(() => toTimeInput(new Date(Date.now() + 30 * 60 * 1000)), []);
  const defaultPubBefore = useMemo(() => toTimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)), []);

  const publishForm = useForm<PublishValues>({
    resolver: zodResolver(publishSchema),
    defaultValues: {
      origin: savedProfile.lastOrigin || "",
      destination: savedProfile.lastDestination || "",
      seats: savedProfile.carSeats || 4,
      notes: "",
      departDay: "today",
      departAfter: defaultPubAfter,
      departBefore: defaultPubBefore,
    },
  });

  useEffect(() => {
    if (Object.keys(publishForm.formState.errors).length > 0) {
      void publishForm.trigger();
    }
  }, [lang, publishForm]);

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

  const createOfferMutation = useCreateDriverOffer({
    mutation: {
      onSuccess: () => {
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
      onError: () => {
        toast({
          title: t("driver.publish.error"),
          variant: "destructive",
        });
      },
    },
  });

  const cancelOfferMutation = useCancelDriverOffer({
    mutation: {
      onSuccess: () => {
        toast({
          title: t("driver.offers.cancelled.title"),
          description: t("driver.offers.cancelled.desc"),
        });
        queryClient.invalidateQueries({ queryKey: getListDriverOffersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListActiveDriversQueryKey() });
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

  const handleReleaseClick = (rideId: string) => {
    if (!window.confirm(t("driver.mine.release.confirm"))) return;
    releaseMutation.mutate({
      id: rideId,
      data: { driverPhone: savedProfile.driverPhone },
    });
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
      onError: () => {
        toast({
          title: t("driver.toast.error.title"),
          description: t("driver.toast.error.desc"),
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
    acceptMutation.mutate({
      id: selectedRequestId,
      data,
    });
  };

  const activeRequests = requests.filter((request) => {
    if (request.status !== "active") return false;
    if (originFilter !== ALL_ROUTES_VALUE && request.origin !== originFilter) return false;
    if (destinationFilter !== ALL_ROUTES_VALUE && request.destination !== destinationFilter) return false;
    return true;
  });

  const myAcceptedRides = requests.filter(
    (request) =>
      request.status === "accepted" &&
      request.driverPhone === savedProfile.driverPhone &&
      !!savedProfile.driverPhone,
  );

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
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t("driver.dialog.phone.placeholder")}
                  className="h-12 pl-10"
                  inputMode="tel"
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
            <FormControl>
              <Input
                type="number"
                inputMode="numeric"
                placeholder={t("driver.dialog.car-seats.placeholder")}
                className="h-12"
                {...field}
                value={field.value as unknown as string ?? ""}
              />
            </FormControl>
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
    <div className="space-y-4">
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

      <Card className="shadow-sm border-primary/30 bg-primary/5">
        <CardContent className="p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-primary">{t("driver.publish.title")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("driver.publish.subtitle")}</p>
          </div>
          <Form {...publishForm}>
            <form onSubmit={publishForm.handleSubmit(onPublishSubmit)} className="space-y-3">
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
        </CardContent>
      </Card>

      {myOffers.length > 0 && (
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
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm border-border">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">{t("driver.filter.title")}</p>
          <div className="grid grid-cols-1 gap-3">
            <SettlementCombobox
              value={originFilter}
              onChange={setOriginFilter}
              options={[
                { value: ALL_ROUTES_VALUE, label: t("driver.filter.all-from") },
                ...settlements.map((s) => ({ value: s, label: s })),
              ]}
              placeholder={t("driver.filter.from")}
              className="h-11"
            />

            <SettlementCombobox
              value={destinationFilter}
              onChange={setDestinationFilter}
              options={[
                { value: ALL_ROUTES_VALUE, label: t("driver.filter.all-to") },
                ...settlements.map((s) => ({ value: s, label: s })),
              ]}
              placeholder={t("driver.filter.to")}
              className="h-11"
            />
          </div>
        </CardContent>
      </Card>

      {isPending ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <Card key={item} className="animate-pulse border-border/50 shadow-none">
              <CardContent className="p-5 h-[120px] bg-muted/20" />
            </Card>
          ))}
        </div>
      ) : activeRequests.length === 0 ? (
        <Card className="border-dashed border-2 border-border/60 bg-transparent">
          <CardContent className="p-10 flex flex-col items-center justify-center text-center text-muted-foreground">
            <Navigation className="w-10 h-10 mb-3 opacity-20" />
            <p className="font-medium text-foreground">{t("driver.empty.title")}</p>
            <p className="text-sm">{t("driver.empty.desc")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
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
                  <Button
                    className="w-full font-semibold shadow-none"
                    variant="default"
                    onClick={() => handleAcceptClick(request.id)}
                    disabled={acceptMutation.isPending}
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
