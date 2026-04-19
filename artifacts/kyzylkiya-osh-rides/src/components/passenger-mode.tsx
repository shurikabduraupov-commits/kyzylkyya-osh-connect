import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Users, CheckCircle2, Phone, Search, Car, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const createRideSchema = z.object({
  pickupAddress: z.string().min(3, "Так даректи жазыңыз"),
  seats: z.coerce.number().min(1).max(7),
});

type CreateRideValues = z.infer<typeof createRideSchema>;

export function PassengerMode() {
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<CreateRideValues>({
    resolver: zodResolver(createRideSchema),
    defaultValues: {
      pickupAddress: "",
      seats: 1,
    },
  });

  const createMutation = useCreateRideRequest({
    mutation: {
      onSuccess: (data) => {
        setActiveRequestId(data.id);
        toast({
          title: "Заявка жөнөтүлдү",
          description: "Азыр сизге машина издеп жатабыз.",
        });
      },
      onError: () => {
        toast({
          title: "Ката кетти",
          description: "Заявканы түзүү мүмкүн болгон жок. Кайра аракет кылыңыз.",
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
    createMutation.mutate({ data });
  };

  const resetRequest = () => {
    setActiveRequestId(null);
    form.reset();
  };

  if (activeRequestId) {
    if (isRequestLoading) {
      return <WaitingCard />;
    }

    if (activeRequest?.status === "accepted") {
      return (
        <Card className="w-full shadow-lg border-primary/20 bg-card overflow-hidden animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-primary p-6 text-primary-foreground flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h3 className="font-display font-bold text-2xl">Машина табылды</h3>
              <p className="text-primary-foreground/90 text-sm mt-1">
                Ошко сапарыңыз тастыкталды
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
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Айдоочу</p>
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
                Чалуу: {activeRequest.driverPhone}
              </Button>

              <Button
                variant="outline"
                className="w-full text-muted-foreground"
                onClick={resetRequest}
              >
                Башка сапар издөө
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return <WaitingCard />;
  }

  return (
    <Card className="w-full shadow-sm border-border">
      <CardHeader className="pb-4">
        <CardTitle className="font-display text-2xl font-bold">Кызыл-Кыядан Ошко</CardTitle>
        <CardDescription>Азыр Ошко бара турган ишенимдүү машинаны табыңыз.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="pickupAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Сиз кайсы жердесиз?</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        placeholder="мисалы: автобекет же көчө дареги"
                        className="pl-10 h-12 text-base"
                        {...field}
                      />
                    </div>
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
                  <FormLabel className="text-foreground">Канча орун керек?</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(Number(val))}
                    defaultValue={field.value.toString()}
                  >
                    <FormControl>
                      <SelectTrigger className="h-12 text-base">
                        <div className="flex items-center gap-2">
                          <Users className="w-5 h-5 text-muted-foreground" />
                          <SelectValue placeholder="Орун тандаңыз" />
                        </div>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                        <SelectItem key={num} value={num.toString()}>
                          {num} орун
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
              {createMutation.isPending ? "Жөнөтүлүүдө..." : "Машина табуу"}
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

function WaitingCard() {
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
          <h3 className="font-display font-semibold text-xl">Айдоочу изделүүдө</h3>
          <p className="text-muted-foreground text-sm max-w-[250px]">
            Заявкаңыз Кызыл-Кыядагы айдоочуларга көрсөтүлүүдө. Адатта 2-5 мүнөт талап кылынат.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
