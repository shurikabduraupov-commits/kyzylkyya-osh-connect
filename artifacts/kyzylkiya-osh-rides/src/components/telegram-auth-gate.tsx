import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  completeTelegramWidgetLogin,
  getTelegramAuthConfig,
  writeAuthSession,
  type AuthUser,
  type TelegramWidgetUser,
} from "@/lib/auth";

type Props = {
  onSuccess: (user: AuthUser) => void;
};

export function TelegramAuthGate({ onSuccess }: Props) {
  const widgetRootRef = useRef<HTMLDivElement | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isConfigured, setIsConfigured] = useState(true);
  const [botUsername, setBotUsername] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const config = await getTelegramAuthConfig();
        if (!mounted) return;
        setIsConfigured(config.enabled);
        setBotUsername(config.botUsername);
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
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold">Вход через Telegram</h1>
            <p className="text-sm text-muted-foreground">
              Нажмите официальную кнопку Telegram, подтвердите вход и сразу вернитесь в приложение.
            </p>
          </div>
          {!isConfigured ? (
            <p className="text-sm text-destructive">
              Telegram вход пока не настроен на сервере. Установите `TELEGRAM_BOT_TOKEN`.
            </p>
          ) : (
            <div className="space-y-2">
              <div ref={widgetRootRef} className="min-h-[44px] flex items-center justify-center" />
              {isBusy && <p className="text-xs text-muted-foreground text-center">Проверяем вход...</p>}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
