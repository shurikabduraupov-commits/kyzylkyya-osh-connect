import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  completeTelegramWidgetLogin,
  getTelegramAuthConfig,
  writeAuthSession,
  type AuthUser,
  type TelegramWidgetUser,
} from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { Languages } from "lucide-react";

type Props = {
  onSuccess: (user: AuthUser) => void;
};

export function TelegramAuthGate({ onSuccess }: Props) {
  const { t, lang, toggle } = useTranslation();
  const widgetRootRef = useRef<HTMLDivElement | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isConfigured, setIsConfigured] = useState(true);
  const [botUsername, setBotUsername] = useState("");
  const [openBotUrl, setOpenBotUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const config = await getTelegramAuthConfig();
        if (!mounted) return;
        setIsConfigured(config.enabled);
        setBotUsername(config.botUsername);
        setOpenBotUrl(config.openBotUrl);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Не удалось загрузить Telegram вход");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!botUsername || !widgetRootRef.current || !isConfigured) return;
    const w = window as typeof window & {
      onTelegramAuth?: (user: TelegramWidgetUser) => void;
    };
    w.onTelegramAuth = async (user: TelegramWidgetUser) => {
      setIsBusy(true);
      setError("");
      try {
        const res = await completeTelegramWidgetLogin(user);
        writeAuthSession(res.token, res.user);
        onSuccess(res.user);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось завершить вход через Telegram");
      } finally {
        setIsBusy(false);
      }
    };
    widgetRootRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    widgetRootRef.current.appendChild(script);
    return () => {
      if (widgetRootRef.current) widgetRootRef.current.innerHTML = "";
      delete w.onTelegramAuth;
    };
  }, [botUsername, isConfigured, onSuccess]);

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={toggle}
              aria-label={t("lang.toggle.aria")}
              className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-bold tracking-wider hover:bg-muted/70"
            >
              <Languages className="w-3.5 h-3.5" />
              {lang === "kg" ? t("lang.kg") : t("lang.ru")}
            </button>
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold font-display">{t("auth.telegram.title")}</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">{t("auth.telegram.lead")}</p>
          </div>

          <ol className="text-sm text-foreground/90 space-y-2 list-decimal pl-4 leading-relaxed">
            <li>{t("auth.telegram.step1")}</li>
            <li>{t("auth.telegram.step2")}</li>
            <li className="text-muted-foreground">{t("auth.telegram.step3")}</li>
          </ol>

          <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
            {t("auth.telegram.menuButtonHint")}
          </p>

          {openBotUrl ? (
            <Button variant="outline" className="w-full" asChild>
              <a href={openBotUrl} target="_blank" rel="noopener noreferrer">
                {t("auth.telegram.openBot")}
              </a>
            </Button>
          ) : null}

          {!isConfigured ? (
            <p className="text-sm text-destructive">{t("auth.telegram.notConfigured")}</p>
          ) : (
            <div className="space-y-2">
              <div ref={widgetRootRef} className="min-h-[44px] flex items-center justify-center" />
              {isBusy ? (
                <p className="text-xs text-muted-foreground text-center">{t("auth.telegram.checking")}</p>
              ) : null}
            </div>
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
