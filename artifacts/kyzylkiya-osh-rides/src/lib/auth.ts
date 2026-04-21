import { apiUrl } from "@/lib/api-url";

export type AuthUser = {
  id: string;
  name: string;
  phone?: string;
  telegramUserId: string;
  telegramChatId: string;
  username?: string;
  photoUrl?: string;
};

const AUTH_TOKEN_KEY = "mak.auth.token";
const AUTH_USER_KEY = "mak.auth.user";
export const AUTH_SESSION_CLEARED_EVENT = "mak:auth-session-cleared";

function authHeaders() {
  const token = readAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function readAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function writeAuthSession(token: string, user: AuthUser) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function writeAuthUser(user: AuthUser) {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  window.dispatchEvent(new Event(AUTH_SESSION_CLEARED_EVENT));
}

export function readAuthUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export type TelegramWidgetUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export type TelegramAuthConfig = {
  enabled: boolean;
  botUsername: string;
  openBotUrl: string;
};

export async function getTelegramAuthConfig(): Promise<TelegramAuthConfig> {
  const resp = await fetch(apiUrl("/rides-api/auth/telegram/config"));
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.message || "Не удалось получить настройки Telegram входа");
  }
  const data = (await resp.json()) as Partial<TelegramAuthConfig>;
  return {
    enabled: Boolean(data.enabled),
    botUsername: String(data.botUsername ?? ""),
    openBotUrl: String(data.openBotUrl ?? ""),
  };
}

export async function completeTelegramWidgetLogin(user: TelegramWidgetUser): Promise<{ token: string; user: AuthUser }> {
  const resp = await fetch(apiUrl("/rides-api/auth/telegram/widget"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.message || "Не удалось завершить вход через Telegram");
  }
  return await resp.json();
}

export async function validateAuth(): Promise<AuthUser | null> {
  const token = readAuthToken();
  if (!token) return null;
  const resp = await fetch(apiUrl("/rides-api/auth/me"), {
    headers: { ...authHeaders() },
  });
  if (!resp.ok) return null;
  return await resp.json();
}

export async function registerPhoneAuth(payload: {
  name: string;
  phone: string;
}): Promise<{ token: string; user: AuthUser }> {
  const resp = await fetch(apiUrl("/rides-api/auth/phone/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.message || "Не удалось зарегистрироваться по номеру телефона");
  }
  return await resp.json();
}
