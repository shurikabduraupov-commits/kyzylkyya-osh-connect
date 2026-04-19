import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useListRideRequests,
  useAcceptRideRequest,
  getListRideRequestsQueryKey,
  getGetRideStatsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Users, Clock, Phone, Navigation, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ALL_ROUTES_VALUE, KYRGYZSTAN_SETTLEMENTS } from "@/lib/settlements";
import { useTranslation } from "@/lib/i18n";
import { readProfile, updateProfile } from "@/lib/profile";

export function DriverMode() {
  const { t, lang } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState(ALL_ROUTES_VALUE);
  const [destinationFilter, setDestinationFilter] = useState(ALL_ROUTES_VALUE);

  const acceptRideSchema = useMemo(
    () =>
      z.object({
        driverName: z.string().min(2, t("driver.error.name")),
        driverPhone: z.string().min(5, t("driver.error.phone")),
      }),
    [t],
  );

  type AcceptRideValues = z.infer<typeof acceptRideSchema>;

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

  const acceptMutation = useAcceptRideRequest({
    mutation: {
      onSuccess: (_data, variables) => {
        updateProfile({
          driverName: variables.data.driverName,
          driverPhone: variables.data.driverPhone,
        });
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

  const initialProfile = useMemo(() => readProfile(), []);
  const form = useForm<AcceptRideValues>({
    resolver: zodResolver(acceptRideSchema),
    defaultValues: {
      driverName: initialProfile.driverName,
      driverPhone: initialProfile.driverPhone,
    },
  });

  useEffect(() => {
    if (Object.keys(form.formState.errors).length > 0) {
      void form.trigger();
    }
  }, [lang, form]);

  const onSubmit = (data: AcceptRideValues) => {
    if (!selectedRequestId) return;
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-display font-bold text-xl">{t("driver.active.title")}</h2>
        <div className="flex items-center text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse mr-2" />
          {t("driver.live")}
        </div>
      </div>

      <Card className="shadow-sm border-border">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">{t("driver.filter.title")}</p>
          <div className="grid grid-cols-1 gap-3">
            <Select value={originFilter} onValueChange={setOriginFilter}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={t("driver.filter.from")} />
              </SelectTrigger>
              <SelectContent className="max-h-[280px]">
                <SelectItem value={ALL_ROUTES_VALUE}>{t("driver.filter.all-from")}</SelectItem>
                {KYRGYZSTAN_SETTLEMENTS.map((settlement) => (
                  <SelectItem key={settlement} value={settlement}>
                    {settlement}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={destinationFilter} onValueChange={setDestinationFilter}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={t("driver.filter.to")} />
              </SelectTrigger>
              <SelectContent className="max-h-[280px]">
                <SelectItem value={ALL_ROUTES_VALUE}>{t("driver.filter.all-to")}</SelectItem>
                {KYRGYZSTAN_SETTLEMENTS.map((settlement) => (
                  <SelectItem key={settlement} value={settlement}>
                    {settlement}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                    onClick={() => setSelectedRequestId(request.id)}
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
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{t("driver.dialog.title")}</DialogTitle>
            <DialogDescription>{t("driver.dialog.desc")}</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
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
                        <Input placeholder={t("driver.dialog.phone.placeholder")} className="pl-10 h-12" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
