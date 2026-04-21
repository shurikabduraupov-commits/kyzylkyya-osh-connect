import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Languages } from "lucide-react";
import { registerPhoneAuth, writeAuthSession, type AuthUser } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";

type Props = {
  onSuccess: (user: AuthUser) => void;
};

export function PhoneAuthGate({ onSuccess }: Props) {
  const { t, lang, toggle } = useTranslation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+996");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

          <div className="space-y-1">
            <h1 className="text-xl font-bold font-display">{t("auth.phone.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("auth.phone.lead")}</p>
          </div>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              setLoading(true);
              setError("");
              void registerPhoneAuth({ name: name.trim(), phone: phone.trim() })
                .then((res) => {
                  writeAuthSession(res.token, res.user);
                  onSuccess(res.user);
                })
                .catch((e) => {
                  setError(e instanceof Error ? e.message : t("auth.phone.error"));
                })
                .finally(() => setLoading(false));
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="auth-name">{t("auth.phone.name")}</Label>
              <Input
                id="auth-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("auth.phone.name.placeholder")}
                autoComplete="name"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-phone">{t("auth.phone.phone")}</Label>
              <Input
                id="auth-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+996555000000"
                autoComplete="tel"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("auth.phone.hint")}</p>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? t("auth.phone.submitting") : t("auth.phone.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
