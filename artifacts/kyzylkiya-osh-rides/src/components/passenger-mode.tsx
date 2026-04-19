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
import { DEFAULT_DESTINATION, DEFAULT_ORIGIN, KYRGYZSTAN_SETTLEMENTS } from "@/lib/settlements";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { SettlementCombobox } from "@/components/settlement-combobox";
import { useTranslation } from "@/lib/i18n";
import { readProfile, updateProfile } from "@/lib/profile";

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PassengerMode() {
  const { t, lang } = useTranslation();
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const { toast } = useToast();

  const createRideSchema = useMemo(
    () =>
      z
        .object({
          origin: z.string().min(2, t("passenger.error.origin")),
          destination: z.string().min(2, t("passenger.error.destination")),
          pickupAddress: z.string().min(3, t("passenger.error.address")),
          notes: z.string().max(500, t("passenger.error.notes")).optional(),
          seats: z.coerce.number().min(1).max(7),
          departAfter: z.string().min(1, t("passenger.error.depart-required")),
          departBefore: z.string().min(1, t("passenger.error.depart-required")),
        })
        .refine((value) => value.origin !== value.destination, {
          message: t("passenger.error.same"),
          path: ["destination"],
        })
        .refine(
          (value) => {
            const a = Date.parse(value.departAfter);
            const b = Date.parse(value.departBefore);
            if (Number.isNaN(a) || Number.isNaN(b)) return false;
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

  const defaultDepartAfter = useMemo(() => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    d.setSeconds(0, 0);
    return toLocalInput(d);
  }, []);
  const defaultDepartBefore = useMemo(() => {
    const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return toLocalInput(d);
  }, []);

  const initialProfile = useMemo(() => readProfile(), []);
  const form = useForm<CreateRideValues>({
    resolver: zodResolver(createRideSchema),
    defaultValues: {
      origin: initialProfile.lastOrigin || DEFAULT_ORIGIN,
      destination: initialProfile.lastDestination || DEFAULT_DESTINATION,
      pickupAddress: "",
      notes: "",
      seats: 1,
      departAfter: defaultDepartAfter,
      departBefore: defaultDepartBefore,
    },
  });

  useEffect(() => {
    if (Object.keys(form.formState.errors).length > 0) {
      void form.trigger();
    }
  }, [lang, form]);

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
    const payload = {
      ...data,
      notes: data.notes?.trim() ? data.notes.trim() : undefined,
      departAfter: new Date(data.departAfter).toISOString(),
      departBefore: new Date(data.departBefore).toISOString(),
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
            <div className="bg-muted/50 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Car className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    {t("passenger.found.driver")}
                  </p>
                  <p className="font-semibold text-foreground text-lg">{activeRequest.driverName}</p>
                </div>
              </div>
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

  return (
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
                          options={KYRGYZSTAN_SETTLEMENTS
                            .filter((s) => s !== destination)
                            .map((s) => ({ value: s, label: s }))}
                          placeholder={t("passenger.origin.placeholder")}
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
                          options={KYRGYZSTAN_SETTLEMENTS
                            .filter((s) => s !== origin)
                            .map((s) => ({ value: s, label: s }))}
                          placeholder={t("passenger.destination.placeholder")}
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

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">{t("passenger.depart.label")}</p>
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
                        <Input type="datetime-local" className="h-12 text-base" {...field} />
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
                        <Input type="datetime-local" className="h-12 text-base" {...field} />
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
