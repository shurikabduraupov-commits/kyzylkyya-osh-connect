import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Home } from "@/pages/home";
import NotFound from "@/pages/not-found";
import { LanguageProvider } from "@/lib/i18n";
import { setAdminToken, clearAdminToken } from "@/lib/all-settlements";

const queryClient = new QueryClient();

function useAdminParam() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const adminParam = params.get("admin");
    if (adminParam === null) return;
    if (adminParam === "off" || adminParam === "") {
      clearAdminToken();
    } else {
      setAdminToken(adminParam);
    }
    params.delete("admin");
    const newSearch = params.toString();
    const newUrl =
      window.location.pathname +
      (newSearch ? `?${newSearch}` : "") +
      window.location.hash;
    window.history.replaceState({}, "", newUrl);
  }, []);
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useAdminParam();
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
