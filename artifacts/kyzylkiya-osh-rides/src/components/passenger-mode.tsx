import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useCreateRideRequest,
  useGetRideRequest,
  getGetRideRequestQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Users, CheckCircle2, Phone, Search, Car, ArrowRight, Navigation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_DESTINATION, DEFAULT_ORIGIN } from "@/lib/settlements";
import { useAllSettlements } from "@/lib/all-settlements";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { SettlementCombobox } from "@/components/settlement-combobox";
import { ActiveDriversList } from "@/components/active-drivers-list";
import { useTranslation } from "@/lib/i18n";
import { readProfile, updateProfile } from "@/lib/profile";
import { prefetchCityPlaces } from "@/lib/nominatim";

const pad = (n: number) => String(n).padStart(2, "0");

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

export function PassengerMode() {
  const { t, lang } = useTranslation();
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const { toast } = useToast();
  const settlements = useAllSettlements();

  const createRideSchema = useMemo(
    () =>
      z
        .object({
          origin: z.string().min(2, t("passenger.error.origin")),
          destination: z.string().min(2, t("passenger.error.destination")),
          pickupAddress: z.string().min(3, t("passenger.error.address")),
          notes: z.string().max(500, t("passenger.error.notes")).optional(),
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
        ),
    [t],
  );

  type CreateRideValues = z.infer<typeof createRideSchema>;

  const defaultDepartAfter = useMemo(
    () => toTimeInput(new Date(Date.now() + 30 * 60 * 1000)),
    [],
  );
  const defaultDepartBefore = useMemo(
    () => toTimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)),
    [],
  );

  const initialProfile = useMemo(() => readProfile(), []);
  const form = useForm<CreateRideValues>({
    resolver: zodResolver(createRideSchema),
    defaultValues: {
      origin: initialProfile.lastOrigin || DEFAULT_ORIGIN,
      destination: initialProfile.lastDestination || DEFAULT_DESTINATION,
      pickupAddress: "",
      notes: "",
      seats: 1,
      departDay: "today",
      departAfter: defaultDepartAfter,
      departBefore: defaultDepartBefore,
    },
  });

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
        setActiveRequestId(data.id);
        toast({
          title: t("passenger.toast.created.title"),
          description: t("passenger.toast.created.desc"),
        });
      },
      onError: () => {
        toast({
          title: t("passenger.toast.error.title"),
          description: t("passenger.toast.error.desc"),
          variant: "destructive",
        });
      },
    },
  });

  const { data: activeRequest, isPending: isRequestLoading } = useGetRideRequest(
    activeRequestId || "",
    {
      query: {
        enabled: !!activeRequestId,
        refetchInterval: (data) => {
          if (data?.state?.data?.status === "active") return 3000;
          return false;
        },
        queryKey: getGetRideRequestQueryKey(activeRequestId || ""),
      },
    },
  );

  const onSubmit = (data: CreateRideValues) => {
    const { departDay, departAfter, departBefore, ...rest } = data;
    const payload = {
      ...rest,
      notes: rest.notes?.trim() ? rest.notes.trim() : undefined,
      departAfter: combineDateTime(departDay, departAfter).toISOString(),
      departBefore: combineDateTime(departDay, departBefore).toISOString(),
    };
    updateProfile({ lastOrigin: data.origin, lastDestination: data.destination });
    createMutation.mutate({ data: payload });
  };

  const resetRequest = () => {
    setActiveRequestId(null);
    form.reset();
  };

  if (activeRequestId) {
    if (isRequestLoading) {
      return <WaitingCard route={form.getValues("origin") + " → " + form.getValues("destination")} />;
    }

    if (activeRequest?.status === "accepted") {
      return (
        <Card className="w-full shadow-lg border-primary/20 bg-card overflow-hidden animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-primary p-6 text-primary-foreground flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h3 className="font-display font-bold text-2xl">{t("passenger.found.title")}</h3>
              <p className="text-primary-foreground/90 text-sm mt-1">
                {t("passenger.found.subtitle", { route: activeRequest.route })}
              </p>
            </div>
          </div>

          <CardContent className="p-6 space-y-6">
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
                        {" "}· {activeRequest.driverAge} {t("passenger.found.age-short")}
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

            <div className="space-y-3">
              <Button
                className="w-full h-14 text-lg font-semibold gap-2 shadow-md hover-elevate-2"
                size="lg"
                onClick={() => window.open(`tel:${activeRequest.driverPhone}`, "_blank")}
              >
                <Phone className="w-5 h-5" />
                {t("passenger.found.call", { phone: activeRequest.driverPhone ?? "" })}
              </Button>

              <Button
                variant="outline"
                className="w-full text-muted-foreground"
                onClick={resetRequest}
              >
                {t("passenger.found.search-other")}
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return <WaitingCard route={activeRequest?.route || form.getValues("origin") + " → " + form.getValues("destination")} />;
  }

  const watchOrigin = form.watch("origin");
  const watchDestination = form.watch("destination");

  return (
    <div className="space-y-4">
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
    <ActiveDriversList origin={watchOrigin} destination={watchDestination} />
    </div>
  );
}

function WaitingCard({ route }: { route: string }) {
  const { t } = useTranslation();
  return (
    <Card className="w-full shadow-md border-border bg-card overflow-hidden">
      <CardContent className="p-8 flex flex-col items-center justify-center min-h-[300px] text-center space-y-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
        <div className="space-y-2">
          <h3 className="font-display font-semibold text-xl">{t("passenger.waiting.title")}</h3>
          <p className="text-foreground font-medium">{route}</p>
          <p className="text-muted-foreground text-sm max-w-[250px]">
            {t("passenger.waiting.desc")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
